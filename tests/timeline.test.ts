import { describe, expect, it } from 'vitest'
import type { IssueDetailView, RuntimeEventView } from '../src/runtime/types.ts'
import { buildTaskTimelinePage, RuntimeTimelineArchive } from '../src/runtime/timeline.ts'

const detail: IssueDetailView = {
  issue: {
    sourceKind: 'local', scopeRef: 'demo', nativeRef: '1', identifier: 'LOCAL-1', title: 'Timeline contract',
    state: { name: 'In Progress' }, labels: [], blockedBy: [], dispatchable: true,
    createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z',
  },
  runtime: {
    key: 'local:demo:1', identifier: 'LOCAL-1', phase: 'running', state: 'In Progress',
    sessionId: 'session-1', turnCount: 1, startedAt: '2026-08-14T10:01:00.000Z',
    phaseChangedAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T10:05:00.000Z', workerHost: 'local',
    tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 2 }, recentEvents: [],
  },
}

const runtimeEvents: readonly RuntimeEventView[] = [
  { id: 'session:session-1:2', type: 'assistant/message', title: 'Assistant message', detail: 'Working', at: '2026-08-14T10:04:00.000Z' },
  { id: 'session:session-1:1', type: 'tool/call', title: 'Tool started', detail: 'Read', at: '2026-08-14T10:03:00.000Z' },
  { id: 'host:1', type: 'scheduler.running', title: 'Agent running', at: '2026-08-14T10:00:00.000Z' },
]

describe('task timeline projection', () => {
  it('combines task, scheduler, and full runtime history behind an opaque cursor', () => {
    const first = buildTaskTimelinePage(detail, { limit: 2 }, runtimeEvents)
    expect(first.coverage).toBe('runtime-session')
    expect(first.truncated).toBe(false)
    expect(first.events).toHaveLength(2)
    expect(first.events[0]?.type).toBe('assistant/message')
    expect(first.nextCursor).toMatch(/^timeline:/u)

    const second = buildTaskTimelinePage(detail, { limit: 10, cursor: first.nextCursor! }, [
      { id: 'host:2', type: 'system/notice', title: 'New event', at: '2026-08-14T10:06:00.000Z' },
      ...runtimeEvents,
    ])
    expect(second.events.map(event => event.type)).toEqual([
      'agent.started', 'scheduler.running', 'task.updated', 'task.created',
    ])
    expect(second.events.filter(event => event.type === 'scheduler.running')).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
  })

  it('labels task-only data as a Provider summary and rejects malformed cursors', () => {
    expect(buildTaskTimelinePage({ issue: detail.issue }).coverage).toBe('provider-summary')
    expect(() => buildTaskTimelinePage(detail, { cursor: '2' }, runtimeEvents)).toThrow('invalid timeline cursor')
  })

  it('preserves distinct same-millisecond events by their Harness identity', () => {
    const repeated: readonly RuntimeEventView[] = [
      { id: 'session:session-1:10', type: 'tool/result', title: 'Tool completed', at: '2026-08-14T10:04:30.000Z' },
      { id: 'session:session-1:11', type: 'tool/result', title: 'Tool completed', at: '2026-08-14T10:04:30.000Z' },
    ]
    const page = buildTaskTimelinePage(detail, { limit: 20 }, repeated)
    expect(page.events.filter(event => event.type === 'tool/result').map(event => event.id)).toEqual([
      'session:session-1:10',
      'session:session-1:11',
    ])
  })

  it('uses a bounded O(1) archive and reports retention truncation', () => {
    const archive = new RuntimeTimelineArchive(2)
    const first = { id: 'event-1', type: 'tool/result', title: 'One', at: '2026-08-14T10:01:00.000Z' }
    expect(archive.append(first)).toBe(true)
    expect(archive.append(first)).toBe(false)
    archive.append({ id: 'event-2', type: 'tool/result', title: 'Two', at: '2026-08-14T10:02:00.000Z' })
    archive.append({ id: 'event-3', type: 'tool/result', title: 'Three', at: '2026-08-14T10:03:00.000Z' })

    const snapshot = archive.snapshot()
    expect(snapshot.events.map(event => event.id)).toEqual(['event-2', 'event-3'])
    expect(snapshot.truncated).toBe(true)
    expect(buildTaskTimelinePage(detail, {}, snapshot.events, snapshot.truncated).truncated).toBe(true)
  })
})
