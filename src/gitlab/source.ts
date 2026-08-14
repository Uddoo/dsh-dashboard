/** GitLab project Issues REST adapter with label-backed workflow states. */

import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { TaskIssue, TaskSourceContext } from '../domain/issue.ts'
import type { TaskSource, TaskSourceAgentTool, TaskSourceCredentialStatus } from '../task-source/index.ts'
import {
  apiUrl,
  filterIssuesByStates,
  inferPriority,
  isoDate,
  numberValue,
  objectValue,
  requestJson,
  resolveLabelState,
  slugBranch,
  stringValue,
  uniqueLabels,
  validateRemoteEndpoint,
  type FetchLike,
} from '../providers/common.ts'

const PAGE_SIZE = 100
const MAX_PAGES = 100

export interface GitLabSourceConfig {
  readonly endpoint: string
  readonly tokenRef: string
}

export interface GitLabRoutingConfig {
  readonly projectId: string
  readonly contextLabel?: string
  readonly assignee?: string
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
  readonly stateLabels: Readonly<Record<string, string>>
}

export class GitLabTaskSource implements TaskSource {
  readonly kind = 'gitlab'

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly config: GitLabSourceConfig,
    private readonly routing: () => GitLabRoutingConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    validateRemoteEndpoint(config.endpoint, 'GitLab')
    credentialRef(config.tokenRef)
  }

  context(): TaskSourceContext {
    const routing = this.routing()
    return {
      kind: this.kind,
      providerLabel: 'GitLab',
      projectLabel: routing.contextLabel ?? routing.projectId,
      projectRef: routing.projectId,
    }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const routing = this.routing()
    const path = this.projectPath(routing)
    const issues: TaskIssue[] = []
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const data = await this.request('GET', `${path}/issues`, { state: 'all', scope: 'all', per_page: PAGE_SIZE, page }, undefined, signal)
      if (!Array.isArray(data)) throw new Error('GitLab response is not an issue array')
      issues.push(...data.flatMap(value => normalizeIssue(value, routing)))
      if (data.length < PAGE_SIZE) return issues
    }
    throw new Error(`GitLab pagination exceeded the safety limit of ${MAX_PAGES} pages`)
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    return filterIssuesByStates(await this.listBoardIssues(signal), states)
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const refs = [...new Set(nativeRefs.map(value => value.trim()).filter(value => /^\d+$/u.test(value)))]
    const routing = this.routing()
    const path = this.projectPath(routing)
    const issues: TaskIssue[] = []
    for (const ref of refs) {
      issues.push(...normalizeIssue(await this.request('GET', `${path}/issues/${ref}`, {}, undefined, signal), routing))
    }
    return issues
  }

  async credentialStatuses(): Promise<readonly TaskSourceCredentialStatus[]> {
    const status = await this.credentials.describe(credentialRef(this.config.tokenRef))
    return [{ ref: this.config.tokenRef, label: 'Personal access token', ...status }]
  }

  agentTool(): TaskSourceAgentTool {
    return {
      kind: 'rest',
      name: 'gitlab_api',
      description: 'Call the GitLab REST API for the configured project. Use relative /projects/{id}/... paths; authentication is supplied by dsh-dashboard.',
      execute: async (request, signal) => {
        const prefix = `${this.projectPath(this.routing())}/issues`
        if (request.path !== prefix && !request.path.startsWith(`${prefix}/`)) {
          throw new Error('GitLab tool path must stay inside Issues for the configured project')
        }
        return await this.request(request.method, request.path, request.query ?? {}, request.body, signal)
      },
    }
  }

  private projectPath(routing: GitLabRoutingConfig): string {
    return `/projects/${encodeURIComponent(routing.projectId)}`
  }

  private async request(
    methodValue: string,
    path: string,
    query: Readonly<Record<string, unknown>>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const method = methodValue.trim().toLocaleUpperCase('en-US')
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error(`GitLab method ${JSON.stringify(method)} is not allowed`)
    const resolved = await this.credentials.resolve(credentialRef(this.config.tokenRef))
    if (resolved === undefined) throw new Error(`GitLab credential ${this.config.tokenRef} is not configured`)
    const result = await requestJson(this.fetchImpl, 'GitLab', apiUrl(this.config.endpoint, path, query), {
      method,
      headers: {
        'private-token': resolved.value,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    })
    return result.data
  }
}

function normalizeIssue(value: unknown, routing: GitLabRoutingConfig): TaskIssue[] {
  const raw = objectValue(value)
  const iid = numberValue(raw?.iid)
  const title = stringValue(raw?.title)
  if (raw === undefined || iid === undefined || title === undefined) return []
  const labels = uniqueLabels(Array.isArray(raw.labels) ? raw.labels : [])
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.flatMap(value => stringValue(objectValue(value)?.username) ?? [])
    : []
  const assignee = assignees[0] ?? stringValue(objectValue(raw.assignee)?.username)
  if (assignee !== undefined && !assignees.includes(assignee)) assignees.push(assignee)
  const expected = routing.assignee?.toLocaleLowerCase('en-US')
  const state = resolveLabelState({
    open: stringValue(raw.state)?.toLocaleLowerCase('en-US') !== 'closed',
    labels,
    states: routing.states,
    activeStates: routing.activeStates,
    terminalStates: routing.terminalStates,
    stateLabels: routing.stateLabels,
  })
  const priority = inferPriority(labels, stringValue(raw.severity), numberValue(raw.weight))
  const createdAt = isoDate(raw.created_at)
  const updatedAt = isoDate(raw.updated_at)
  const description = typeof raw.description === 'string' ? raw.description : undefined
  const url = stringValue(raw.web_url)
  return [{
    sourceKind: 'gitlab',
    scopeRef: routing.projectId,
    nativeRef: String(iid),
    identifier: `#${iid}`,
    title,
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    state,
    branchName: slugBranch('issue', String(iid), title),
    ...(url === undefined ? {} : { url }),
    ...(assignee === undefined ? {} : { assigneeId: assignee }),
    labels,
    blockedBy: [],
    dispatchable: expected === undefined || assignees.some(value => value.toLocaleLowerCase('en-US') === expected),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }]
}
