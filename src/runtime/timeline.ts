/** Provider-neutral projection and pagination for the task detail timeline. */

import type {
  IssueDetailView,
  RuntimeEventView,
  TaskTimelineCategory,
  TaskTimelineEvent,
  TaskTimelineOptions,
  TaskTimelinePage,
} from './types.ts'

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100
const CURSOR_PREFIX = 'timeline:'
export const DEFAULT_RUNTIME_TIMELINE_CAPACITY = 8_192

export interface RuntimeTimelineArchiveSnapshot {
  readonly events: readonly RuntimeEventView[]
  readonly truncated: boolean
}

/** Fixed-capacity append log with O(1) identity checks and eviction. */
export class RuntimeTimelineArchive {
  private readonly events: (RuntimeEventView | undefined)[]
  private readonly ids = new Set<string>()
  private head = 0
  private size = 0
  private truncatedValue = false

  constructor(private readonly capacity = DEFAULT_RUNTIME_TIMELINE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('timeline archive capacity must be a positive integer')
    this.events = Array.from({ length: capacity })
  }

  append(event: RuntimeEventView): boolean {
    if (this.ids.has(event.id)) return false
    if (this.size < this.capacity) {
      const index = (this.head + this.size) % this.capacity
      this.events[index] = event
      this.size += 1
    } else {
      const evicted = this.events[this.head]
      if (evicted !== undefined) this.ids.delete(evicted.id)
      this.events[this.head] = event
      this.head = (this.head + 1) % this.capacity
      this.truncatedValue = true
    }
    this.ids.add(event.id)
    return true
  }

  snapshot(): RuntimeTimelineArchiveSnapshot {
    const events: RuntimeEventView[] = []
    for (let offset = 0; offset < this.size; offset += 1) {
      const event = this.events[(this.head + offset) % this.capacity]
      if (event !== undefined) events.push(event)
    }
    return { events, truncated: this.truncatedValue }
  }
}

/** Build one stable, newest-first page from the history currently owned by the Host. */
export function buildTaskTimelinePage(
  detail: IssueDetailView,
  options: TaskTimelineOptions = {},
  runtimeEvents: readonly RuntimeEventView[] = detail.runtime?.recentEvents ?? [],
  historyTruncated = false,
): TaskTimelinePage {
  const events = buildEvents(detail, runtimeEvents)
  const cursor = decodeCursor(options.cursor)
  const afterCursor = cursor === undefined ? 0 : events.findIndex(event => compareTimelinePosition(event, cursor) > 0)
  const offset = afterCursor < 0 ? events.length : afterCursor
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE))
  const page = events.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    events: page,
    ...(nextOffset < events.length && page.at(-1) !== undefined ? { nextCursor: encodeCursor(page.at(-1)!) } : {}),
    coverage: detail.runtime === undefined && runtimeEvents.length === 0 ? 'provider-summary' : 'runtime-session',
    truncated: historyTruncated,
  }
}

function buildEvents(detail: IssueDetailView, runtimeEvents: readonly RuntimeEventView[]): TaskTimelineEvent[] {
  const { issue, runtime } = detail
  const events: TaskTimelineEvent[] = runtimeEvents.map(event => ({
    id: event.id,
    type: event.type,
    category: eventCategory(event.type),
    title: event.title,
    ...(event.detail === undefined ? {} : { detail: event.detail }),
    at: event.at,
  }))

  if (runtime !== undefined) {
    if (runtime.startedAt !== undefined) {
      events.push({
        id: syntheticId('agent.started', runtime.startedAt),
        type: 'agent.started',
        category: 'scheduler',
        title: 'Agent started',
        at: runtime.startedAt,
      })
    }
    const phaseType = `scheduler.${runtime.phase}`
    if (!runtimeEvents.some(event => event.type === phaseType)) {
      events.push({
        id: syntheticId(phaseType, runtime.phaseChangedAt),
        type: phaseType,
        category: 'scheduler',
        title: `Agent ${runtime.phase}`,
        ...(runtime.retry !== undefined
          ? { detail: runtime.retry.error }
          : runtime.blocked !== undefined
            ? { detail: runtime.blocked.reason }
            : {}),
        at: runtime.phaseChangedAt,
      })
    }
  }

  if (issue.updatedAt !== undefined) {
    events.push({
      id: syntheticId('task.updated', issue.updatedAt),
      type: 'task.updated',
      category: 'task',
      title: 'Task updated',
      detail: issue.state.name,
      at: issue.updatedAt,
    })
  }
  if (issue.createdAt !== undefined) {
    events.push({
      id: syntheticId('task.created', issue.createdAt),
      type: 'task.created',
      category: 'task',
      title: 'Task created',
      at: issue.createdAt,
    })
  }

  return dedupeEvents(events).sort(compareTimelinePosition)
}

function eventCategory(type: string): TaskTimelineCategory {
  if (type.startsWith('turn/') || type.startsWith('assistant/') || type.startsWith('tool/')) return 'agent'
  if (type.startsWith('task.')) return 'task'
  if (type.startsWith('scheduler.') || type.startsWith('agent.')) return 'scheduler'
  return 'system'
}

function dedupeEvents(events: readonly TaskTimelineEvent[]): TaskTimelineEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

function encodeCursor(event: Pick<TaskTimelineEvent, 'at' | 'id'>): string {
  return `${CURSOR_PREFIX}${encodeURIComponent(event.at)}|${encodeURIComponent(event.id)}`
}

function decodeCursor(cursor: string | undefined): { readonly at: string; readonly id: string } | undefined {
  if (cursor === undefined) return undefined
  if (!cursor.startsWith(CURSOR_PREFIX)) throw new Error('invalid timeline cursor')
  const separator = cursor.indexOf('|', CURSOR_PREFIX.length)
  if (separator < 0) throw new Error('invalid timeline cursor')
  try {
    const at = decodeURIComponent(cursor.slice(CURSOR_PREFIX.length, separator))
    const id = decodeURIComponent(cursor.slice(separator + 1))
    if (!Number.isFinite(Date.parse(at)) || id === '') throw new Error('invalid timeline cursor')
    return { at, id }
  } catch {
    throw new Error('invalid timeline cursor')
  }
}

function compareTimelinePosition(
  left: Pick<TaskTimelineEvent, 'at' | 'id'>,
  right: Pick<TaskTimelineEvent, 'at' | 'id'>,
): number {
  const time = Date.parse(right.at) - Date.parse(left.at)
  return Number.isFinite(time) && time !== 0 ? time : left.id.localeCompare(right.id)
}

function syntheticId(type: string, at: string): string {
  return `synthetic:${type}:${at}`
}
