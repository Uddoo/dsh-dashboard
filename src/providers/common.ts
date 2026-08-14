/** Shared HTTP, decoding, and label-backed state helpers for REST trackers. */

import type { IssueState, TaskIssue } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'

export type FetchLike = typeof globalThis.fetch

export interface HttpJsonResult {
  readonly data: unknown
  readonly response: Response
}

export function validateRemoteEndpoint(endpoint: string, provider: string): URL {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new Error(`dsh-dashboard: ${provider} endpoint must use HTTPS unless it is loopback`)
  }
  return url
}

export function apiUrl(endpoint: string, path: string, query: Readonly<Record<string, unknown>> = {}): URL {
  assertSafeApiPath(path)
  const base = new URL(endpoint)
  if (base.search !== '' || base.hash !== '') {
    throw new Error('provider API endpoint must not contain a query or fragment')
  }
  const endpointPath = base.pathname.replace(/\/+$/u, '')
  const url = new URL(base)
  url.pathname = `${endpointPath}${path}`
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item))
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

/** Reject paths that URL or upstream router normalization could move outside the allowed API namespace. */
function assertSafeApiPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || /[?#\\]/u.test(path)) {
    throw new Error('provider API path must be an absolute path without an origin, query, fragment, or backslash')
  }
  let decoded = path
  for (let depth = 0; depth < 8; depth += 1) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      throw new Error('provider API path contains invalid percent encoding')
    }
    if (next.includes('\\') || next.split('/').some(segment => segment === '.' || segment === '..')) {
      throw new Error('provider API path must not contain dot segments or backslashes')
    }
    if (next === decoded) return
    decoded = next
  }
  throw new Error('provider API path contains excessive nested percent encoding')
}

export async function requestJson(
  fetchImpl: FetchLike,
  provider: string,
  url: URL,
  init: RequestInit,
): Promise<HttpJsonResult> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    if (init.signal?.aborted === true) throw init.signal.reason
    throw new Error(`${provider} network request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const raw = await response.text()
  let data: unknown = null
  if (raw.trim() !== '') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(`${provider} returned non-JSON content (HTTP ${response.status})`)
    }
  }
  if (!response.ok) {
    const message = apiErrorMessage(data) ?? `${provider} request failed with HTTP ${response.status}`
    throw new Error(`${provider}: ${message}`)
  }
  return { data, response }
}

export function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error(message)
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function isoDate(value: unknown): string | undefined {
  const text = stringValue(value)
  return text !== undefined && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : undefined
}

export function uniqueLabels(values: readonly unknown[]): string[] {
  return [...new Set(values.flatMap(value => {
    const label = typeof value === 'string'
      ? stringValue(value)
      : stringValue(objectValue(value)?.name)
    return label === undefined ? [] : [label.toLocaleLowerCase('en-US')]
  }))]
}

export function filterIssuesByStates(issues: readonly TaskIssue[], states: readonly string[]): readonly TaskIssue[] {
  const wanted = new Set(states.map(normalizedState))
  return issues.filter(issue => wanted.has(normalizedState(issue.state.name)))
}

export function resolveLabelState(options: {
  readonly open: boolean
  readonly labels: readonly string[]
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
  readonly stateLabels: Readonly<Record<string, string>>
}): IssueState {
  const labels = new Set(options.labels.map(normalizedState))
  const configured = Object.entries(options.stateLabels).find(([, label]) => labels.has(normalizedState(label)))?.[0]
  const direct = options.states.find(state => labels.has(normalizedState(state)))
  const terminal = new Set(options.terminalStates.map(normalizedState))
  const candidate = configured ?? direct
  const fallback = options.open
    ? options.activeStates[0] ?? options.states[0] ?? 'Todo'
    : options.terminalStates[0] ?? 'Done'
  const name = !options.open && candidate !== undefined && !terminal.has(normalizedState(candidate))
    ? fallback
    : candidate ?? fallback
  const position = Math.max(0, options.states.findIndex(state => normalizedState(state) === normalizedState(name)))
  return {
    name,
    type: options.open ? 'started' : 'completed',
    position,
  }
}

export function inferPriority(labels: readonly string[], name?: string, weight?: number): number | undefined {
  const haystack = `${labels.join(' ')} ${name ?? ''}`.toLocaleLowerCase('en-US')
  if (/\b(urgent|critical|highest|p0)\b/u.test(haystack)) return 1
  if (/\b(high|p1)\b/u.test(haystack)) return 2
  if (/\b(medium|normal|p2)\b/u.test(haystack)) return 3
  if (/\b(low|lowest|p3|p4)\b/u.test(haystack)) return 4
  if (weight !== undefined && Number.isFinite(weight)) return Math.max(1, Math.min(4, Math.trunc(weight)))
  return undefined
}

export function slugBranch(prefix: string, identifier: string, title: string): string {
  const slug = title.toLocaleLowerCase('en-US').replaceAll(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48)
  return `${prefix}-${identifier.replaceAll(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLocaleLowerCase('en-US')}${slug === '' ? '' : `-${slug}`}`
}

function apiErrorMessage(value: unknown): string | undefined {
  const object = objectValue(value)
  const direct = stringValue(object?.message) ?? stringValue(object?.error_description) ?? stringValue(object?.error)
  if (direct !== undefined) return direct.slice(0, 500)
  const errors = object?.errors
  if (!Array.isArray(errors)) return undefined
  return errors.flatMap(entry => {
    if (typeof entry === 'string') return [entry]
    const message = stringValue(objectValue(entry)?.message)
    return message === undefined ? [] : [message]
  }).join('; ').slice(0, 500) || undefined
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}
