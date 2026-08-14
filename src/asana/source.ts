/** Asana project task adapter using project sections as Dashboard states. */

import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'
import type { TaskSource, TaskSourceAgentTool, TaskSourceCredentialStatus } from '../task-source/index.ts'
import {
  apiUrl,
  filterIssuesByStates,
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
const TASK_FIELDS = [
  'gid',
  'name',
  'notes',
  'completed',
  'completed_at',
  'created_at',
  'modified_at',
  'permalink_url',
  'assignee.gid',
  'memberships.project.gid',
  'memberships.section.gid',
  'memberships.section.name',
  'tags.name',
].join(',')

export interface AsanaSourceConfig {
  readonly endpoint: string
  readonly tokenRef: string
}

export interface AsanaRoutingConfig {
  readonly projectGid: string
  readonly contextLabel?: string
  readonly assignee?: string
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
}

export class AsanaTaskSource implements TaskSource {
  readonly kind = 'asana'

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly config: AsanaSourceConfig,
    private readonly routing: () => AsanaRoutingConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    validateRemoteEndpoint(config.endpoint, 'Asana')
    credentialRef(config.tokenRef)
  }

  context(): TaskSourceContext {
    const routing = this.routing()
    return {
      kind: this.kind,
      providerLabel: 'Asana',
      projectLabel: routing.contextLabel ?? routing.projectGid,
      projectRef: routing.projectGid,
    }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const routing = await this.resolveRouting(signal)
    const issues: TaskIssue[] = []
    let offset: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = objectValue(await this.request(
        'GET',
        `/projects/${encodeURIComponent(routing.projectGid)}/tasks`,
        {
          limit: PAGE_SIZE,
          opt_fields: TASK_FIELDS,
          completed_since: '1970-01-01T00:00:00.000Z',
          ...(offset === undefined ? {} : { offset }),
        },
        undefined,
        signal,
      ))
      if (!Array.isArray(body?.data)) throw new Error('Asana response is missing a task data array')
      issues.push(...body.data.flatMap(value => normalizeTask(value, routing)))
      offset = stringValue(objectValue(body.next_page)?.offset)
      if (offset === undefined) return issues
    }
    throw new Error(`Asana pagination exceeded the safety limit of ${MAX_PAGES} pages`)
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    return filterIssuesByStates(await this.listBoardIssues(signal), states)
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const refs = [...new Set(nativeRefs.map(value => value.trim()).filter(Boolean))]
    const routing = await this.resolveRouting(signal)
    const issues: TaskIssue[] = []
    for (const ref of refs) {
      const body = objectValue(await this.request('GET', `/tasks/${encodeURIComponent(ref)}`, { opt_fields: TASK_FIELDS }, undefined, signal))
      issues.push(...normalizeTask(body?.data, routing))
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
      name: 'asana_api',
      description: 'Call the Asana REST API for tasks in the configured project. Authentication is supplied by dsh-dashboard; request bodies must use Asana\'s data envelope.',
      execute: async (request, signal) => {
        const routing = this.routing()
        const method = request.method.trim().toLocaleUpperCase('en-US')
        const projectTasksPath = `/projects/${encodeURIComponent(routing.projectGid)}/tasks`
        const projectSectionsPath = `/projects/${encodeURIComponent(routing.projectGid)}/sections`
        if (request.path === projectTasksPath) {
          if (method !== 'GET') {
            throw new Error('Asana project task collection is read-only through the Agent tool')
          }
          return await this.request(method, request.path, request.query ?? {}, undefined, signal)
        }
        if (request.path === projectSectionsPath) {
          if (method !== 'GET') throw new Error('Asana project section collection is read-only through the Agent tool')
          return await this.request(method, request.path, request.query ?? {}, undefined, signal)
        }
        const taskMatch = /^\/tasks\/([^/]+)$/u.exec(request.path)
        if (taskMatch !== null) {
          if (method !== 'GET' && method !== 'PUT') {
            throw new Error('Asana task endpoints only allow GET and PUT through the Agent tool')
          }
          await this.assertTaskInProject(taskMatch[1]!, routing, signal)
          return await this.request(method, request.path, request.query ?? {}, request.body, signal)
        }
        const sectionMatch = /^\/sections\/([^/]+)\/addTask$/u.exec(request.path)
        if (sectionMatch !== null) {
          if (method !== 'POST') throw new Error('Asana section moves require POST through the Agent tool')
          const taskGid = stringValue(objectValue(objectValue(request.body)?.data)?.task)
          if (taskGid === undefined) throw new Error('Asana section move requires body.data.task')
          await Promise.all([
            this.assertSectionInProject(sectionMatch[1]!, routing, signal),
            this.assertTaskInProject(encodeURIComponent(taskGid), routing, signal),
          ])
          return await this.request(method, request.path, request.query ?? {}, request.body, signal)
        }
        throw new Error('Asana tool path is not in the configured project allowlist')
      },
    }
  }

  private async assertTaskInProject(encodedTaskGid: string, routing: AsanaRoutingConfig, signal?: AbortSignal): Promise<void> {
    const body = objectValue(await this.request(
      'GET',
      `/tasks/${encodedTaskGid}`,
      { opt_fields: 'memberships.project.gid' },
      undefined,
      signal,
    ))
    const memberships = objectValue(body?.data)?.memberships
    const belongs = Array.isArray(memberships) && memberships.some(value => {
      return stringValue(objectValue(objectValue(value)?.project)?.gid) === routing.projectGid
    })
    if (!belongs) throw new Error('Asana task does not belong to the configured project')
  }

  private async assertSectionInProject(encodedSectionGid: string, routing: AsanaRoutingConfig, signal?: AbortSignal): Promise<void> {
    let offset: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = objectValue(await this.request(
        'GET',
        `/projects/${encodeURIComponent(routing.projectGid)}/sections`,
        { limit: PAGE_SIZE, opt_fields: 'gid', ...(offset === undefined ? {} : { offset }) },
        undefined,
        signal,
      ))
      if (!Array.isArray(body?.data)) throw new Error('Asana response is missing a section data array')
      if (body.data.some(value => encodeURIComponent(stringValue(objectValue(value)?.gid) ?? '') === encodedSectionGid)) return
      offset = stringValue(objectValue(body.next_page)?.offset)
      if (offset === undefined) break
    }
    throw new Error('Asana section does not belong to the configured project')
  }

  private async resolveRouting(signal?: AbortSignal): Promise<AsanaRoutingConfig> {
    const routing = this.routing()
    if (routing.assignee?.toLocaleLowerCase('en-US') !== 'me') return routing
    const body = objectValue(await this.request('GET', '/users/me', {}, undefined, signal))
    const gid = stringValue(objectValue(body?.data)?.gid)
    if (gid === undefined) throw new Error('Asana viewer response did not include a gid')
    return { ...routing, assignee: gid }
  }

  private async request(
    methodValue: string,
    path: string,
    query: Readonly<Record<string, unknown>>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const method = methodValue.trim().toLocaleUpperCase('en-US')
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error(`Asana method ${JSON.stringify(method)} is not allowed`)
    const resolved = await this.credentials.resolve(credentialRef(this.config.tokenRef))
    if (resolved === undefined) throw new Error(`Asana credential ${this.config.tokenRef} is not configured`)
    const result = await requestJson(this.fetchImpl, 'Asana', apiUrl(this.config.endpoint, path, query), {
      method,
      headers: {
        authorization: `Bearer ${resolved.value}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    })
    return result.data
  }
}

function normalizeTask(value: unknown, routing: AsanaRoutingConfig): TaskIssue[] {
  const raw = objectValue(value)
  const gid = stringValue(raw?.gid)
  const title = stringValue(raw?.name)
  if (raw === undefined || gid === undefined || title === undefined) return []
  const memberships = Array.isArray(raw.memberships) ? raw.memberships : []
  const membership = memberships.map(objectValue).find((entry) => {
    return stringValue(objectValue(entry?.project)?.gid) === routing.projectGid
  })
  if (membership === undefined && memberships.length > 0) return []
  const sectionName = stringValue(objectValue(membership?.section)?.name)
  const completed = raw.completed === true
  const stateName = completed
    ? routing.terminalStates[0] ?? 'Done'
    : sectionName ?? routing.activeStates[0] ?? routing.states[0] ?? 'Todo'
  const state: IssueState = {
    name: stateName,
    type: completed ? 'completed' : 'started',
    position: Math.max(0, routing.states.findIndex(value => normalizedState(value) === normalizedState(stateName))),
  }
  const labels = uniqueLabels(Array.isArray(raw.tags) ? raw.tags : [])
  const assignee = stringValue(objectValue(raw.assignee)?.gid)
  const priority = inferPriority(labels)
  const createdAt = isoDate(raw.created_at)
  const updatedAt = isoDate(raw.modified_at)
  const description = typeof raw.notes === 'string' ? raw.notes : undefined
  const url = stringValue(raw.permalink_url)
  return [{
    sourceKind: 'asana',
    scopeRef: routing.projectGid,
    nativeRef: gid,
    identifier: `ASANA-${gid.slice(-6)}`,
    title,
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    state,
    branchName: slugBranch('asana', gid.slice(-8), title),
    ...(url === undefined ? {} : { url }),
    ...(assignee === undefined ? {} : { assigneeId: assignee }),
    labels,
    blockedBy: [],
    dispatchable: routing.assignee === undefined || assignee === routing.assignee,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }]
}
