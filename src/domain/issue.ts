/** Provider-neutral issue model used by scheduling, runtime state, and the Dashboard. */

/** A provider-owned state with enough metadata to render without hard-coded Linear colors. */
export interface IssueState {
  readonly name: string
  readonly type?: string
  readonly color?: string
  readonly position?: number
}

/** One issue preventing another issue from being dispatched. */
export interface IssueBlocker {
  readonly nativeRef?: string
  readonly identifier?: string
  readonly state?: string
}

/** Stable provider context rendered by the dynamic `Linear · ENG` control. */
export interface TaskSourceContext {
  readonly kind: string
  readonly providerLabel: string
  readonly projectLabel: string
  readonly projectRef: string
}

/**
 * Normalized task record.
 *
 * `nativeRef` is intentionally opaque: Linear ids, GitHub node ids, Jira keys,
 * and the future local-task ids all pass through the same core without being
 * interpreted by the orchestrator.
 */
export interface TaskIssue {
  readonly sourceKind: string
  readonly nativeRef: string
  readonly identifier: string
  readonly title: string
  readonly description?: string
  readonly priority?: number
  readonly state: IssueState
  readonly branchName?: string
  readonly url?: string
  readonly assigneeId?: string
  readonly labels: readonly string[]
  readonly blockedBy: readonly IssueBlocker[]
  readonly dispatchable: boolean
  readonly createdAt?: string
  readonly updatedAt?: string
}

/** Collision-free process key used for claims and runtime maps. */
export function issueKey(issue: Pick<TaskIssue, 'sourceKind' | 'nativeRef'>): string {
  return `${issue.sourceKind}:${issue.nativeRef}`
}

/** Case- and surrounding-whitespace-insensitive state comparison. */
export function normalizedState(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

/** Whether an issue carries every required label. */
export function hasRequiredLabels(issue: TaskIssue, required: readonly string[]): boolean {
  if (required.length === 0) return true
  const labels = new Set(issue.labels.map(normalizedState))
  return required.every(label => labels.has(normalizedState(label)))
}
