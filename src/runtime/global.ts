/** Pure cross-project projection used by the read-only global Dashboard. */

import type { ProjectCatalogView, ProjectView } from '../catalog/types.ts'
import type { IssueState, TaskIssue, TaskIssueOrigin } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'
import type { BoardColumn, DashboardSnapshot, IssueRuntimeView } from './types.ts'
import { addTokens, emptyTokens } from './types.ts'

export interface ProjectSnapshotProjection {
  readonly project: ProjectView
  readonly snapshot: DashboardSnapshot
}

interface CanonicalColumnDefinition {
  readonly name: string
  readonly type: string
  readonly color: string
  readonly position: number
  readonly hidden: boolean
}

const CANONICAL_COLUMNS: readonly CanonicalColumnDefinition[] = [
  { name: 'Backlog', type: 'backlog', color: '#8a9ab4', position: 0, hidden: false },
  { name: 'Todo', type: 'unstarted', color: '#8a9ab4', position: 1, hidden: false },
  { name: 'In Progress', type: 'started', color: '#f3bd19', position: 2, hidden: false },
  { name: 'Human Review', type: 'started', color: '#f04452', position: 3, hidden: false },
  { name: 'Rework', type: 'started', color: '#e99b2f', position: 4, hidden: true },
  { name: 'Merging', type: 'started', color: '#35b88a', position: 5, hidden: true },
  { name: 'Done', type: 'completed', color: '#35b88a', position: 6, hidden: true },
  { name: 'Canceled', type: 'canceled', color: '#929eb1', position: 7, hidden: true },
  { name: 'Duplicate', type: 'canceled', color: '#929eb1', position: 8, hidden: true },
]

/** Prefix one provider-local key with its owning project. */
export function globalRuntimeKey(projectId: string, sourceKey: string): string {
  return `project:${encodeURIComponent(projectId)}:${sourceKey}`
}

export function issueOrigin(project: ProjectView, snapshot: DashboardSnapshot): TaskIssueOrigin {
  const context = snapshot.context
  const providerKind = context?.kind ?? snapshot.configuration.trackerKind ?? project.trackerKind ?? 'unknown'
  return {
    projectId: project.id,
    projectName: project.name,
    providerKind,
    providerLabel: context?.providerLabel ?? providerName(providerKind),
    contextLabel: context?.projectLabel ?? project.contextLabel ?? project.name,
  }
}

