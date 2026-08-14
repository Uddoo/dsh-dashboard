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

/** Dashboard-owned provenance attached only to cross-project projections. */
export interface TaskIssueOrigin {
  readonly projectId: string
  readonly projectName: string
  readonly providerKind: string
  readonly providerLabel: string
  readonly contextLabel: string
}

/**
 * Normalized task record.
 *
 * `scopeRef` identifies the configured provider project. `nativeRef` is
 * intentionally opaque inside that scope: Linear ids, GitHub issue numbers,
 * Jira keys, and local-task ids all pass through the same core without being
 * interpreted by the orchestrator.
 */
export interface TaskIssue {
  readonly sourceKind: string
  readonly scopeRef: string
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
  /** Present in the global composite view; provider adapters never need to set it. */
  readonly origin?: TaskIssueOrigin
}

/** Collision-free process key used for claims and runtime maps. */
export function issueKey(issue: Pick<TaskIssue, 'sourceKind' | 'scopeRef' | 'nativeRef' | 'origin'>): string {
  const providerKey = [issue.sourceKind, issue.scopeRef, issue.nativeRef].map(encodeURIComponent).join(':')
  return issue.origin === undefined
    ? providerKey
    : `project:${encodeURIComponent(issue.origin.projectId)}:${providerKey}`
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
