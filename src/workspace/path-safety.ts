/** Deterministic workspace naming and containment checks. */

import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import type { TaskIssue } from '../domain/issue.ts'

const UNSAFE = /[^A-Za-z0-9._-]/g

/** Expand `~` only as a complete first path segment. */
export function expandHome(input: string): string {
  if (input === '~') return homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) return resolve(homedir(), input.slice(2))
  return input
}

/**
 * Convert an issue identifier into a stable workspace leaf.
 * If sanitization changes it, append the first 16 lower-case SHA-256 hex chars
 * so two provider ids that collapse to the same safe text remain distinct.
 */
export function workspaceLeaf(identifier: string): string {
  const trimmed = identifier.trim()
  const sanitized = trimmed.replace(UNSAFE, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  const base = sanitized === '' ? 'issue' : sanitized
  if (base === trimmed) return base
  const digest = createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 16)
  return `${base}-${digest}`
}

/** Scope one workspace by provider, configured project, and human-facing task id. */
export function issueWorkspaceLeaf(issue: Pick<TaskIssue, 'sourceKind' | 'scopeRef' | 'identifier'>): string {
  return workspaceLeaf(`${issue.sourceKind}-${issue.scopeRef}-${issue.identifier}`)
}

/** Resolve a configured root relative to the plugin process working directory. */
export function resolveWorkspaceRoot(configured: string, cwd = process.cwd()): string {
  const expanded = expandHome(configured)
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded)
}

/** Fail closed unless `candidate` is a strict descendant of `root`. */
export function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  if (rel === '' || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`workspace path escapes its configured root: ${candidate}`)
  }
}