/** Combine detached project snapshots without granting any cross-project mutation capability. */
export function aggregateProjectSnapshots(
  projections: readonly ProjectSnapshotProjection[],
  catalog: ProjectCatalogView,
  generatedAt = new Date().toISOString(),
): DashboardSnapshot {
  const canonical = new Map(CANONICAL_COLUMNS.map(definition => [definition.name, { ...definition, issues: [] as TaskIssue[] }]))
  const additional = new Map<string, BoardColumn & { issues: TaskIssue[] }>()
  const runtimeIssues: IssueRuntimeView[] = []
  let capacity = 0
  let lastRefreshAt: string | undefined
  const errors: string[] = []

  for (const { project, snapshot } of projections) {
    const origin = issueOrigin(project, snapshot)
    const terminal = new Set(snapshot.configuration.terminalStates.map(normalizedState))
    capacity += snapshot.runtime.capacity
    lastRefreshAt = latestTimestamp(lastRefreshAt, snapshot.runtime.lastRefreshAt)
    if (snapshot.runtime.lastError !== undefined) errors.push(`${project.name}: ${snapshot.runtime.lastError}`)

    for (const sourceColumn of snapshot.board.columns) {
      for (const sourceIssue of sourceColumn.issues) {
        const issue: TaskIssue = { ...sourceIssue, origin }
        const name = canonicalState(sourceIssue.state, sourceColumn, terminal)
        const known = canonical.get(name)
        if (known !== undefined) {
          known.issues.push(issue)
          continue
        }
        const additionalKey = normalizedState(name)
        let column = additional.get(additionalKey)
        if (column === undefined) {
          column = {
            name,
            ...(sourceColumn.type === undefined ? {} : { type: sourceColumn.type }),
            ...(sourceColumn.color === undefined ? {} : { color: sourceColumn.color }),
            position: CANONICAL_COLUMNS.length + additional.size,
            hidden: sourceColumn.hidden,
            issues: [],
          }
          additional.set(additionalKey, column)
        } else if (column.hidden && !sourceColumn.hidden) {
          // A custom state stays visible when any owning project exposes it.
          column = { ...column, hidden: false }
          additional.set(additionalKey, column)
        }
        column.issues.push(issue)
      }
    }
    for (const runtime of snapshot.runtime.issues) {
      runtimeIssues.push({
        ...runtime,
        key: globalRuntimeKey(project.id, runtime.key),
        origin,
      })
    }
  }

  const columns = [...canonical.values(), ...additional.values()].map(column => ({
    ...column,
    issues: column.issues.toSorted((left, right) => (
      (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER)
      || left.identifier.localeCompare(right.identifier, 'en-US')
    )),
  }))
  const tokens = runtimeIssues.reduce((sum, runtime) => addTokens(sum, runtime.tokens), emptyTokens())
  const readyProjectCount = catalog.projects.filter(project => project.configurationState === 'ready').length
  return {
    version: 2,
    generatedAt,
    selection: { mode: 'global', projectCount: catalog.projects.length, readyProjectCount },
    taskMutations: { canCreate: false, canUpdate: false, canDelete: false, states: [] },
    paused: projections.length > 0 && projections.every(projection => projection.snapshot.paused),
    board: {
      columns,
      total: columns.reduce((total, column) => total + column.issues.length, 0),
    },
    runtime: {
      running: runtimeIssues.filter(issue => issue.phase === 'running').length,
      retrying: runtimeIssues.filter(issue => issue.phase === 'retrying').length,
      blocked: runtimeIssues.filter(issue => issue.phase === 'blocked').length,
      capacity,
      tokens,
      ...(lastRefreshAt === undefined ? {} : { lastRefreshAt }),
      ...(errors.length === 0 ? {} : { lastError: errors.join('\n') }),
      issues: runtimeIssues.toSorted(runtimeOrder),
    },
    configuration: {
      workflowPath: '',
      activeStates: [],
      terminalStates: [],
      permissionPreset: '',
      credentials: [],
    },
    catalog,
  }
}

function canonicalState(state: IssueState, column: BoardColumn, terminal: ReadonlySet<string>): string {
  const name = normalizedState(state.name)
  const compact = name.replaceAll(/[^a-z0-9]+/gu, '')
  const type = normalizedState(state.type ?? column.type ?? '')
  if (compact.includes('duplicate')) return 'Duplicate'
  if (compact.includes('cancel') || compact.includes('declin') || type === 'canceled' || type === 'cancelled') return 'Canceled'
  if (terminal.has(name) || type === 'completed' || ['done', 'complete', 'completed', 'closed', 'resolved'].includes(compact)) return 'Done'
  if (compact.includes('rework') || compact.includes('changesrequested')) return 'Rework'
  if (compact.includes('merg')) return 'Merging'
  if (compact.includes('review') || compact.includes('approval')) return 'Human Review'
  if (compact.includes('backlog') || type === 'backlog') return 'Backlog'
  if (compact === 'todo' || compact === 'open' || compact.includes('unstarted') || type === 'unstarted') return 'Todo'
  if (compact.includes('progress') || compact === 'doing' || compact.includes('development') || type === 'started') return 'In Progress'
  return state.name
}

function providerName(kind: string): string {
  switch (kind.toLocaleLowerCase('en-US')) {
    case 'github': return 'GitHub'
    case 'gitlab': return 'GitLab'
    case 'jira': return 'Jira'
    case 'asana': return 'Asana'
    case 'linear': return 'Linear'
    case 'local': return 'Local'
    default: return kind
  }
}

function latestTimestamp(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Date.parse(left) >= Date.parse(right) ? left : right
}

function runtimeOrder(left: IssueRuntimeView, right: IssueRuntimeView): number {
  const order = { running: 0, retrying: 1, blocked: 2, idle: 3 } as const
  return order[left.phase] - order[right.phase]
    || (left.origin?.projectName ?? '').localeCompare(right.origin?.projectName ?? '', 'en-US')
    || left.identifier.localeCompare(right.identifier, 'en-US')
}
