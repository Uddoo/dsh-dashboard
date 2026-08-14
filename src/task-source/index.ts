/** Public TaskSource capability seam for remote trackers and Host-local tasks. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { TaskIssue, TaskSourceContext } from '../domain/issue.ts'

export type { IssueBlocker, IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'

export interface TaskSourceCredentialStatus {
  readonly ref: string
  readonly label: string
  readonly configured: boolean
  readonly source?: string
  readonly writable: boolean
}

export interface CreateTaskInput {
  readonly title: string
  readonly description?: string
  readonly state?: string
  readonly priority?: number
}

export interface UpdateTaskInput {
  readonly title?: string
  readonly description?: string | null
  readonly state?: string
  readonly priority?: number | null
  /** Optional compare-and-swap token used by human editors. */
  readonly expectedUpdatedAt?: string
}

export interface TaskSourceCapabilities {
  readonly create: boolean
  readonly update: boolean
  readonly delete: boolean
  readonly states: readonly string[]
}

export type TaskSourceAgentTool =
  | {
      readonly kind: 'graphql'
      readonly name: string
      readonly description: string
      execute(query: string, variables: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown>
    }
  | {
      readonly kind: 'rest'
      readonly name: string
      readonly description: string
      execute(request: {
        readonly method: string
        readonly path: string
        readonly query?: Readonly<Record<string, unknown>>
        readonly body?: unknown
      }, signal?: AbortSignal): Promise<unknown>
    }
  | {
      readonly kind: 'task-mutation'
      readonly name: string
      readonly description: string
      execute(request: {
        readonly operation: 'get' | 'update'
        readonly nativeRef: string
        readonly title?: string
        readonly description?: string | null
        readonly state?: string
        readonly priority?: number | null
      }, signal?: AbortSignal): Promise<unknown>
    }

/** Read-side and scheduler-side operations implemented by one task provider. */
export interface TaskSource {
  readonly kind: string
  context(): TaskSourceContext
  listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]>
  listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]>
  getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]>
  credentialStatuses?(): Promise<readonly TaskSourceCredentialStatus[]>
  capabilities?(): TaskSourceCapabilities
  createTask?(input: CreateTaskInput, signal?: AbortSignal): Promise<TaskIssue>
  updateTask?(nativeRef: string, input: UpdateTaskInput, signal?: AbortSignal): Promise<TaskIssue>
  deleteTask?(nativeRef: string, signal?: AbortSignal): Promise<boolean>
  agentTool?(): TaskSourceAgentTool
  /** @deprecated Implement `agentTool()` for new providers. */
  executeRaw?(query: string, variables: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown>
}

/** Preserve the pre-0.2 GraphQL seam while external providers migrate to `agentTool()`. */
export function resolveTaskSourceAgentTool(source: TaskSource): TaskSourceAgentTool | undefined {
  const explicit = source.agentTool?.()
  if (explicit !== undefined || source.executeRaw === undefined) return explicit
  const legacyExecute = source.executeRaw.bind(source)
  const slug = source.kind.trim().toLocaleLowerCase('en-US').replaceAll(/[^a-z0-9_]+/gu, '_').replace(/^_+|_+$/gu, '')
  return {
    kind: 'graphql',
    name: `${slug === '' ? 'task_source' : slug}_graphql`,
    description: `Call the ${source.kind} GraphQL API through the configured dsh-dashboard task source. Authentication is supplied by the Host.`,
    execute: async (query, variables, signal) => await legacyExecute(query, variables, signal),
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dashboardTaskSources: TaskSourceRegistry
  }
}

/** Layer-owned registry; later providers register without importing the Linear implementation. */
export class TaskSourceRegistry extends Service {
  private readonly sources = new Map<string, TaskSource>()

  constructor(ctx: Context) {
    super(ctx, 'dashboardTaskSources')
  }

  /** Register one provider kind for the caller fiber. */
  register(source: TaskSource): () => void {
    if (this.sources.has(source.kind)) {
      throw new Error(`dsh-dashboard: task source ${JSON.stringify(source.kind)} is already registered`)
    }
    return this.ctx.effect(() => {
      this.sources.set(source.kind, source)
      return () => { this.sources.delete(source.kind) }
    }, `dashboardTaskSources.register(${JSON.stringify(source.kind)})`)
  }

  /** Resolve one provider kind or fail with the current catalog. */
  require(kind: string): TaskSource {
    const source = this.sources.get(kind)
    if (source !== undefined) return source
    throw new Error(`dsh-dashboard: task source ${JSON.stringify(kind)} is not registered (known: ${this.kinds.join(', ') || 'none'})`)
  }

  /** Registered provider ids in deterministic order. */
  get kinds(): readonly string[] {
    return [...this.sources.keys()].sort()
  }
}
