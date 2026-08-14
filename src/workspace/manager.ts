/** Persistent per-issue workspaces and Symphony-compatible lifecycle hooks. */

import { lstat, mkdir, realpath, rm } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ProjectWorkspaceSource } from '../catalog/types.ts'
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
  readonly source?: ProjectWorkspaceSource
}

const HOOK_OUTPUT_LIMIT_BYTES = 64 * 1024

/** Owns all filesystem mutation below the configured WORKFLOW workspace root. */
export class WorkspaceManager {
  constructor(
    private readonly ctx: Context,
    private readonly workerHost = 'local',
    private readonly resolveProjectSource: () => ProjectWorkspaceSource | undefined = () => undefined,
  ) {}

  /** Create or reuse one issue workspace and run `after_create` exactly once. */
  async prepare(issue: TaskIssue, workflow: WorkflowDefinition, signal?: AbortSignal): Promise<PreparedWorkspace> {
    const root = resolveWorkspaceRoot(workflow.workspace.root, dirname(workflow.sourcePath))
    await mkdir(root, { recursive: true })
    const rootInfo = await lstat(root)
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error(`workspace root is not a real directory: ${root}`)
    }
    const canonicalRoot = await realpath(root)
    const path = resolve(canonicalRoot, issueWorkspaceLeaf(issue))
    assertContained(canonicalRoot, path)
    const source = this.resolveProjectSource()

    let createdNow = false
    try {
      const info = await lstat(path)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`issue workspace is not a real directory: ${path}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (source?.strategy === 'worktree') {
        await this.createWorktree(source, path, workflow.hooks.timeout_ms, signal)
      } else {
        await mkdir(path)
      }
      createdNow = true
    }
    const canonicalPath = await realpath(path)
    assertContained(canonicalRoot, canonicalPath)
    if (source?.strategy === 'worktree') {
      await this.assertGitWorktree(source, canonicalPath, workflow.hooks.timeout_ms, signal)
    }
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
    const beforeHook = await this.resolveExistingTarget(issue, workflow, signal)
    if (beforeHook === undefined) return false
    if (workflow.hooks.before_remove !== undefined) {
      await this.runHook('before_remove', workflow.hooks.before_remove, beforeHook.path, issue, workflow, signal)
    }
    const afterHook = await this.resolveExistingTarget(issue, workflow, signal)
    if (afterHook === undefined || !samePath(beforeHook.root, afterHook.root) || !samePath(beforeHook.path, afterHook.path)) {
      throw new Error(`workspace target changed during before_remove for ${issue.identifier}; refusing recursive removal`)
    }
    await this.removeValidatedTarget(afterHook, workflow.hooks.timeout_ms, signal)
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
    await this.removeValidatedTarget(current, workflow.hooks.timeout_ms)
    this.ctx.logger.info('dsh-dashboard: removed incomplete workspace %s after after_create failure', current.path)
  }

  private async resolveExistingTarget(
    issue: TaskIssue,
    workflow: WorkflowDefinition,
    signal?: AbortSignal,
  ): Promise<ValidatedWorkspaceTarget | undefined> {
    const configuredRoot = resolveWorkspaceRoot(workflow.workspace.root, dirname(workflow.sourcePath))
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
    const source = this.resolveProjectSource()
    if (source?.strategy === 'worktree') {
      await this.assertGitWorktree(source, canonicalPath, workflow.hooks.timeout_ms, signal)
    }
    return { root: canonicalRoot, path: canonicalPath, ...(source === undefined ? {} : { source }) }
  }

  private async createWorktree(
    source: Extract<ProjectWorkspaceSource, { readonly strategy: 'worktree' }>,
    path: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runGit(
      source.repositoryRoot,
      ['worktree', 'add', '--detach', path, 'HEAD'],
      timeoutMs,
      signal,
    )
    this.ctx.logger.info('dsh-dashboard: created Git worktree %s from %s', path, source.repositoryRoot)
  }

  private async assertGitWorktree(
    source: Extract<ProjectWorkspaceSource, { readonly strategy: 'worktree' }>,
    path: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const [sourceCommonDirectory, targetCommonDirectory, targetRoot] = await Promise.all([
      this.runGit(source.repositoryRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'], timeoutMs, signal),
      this.runGit(path, ['rev-parse', '--path-format=absolute', '--git-common-dir'], timeoutMs, signal),
      this.runGit(path, ['rev-parse', '--path-format=absolute', '--show-toplevel'], timeoutMs, signal),
    ])
    if (!samePath(sourceCommonDirectory, targetCommonDirectory) || !samePath(path, targetRoot)) {
      throw new Error(`issue workspace is not a worktree of the selected repository: ${path}`)
    }
  }

  private async removeValidatedTarget(
    target: ValidatedWorkspaceTarget,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (target.source?.strategy === 'worktree') {
      await this.runGit(
        target.source.repositoryRoot,
        ['worktree', 'remove', '--force', target.path],
        timeoutMs,
        signal,
      )
      return
    }
    await rm(target.path, { recursive: true, force: false })
  }

  private async runGit(
    cwd: string,
    args: readonly string[],
    timeoutMs: number,
    outerSignal?: AbortSignal,
  ): Promise<string> {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = outerSignal === undefined ? timeout : AbortSignal.any([outerSignal, timeout])
    return await new Promise<string>((accept, reject) => {
      execFile('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        maxBuffer: HOOK_OUTPUT_LIMIT_BYTES,
        windowsHide: true,
        signal,
      }, (error, stdout, stderr) => {
        if (signal.aborted) {
          reject(signal.reason instanceof Error ? signal.reason : new Error('Git workspace operation was cancelled'))
          return
        }
        if (error !== null) {
          const detail = stderr.trim().slice(-4000)
          reject(new Error(`git ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`))
          return
        }
        accept(stdout.trim())
      })
    })
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
