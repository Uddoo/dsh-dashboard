/** Deterministic candidate ordering, state limits, and Symphony retry timing. */

import type { TaskIssue } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'

/** Priority ascending (1 is urgent, 0/no priority last), then oldest creation, then identifier. */
export function compareCandidates(left: TaskIssue, right: TaskIssue): number {
  const leftPriority = left.priority === undefined || left.priority <= 0 ? Number.POSITIVE_INFINITY : left.priority
  const rightPriority = right.priority === undefined || right.priority <= 0 ? Number.POSITIVE_INFINITY : right.priority
  if (leftPriority !== rightPriority) return leftPriority - rightPriority
  const leftCreated = left.createdAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(left.createdAt)
  const rightCreated = right.createdAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(right.createdAt)
  if (leftCreated !== rightCreated) return leftCreated - rightCreated
  return left.identifier.localeCompare(right.identifier, 'en-US')
}

/** Failure retry #1 is 10 seconds; each later retry doubles up to max. */
export function failureRetryDelay(attempt: number, maximumMs: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError('retry attempt must be a positive integer')
  return Math.min(10_000 * 2 ** (attempt - 1), maximumMs)
}

/** Read a case-insensitive per-state limit. */
export function stateLimit(limits: Readonly<Record<string, number>>, state: string): number | undefined {
  const wanted = normalizedState(state)
  for (const [name, value] of Object.entries(limits)) {
    if (normalizedState(name) === wanted) return value
  }
  return undefined
}
