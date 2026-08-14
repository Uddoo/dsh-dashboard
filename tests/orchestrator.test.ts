import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRunResult, HarnessAgentRunner } from '../src/agent/harness-runner.ts'
import type { TaskIssue } from '../src/domain/issue.ts'
import { issueKey } from '../src/domain/issue.ts'
import { DashboardOrchestrator } from '../src/orchestrator/orchestrator.ts'
import type { IssueRuntimeView } from '../src/runtime/types.ts'
import { emptyTokens } from '../src/runtime/types.ts'
import type { TaskSource, TaskSourceRegistry } from '../src/task-source/index.ts'
import type { WorkflowStore } from '../src/workflow/store.ts'
import type { WorkflowDefinition } from '../src/workflow/types.ts'
import type { WorkspaceManager } from '../src/workspace/manager.ts'
import type { ProjectCatalog } from '../src/catalog/catalog.ts'

interface TestRunningRecord {
  issue: TaskIssue
  readonly workflow: WorkflowDefinition
  readonly abort: AbortController
  readonly attempt: number
  runtime: IssueRuntimeView
}

interface TestRetryRecord {
  readonly issue: TaskIssue
  readonly attempt: number
  readonly dueAt: number
  readonly error: string
  readonly runtime: IssueRuntimeView
}

interface OrchestratorAccess {
  readonly running: Map<string, TestRunningRecord>
  readonly retries: Map<string, TestRetryRecord>
  readonly runtimeArchive: Map<string, IssueRuntimeView>
  readonly manualStops: Set<string>
  readonly terminalStops: Set<string>
  reconcileRuntime(board: readonly TaskIssue[], definition: WorkflowDefinition): Promise<void>
  execute(record: TestRunningRecord): Promise<void>
}

