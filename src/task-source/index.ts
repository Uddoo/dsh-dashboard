/** Public TaskSource capability seam for tracker adapters and the future local-task provider. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { TaskIssue, TaskSourceContext } from '../domain/issue.ts'

export type { IssueBlocker, IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'

/** Read-side and scheduler-side operations implemented by one task provider. */
export interface TaskSource {
  readonly kind: string
  context(): TaskSourceContext
  listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]>
  listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]>
  getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]>
  executeRaw?(query: string, variables: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown>
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
