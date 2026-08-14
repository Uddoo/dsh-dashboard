/** Persistent per-issue workspaces and Symphony-compatible lifecycle hooks. */

import { lstat, mkdir, realpath, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { TaskIssue } from '../domain/issue.ts'
import type { WorkflowDefinition } from '../workflow/types.ts'
import { assertContained, issueWorkspaceLeaf, resolveWorkspaceRoot } from './path-safety.ts'

export interface PreparedWorkspace {
  readonly path: string
  readonly createdNow: boolean
}

interface ValidatedWorkspaceTarget {
  readonly root: string
  readonly path: string
}

const HOOK_OUTPUT_LIMIT_BYTES = 64 * 1024

/** Owns all filesystem mutation below the configured WORKFLOW workspace root. */
export class WorkspaceManager {
  constructor(private readonly ctx: Context, private readonly workerHost = 'local') {}

  /** Create or reuse one issue workspace and run `after_create` exactly once. */
  async prepare(issue: TaskIssue, workflow: WorkflowDefinition, signal?: AbortSignal): Promise<PreparedWorkspace> {
    const root = resolveWorkspaceRoot(workflow.workspace.root)
    await mkdir(root, { recursive: true })
    const rootInfo = await lstat(root)
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error(`workspace root is not a real directory: ${root}`)
    }
    const canonicalRoot = await realpath(root)
    const path = resolve(canonicalRoot, issueWorkspaceLeaf(issue))
    assertContained(canonicalRoot, path)

    let createdNow = false
    try {
      const info = await lstat(path)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`issue workspace is not a real directory: ${path}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(path)
      createdNow = true
    }
    const canonicalPath = await realpath(path)
    assertContained(canonicalRoot, canonicalPath)
    if (createdNow && workflow.hooks.after_create !== undefined) {
      try {
        await this.runHook('after_create', workflow.hooks.after_create, canonicalPath, issue, workflow, signal)
      } catch (hookError) {
        try {
          await this.removeFailedInitialization(issue, workflow, { root: canonicalRoot, path: canonicalPath })
        } catch (cleanupError) {
          throw new AggregateError(
            [hookError, cleanupError],
            `after_create failed for ${issue.identifier}, and the incomplete workspace could not be removed safely`,
          )
        }
        throw hookError
      }
    }
    return { path: canonicalPath, createdNow }
  }

  async beforeRun(path: string, issue: TaskIssue, workflow: WorkflowDefinition, signal?: AbortSignal): Promise<void> {
    if (workflow.hooks.before_run !== undefined) {
      await this.runHook('before_run', workflow.hooks.before_run, path, issue, workflow, signal)
    }
  }

  /** `after_run` is observable but never replaces the primary Agent outcome. */
  async afterRun(path: string, issue: TaskIssue, workflow: WorkflowDefinition): Promise<void> {
    if (workflow.hooks.after_run === undefined) return
    try {
      await this.runHook('after_run', workflow.hooks.after_run, path, issue, workflow)
    } catch (error) {
      this.ctx.logger.warn('dsh-dashboard: after_run failed for %s: %s', issue.identifier, error instanceof Error ? error.message : String(error))
    }
  }

  /** Run `before_remove`, revalidate the exact target, then remove only that issue workspace. */
  async remove(issue: TaskIssue, workflow: WorkflowDefinition, signal?: AbortSignal): Promise<boolean> {
    const beforeHook = await this.resolveExistingTarget(issue, workflow)
    if (beforeHook === undefined) return false
    if (workflow.hooks.before_remove !== undefined) {
      await this.runHook('before_remove', workflow.hooks.before_remove, beforeHook.path, issue, workflow, signal)
    }
    const afterHook = await this.resolveExistingTarget(issue, workflow)
    if (afterHook === undefined || !samePath(beforeHook.root, afterHook.root) || !samePath(beforeHook.path, afterHook.path)) {
      throw new Error(`workspace target changed during before_remove for ${issue.identifier}; refusing recursive removal`)
    }
    await rm(afterHook.path, { recursive: true, force: false })
    this.ctx.logger.info('dsh-dashboard: removed terminal workspace %s', afterHook.path)
    return true
  }

  private async removeFailedInitialization(
    issue: TaskIssue,
    workflow: WorkflowDefinition,
    expected: ValidatedWorkspaceTarget,
  ): Promise<void> {
    const current = await this.resolveExistingTarget(issue, workflow)
    if (current === undefined) return
    if (!samePath(expected.root, current.root) || !samePath(expected.path, current.path)) {
      throw new Error(`workspace target changed while after_create was running for ${issue.identifier}`)
    }
    await rm(current.path, { recursive: true, force: false })
    this.ctx.logger.info('dsh-dashboard: removed incomplete workspace %s after after_create failure', current.path)
  }

  private async resolveExistingTarget(
    issue: TaskIssue,
    workflow: WorkflowDefinition,
  ): Promise<ValidatedWorkspaceTarget | undefined> {
    const configuredRoot = resolveWorkspaceRoot(workflow.workspace.root)
    let rootInfo
    try {
      rootInfo = await lstat(configuredRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error(`workspace root is not a real directory: ${configuredRoot}`)
    }
    const canonicalRoot = await realpath(configuredRoot)
    const candidate = resolve(canonicalRoot, issueWorkspaceLeaf(issue))
    assertContained(canonicalRoot, candidate)
    let info
    try {
      info = await lstat(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`refusing to remove non-directory or symlink workspace: ${candidate}`)
    }
    const canonicalPath = await realpath(candidate)
    assertContained(canonicalRoot, canonicalPath)
    return { root: canonicalRoot, path: canonicalPath }
  }

  private async runHook(
    name: string,
    command: string,
    cwd: string,
    issue: TaskIssue,
    workflow: WorkflowDefinition,
    outerSignal?: AbortSignal,
  ): Promise<void> {
    const timeout = AbortSignal.timeout(workflow.hooks.timeout_ms)
    const signal = outerSignal === undefined ? timeout : AbortSignal.any([outerSignal, timeout])
    const executable = process.platform === 'win32' ? 'pwsh' : '/bin/sh'
    const args = process.platform === 'win32'
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command]
    this.ctx.logger.info('dsh-dashboard: running %s for %s in %s', name, issue.identifier, cwd)
    await new Promise<void>((accept, reject) => {
      const child = spawn(executable, args, {
        cwd,
        env: {
          ...process.env,
          SYMPHONY_ISSUE_ID: issue.nativeRef,
          SYMPHONY_ISSUE_IDENTIFIER: issue.identifier,
          SYMPHONY_WORKER_HOST: this.workerHost,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const stdout = new TailBuffer(HOOK_OUTPUT_LIMIT_BYTES)
      const stderr = new TailBuffer(HOOK_OUTPUT_LIMIT_BYTES)
      child.stdout.on('data', chunk => stdout.append(chunk))
      child.stderr.on('data', chunk => stderr.append(chunk))
      const onAbort = (): void => { child.kill() }
      signal.addEventListener('abort', onAbort, { once: true })
      child.once('error', reject)
      child.once('close', (code, signalName) => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) {
          reject(signal.reason instanceof Error ? signal.reason : new Error(`${name} was cancelled`))
          return
        }
        if (code === 0) {
          const text = stdout.text().trim()
          if (text !== '') this.ctx.logger.debug('dsh-dashboard: %s stdout: %s', name, text.slice(-4000))
          accept()
          return
        }
        const detail = stderr.text().trim().slice(-4000)
        reject(new Error(`${name} exited with ${code ?? signalName ?? 'unknown'}${detail === '' ? '' : `: ${detail}`}`))
      })
    })
  }
}

function samePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left)
  const resolvedRight = resolve(right)
  return process.platform === 'win32'
    ? resolvedLeft.toLocaleLowerCase('en-US') === resolvedRight.toLocaleLowerCase('en-US')
    : resolvedLeft === resolvedRight
}

class TailBuffer {
  private value = Buffer.alloc(0)

  constructor(private readonly maximumBytes: number) {}

  append(chunk: unknown): void {
    const input = Buffer.from(chunk as Uint8Array)
    if (input.length >= this.maximumBytes) {
      this.value = Buffer.from(input.subarray(input.length - this.maximumBytes))
      return
    }
    const overflow = Math.max(0, this.value.length + input.length - this.maximumBytes)
    const retained = overflow === 0 ? this.value : this.value.subarray(overflow)
    this.value = Buffer.concat([retained, input], retained.length + input.length)
  }

  text(): string {
    return this.value.toString('utf8')
  }
}