describe('DashboardOrchestrator reconciliation', () => {
  it('forces a fresh board read after a mutation overlaps an older poll', async () => {
    let releaseFirstRead: (() => void) | undefined
    const firstReadGate = new Promise<void>(accept => { releaseFirstRead = accept })
    let current: readonly TaskIssue[] = [task('Todo')]
    let reads = 0
    const source = {
      kind: 'linear',
      context: () => ({ kind: 'linear', providerLabel: 'Linear', projectLabel: 'ENG', projectRef: 'ENG' }),
      listBoardIssues: vi.fn(async () => {
        reads += 1
        const captured = current
        if (reads === 1) await firstReadGate
        return captured
      }),
      listIssuesByStates: async () => [],
      getIssuesByNativeRefs: async () => current,
      updateTask: vi.fn(async () => {
        current = [task('Done')]
        return current[0]!
      }),
    } satisfies TaskSource
    const store = {
      path: 'WORKFLOW.md',
      require: () => definition,
      status: () => ({ current: definition }),
    } as unknown as WorkflowStore
    const orchestrator = new DashboardOrchestrator(
      { logger: { warn: vi.fn() } } as unknown as Context,
      store,
      { require: vi.fn(() => source) } as unknown as TaskSourceRegistry,
      {} as WorkspaceManager,
      {} as HarnessAgentRunner,
      emptyCatalog(),
      { agentProfile: 'default', permissionPreset: 'workspace-write', workerHost: 'test' },
    )
    orchestrator.setPaused(true)

    const stalePoll = orchestrator.refresh()
    await vi.waitFor(() => { expect(reads).toBe(1) })
    const mutation = orchestrator.updateTask('issue-1', { state: 'Done' })
    await vi.waitFor(() => { expect(source.updateTask).toHaveBeenCalledOnce() })
    releaseFirstRead?.()
    await Promise.all([stalePoll, mutation])

    expect(source.listBoardIssues).toHaveBeenCalledTimes(2)
    const snapshot = await orchestrator.snapshot()
    expect(snapshot.board.columns.flatMap(column => column.issues)).toMatchObject([{ state: { name: 'Done' } }])
    const timer = (orchestrator as unknown as { timer?: NodeJS.Timeout }).timer
    if (timer !== undefined) clearTimeout(timer)
  })

  it('does not dispatch a provider result that finishes after the project is deactivated', async () => {
    let releaseRead: (() => void) | undefined
    const readGate = new Promise<void>(accept => { releaseRead = accept })
    const source = {
      kind: 'linear',
      context: () => ({ kind: 'linear', providerLabel: 'Linear', projectLabel: 'ENG', projectRef: 'ENG' }),
      listBoardIssues: vi.fn(async () => { await readGate; return [task('Todo')] }),
      listIssuesByStates: async () => [],
      getIssuesByNativeRefs: async () => [],
    } satisfies TaskSource
    const store = {
      path: 'WORKFLOW.md',
      require: () => definition,
      status: () => ({ current: definition }),
    } as unknown as WorkflowStore
    const orchestrator = new DashboardOrchestrator(
      { logger: { warn: vi.fn() } } as unknown as Context,
      store,
      { require: vi.fn(() => source) } as unknown as TaskSourceRegistry,
      {} as WorkspaceManager,
      {} as HarnessAgentRunner,
      emptyCatalog(),
      { agentProfile: 'default', permissionPreset: 'workspace-write', workerHost: 'test' },
    )
    const access = orchestrator as unknown as { dispatch(board: readonly TaskIssue[], workflow: WorkflowDefinition): void }
    const dispatch = vi.spyOn(access, 'dispatch')

    const refresh = orchestrator.refresh()
    await vi.waitFor(() => { expect(source.listBoardIssues).toHaveBeenCalledOnce() })
    orchestrator.setActive(false)
    releaseRead?.()
    await refresh

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('runs an active poll after a read-only overview refresh finishes', async () => {
    let releaseOverview: (() => void) | undefined
    const overviewGate = new Promise<void>(accept => { releaseOverview = accept })
    let reads = 0
    const source = {
      kind: 'linear',
      context: () => ({ kind: 'linear', providerLabel: 'Linear', projectLabel: 'ENG', projectRef: 'ENG' }),
      listBoardIssues: vi.fn(async () => {
        reads += 1
        if (reads === 1) await overviewGate
        return [task('Todo')]
      }),
      listIssuesByStates: async () => [],
      getIssuesByNativeRefs: async () => [],
    } satisfies TaskSource
    const store = {
      path: 'WORKFLOW.md',
      require: () => definition,
      status: () => ({ current: definition }),
    } as unknown as WorkflowStore
    const orchestrator = new DashboardOrchestrator(
      { logger: { warn: vi.fn() } } as unknown as Context,
      store,
      { require: vi.fn(() => source) } as unknown as TaskSourceRegistry,
      {} as WorkspaceManager,
      {} as HarnessAgentRunner,
      emptyCatalog(),
      { agentProfile: 'default', permissionPreset: 'workspace-write', workerHost: 'test' },
    )
    const access = orchestrator as unknown as { dispatch(board: readonly TaskIssue[], workflow: WorkflowDefinition): void }
    const dispatch = vi.spyOn(access, 'dispatch').mockImplementation(() => undefined)

    const overview = orchestrator.refreshOverview()
    await vi.waitFor(() => { expect(source.listBoardIssues).toHaveBeenCalledOnce() })
    const active = orchestrator.refresh()
    releaseOverview?.()
    await Promise.all([overview, active])

    expect(source.listBoardIssues).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledOnce()
    orchestrator.setActive(false)
  })

  it('stops a missing running issue without classifying it as terminal or removing its workspace', async () => {
    const fixture = createFixture()
    const record = runningRecord(task('Todo'))
    fixture.access.running.set(issueKey(record.issue), record)

    await fixture.access.reconcileRuntime([], definition)

    expect(record.abort.signal.aborted).toBe(true)
    expect(fixture.access.manualStops.has(issueKey(record.issue))).toBe(true)
    expect(fixture.access.terminalStops.has(issueKey(record.issue))).toBe(false)
    expect(fixture.remove).not.toHaveBeenCalled()
  })

  it('updates active running records before applying per-state concurrency counts', async () => {
    const fixture = createFixture()
    const record = runningRecord(task('Todo'))
    fixture.access.running.set(issueKey(record.issue), record)

    await fixture.access.reconcileRuntime([task('In Progress')], definition)

    expect(record.abort.signal.aborted).toBe(false)
    expect(record.issue.state.name).toBe('In Progress')
    expect(record.runtime.state).toBe('In Progress')
  })

  it('removes the workspace when a retrying issue is confirmed terminal', async () => {
    const fixture = createFixture()
    const retryIssue = task('Todo')
    const retryRuntime = runtime(retryIssue, 'retrying')
    const key = issueKey(retryIssue)
    fixture.access.retries.set(key, { issue: retryIssue, attempt: 1, dueAt: Date.now() + 10_000, error: 'failed', runtime: retryRuntime })
    fixture.access.runtimeArchive.set(key, retryRuntime)
    const terminal = task('Done')

    await fixture.access.reconcileRuntime([terminal], definition)

    expect(fixture.remove).toHaveBeenCalledWith(terminal, definition)
    expect(fixture.access.retries.has(key)).toBe(false)
    expect(fixture.access.runtimeArchive.has(key)).toBe(false)
  })

  it('keeps terminal retry state when cleanup fails so the next poll retries removal', async () => {
    const remove = vi.fn(async () => { throw new Error('workspace busy') })
    const fixture = createFixture({ remove })
    const retryIssue = task('Todo')
    const retryRuntime = runtime(retryIssue, 'retrying')
    const key = issueKey(retryIssue)
    fixture.access.retries.set(key, { issue: retryIssue, attempt: 1, dueAt: Date.now(), error: 'failed', runtime: retryRuntime })
    fixture.access.runtimeArchive.set(key, retryRuntime)

    await fixture.access.reconcileRuntime([task('Done')], definition)

    expect(remove).toHaveBeenCalledOnce()
    expect(fixture.access.retries.has(key)).toBe(true)
    expect(fixture.access.runtimeArchive.has(key)).toBe(true)
  })

  it('runs after_run before before_remove and terminal workspace deletion', async () => {
    const order: string[] = []
    const fixture = createFixture({
      prepare: vi.fn(async () => { order.push('prepare'); return { path: 'C:\\workspace\\ENG-1', createdNow: false } }),
      beforeRun: vi.fn(async () => { order.push('before-run') }),
      afterRun: vi.fn(async () => { order.push('after-run') }),
      remove: vi.fn(async () => { order.push('remove'); return true }),
      run: vi.fn(async (request) => {
        order.push('agent')
        return { kind: 'terminal', issue: task('Done'), runtime: runtime(request.issue, 'running') } satisfies AgentRunResult
      }),
    })
    const record = runningRecord(task('Todo'))

    await fixture.access.execute(record)

    expect(order).toEqual(['prepare', 'before-run', 'agent', 'after-run', 'remove'])
  })

  it('runs after_run before cleanup when a polling transition aborts the agent as terminal', async () => {
    const order: string[] = []
    const fixture = createFixture({
      prepare: vi.fn(async () => { order.push('prepare'); return { path: 'C:\\workspace\\ENG-1', createdNow: false } }),
      beforeRun: vi.fn(async () => { order.push('before-run') }),
      afterRun: vi.fn(async () => { order.push('after-run') }),
      remove: vi.fn(async () => { order.push('remove'); return true }),
      run: vi.fn(async () => { order.push('agent'); throw new Error('issue reached a terminal state') }),
    })
    const record = runningRecord(task('Done'))
    fixture.access.terminalStops.add(issueKey(record.issue))

    await fixture.access.execute(record)

    expect(order).toEqual(['prepare', 'before-run', 'agent', 'after-run', 'remove'])
  })
})

function createFixture(overrides: {
  readonly prepare?: WorkspaceManager['prepare']
  readonly beforeRun?: WorkspaceManager['beforeRun']
  readonly afterRun?: WorkspaceManager['afterRun']
  readonly remove?: WorkspaceManager['remove']
  readonly run?: HarnessAgentRunner['run']
} = {}) {
  const source = {
    kind: 'linear',
    context: () => ({ kind: 'linear', providerLabel: 'Linear', projectLabel: 'ENG', projectRef: 'engineering' }),
    listBoardIssues: async () => [],
    listIssuesByStates: async () => [],
    getIssuesByNativeRefs: async () => [],
  } satisfies TaskSource
  const prepare = overrides.prepare ?? vi.fn(async () => ({ path: 'C:\\workspace\\ENG-1', createdNow: false }))
  const beforeRun = overrides.beforeRun ?? vi.fn(async () => {})
  const afterRun = overrides.afterRun ?? vi.fn(async () => {})
  const remove = overrides.remove ?? vi.fn(async () => true)
  const run = overrides.run ?? vi.fn(async request => ({ kind: 'inactive', runtime: runtime(request.issue, 'running') } satisfies AgentRunResult))
  const workspaces = { prepare, beforeRun, afterRun, remove } as unknown as WorkspaceManager
  const runner = { run } as unknown as HarnessAgentRunner
  const sources = { require: vi.fn(() => source) } as unknown as TaskSourceRegistry
  const orchestrator = new DashboardOrchestrator(
    { logger: { warn: vi.fn() } } as unknown as Context,
    {} as WorkflowStore,
    sources,
    workspaces,
    runner,
    emptyCatalog(),
    { agentProfile: 'default', permissionPreset: 'workspace-write', workerHost: 'test' },
  )
  return { access: orchestrator as unknown as OrchestratorAccess, remove }
}

function task(state: string): TaskIssue {
  return {
    sourceKind: 'linear', scopeRef: 'ENG', nativeRef: 'issue-1', identifier: 'ENG-1', title: 'Orchestrate safely',
    state: { name: state }, labels: [], blockedBy: [], dispatchable: true,
  }
}

function runtime(issue: TaskIssue, phase: IssueRuntimeView['phase']): IssueRuntimeView {
  return {
    key: issueKey(issue), identifier: issue.identifier, phase, state: issue.state.name,
    turnCount: 0, updatedAt: new Date(0).toISOString(), workerHost: 'test', tokens: emptyTokens(), recentEvents: [],
  }
}

function runningRecord(issue: TaskIssue): TestRunningRecord {
  return { issue, workflow: definition, abort: new AbortController(), attempt: 0, runtime: runtime(issue, 'running') }
}

const definition: WorkflowDefinition = {
  version: 1,
  project: { name: 'Test project', agent_profile: 'default' },
  tracker: {
    kind: 'linear', provider: { project_slug: 'engineering' }, required_labels: [],
    active_states: ['Todo', 'In Progress'], terminal_states: ['Done'],
  },
  polling: { interval_ms: 5000 },
  workspace: { root: 'C:\\workspace' },
  hooks: { timeout_ms: 10_000 },
  agent: {
    max_concurrent_agents: 2,
    max_concurrent_agents_by_state: { Todo: 1, 'In Progress': 1 },
    max_turns: 3,
    max_retry_backoff_ms: 60_000,
  },
  dashboard: { visible_states: [] },
  prompt: 'Work on {{ issue.identifier }}',
  sourcePath: 'WORKFLOW.md',
  loadedAt: new Date(0).toISOString(),
}

function emptyCatalog(): ProjectCatalog {
  return {
    snapshot: () => ({ projects: [], discoveryRoots: [], globalBrokerEnabled: false }),
  } as unknown as ProjectCatalog
}
