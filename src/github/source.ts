/** GitHub Issues REST adapter with label-backed workflow states. */

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

export interface GitHubSourceConfig {
  readonly endpoint: string
  readonly tokenRef: string
}

export interface GitHubRoutingConfig {
  readonly owner: string
  readonly repo: string
  readonly contextLabel?: string
  readonly assignee?: string
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
  readonly stateLabels: Readonly<Record<string, string>>
}

/** Reads GitHub Issues; pull requests returned by the Issues endpoint are excluded. */
export class GitHubTaskSource implements TaskSource {
  readonly kind = 'github'

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly config: GitHubSourceConfig,
    private readonly routing: () => GitHubRoutingConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    validateRemoteEndpoint(config.endpoint, 'GitHub')
    credentialRef(config.tokenRef)
  }

  context(): TaskSourceContext {
    const routing = this.routing()
    const project = `${routing.owner}/${routing.repo}`
    return {
      kind: this.kind,
      providerLabel: 'GitHub',
      projectLabel: routing.contextLabel ?? project,
      projectRef: project,
    }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const routing = await this.resolveRouting(signal)
    const issues: TaskIssue[] = []
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const data = await this.request(
        'GET',
        `/repos/${encodeURIComponent(routing.owner)}/${encodeURIComponent(routing.repo)}/issues`,
        { state: 'all', per_page: PAGE_SIZE, page },
        undefined,
        signal,
      )
      if (!Array.isArray(data)) throw new Error('GitHub response is not an issue array')
      const pageIssues = data.flatMap(value => normalizeIssue(value, routing))
      issues.push(...pageIssues)
      if (data.length < PAGE_SIZE) return issues
    }
    throw new Error(`GitHub pagination exceeded the safety limit of ${MAX_PAGES} pages`)
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    return filterIssuesByStates(await this.listBoardIssues(signal), states)
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const refs = [...new Set(nativeRefs.map(value => value.trim()).filter(value => /^\d+$/u.test(value)))]
    const routing = await this.resolveRouting(signal)
    const issues: TaskIssue[] = []
    for (const ref of refs) {
      const data = await this.request(
        'GET',
        `/repos/${encodeURIComponent(routing.owner)}/${encodeURIComponent(routing.repo)}/issues/${ref}`,
        {},
        undefined,
        signal,
      )
      issues.push(...normalizeIssue(data, routing))
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
      name: 'github_api',
      description: 'Call the GitHub REST API for the configured repository. Use relative /repos/{owner}/{repo}/... paths; authentication is supplied by dsh-dashboard.',
      execute: async (request, signal) => {
        const routing = this.routing()
        const prefix = `/repos/${encodeURIComponent(routing.owner)}/${encodeURIComponent(routing.repo)}/issues`
        if (request.path !== prefix && !request.path.startsWith(`${prefix}/`)) {
          throw new Error('GitHub tool path must stay inside Issues for the configured repository')
        }
        return await this.request(request.method, request.path, request.query ?? {}, request.body, signal)
      },
    }
  }

  private async resolveRouting(signal?: AbortSignal): Promise<GitHubRoutingConfig> {
    const routing = this.routing()
    if (routing.assignee?.toLocaleLowerCase('en-US') !== 'me') return routing
    const viewer = objectValue(await this.request('GET', '/user', {}, undefined, signal))
    const login = stringValue(viewer?.login)
    if (login === undefined) throw new Error('GitHub viewer response did not include a login')
    return { ...routing, assignee: login }
  }

  private async request(
    methodValue: string,
    path: string,
    query: Readonly<Record<string, unknown>>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const method = methodValue.trim().toLocaleUpperCase('en-US')
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) throw new Error(`GitHub method ${JSON.stringify(method)} is not allowed`)
    const resolved = await this.credentials.resolve(credentialRef(this.config.tokenRef))
    if (resolved === undefined) throw new Error(`GitHub credential ${this.config.tokenRef} is not configured`)
    const result = await requestJson(this.fetchImpl, 'GitHub', apiUrl(this.config.endpoint, path, query), {
      method,
      headers: {
        authorization: `Bearer ${resolved.value}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    })
    return result.data
  }
}

function normalizeIssue(value: unknown, routing: GitHubRoutingConfig): TaskIssue[] {
  const raw = objectValue(value)
  if (raw === undefined || raw.pull_request !== undefined) return []
  const number = numberValue(raw.number)
  const title = stringValue(raw.title)
  if (number === undefined || title === undefined) return []
  const labels = uniqueLabels(Array.isArray(raw.labels) ? raw.labels : [])
  const open = stringValue(raw.state)?.toLocaleLowerCase('en-US') !== 'closed'
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.flatMap(value => stringValue(objectValue(value)?.login) ?? [])
    : []
  const assignee = stringValue(objectValue(raw.assignee)?.login) ?? assignees[0]
  if (assignee !== undefined && !assignees.includes(assignee)) assignees.push(assignee)
  const expected = routing.assignee?.toLocaleLowerCase('en-US')
  const state = resolveLabelState({
    open,
    labels,
    states: routing.states,
    activeStates: routing.activeStates,
    terminalStates: routing.terminalStates,
    stateLabels: routing.stateLabels,
  })
  const priority = inferPriority(labels)
  const createdAt = isoDate(raw.created_at)
  const updatedAt = isoDate(raw.updated_at)
  const description = typeof raw.body === 'string' ? raw.body : undefined
  const url = stringValue(raw.html_url)
  return [{
    sourceKind: 'github',
    scopeRef: `${routing.owner}/${routing.repo}`,
    nativeRef: String(number),
    identifier: `#${number}`,
    title,
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    state,
    branchName: slugBranch('issue', String(number), title),
    ...(url === undefined ? {} : { url }),
    ...(assignee === undefined ? {} : { assigneeId: assignee }),
    labels,
    blockedBy: [],
    dispatchable: expected === undefined || assignees.some(value => value.toLocaleLowerCase('en-US') === expected),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }]
}
