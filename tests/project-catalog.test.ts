import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectCatalog } from '../src/catalog/catalog.ts'
import { dashboardCatalogDomainSpec } from '../src/catalog/spec.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('ProjectCatalog', () => {
  it('persists the current Git workspace as separate Project and Repository records', async () => {
    const root = await temporaryDirectory()
    const currentProject = join(root, 'current-project')
    await mkdir(currentProject)
    await writeFile(join(currentProject, 'WORKFLOW.md'), '# Project policy\n')
    execFileSync('git', ['init', currentProject], { stdio: 'ignore', windowsHide: true })

    const storage = memoryDomain()
    const catalog = new ProjectCatalog(storage.context, {
      currentProject: { root: currentProject, policyPath: 'WORKFLOW.md', registerInCatalog: true },
      discoveryRoots: [],
    }, root)

    await catalog.start()
    const snapshot = catalog.snapshot()

    expect(snapshot.globalBrokerEnabled).toBe(false)
    expect(snapshot.projects).toHaveLength(1)
    expect(snapshot.projects[0]).toMatchObject({
      name: 'current-project',
      root: currentProject,
      workspaceStrategy: 'worktree',
      autonomousClaims: false,
      source: 'current-workspace',
      currentWorkspace: true,
    })
    expect(snapshot.projects[0]?.repositories).toHaveLength(1)
    expect(snapshot.projects[0]?.repositories[0]).toMatchObject({ kind: 'git', root: currentProject })
    expect(snapshot.projects[0]?.repositoryIds).toEqual([snapshot.projects[0]?.repositories[0]?.id])

    await catalog.stop()
    expect(storage.close).toHaveBeenCalledOnce()
  })

  it('discovers only bounded candidates and requires a fresh one-use confirmation token', async () => {
    const root = await temporaryDirectory()
    const currentProject = join(root, 'current-project')
    const discoveryRoot = join(root, 'projects')
    const alpha = join(discoveryRoot, 'alpha')
    const nested = join(alpha, 'nested-project')
    const ignored = join(discoveryRoot, 'node_modules', 'ignored-project')
    await mkdir(currentProject)
    await mkdir(nested, { recursive: true })
    await mkdir(ignored, { recursive: true })
    await writeFile(join(alpha, 'WORKFLOW.md'), '# Alpha\n')
    await writeFile(join(nested, 'WORKFLOW.md'), '# Nested\n')
    await writeFile(join(ignored, 'WORKFLOW.md'), '# Ignored\n')

    const catalog = new ProjectCatalog(memoryDomain().context, {
      currentProject: { root: currentProject, policyPath: 'WORKFLOW.md', registerInCatalog: false },
      discoveryRoots: [],
    }, root)
    await catalog.start()
    const registeredRoot = await catalog.addDiscoveryRoot({ path: discoveryRoot, maxDepth: 3 })

    const scan = await catalog.scan(registeredRoot.id)
    expect(scan.root).toMatchObject({ path: discoveryRoot, maxDepth: 3, confirmationRequired: true })
    expect(scan.truncated).toBe(false)
    expect(scan.candidates.map(candidate => candidate.path)).toEqual([alpha])

    const candidate = scan.candidates[0]!
    await expect(catalog.registerCandidate(candidate.token)).resolves.toMatchObject({
      root: alpha,
      source: 'discovery',
      workspaceStrategy: 'controlled-directory',
      autonomousClaims: false,
    })
    await expect(catalog.registerCandidate(candidate.token)).rejects.toThrow('missing or expired')
    expect(catalog.snapshot().projects).toHaveLength(1)
    await catalog.stop()
  })

  it('invalidates discovered candidates when their allowed root is removed and rejects relative manual paths', async () => {
    const root = await temporaryDirectory()
    const currentProject = join(root, 'current-project')
    const discoveryRoot = join(root, 'projects')
    const candidatePath = join(discoveryRoot, 'candidate')
    await mkdir(currentProject)
    await mkdir(candidatePath, { recursive: true })
    await writeFile(join(candidatePath, 'WORKFLOW.md'), '# Candidate\n')

    const catalog = new ProjectCatalog(memoryDomain().context, {
      currentProject: { root: currentProject, policyPath: 'WORKFLOW.md', registerInCatalog: false },
      discoveryRoots: [],
    }, root)
    await catalog.start()
    const registeredRoot = await catalog.addDiscoveryRoot({ path: discoveryRoot })
    const scan = await catalog.scan(registeredRoot.id)
    const token = scan.candidates[0]!.token

    await expect(catalog.removeDiscoveryRoot(registeredRoot.id)).resolves.toBe(true)
    await expect(catalog.registerCandidate(token)).rejects.toThrow('missing or expired')
    await expect(catalog.registerProject({ path: 'relative-project' })).rejects.toThrow('path must be absolute')
    await catalog.stop()
  })

  it('re-inspects an existing project on restart and removes stale repository references', async () => {
    const root = await temporaryDirectory()
    const currentProject = join(root, 'current-project')
    await mkdir(currentProject)
    await writeFile(join(currentProject, 'WORKFLOW.md'), '# Project policy\n')
    execFileSync('git', ['init', currentProject], { stdio: 'ignore', windowsHide: true })
    const storage = memoryDomain()
    const bootstrap = {
      currentProject: { root: currentProject, policyPath: 'WORKFLOW.md', registerInCatalog: true },
      discoveryRoots: [],
    } as const
    const first = new ProjectCatalog(storage.context, bootstrap, root)
    await first.start()
    expect(first.snapshot().projects[0]).toMatchObject({ workspaceStrategy: 'worktree' })
    expect(first.snapshot().projects[0]?.repositories).toHaveLength(1)
    await first.stop()

    await rm(join(currentProject, '.git'), { recursive: true, force: true })
    const restarted = new ProjectCatalog(storage.context, bootstrap, root)
    await restarted.start()
    const refreshed = restarted.snapshot().projects[0]

    expect(refreshed).toMatchObject({ workspaceStrategy: 'controlled-directory', repositoryIds: [] })
    expect(refreshed?.repositories).toEqual([])
    await restarted.stop()
  })

  it('caps scan candidates and rejects an aborted scan before doing more work', async () => {
    const root = await temporaryDirectory()
    const currentProject = join(root, 'current-project')
    const discoveryRoot = join(root, 'projects')
    await mkdir(currentProject)
    await mkdir(discoveryRoot)
    await Promise.all(Array.from({ length: 201 }, async (_, index) => {
      const candidate = join(discoveryRoot, `project-${String(index).padStart(3, '0')}`)
      await mkdir(candidate)
      await writeFile(join(candidate, 'WORKFLOW.md'), '# Candidate\n')
    }))
    const catalog = new ProjectCatalog(memoryDomain().context, {
      currentProject: { root: currentProject, policyPath: 'WORKFLOW.md', registerInCatalog: false },
      discoveryRoots: [],
    }, root)
    await catalog.start()
    const registeredRoot = await catalog.addDiscoveryRoot({ path: discoveryRoot, maxDepth: 1 })

    const scan = await catalog.scan(registeredRoot.id)
    expect(scan.candidates).toHaveLength(200)
    expect(scan.truncated).toBe(true)

    const abort = new AbortController()
    abort.abort(new Error('test scan cancellation'))
    await expect(catalog.scan(registeredRoot.id, abort.signal)).rejects.toThrow('test scan cancellation')
    await catalog.stop()
  })
})

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-dashboard-catalog-'))
  temporaryDirectories.push(path)
  return path
}

