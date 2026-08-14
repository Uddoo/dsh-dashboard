/** Validated WORKFLOW.md configuration and prompt body. */

export interface WorkflowTracker {
  readonly kind: string
  readonly provider: {
    readonly project_slug: string
    readonly context_label?: string
    readonly assignee?: string
  }
  readonly required_labels: readonly string[]
  readonly active_states: readonly string[]
  readonly terminal_states: readonly string[]
}

export interface WorkflowPolling {
  readonly interval_ms: number
}

export interface WorkflowWorkspace {
  readonly root: string
}

export interface WorkflowHooks {
  readonly after_create?: string
  readonly before_run?: string
  readonly after_run?: string
  readonly before_remove?: string
  readonly timeout_ms: number
}

export interface WorkflowAgent {
  readonly max_concurrent_agents: number
  readonly max_concurrent_agents_by_state: Readonly<Record<string, number>>
  readonly max_turns: number
  readonly max_retry_backoff_ms: number
}

export interface WorkflowDashboard {
  readonly visible_states: readonly string[]
}

export interface WorkflowDefinition {
  readonly tracker: WorkflowTracker
  readonly polling: WorkflowPolling
  readonly workspace: WorkflowWorkspace
  readonly hooks: WorkflowHooks
  readonly agent: WorkflowAgent
  readonly dashboard: WorkflowDashboard
  readonly prompt: string
  readonly sourcePath: string
  readonly loadedAt: string
}

export interface WorkflowStatus {
  readonly current?: WorkflowDefinition
  readonly error?: string
  readonly lastAttemptAt?: string
}
