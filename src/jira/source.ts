/** Jira Cloud REST v3 adapter using native workflow statuses. */

import { Buffer } from 'node:buffer'
import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { IssueBlocker, IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'
import type { TaskSource, TaskSourceAgentTool, TaskSourceCredentialStatus } from '../task-source/index.ts'
import {
  apiUrl,
  inferPriority,
  isoDate,
  objectValue,
  requestJson,
  slugBranch,
  stringValue,
  uniqueLabels,
  validateRemoteEndpoint,
  type FetchLike,
} from '../providers/common.ts'

const PAGE_SIZE = 100
const MAX_PAGES = 100
const ISSUE_FIELDS = ['summary', 'description', 'status', 'labels', 'priority', 'assignee', 'created', 'updated', 'issuelinks']

export interface JiraSourceConfig {
  readonly emailRef: string
  readonly apiTokenRef: string
}

export interface JiraRoutingConfig {
  readonly siteUrl: string
  readonly projectKey: string
  readonly contextLabel?: string
  readonly assignee?: string
  readonly jql?: string
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
}

export class JiraTaskSource implements TaskSource {
  readonly kind = 'jira'

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly config: JiraSourceConfig,
    private readonly routing: () => JiraRoutingConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    credentialRef(config.emailRef)
    credentialRef(config.apiTokenRef)
  }

  context(): TaskSourceContext {
    const routing = this.routing()
    validateRemoteEndpoint(routing.siteUrl, 'Jira')
    return {
      kind: this.kind,
      providerLabel: 'Jira',
      projectLabel: routing.contextLabel ?? routing.projectKey,
      projectRef: routing.projectKey,
    }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const routing = await this.resolveRouting(signal)
    return await this.search(baseJql(routing), routing, signal)
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    if (states.length === 0) return []
    const routing = await this.resolveRouting(signal)
    const quoted = states.map(value => `\"${escapeJql(value)}\"`).join(', ')
    return await this.search(`${baseJql(routing)} AND status IN (${quoted})`, routing, signal)
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const refs = [...new Set(nativeRefs.map(value => value.trim()).filter(Boolean))]
    if (refs.length === 0) return []
    const routing = await this.resolveRouting(signal)
    const quoted = refs.map(value => `\"${escapeJql(value)}\"`).join(', ')
    return await this.search(`${baseJql(routing)} AND key IN (${quoted})`, routing, signal)
  }

  async credentialStatuses(): Promise<readonly TaskSourceCredentialStatus[]> {
    const [email, token] = await Promise.all([
      this.credentials.describe(credentialRef(this.config.emailRef)),
      this.credentials.describe(credentialRef(this.config.apiTokenRef)),
    ])
    return [
      { ref: this.config.emailRef, label: 'Account email', ...email },
      { ref: this.config.apiTokenRef, label: 'API token', ...token },
    ]
  }

  agentTool(): TaskSourceAgentTool {
    return {
      kind: 'rest',
      name: 'jira_api',
      description: 'Call Jira Cloud REST v3 for issues in the configured project. Use /rest/api/3/issue/{key} or its transition subresource; authentication is supplied by dsh-dashboard.',
      execute: async (request, signal) => {
        const routing = this.routing()
        const escaped = routing.projectKey.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
        const issuePath = new RegExp(`^/rest/api/3/issue/${escaped}-\\d+(?:/.*)?$`, 'iu')
        if (!issuePath.test(request.path)) throw new Error('Jira tool path must target an issue in the configured project')
        return await this.request(routing, request.method, request.path, request.query ?? {}, request.body, signal)
      },
    }
  }

  private async resolveRouting(signal?: AbortSignal): Promise<JiraRoutingConfig> {
    const routing = this.routing()
    validateRemoteEndpoint(routing.siteUrl, 'Jira')
    if (routing.assignee?.toLocaleLowerCase('en-US') !== 'me') return routing
    const viewer = objectValue(await this.request(routing, 'GET', '/rest/api/3/myself', {}, undefined, signal))
    const accountId = stringValue(viewer?.accountId)
    if (accountId === undefined) throw new Error('Jira viewer response did not include an accountId')
    return { ...routing, assignee: accountId }
  }

  private async search(jql: string, routing: JiraRoutingConfig, signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const issues: TaskIssue[] = []
    let nextPageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = objectValue(await this.request(routing, 'POST', '/rest/api/3/search/jql', {}, {
        jql,
        fields: ISSUE_FIELDS,
        maxResults: PAGE_SIZE,
        ...(nextPageToken === undefined ? {} : { nextPageToken }),
      }, signal))
      if (!Array.isArray(body?.issues)) throw new Error('Jira response is missing an issues array')
      issues.push(...body.issues.flatMap(value => normalizeIssue(value, routing)))
      nextPageToken = stringValue(body.nextPageToken)
      if (body.isLast === true || nextPageToken === undefined) return issues
    }
    throw new Error(`Jira pagination exceeded the safety limit of ${MAX_PAGES} pages`)
  }

  private async request(
    routing: JiraRoutingConfig,
    methodValue: string,
    path: string,
    query: Readonly<Record<string, unknown>>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const method = methodValue.trim().toLocaleUpperCase('en-US')
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error(`Jira method ${JSON.stringify(method)} is not allowed`)
    const [email, token] = await Promise.all([
      this.credentials.resolve(credentialRef(this.config.emailRef)),
      this.credentials.resolve(credentialRef(this.config.apiTokenRef)),
    ])
    if (email === undefined) throw new Error(`Jira credential ${this.config.emailRef} is not configured`)
    if (token === undefined) throw new Error(`Jira credential ${this.config.apiTokenRef} is not configured`)
    const authorization = Buffer.from(`${email.value}:${token.value}`, 'utf8').toString('base64')
    const result = await requestJson(this.fetchImpl, 'Jira', apiUrl(routing.siteUrl, path, query), {
      method,
      headers: {
        authorization: `Basic ${authorization}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    })
    return result.data
  }
}

function baseJql(routing: JiraRoutingConfig): string {
  const project = `project = \"${escapeJql(routing.projectKey)}\"`
  return routing.jql === undefined ? project : `${project} AND (${routing.jql})`
}

function escapeJql(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function normalizeIssue(value: unknown, routing: JiraRoutingConfig): TaskIssue[] {
  const raw = objectValue(value)
  const key = stringValue(raw?.key)
  const fields = objectValue(raw?.fields)
  const title = stringValue(fields?.summary)
  const status = objectValue(fields?.status)
  const stateName = stringValue(status?.name)
  if (raw === undefined || fields === undefined || key === undefined || title === undefined || stateName === undefined) return []
  const statusCategory = objectValue(status?.statusCategory)
  const categoryKey = stringValue(statusCategory?.key)
  const state: IssueState = {
    name: stateName,
    ...(categoryKey === undefined ? {} : { type: categoryKey }),
    position: Math.max(0, routing.states.findIndex(value => normalizedState(value) === normalizedState(stateName))),
  }
  const labels = uniqueLabels(Array.isArray(fields.labels) ? fields.labels : [])
  const priority = inferPriority(labels, stringValue(objectValue(fields.priority)?.name))
  const assignee = stringValue(objectValue(fields.assignee)?.accountId)
  const expected = routing.assignee
  const description = adfText(fields.description)
  const createdAt = isoDate(fields.created)
  const updatedAt = isoDate(fields.updated)
  return [{
    sourceKind: 'jira',
    scopeRef: routing.projectKey,
    nativeRef: key,
    identifier: key,
    title,
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    state,
    branchName: slugBranch('jira', key, title),
    url: `${routing.siteUrl.replace(/\/$/u, '')}/browse/${encodeURIComponent(key)}`,
    ...(assignee === undefined ? {} : { assigneeId: assignee }),
    labels,
    blockedBy: readBlockers(fields.issuelinks),
    dispatchable: expected === undefined || assignee === expected,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }]
}

function readBlockers(value: unknown): IssueBlocker[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const link = objectValue(entry)
    const inwardLabel = stringValue(objectValue(link?.type)?.inward)?.toLocaleLowerCase('en-US')
    const issue = objectValue(link?.inwardIssue)
    if (issue === undefined || inwardLabel?.includes('blocked by') !== true) return []
    const identifier = stringValue(issue.key)
    const nativeRef = identifier
    const state = stringValue(objectValue(objectValue(issue.fields)?.status)?.name)
    return [{
      ...(nativeRef === undefined ? {} : { nativeRef }),
      ...(identifier === undefined ? {} : { identifier }),
      ...(state === undefined ? {} : { state }),
    }]
  })
}

function adfText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const text: string[] = []
  const visit = (node: unknown): void => {
    const object = objectValue(node)
    if (object === undefined) return
    if (typeof object.text === 'string') text.push(object.text)
    if (Array.isArray(object.content)) {
      for (const child of object.content) visit(child)
      if (object.type === 'paragraph' || object.type === 'heading' || object.type === 'listItem') text.push('\n')
    }
  }
  visit(value)
  const result = text.join('').replaceAll(/\n{3,}/gu, '\n\n').trim()
  return result === '' ? undefined : result
}
