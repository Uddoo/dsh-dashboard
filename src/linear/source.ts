/** Linear GraphQL TaskSource adapter with per-operation credential resolution. */

import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { IssueBlocker, IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'
import type { TaskSource } from '../task-source/index.ts'

const PAGE_SIZE = 50
const RELATION_PAGE_SIZE = 50
const MAX_PAGES = 200

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  state { name type color position }
  branchName
  url
  assignee { id }
  labels { nodes { name } }
  inverseRelations(first: $relationFirst) {
    nodes { type issue { id identifier state { name } } }
  }
  createdAt
  updatedAt
`

const BOARD_QUERY = `
  query DashboardLinearBoard($projectSlug: String!, $first: Int!, $relationFirst: Int!, $after: String) {
    issues(filter: {project: {slugId: {eq: $projectSlug}}}, first: $first, after: $after) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const STATES_QUERY = `
  query DashboardLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
    issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const IDS_QUERY = `
  query DashboardLinearIssuesById($ids: [ID!]!, $projectSlug: String!, $first: Int!, $relationFirst: Int!) {
    issues(filter: {id: {in: $ids}, project: {slugId: {eq: $projectSlug}}}, first: $first) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`

const VIEWER_QUERY = 'query DashboardLinearViewer { viewer { id } }'

export interface LinearSourceConfig {
  readonly endpoint: string
  readonly apiKeyRef: string
}

export interface LinearRoutingConfig {
  readonly projectSlug: string
  readonly contextLabel?: string
  readonly assignee?: string
  readonly terminalStates: readonly string[]
}

type FetchLike = typeof globalThis.fetch

interface LinearGraphqlResponse {
  readonly data?: unknown
  readonly errors?: readonly { readonly message?: unknown }[]
  readonly error?: { readonly message?: unknown }
}

interface RawIssue {
  readonly id?: unknown
  readonly identifier?: unknown
  readonly title?: unknown
  readonly description?: unknown
  readonly priority?: unknown
  readonly state?: unknown
  readonly branchName?: unknown
  readonly url?: unknown
  readonly assignee?: unknown
  readonly labels?: unknown
  readonly inverseRelations?: unknown
  readonly createdAt?: unknown
  readonly updatedAt?: unknown
}

/** Read-only scheduler/board adapter plus the scoped raw GraphQL tool transport. */
export class LinearTaskSource implements TaskSource {
  readonly kind = 'linear'

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly config: LinearSourceConfig,
    private readonly routing: () => LinearRoutingConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    const url = new URL(config.endpoint)
    if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
      throw new Error('dsh-dashboard: Linear endpoint must use HTTPS unless it is loopback')
    }
    credentialRef(config.apiKeyRef)
  }

  context(): TaskSourceContext {
    const current = this.routing()
    return {
      kind: this.kind,
      providerLabel: 'Linear',
      projectLabel: current.contextLabel ?? current.projectSlug,
      projectRef: current.projectSlug,
    }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const routing = await this.resolveRouting(signal)
    return await this.paginate(BOARD_QUERY, { projectSlug: routing.projectSlug }, routing, signal)
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    if (states.length === 0) return []
    const routing = await this.resolveRouting(signal)
    return await this.paginate(STATES_QUERY, {
      projectSlug: routing.projectSlug,
      stateNames: [...new Set(states.map(state => state.trim()).filter(Boolean))],
    }, routing, signal)
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const ids = [...new Set(nativeRefs.map(id => id.trim()).filter(Boolean))]
    if (ids.length === 0) return []
    const routing = await this.resolveRouting(signal)
    const body = await this.graphql(IDS_QUERY, {
      ids,
      projectSlug: routing.projectSlug,
      first: Math.max(ids.length, 1),
      relationFirst: RELATION_PAGE_SIZE,
    }, signal)
    return this.decodeIssues(readNodes(body), routing)
  }

  async executeRaw(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.graphql(query, variables, signal)
  }

  /** Safe credential status for the Configuration tab. */
  async credentialStatus(): Promise<{ configured: boolean; source?: string; writable: boolean }> {
    return await this.credentials.describe(credentialRef(this.config.apiKeyRef))
  }

  private async resolveRouting(signal?: AbortSignal): Promise<LinearRoutingConfig> {
    const routing = this.routing()
    if (routing.assignee?.trim().toLocaleLowerCase('en-US') !== 'me') return routing
    const viewer = await this.graphql(VIEWER_QUERY, {}, signal)
    if (!isObject(viewer.data) || !isObject(viewer.data.viewer)) {
      throw new LinearSourceError('response', 'Linear viewer query did not return an identity')
    }
    const viewerId = asNonBlank(viewer.data.viewer.id)
    if (viewerId === undefined) throw new LinearSourceError('response', 'Linear viewer identity has no id')
    return { ...routing, assignee: viewerId }
  }

  private async paginate(
    query: string,
    baseVariables: Readonly<Record<string, unknown>>,
    routing: LinearRoutingConfig,
    signal?: AbortSignal,
  ): Promise<readonly TaskIssue[]> {
    const all: TaskIssue[] = []
    let after: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = await this.graphql(query, {
        ...baseVariables,
        first: PAGE_SIZE,
        relationFirst: RELATION_PAGE_SIZE,
        ...(after === undefined ? {} : { after }),
      }, signal)
      all.push(...this.decodeIssues(readNodes(body), routing))
      const pageInfo = readPageInfo(body)
      if (!pageInfo.hasNextPage) return all
      if (pageInfo.endCursor === undefined) {
        throw new LinearSourceError('response', 'Linear reported another page without an end cursor')
      }
      after = pageInfo.endCursor
    }
    throw new LinearSourceError('response', `Linear pagination exceeded the safety limit of ${MAX_PAGES} pages`)
  }

  private async graphql(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<LinearGraphqlResponse> {
    const resolved = await this.credentials.resolve(credentialRef(this.config.apiKeyRef))
    if (resolved === undefined) {
      throw new LinearSourceError('credential', `credential ${this.config.apiKeyRef} is not configured`)
    }
    let response: Response
    try {
      response = await this.fetchImpl(this.config.endpoint, {
        method: 'POST',
        headers: {
          authorization: resolved.value,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true) throw signal.reason
      throw new LinearSourceError('network', error instanceof Error ? error.message : String(error))
    }

    const raw = await response.text()
    let body: LinearGraphqlResponse
    try {
      body = JSON.parse(raw) as LinearGraphqlResponse
    } catch {
      throw new LinearSourceError('response', `Linear returned non-JSON content (HTTP ${response.status})`)
    }
    if (!response.ok) {
      const category = response.status === 429 ? 'rate-limited' : 'http'
      throw new LinearSourceError(category, firstError(body) ?? `Linear request failed with HTTP ${response.status}`, response.status)
    }
    const error = firstError(body)
    if (error !== undefined) throw new LinearSourceError('graphql', error)
    return body
  }

  private decodeIssues(nodes: readonly unknown[], routing: LinearRoutingConfig): TaskIssue[] {
    return nodes.flatMap((node) => {
      const issue = normalizeIssue(node, routing)
      return issue === undefined ? [] : [issue]
    })
  }
}

export type LinearSourceErrorKind = 'credential' | 'network' | 'http' | 'rate-limited' | 'graphql' | 'response'

export class LinearSourceError extends Error {
  constructor(readonly kind: LinearSourceErrorKind, message: string, readonly status?: number) {
    super(message)
    this.name = 'LinearSourceError'
  }
}

function normalizeIssue(value: unknown, routing: LinearRoutingConfig): TaskIssue | undefined {
  if (!isObject(value)) return undefined
  const raw = value as RawIssue
  const id = asNonBlank(raw.id)
  const identifier = asNonBlank(raw.identifier)
  const title = asNonBlank(raw.title)
  const state = readState(raw.state)
  if (id === undefined || identifier === undefined || title === undefined || state === undefined) return undefined
  const blockers = readBlockers(raw.inverseRelations)
  const assigneeId = readNestedString(raw.assignee, 'id')
  const assigned = routing.assignee === undefined || routing.assignee.trim() === ''
    ? true
    : assigneeId === routing.assignee.trim()
  const terminal = new Set(routing.terminalStates.map(normalizedState))
  const blockedBeforeDispatch = normalizedState(state.name) === 'todo'
    && blockers.some(blocker => blocker.state === undefined || !terminal.has(normalizedState(blocker.state)))
  const description = asString(raw.description)
  const branchName = asNonBlank(raw.branchName)
  const url = asNonBlank(raw.url)
  const createdAt = asIsoDate(raw.createdAt)
  const updatedAt = asIsoDate(raw.updatedAt)
  return {
    sourceKind: 'linear',
    nativeRef: id,
    identifier,
    title,
    ...(description === undefined ? {} : { description }),
    ...(typeof raw.priority === 'number' && Number.isInteger(raw.priority) ? { priority: raw.priority } : {}),
    state,
    ...(branchName === undefined ? {} : { branchName }),
    ...(url === undefined ? {} : { url }),
    ...(assigneeId === undefined ? {} : { assigneeId }),
    labels: readLabels(raw.labels),
    blockedBy: blockers,
    dispatchable: assigned && !blockedBeforeDispatch,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }
}

function readState(value: unknown): IssueState | undefined {
  if (!isObject(value)) return undefined
  const name = asNonBlank(value.name)
  if (name === undefined) return undefined
  const type = asNonBlank(value.type)
  const color = asNonBlank(value.color)
  return {
    name,
    ...(type === undefined ? {} : { type }),
    ...(color === undefined ? {} : { color }),
    ...(typeof value.position === 'number' && Number.isFinite(value.position) ? { position: value.position } : {}),
  }
}

function readLabels(value: unknown): string[] {
  if (!isObject(value) || !Array.isArray(value.nodes)) return []
  return [...new Set(value.nodes.flatMap((entry) => {
    const label = readNestedString(entry, 'name')?.trim().toLocaleLowerCase('en-US')
    return label === undefined || label === '' ? [] : [label]
  }))]
}

function readBlockers(value: unknown): IssueBlocker[] {
  if (!isObject(value) || !Array.isArray(value.nodes)) return []
  return value.nodes.flatMap((relation) => {
    if (!isObject(relation) || normalizedState(asString(relation.type) ?? '') !== 'blocks' || !isObject(relation.issue)) return []
    const nativeRef = asNonBlank(relation.issue.id)
    const identifier = asNonBlank(relation.issue.identifier)
    const state = readNestedString(relation.issue.state, 'name')
    const blocker: IssueBlocker = {
      ...(nativeRef === undefined ? {} : { nativeRef }),
      ...(identifier === undefined ? {} : { identifier }),
      ...(state === undefined ? {} : { state }),
    }
    return [blocker]
  })
}

function readNodes(body: LinearGraphqlResponse): readonly unknown[] {
  if (!isObject(body.data) || !isObject(body.data.issues) || !Array.isArray(body.data.issues.nodes)) {
    throw new LinearSourceError('response', 'Linear response is missing data.issues.nodes')
  }
  return body.data.issues.nodes
}

function readPageInfo(body: LinearGraphqlResponse): { hasNextPage: boolean; endCursor?: string } {
  if (!isObject(body.data) || !isObject(body.data.issues) || !isObject(body.data.issues.pageInfo)) {
    return { hasNextPage: false }
  }
  const page = body.data.issues.pageInfo
  const endCursor = asNonBlank(page.endCursor)
  return { hasNextPage: page.hasNextPage === true, ...(endCursor === undefined ? {} : { endCursor }) }
}

function firstError(body: LinearGraphqlResponse): string | undefined {
  const nested = asNonBlank(body.error?.message)
  if (nested !== undefined) return nested
  return body.errors?.flatMap(entry => asNonBlank(entry.message) ?? []).at(0)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNonBlank(value: unknown): string | undefined {
  const text = asString(value)?.trim()
  return text === undefined || text === '' ? undefined : text
}

function asIsoDate(value: unknown): string | undefined {
  const text = asNonBlank(value)
  return text !== undefined && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : undefined
}

function readNestedString(value: unknown, key: string): string | undefined {
  return isObject(value) ? asNonBlank(value[key]) : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}
