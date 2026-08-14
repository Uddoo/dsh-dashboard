/** Harness-native Project Catalog with bounded discovery and explicit registration. */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { CurrentProjectConfig, DiscoveryRootConfig } from '../config.ts'
import { DashboardDomainError } from '../runtime/errors.ts'
import { expandHome } from '../workspace/path-safety.ts'
import { dashboardCatalogDomainSpec } from './spec.ts'
import type {
  ActiveProjectRecord,
  CatalogSettingId,
  AddDiscoveryRootInput,
  DiscoveryRootId,
  DiscoveryRootRecord,
  ProjectCandidateView,
  ProjectCatalogView,
  ProjectCatalogSelection,
  ProjectId,
  ProjectRecord,
  ProjectRegistrationSource,
  ProjectScanResult,
  ProjectWorkspaceSource,
  RegisterProjectInput,
  RepositoryId,
  RepositoryRecord,
  RepositoryView,
} from './types.ts'

const DEFAULT_MAX_DEPTH = 4
const MAX_SCANNED_DIRECTORIES = 10_000
const MAX_PROJECT_CANDIDATES = 200
const INSPECTION_CONCURRENCY = 4
const CANDIDATE_TTL_MS = 10 * 60 * 1000
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git', '.hg', '.svn', '.next', '.turbo', '.yarn',
  'build', 'coverage', 'dist', 'node_modules', 'out', 'target',
])

interface CandidateClaim {
  readonly rootId: DiscoveryRootId
  readonly path: string
  readonly expiresAt: number
}

export interface ProjectCatalogBootstrap {
  readonly currentProject: CurrentProjectConfig
  readonly discoveryRoots: readonly DiscoveryRootConfig[]
}

/** One process-owned catalog domain. Mutations are serialized above durable KV writes. */
export class ProjectCatalog {
  private domain: Domain<typeof dashboardCatalogDomainSpec> | undefined
  private projects: KvTable<ProjectId, ProjectRecord> | undefined
  private repositories: KvTable<RepositoryId, RepositoryRecord> | undefined
  private roots: KvTable<DiscoveryRootId, DiscoveryRootRecord> | undefined
  private settings: KvTable<CatalogSettingId, ActiveProjectRecord> | undefined
  private readonly candidateClaims = new Map<string, CandidateClaim>()
  private mutationTail: Promise<void> = Promise.resolve()
  private currentRoot?: string
  private activeProjectId?: ProjectId
  private globalSelected = false
  private currentWorkspaceSource?: ProjectWorkspaceSource

  constructor(
    private readonly ctx: Context,
    private readonly bootstrap: ProjectCatalogBootstrap,
    private readonly cwd = process.cwd(),
  ) {}

