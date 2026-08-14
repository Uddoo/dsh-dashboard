import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectCatalog } from '../src/catalog/catalog.ts'
import { dashboardCatalogDomainSpec } from '../src/catalog/spec.ts'
import type { ProjectRecord } from '../src/catalog/types.ts'
import { fixtureSnapshot } from '../src/client/fixture.ts'
import type { DashboardOrchestrator } from '../src/orchestrator/orchestrator.ts'
import { DashboardRuntimeCoordinator } from '../src/runtime/coordinator.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('DashboardRuntimeCoordinator', () => {
  it('validates before atomic selection and leaves old project Agents on their original graph', async () => {
    const root = await temporaryDirectory()
    const currentRoot = join(root, 'current')
    const targetRoot = join(root, 'target')
    const invalidRoot = join(root, 'invalid')
    await Promise.all([mkdir(currentRoot), mkdir(targetRoot), mkdir(invalidRoot)])
    await writeFile(join(currentRoot, 'WORKFLOW.md'), localWorkflow('current', 'Current'))
    await writeFile(join(targetRoot, 'WORKFLOW.md'), localWorkflow('target', 'Target'))
    await writeFile(join(invalidRoot, 'WORKFLOW.md'), '# Missing YAML frontmatter\n')

    const storage = memoryDomain()
    const catalog = new ProjectCatalog(storage.context, {
      currentProject: { root: currentRoot, policyPath: 'WORKFLOW.md', registerInCatalog: true },
      discoveryRoots: [],
    }, root)
    await catalog.start()
    const current = catalog.activeProject()!
    const target = await catalog.registerProject({ path: targetRoot, name: 'Target' })
    const invalid = await catalog.registerProject({ path: invalidRoot, name: 'Invalid' })
    const runtimes = new Map<string, FakeRuntime>()
    const coordinator = new DashboardRuntimeCoordinator(storage.context, catalog, {
      initialProject: current,
      parseOptions: {
        defaults: {
          pollingIntervalMs: 5_000,
          workspaceRoot: '.dsh-dashboard/workspaces',
          hookTimeoutMs: 60_000,
          maxConcurrentAgents: 3,
          maxTurns: 20,
          maxRetryBackoffMs: 300_000,
        },
        agentProfile: { id: 'default', permissionPreset: 'workspace-write', workerHost: 'test-host' },
      },
      createRuntime: (project) => {
        const runtime = fakeRuntime(project, catalog, project.id === current.id ? 2 : 0)
        runtimes.set(project.id, runtime)
        return { orchestrator: runtime.orchestrator, disposeSources: runtime.disposeSources }
      },
    })

    await coordinator.start()
    expect(runtimes.get(current.id)?.start).toHaveBeenCalledWith(true)

    await coordinator.switchProject(target.id)

    expect(catalog.activeProject()).toMatchObject({ id: target.id })
    expect(runtimes.get(current.id)?.setActive).toHaveBeenCalledWith(false)
    expect(runtimes.get(current.id)?.dispose).not.toHaveBeenCalled()
    expect(runtimes.get(target.id)?.start).toHaveBeenCalledWith(false)
    expect(runtimes.get(target.id)?.setActive).toHaveBeenCalledWith(true)
    expect(runtimes.get(target.id)?.refresh).toHaveBeenCalled()

    const snapshot = await coordinator.snapshot()
    expect(snapshot.catalog.projects.find(project => project.id === current.id)).toMatchObject({
      currentWorkspace: false,
      trackerKind: 'local',
      contextLabel: 'Current',
      runningAgents: 2,
    })
    expect(snapshot.catalog.projects.find(project => project.id === target.id)).toMatchObject({
      currentWorkspace: true,
      trackerKind: 'local',
      contextLabel: 'Target',
    })
    expect(snapshot.catalog.projects.find(project => project.id === invalid.id)).toMatchObject({
      currentWorkspace: false,
      configurationState: 'invalid',
    })

    await writeFile(join(targetRoot, 'WORKFLOW.md'), '# Broken after a last-good load\n')
    await vi.waitFor(async () => {
      expect((await coordinator.snapshot()).catalog.projects.find(project => project.id === target.id)).toMatchObject({
        configurationState: 'invalid',
        trackerKind: 'local',
        contextLabel: 'Target',
      })
    })
    await writeFile(join(targetRoot, 'WORKFLOW.md'), localWorkflow('target', 'Target'))
    await vi.waitFor(async () => {
      expect((await coordinator.snapshot()).catalog.projects.find(project => project.id === target.id)?.configurationState).toBe('ready')
    })

    await expect(coordinator.switchProject(invalid.id)).rejects.toMatchObject({
      dashboardCode: 'project.workflowInvalid',
      params: { project: 'Invalid' },
    })
    expect(catalog.activeProject()).toMatchObject({ id: target.id })
    expect(runtimes.has(invalid.id)).toBe(false)
    expect(runtimes.get(target.id)?.setActive).not.toHaveBeenCalledWith(false)

    for (const runtime of runtimes.values()) {
      runtime.refresh.mockClear()
      runtime.refreshOverview.mockClear()
      runtime.setActive.mockClear()
    }
    await coordinator.switchGlobal()
    expect(catalog.selection()).toEqual({ mode: 'global' })
    expect(runtimes.get(target.id)?.setActive).toHaveBeenCalledWith(false)
    expect([...runtimes.values()].every(runtime => runtime.refresh.mock.calls.length === 0)).toBe(true)
    expect([...runtimes.values()].every(runtime => runtime.refreshOverview.mock.calls.length === 1)).toBe(true)
    const globalSnapshot = await coordinator.snapshot()
    expect(globalSnapshot.selection).toEqual({ mode: 'global', projectCount: 3, readyProjectCount: 2 })
    expect(globalSnapshot.catalog.projects.every(project => !project.currentWorkspace)).toBe(true)
    expect(globalSnapshot.taskMutations).toEqual({ canCreate: false, canUpdate: false, canDelete: false, states: [] })

    for (const runtime of runtimes.values()) runtime.refreshOverview.mockClear()
    const coordinatorAccess = coordinator as unknown as { refreshGlobal(force: boolean): Promise<void> }
    await coordinatorAccess.refreshGlobal(false)
    expect([...runtimes.values()].every(runtime => runtime.refreshOverview.mock.calls.length === 0)).toBe(true)
    const future = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
    await coordinatorAccess.refreshGlobal(false)
    future.mockRestore()
    expect([...runtimes.values()].every(runtime => runtime.refreshOverview.mock.calls.length === 1)).toBe(true)

    for (const runtime of runtimes.values()) {
      runtime.refresh.mockClear()
      runtime.refreshOverview.mockClear()
      runtime.setActive.mockClear()
    }
    await coordinator.switchProject(target.id)
    expect(catalog.selection()).toEqual({ mode: 'project', projectId: target.id })
    expect(runtimes.get(target.id)?.setActive).toHaveBeenCalledWith(true)
    expect(runtimes.get(target.id)?.refresh).toHaveBeenCalledOnce()

    await coordinator.stop()
    await catalog.stop()
  })
})

