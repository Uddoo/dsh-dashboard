import type { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskIssue } from '../src/domain/issue.ts'
import type { WorkflowDefinition } from '../src/workflow/types.ts'
import { WorkspaceManager } from '../src/workspace/manager.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('WorkspaceManager lifecycle safety', () => {
  it('removes a newly created workspace when after_create fails so a retry can initialize it again', async () => {
    const root = await temporaryRoot()
    const manager = new WorkspaceManager(context())
    const failed = workflow(root, { after_create: 'exit 7' })

    await expect(manager.prepare(issue, failed)).rejects.toThrow('after_create exited with 7')
    await expect(stat(join(root, issue.identifier))).rejects.toMatchObject({ code: 'ENOENT' })

    const retried = await manager.prepare(issue, workflow(root))
    expect(retried.createdNow).toBe(true)
    await expect(stat(retried.path)).resolves.toMatchObject({})
  })

  it('keeps hook diagnostics bounded even when a hook emits a large stderr stream', async () => {
    const root = await temporaryRoot()
    const manager = new WorkspaceManager(context())
    const command = process.platform === 'win32'
      ? '[Console]::Error.Write(("x" * 100000)); exit 9'
      : 'head -c 100000 /dev/zero | tr "\\0" x >&2; exit 9'

    const error = await manager.prepare(issue, workflow(root, { after_create: command })).catch(value => value)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('after_create exited with 9')
    expect((error as Error).message.length).toBeLessThan(5000)
    await expect(stat(join(root, issue.identifier))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

const issue: TaskIssue = {
  sourceKind: 'linear',
  nativeRef: 'issue-1',
  identifier: 'ENG-1',
  title: 'Workspace lifecycle',
  state: { name: 'Todo' },
  labels: [],
  blockedBy: [],
  dispatchable: true,
}

async function temporaryRoot(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-dashboard-workspace-'))
  temporaryRoots.push(parent)
  return join(parent, 'workspaces')
}

function context(): Context {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  } as unknown as Context
}

function workflow(root: string, hooks: Partial<WorkflowDefinition['hooks']> = {}): WorkflowDefinition {
  return {
    tracker: {
      kind: 'linear', provider: { project_slug: 'engineering' }, required_labels: [],
      active_states: ['Todo', 'In Progress'], terminal_states: ['Done'],
    },
    polling: { interval_ms: 5000 },
    workspace: { root },
    hooks: { timeout_ms: 10_000, ...hooks },
    agent: { max_concurrent_agents: 2, max_concurrent_agents_by_state: {}, max_turns: 3, max_retry_backoff_ms: 60_000 },
    dashboard: { visible_states: [] },
    prompt: 'Work on {{ issue.identifier }}',
    sourcePath: 'WORKFLOW.md',
    loadedAt: new Date(0).toISOString(),
  }
}