  /** Open the Harness storage domain and seed explicitly configured roots/current workspace. */
  async start(): Promise<void> {
    if (this.domain !== undefined) throw new Error('dsh-dashboard: Project Catalog is already started')
    const domain = await this.ctx.storageDomain.open(dashboardCatalogDomainSpec)
    this.domain = domain
    this.projects = domain.table('projects')
    this.repositories = domain.table('repositories')
    this.roots = domain.table('discovery_roots')
    this.settings = domain.table('settings')
    try {
      const currentRoot = await canonicalDirectory(this.bootstrap.currentProject.root, this.cwd)
      this.currentRoot = currentRoot
      const currentInspection = await inspectProjectDirectory(
        currentRoot,
        this.bootstrap.currentProject.policyPath,
      )
      this.currentWorkspaceSource = workspaceSource(currentRoot, currentInspection)
      for (const root of this.bootstrap.discoveryRoots) {
        await this.addDiscoveryRoot({ path: root.path, maxDepth: root.maxDepth })
      }
      let bootstrapProject: ProjectRecord | undefined
      if (this.bootstrap.currentProject.registerInCatalog) {
        bootstrapProject = await this.enqueueMutation(async () => {
          return await this.registerDirectory(
            currentRoot,
            undefined,
            'current-workspace',
            this.bootstrap.currentProject.policyPath,
            currentInspection,
          )
        })
      }
      const remembered = this.requireSettings().get('active-project')
      if (remembered?.mode === 'global') {
        this.globalSelected = true
      } else {
        const rememberedProject = remembered === undefined ? undefined : this.requireProjects().get(remembered.projectId)
        const activeProject = rememberedProject ?? bootstrapProject
        if (activeProject !== undefined) this.selectInMemory(activeProject)
      }
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  /** Drain catalog mutations and release the domain. */
  async stop(): Promise<void> {
    await this.mutationTail
    const domain = this.domain
    this.domain = undefined
    this.projects = undefined
    this.repositories = undefined
    this.roots = undefined
    this.settings = undefined
    this.candidateClaims.clear()
    delete this.activeProjectId
    this.globalSelected = false
    delete this.currentRoot
    delete this.currentWorkspaceSource
    await domain?.close()
  }

  /** Return the inspected source for the current Harness-selected project. */
  executionWorkspaceSource(): ProjectWorkspaceSource | undefined {
    const source = this.currentWorkspaceSource
    return source === undefined ? undefined : { ...source }
  }

  /** Resolve the workspace materialization source for one registered project. */
  projectWorkspaceSource(id: ProjectId): ProjectWorkspaceSource | undefined {
    const project = this.requireProjects().get(id)
    return project === undefined ? undefined : this.workspaceSourceFor(project)
  }

  project(id: ProjectId): ProjectRecord | undefined {
    const project = this.requireProjects().get(id)
    return project === undefined ? undefined : { ...project, repositoryIds: [...project.repositoryIds] }
  }

  activeProject(): ProjectRecord | undefined {
    return this.activeProjectId === undefined ? undefined : this.project(this.activeProjectId)
  }

  selection(): ProjectCatalogSelection | undefined {
    if (this.globalSelected) return { mode: 'global' }
    return this.activeProjectId === undefined ? undefined : { mode: 'project', projectId: this.activeProjectId }
  }

  /** Persist and expose a validated project selection. Validation happens before this call. */
  async activateProject(id: ProjectId): Promise<ProjectRecord> {
    return await this.enqueueMutation(async () => {
      const project = this.requireProjects().get(id)
      if (project === undefined) {
        throw new DashboardDomainError('catalog.projectUnknown', `unknown registered project ${JSON.stringify(id)}`, { projectId: id })
      }
      await this.requireSettings().put('active-project', { mode: 'project', projectId: id, updatedAt: now() })
      this.selectInMemory(project)
      return { ...project, repositoryIds: [...project.repositoryIds] }
    })
  }

  /** Persist the read-only composite selection without activating any project runtime. */
  async activateGlobal(): Promise<void> {
    await this.enqueueMutation(async () => {
      if (this.requireProjects().size === 0) {
        throw new DashboardDomainError('catalog.globalEmpty', 'global view requires at least one registered project')
      }
      await this.requireSettings().put('active-project', { mode: 'global', updatedAt: now() })
      this.globalSelected = true
      delete this.activeProjectId
    })
  }

  /** Synchronous detached projection from the domain's authoritative memory. */
  snapshot(): ProjectCatalogView {
    const projects = this.requireProjects()
    const repositories = this.requireRepositories()
    return {
      projects: [...projects.entries()]
        .map(([, project]) => ({
          ...project,
          repositoryIds: [...project.repositoryIds],
          repositories: project.repositoryIds
            .map(id => repositories.get(id))
            .filter((value): value is RepositoryRecord => value !== undefined)
            .map(value => ({ ...value })),
          currentWorkspace: !this.globalSelected && project.id === this.activeProjectId,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'en-US') || left.root.localeCompare(right.root, 'en-US')),
      discoveryRoots: [...this.requireRoots().entries()]
        .map(([, root]) => ({ ...root }))
        .sort((left, right) => left.path.localeCompare(right.path, 'en-US')),
      globalBrokerEnabled: false,
    }
  }

  async addDiscoveryRoot(input: AddDiscoveryRootInput): Promise<DiscoveryRootRecord> {
    return await this.enqueueMutation(async () => {
      const canonical = await canonicalDirectory(input.path, this.cwd, true)
      const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH
      if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 8) {
        throw new DashboardDomainError(
          'catalog.maxDepthInvalid',
          'discovery root maxDepth must be an integer from 1 to 8',
        )
      }
      const existing = findByPath(this.requireRoots(), canonical)
      if (existing !== undefined) {
        if (existing.maxDepth === maxDepth) return existing
        const next = { ...existing, maxDepth, updatedAt: now() }
        await this.requireRoots().put(existing.id, next)
        return next
      }
      const timestamp = now()
      const root: DiscoveryRootRecord = {
        id: randomUUID(),
        path: canonical,
        maxDepth,
        confirmationRequired: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.requireRoots().put(root.id, root)
      return root
    })
  }

  async removeDiscoveryRoot(id: DiscoveryRootId): Promise<boolean> {
    return await this.enqueueMutation(async () => {
      for (const [token, claim] of this.candidateClaims) {
        if (claim.rootId === id) this.candidateClaims.delete(token)
      }
      return await this.requireRoots().delete(id)
    })
  }

  /** Discover candidates without persisting them; registration tokens expire and are one-use. */
  async scan(rootId: DiscoveryRootId, signal?: AbortSignal): Promise<ProjectScanResult> {
    const root = this.requireRoots().get(rootId)
    if (root === undefined) {
      throw new DashboardDomainError(
        'catalog.rootUnknown',
        `unknown discovery root ${JSON.stringify(rootId)}`,
        { rootId },
      )
    }
    throwIfAborted(signal)
    this.purgeCandidateClaims()
    const result = await scanProjectDirectories(root, signal)
    const registered = new Map([...this.requireProjects().entries()].map(([, project]) => [pathKey(project.root), project.id]))
    const candidates: ProjectCandidateView[] = []
    const inspections = await inspectProjectDirectories(result.paths, signal)
    for (let index = 0; index < result.paths.length; index++) {
      throwIfAborted(signal)
      const path = result.paths[index]!
      const inspection = inspections[index]!
      const token = randomUUID()
      this.candidateClaims.set(token, { rootId, path, expiresAt: Date.now() + CANDIDATE_TTL_MS })
      const registeredId = registered.get(pathKey(path))
      candidates.push({
        token,
        name: basename(path),
        path,
        ...(inspection.policyPath === undefined ? {} : { policyPath: inspection.policyPath }),
        ...(inspection.repository === undefined ? {} : { repository: inspection.repository }),
        ...(registeredId === undefined ? {} : { alreadyRegisteredProjectId: registeredId }),
      })
    }
    return {
      root: { ...root },
      candidates: candidates.sort((left, right) => left.name.localeCompare(right.name, 'en-US') || left.path.localeCompare(right.path, 'en-US')),
      truncated: result.truncated,
    }
  }

  /** Register a candidate that was produced by a recent bounded scan. */
  async registerCandidate(token: string): Promise<ProjectRecord> {
    const claim = this.candidateClaims.get(token)
    this.candidateClaims.delete(token)
    if (claim === undefined || claim.expiresAt <= Date.now()) {
      throw new DashboardDomainError(
        'catalog.candidateExpired',
        'project candidate token is missing or expired; scan the discovery root again',
      )
    }
    return await this.enqueueMutation(async () => {
      const root = this.requireRoots().get(claim.rootId)
      if (root === undefined) {
        throw new DashboardDomainError(
          'catalog.rootRemoved',
          'the discovery root was removed; scan again after adding an allowed root',
        )
      }
      const canonical = await canonicalDirectory(claim.path, this.cwd)
      assertContainedOrEqual(root.path, canonical, 'project candidate')
      return await this.registerDirectory(canonical, undefined, 'discovery')
    })
  }

  /** Explicit trusted-host registration path, independent of discovery roots. */
  async registerProject(input: RegisterProjectInput): Promise<ProjectRecord> {
    return await this.enqueueMutation(async () => {
      const canonical = await canonicalDirectory(input.path, this.cwd, true)
      const name = input.name?.trim()
      if (name !== undefined && (name === '' || name.length > 200)) {
        throw new DashboardDomainError(
          'catalog.projectNameInvalid',
          'project name must contain 1 to 200 characters',
        )
      }
      return await this.registerDirectory(canonical, name, 'manual')
    })
  }

  private async registerDirectory(
    root: string,
    requestedName: string | undefined,
    source: ProjectRegistrationSource,
    policyPathOverride?: string,
    preparedInspection?: ProjectInspection,
  ): Promise<ProjectRecord> {
    const inspection = preparedInspection ?? await inspectProjectDirectory(root, policyPathOverride)
    const existing = findByPath(this.requireProjects(), root)
    const timestamp = now()
    const repository = await this.upsertRepository(inspection.repository, timestamp)
    const previousRepositoryIds = existing?.repositoryIds ?? []
    const project: ProjectRecord = {
      id: existing?.id ?? randomUUID(),
      name: requestedName ?? existing?.name ?? basename(root),
      root,
      ...(inspection.policyPath === undefined ? {} : { policyPath: inspection.policyPath }),
      repositoryIds: repository === undefined ? [] : [repository.id],
      workspaceStrategy: repository === undefined ? 'controlled-directory' : 'worktree',
      autonomousClaims: false,
      source,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    try {
      await this.requireProjects().put(project.id, project)
    } catch (error) {
      if (repository !== undefined && !isRepositoryReferenced(this.requireProjects(), repository.id)) {
        await this.requireRepositories().delete(repository.id).catch(() => false)
      }
      throw error
    }
    for (const repositoryId of previousRepositoryIds) {
      if (repositoryId !== repository?.id && !isRepositoryReferenced(this.requireProjects(), repositoryId)) {
        await this.requireRepositories().delete(repositoryId)
      }
    }
    return project
  }

  private async upsertRepository(
    inspection: ProjectInspection['repository'],
    timestamp: string,
  ): Promise<RepositoryRecord | undefined> {
    if (inspection === undefined) return undefined
    const existing = findByPath(this.requireRepositories(), inspection.root)
    const repository: RepositoryRecord = {
      id: existing?.id ?? randomUUID(),
      ...inspection,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    await this.requireRepositories().put(repository.id, repository)
    return repository
  }

  private purgeCandidateClaims(): void {
    const current = Date.now()
    for (const [token, claim] of this.candidateClaims) {
      if (claim.expiresAt <= current) this.candidateClaims.delete(token)
    }
  }

  private async enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    let resolveResult!: (value: T | PromiseLike<T>) => void
    let rejectResult!: (reason?: unknown) => void
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    this.mutationTail = this.mutationTail.then(async () => {
      try {
        resolveResult(await operation())
      } catch (error) {
        rejectResult(error)
      }
    })
    return await result
  }

  private requireProjects(): KvTable<ProjectId, ProjectRecord> {
    if (this.projects === undefined) throw new Error('dsh-dashboard: Project Catalog is not started')
    return this.projects
  }

  private requireRepositories(): KvTable<RepositoryId, RepositoryRecord> {
    if (this.repositories === undefined) throw new Error('dsh-dashboard: Project Catalog is not started')
    return this.repositories
  }

  private requireRoots(): KvTable<DiscoveryRootId, DiscoveryRootRecord> {
    if (this.roots === undefined) throw new Error('dsh-dashboard: Project Catalog is not started')
    return this.roots
  }

  private requireSettings(): KvTable<CatalogSettingId, ActiveProjectRecord> {
    if (this.settings === undefined) throw new Error('dsh-dashboard: Project Catalog is not started')
    return this.settings
  }

  private selectInMemory(project: ProjectRecord): void {
    this.globalSelected = false
    this.activeProjectId = project.id
    this.currentRoot = project.root
    this.currentWorkspaceSource = this.workspaceSourceFor(project)
  }

  private workspaceSourceFor(project: ProjectRecord): ProjectWorkspaceSource {
    const repository = project.repositoryIds
      .map(id => this.requireRepositories().get(id))
      .find((candidate): candidate is RepositoryRecord => candidate !== undefined)
    return repository === undefined
      ? { strategy: 'controlled-directory', projectRoot: project.root }
      : { strategy: 'worktree', projectRoot: project.root, repositoryRoot: repository.root }
  }
}

interface ProjectInspection {
  readonly policyPath?: string
  readonly repository?: Omit<RepositoryView, 'id' | 'createdAt' | 'updatedAt'>
}

async function inspectProjectDirectory(
  root: string,
  policyPathOverride?: string,
  signal?: AbortSignal,
): Promise<ProjectInspection> {
  throwIfAborted(signal)
  const policyCandidate = policyPathOverride === undefined ? join(root, 'WORKFLOW.md') : resolve(root, policyPathOverride)
  assertContainedOrEqual(root, policyCandidate, 'project policy')
  const policyPath = await isRegularFile(policyCandidate) ? policyCandidate : policyPathOverride === undefined ? undefined : policyCandidate
  const repositoryRoot = await gitOutput(root, ['rev-parse', '--show-toplevel'], signal)
  if (repositoryRoot === undefined) {
    return { ...(policyPath === undefined ? {} : { policyPath }) }
  }
  const canonicalRepositoryRoot = await canonicalDirectory(repositoryRoot, root)
  const [remoteUrl, branchValue] = await Promise.all([
    gitOutput(canonicalRepositoryRoot, ['remote', 'get-url', 'origin'], signal),
    gitOutput(canonicalRepositoryRoot, ['branch', '--show-current'], signal),
  ])
  const branch = branchValue === '' ? undefined : branchValue
  return {
    ...(policyPath === undefined ? {} : { policyPath }),
    repository: {
      kind: 'git',
      root: canonicalRepositoryRoot,
      ...(remoteUrl === undefined || remoteUrl === '' ? {} : { remoteUrl }),
      ...(branch === undefined ? {} : { branch }),
    },
  }
}

async function scanProjectDirectories(
  root: DiscoveryRootRecord,
  signal?: AbortSignal,
): Promise<{ readonly paths: readonly string[]; readonly truncated: boolean }> {
  const queue: Array<{ readonly path: string; readonly depth: number }> = [{ path: root.path, depth: 0 }]
  const visited = new Set<string>()
  const candidates: string[] = []
  let truncated = false
  while (queue.length > 0) {
    throwIfAborted(signal)
    if (visited.size >= MAX_SCANNED_DIRECTORIES) { truncated = true; break }
    const item = queue.shift()!
    const key = pathKey(item.path)
    if (visited.has(key)) continue
    visited.add(key)
    let entries
    try {
      entries = await readdir(item.path, { withFileTypes: true })
    } catch {
      continue
    }
    const names = new Set(entries.map(entry => entry.name))
    const candidate = names.has('.git') || names.has('WORKFLOW.md')
    if (candidate) {
      if (candidates.length >= MAX_PROJECT_CANDIDATES) { truncated = true; break }
      candidates.push(item.path)
      // Project directories are traversal boundaries. Nested repositories can
      // be registered explicitly instead of expanding an unbounded project tree.
      continue
    }
    if (item.depth >= root.maxDepth) continue
    const directories = entries
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !SKIPPED_DIRECTORY_NAMES.has(entry.name.toLocaleLowerCase('en-US')))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-US'))
    for (const directory of directories) {
      throwIfAborted(signal)
      const child = join(item.path, directory.name)
      try {
        const info = await lstat(child)
        if (!info.isDirectory() || info.isSymbolicLink()) continue
        const canonical = await realpath(child)
        assertContainedOrEqual(root.path, canonical, 'discovery path')
        queue.push({ path: canonical, depth: item.depth + 1 })
      } catch {
        // A disappearing or inaccessible directory is not a valid candidate.
      }
    }
  }
  return { paths: candidates, truncated }
}

async function inspectProjectDirectories(
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<readonly ProjectInspection[]> {
  const results = new Array<ProjectInspection>(paths.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (true) {
      throwIfAborted(signal)
      const index = nextIndex++
      if (index >= paths.length) return
      results[index] = await inspectProjectDirectory(paths[index]!, undefined, signal)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(INSPECTION_CONCURRENCY, paths.length) },
    () => worker(),
  ))
  return results
}

async function canonicalDirectory(input: string, cwd: string, requireAbsoluteInput = false): Promise<string> {
  const expanded = expandHome(input.trim())
  if (requireAbsoluteInput && !isAbsolute(expanded)) {
    throw new DashboardDomainError(
      'catalog.pathAbsolute',
      'path must be absolute (or start with `~`)',
    )
  }
  const path = resolve(cwd, expanded)
  const info = await directoryInfo(path)
  const canonical = await realpath(path)
  await directoryInfo(canonical)
  return canonical
}

async function directoryInfo(path: string): Promise<Awaited<ReturnType<typeof lstat>>> {
  try {
    const info = await lstat(path)
    if (info.isDirectory() && !info.isSymbolicLink()) return info
  } catch (error) {
    if (!isNodeError(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) throw error
  }
  throw new DashboardDomainError(
    'catalog.pathNotDirectory',
    `path is not a real directory: ${path}`,
    { path },
  )
}

function assertContainedOrEqual(root: string, candidate: string, label: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  const separator = process.platform === 'win32' ? '\\' : '/'
  if (rel === '..' || rel.startsWith(`..${separator}`) || isAbsolute(rel)) {
    throw new DashboardDomainError(
      'catalog.pathEscapesRoot',
      `${label} escapes its allowed root: ${candidate}`,
      { path: candidate },
    )
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    return info.isFile() && !info.isSymbolicLink()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function gitOutput(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string | undefined> {
  throwIfAborted(signal)
  return await new Promise((resolveOutput, rejectOutput) => {
    execFile('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      ...(signal === undefined ? {} : { signal }),
    }, (error, stdout) => {
      if (signal?.aborted) {
        rejectOutput(abortReason(signal))
        return
      }
      if (error !== null) { resolveOutput(undefined); return }
      resolveOutput(stdout.trim())
    })
  })
}

function workspaceSource(root: string, inspection: ProjectInspection): ProjectWorkspaceSource {
  return inspection.repository === undefined
    ? { strategy: 'controlled-directory', projectRoot: root }
    : { strategy: 'worktree', projectRoot: root, repositoryRoot: inspection.repository.root }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('project scan was cancelled')
}

function findByPath<K extends string, V extends { readonly root?: string; readonly path?: string }>(table: KvTable<K, V>, path: string): V | undefined {
  const key = pathKey(path)
  for (const [, record] of table.entries()) {
    const candidate = record.root ?? record.path
    if (candidate !== undefined && pathKey(candidate) === key) return record
  }
  return undefined
}

function isRepositoryReferenced(projects: KvTable<ProjectId, ProjectRecord>, repositoryId: RepositoryId): boolean {
  for (const [, project] of projects.entries()) {
    if (project.repositoryIds.includes(repositoryId)) return true
  }
  return false
}

function pathKey(path: string): string {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

function now(): string {
  return new Date().toISOString()
}
