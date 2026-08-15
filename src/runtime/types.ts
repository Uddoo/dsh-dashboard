/** Lossless-JSON Host ↔ Dashboard protocol. */

import type { TaskIssue, TaskIssueOrigin, TaskSourceContext } from '../domain/issue.ts'
import type {
  AddDiscoveryRootInput,
  ProjectCatalogView,
  ProjectScanResult,
  RegisterProjectInput,
} from '../catalog/types.ts'
import type { CreateTaskInput, TaskSourceCredentialStatus, UpdateTaskInput } from '../task-source/index.ts'

export interface TokenTotals {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly reasoning: number
  readonly total: number
}

export interface RuntimeEventView {
  /** Stable within one Host lifetime; Harness events use `sessionId + seq`. */
  readonly id: string
  readonly type: string
  readonly title: string
  readonly detail?: string
  readonly at: string
}

export type IssueRuntimePhase = 'running' | 'retrying' | 'blocked' | 'idle'

export interface IssueRuntimeView {
  readonly key: string
  readonly identifier: string
  readonly phase: IssueRuntimePhase
  readonly state: string
  readonly sessionId?: string
  readonly turnCount: number
  readonly startedAt?: string
  /** Timestamp of the current `phase` transition, independent of later session events. */
  readonly phaseChangedAt: string
  readonly updatedAt: string
  readonly workerHost: string
  readonly workspacePath?: string
  readonly lastEvent?: string
  readonly lastMessage?: string
  readonly lastEventAt?: string
  readonly tokens: TokenTotals
  readonly retry?: {
    readonly attempt: number
    readonly dueAt: string
    readonly error: string
  }
  readonly blocked?: {
    readonly reason: string
  }
  readonly recentEvents: readonly RuntimeEventView[]
  /** Present in the global composite view. */
  readonly origin?: TaskIssueOrigin
}

export interface BoardColumn {
  readonly name: string
  readonly type?: string
  readonly color?: string
  readonly position: number
  readonly hidden: boolean
  readonly issues: readonly TaskIssue[]
}

export interface DashboardConfigurationView {
  readonly workflowPath: string
  readonly workflowLoadedAt?: string
  readonly workflowError?: string
  readonly trackerKind?: string
  readonly projectName?: string
  readonly projectRef?: string
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
  readonly workspaceRoot?: string
  readonly maxConcurrentAgents?: number
  readonly maxTurns?: number
  readonly pollingIntervalMs?: number
  readonly permissionPreset: string
  readonly agentProfile?: string
  readonly agentPreset?: string
  readonly credentials: readonly TaskSourceCredentialStatus[]
  /** Compatibility projection for clients built against 0.1.x. */
  readonly credentialRef?: string
  readonly credentialConfigured?: boolean
  readonly credentialSource?: string
  readonly credentialWritable?: boolean
}

export interface DashboardSnapshot {
  readonly version: 2
  readonly generatedAt: string
  readonly selection: {
    readonly mode: 'project'
    readonly projectId?: string
  } | {
    readonly mode: 'global'
    readonly projectCount: number
    readonly readyProjectCount: number
  }
  readonly context?: TaskSourceContext
  readonly taskMutations: {
    readonly canCreate: boolean
    readonly canUpdate: boolean
    readonly canDelete: boolean
    readonly states: readonly string[]
  }
  readonly paused: boolean
  readonly board: {
    readonly columns: readonly BoardColumn[]
    readonly total: number
  }
  readonly runtime: {
    readonly running: number
    readonly retrying: number
    readonly blocked: number
    readonly capacity: number
    readonly tokens: TokenTotals
    readonly lastRefreshAt?: string
    readonly nextRefreshAt?: string
    readonly lastError?: string
    readonly issues: readonly IssueRuntimeView[]
  }
  readonly configuration: DashboardConfigurationView
  readonly catalog: ProjectCatalogView
}

export interface IssueDetailView {
  readonly issue: TaskIssue
  readonly runtime?: IssueRuntimeView
}

export type TaskTimelineCategory = 'task' | 'agent' | 'scheduler' | 'system'

export interface TaskTimelineEvent {
  readonly id: string
  readonly type: string
  readonly category: TaskTimelineCategory
  readonly title: string
  readonly detail?: string
  readonly at: string
}

export interface TaskTimelinePage {
  readonly events: readonly TaskTimelineEvent[]
  readonly nextCursor?: string
  /** Describes the history boundary honestly until Provider history adapters land. */
  readonly coverage: 'runtime-session' | 'provider-summary'
  /** True when older runtime events were evicted by the bounded Host retention policy. */
  readonly truncated: boolean
}

export interface TaskTimelineOptions {
  readonly cursor?: string
  readonly limit?: number
}

export interface DashboardRpcMap {
  readonly state: { input: Record<string, never>; output: DashboardSnapshot }
  readonly refresh: { input: Record<string, never>; output: DashboardSnapshot }
  readonly issue: { input: { key: string }; output: IssueDetailView }
  readonly timeline: { input: { key: string; cursor?: string; limit?: number }; output: TaskTimelinePage }
  readonly pause: { input: { paused: boolean }; output: DashboardSnapshot }
  readonly stop: { input: { key: string }; output: DashboardSnapshot }
  readonly createTask: { input: CreateTaskInput; output: DashboardSnapshot }
  readonly updateTask: { input: { nativeRef: string; changes: UpdateTaskInput }; output: DashboardSnapshot }
  readonly deleteTask: { input: { nativeRef: string }; output: DashboardSnapshot }
  readonly switchProject: { input: { projectId: string }; output: DashboardSnapshot }
  readonly switchGlobal: { input: Record<string, never>; output: DashboardSnapshot }
  readonly addDiscoveryRoot: { input: AddDiscoveryRootInput; output: DashboardSnapshot }
  readonly removeDiscoveryRoot: { input: { id: string }; output: DashboardSnapshot }
  readonly scanProjects: { input: { rootId: string }; output: ProjectScanResult }
  readonly registerProjectCandidate: { input: { token: string }; output: DashboardSnapshot }
  readonly registerProject: { input: RegisterProjectInput; output: DashboardSnapshot }
}

export function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
}

export function addTokens(left: TokenTotals, right: TokenTotals): TokenTotals {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    reasoning: left.reasoning + right.reasoning,
    total: left.total + right.total,
  }
}