function memoryDomain(): { readonly context: Context; readonly close: ReturnType<typeof vi.fn> } {
  const tables = new Map<string, MemoryKvTable<string, unknown>>()
  const close = vi.fn(async () => undefined)
  const domain = {
    name: dashboardCatalogDomainSpec.name,
    table(name: string) {
      let table = tables.get(name)
      if (table === undefined) {
        table = new MemoryKvTable<string, unknown>()
        tables.set(name, table)
      }
      return table
    },
    close,
  } as unknown as Domain<typeof dashboardCatalogDomainSpec>
  const context = {
    storageDomain: { open: vi.fn(async () => domain) },
  } as unknown as Context
  return { context, close }
}

class MemoryKvTable<K extends string, V> implements KvTable<K, V> {
  private readonly records = new Map<K, V>()

  get size(): number { return this.records.size }
  get(key: K): V | undefined { return this.records.get(key) }
  entries(): IterableIterator<[K, V]> { return new Map(this.records).entries() }
  keys(): IterableIterator<K> { return new Map(this.records).keys() }
  async put(key: K, value: V): Promise<void> { this.records.set(key, value) }
  async delete(key: K): Promise<boolean> { return this.records.delete(key) }
  async update(key: K, update: (current: V) => V): Promise<V> {
    const current = this.records.get(key)
    if (current === undefined) throw new Error('missing key')
    const next = update(current)
    this.records.set(key, next)
    return next
  }
}