interface FakeRuntime {
  readonly orchestrator: DashboardOrchestrator
  readonly start: ReturnType<typeof vi.fn<(active: boolean) => () => Promise<void>>>
  readonly setActive: ReturnType<typeof vi.fn<(active: boolean) => void>>
  readonly refresh: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly refreshOverview: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly pollingIntervalMs: ReturnType<typeof vi.fn<() => number>>
  readonly dispose: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly disposeSources: ReturnType<typeof vi.fn<() => void>>
}

function fakeRuntime(project: ProjectRecord, catalog: ProjectCatalog, running: number): FakeRuntime {
  const dispose = vi.fn<() => Promise<void>>(async () => undefined)
  const start = vi.fn<(active: boolean) => () => Promise<void>>((_active) => dispose)
  const setActive = vi.fn<(active: boolean) => void>((_active) => undefined)
  const refresh = vi.fn<() => Promise<void>>(async () => undefined)
  const refreshOverview = vi.fn<() => Promise<void>>(async () => undefined)
  const pollingIntervalMs = vi.fn<() => number>(() => 60_000)
  const disposeSources = vi.fn<() => void>(() => undefined)
  const orchestrator = {
    start,
    setActive,
    refresh,
    refreshOverview,
    pollingIntervalMs,
    runtimeActivity: () => ({ running, retrying: 0 }),
    snapshot: vi.fn(async () => ({
      ...fixtureSnapshot,
      context: { kind: 'local', providerLabel: 'Local', projectLabel: project.name, projectRef: project.id },
      catalog: catalog.snapshot(),
    })),
    setPaused: vi.fn(),
    stopIssue: vi.fn(() => false),
    issueDetail: vi.fn(() => undefined),
    createTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => undefined),
    deleteTask: vi.fn(async () => false),
  } as unknown as DashboardOrchestrator
  return { orchestrator, start, setActive, refresh, refreshOverview, pollingIntervalMs, dispose, disposeSources }
}

function localWorkflow(project: string, contextLabel: string): string {
  return `---
version: 1
project:
  name: ${project}
  agent_profile: default
tracker:
  kind: local
  provider:
    project_id: ${project}
    context_label: ${contextLabel}
  required_labels: []
  active_states: [Todo, In Progress]
  terminal_states: [Done, Canceled]
policy: {}
---

Work on {{ issue.identifier }}: {{ issue.title }}.
`
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-dashboard-runtime-'))
  temporaryDirectories.push(path)
  return path
}

function memoryDomain(): { readonly context: Context } {
  const tables = new Map<string, MemoryKvTable<string, unknown>>()
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
    close: vi.fn(async () => undefined),
  } as unknown as Domain<typeof dashboardCatalogDomainSpec>
  const context = {
    logger: { info: vi.fn(), warn: vi.fn() },
    storageDomain: { open: vi.fn(async () => domain) },
  } as unknown as Context
  return { context }
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
