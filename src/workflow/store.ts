/** Dynamically reloaded, last-good WORKFLOW.md store. */

import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { parseWorkflow, type WorkflowParseOptions } from './parser.ts'
import type { WorkflowDefinition, WorkflowStatus } from './types.ts'

/** Hot-reload store whose invalid reloads never replace the last good definition. */
export class WorkflowStore {
  private current: WorkflowDefinition | undefined
  private error: string | undefined
  private lastAttemptAt: string | undefined
  private watcher: FSWatcher | undefined
  private debounce: NodeJS.Timeout | undefined
  private readonly listeners = new Set<() => void>()
  readonly path: string

  constructor(
    private readonly ctx: Context,
    workflowPath: string,
    private readonly parseOptions: WorkflowParseOptions,
    cwd = process.cwd(),
  ) {
    this.path = resolve(cwd, workflowPath)
  }

  /** Load once, then watch the containing directory so atomic replacement is observed. */
  async start(): Promise<void> {
    await this.reload()
    this.watcher = watch(dirname(this.path), { persistent: false }, (_event, filename) => {
      if (filename !== null && resolve(dirname(this.path), filename.toString()) !== this.path) return
      if (this.debounce !== undefined) clearTimeout(this.debounce)
      this.debounce = setTimeout(() => { void this.reload() }, 75)
    })
    this.watcher.on('error', (error) => {
      this.ctx.logger.warn('dsh-dashboard: WORKFLOW.md watcher failed: %s', error.message)
    })
  }

  /** Stop directory observation. */
  stop(): void {
    if (this.debounce !== undefined) clearTimeout(this.debounce)
    this.debounce = undefined
    this.watcher?.close()
    this.watcher = undefined
  }

  /** Read and validate; retain current on any failure. */
  async reload(): Promise<boolean> {
    this.lastAttemptAt = new Date().toISOString()
    try {
      const text = await readFile(this.path, 'utf8')
      const next = parseWorkflow(text, this.path, this.parseOptions)
      this.current = next
      this.error = undefined
      this.ctx.logger.info('dsh-dashboard: loaded workflow %s', this.path)
      this.emit()
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.ctx.logger.warn('dsh-dashboard: workflow reload rejected; retaining last-good definition: %s', this.error)
      this.emit()
      return false
    }
  }

  /** Current validated definition, or a loud error before the first good load. */
  require(): WorkflowDefinition {
    if (this.current !== undefined) return this.current
    throw new Error(this.error ?? `no valid workflow has been loaded from ${this.path}`)
  }

  /** Safe status projection; never exposes the raw YAML separately from its prompt. */
  status(): WorkflowStatus {
    return {
      ...(this.current === undefined ? {} : { current: this.current }),
      ...(this.error === undefined ? {} : { error: this.error }),
      ...(this.lastAttemptAt === undefined ? {} : { lastAttemptAt: this.lastAttemptAt }),
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
