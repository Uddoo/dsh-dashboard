/** Host-side local task store for users without an external tracker. */

import { randomUUID } from 'node:crypto'
import { mkdir, lstat, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { IssueState, TaskIssue, TaskSourceContext } from '../domain/issue.ts'
import { normalizedState } from '../domain/issue.ts'
import type {
  CreateTaskInput,
  TaskSource,
  TaskSourceAgentTool,
  TaskSourceCapabilities,
  UpdateTaskInput,
} from '../task-source/index.ts'
import { slugBranch } from '../providers/common.ts'

interface StoredIssue {
  readonly id: string
  readonly number: number
  readonly title: string
  readonly description?: string
  readonly state: string
  readonly priority?: number
  readonly createdAt: string
  readonly updatedAt: string
}

interface StoredProject {
  nextNumber: number
  issues: StoredIssue[]
}

interface LocalStore {
  readonly version: 1
  readonly projects: Record<string, StoredProject>
}

export interface LocalSourceConfig {
  readonly storePath: string
}

export interface LocalRoutingConfig {
  readonly projectId: string
  readonly contextLabel?: string
  readonly states: readonly string[]
  readonly activeStates: readonly string[]
  readonly terminalStates: readonly string[]
}

export class LocalTaskSource implements TaskSource {
  readonly kind = 'local'
  readonly storePath: string
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly config: LocalSourceConfig, private readonly routing: () => LocalRoutingConfig) {
    this.storePath = expandPath(config.storePath)
  }

  context(): TaskSourceContext {
    const routing = this.validRouting()
    return {
      kind: this.kind,
      providerLabel: 'Local',
      projectLabel: routing.contextLabel ?? routing.projectId,
      projectRef: routing.projectId,
    }
  }

  capabilities(): TaskSourceCapabilities {
    return { create: true, update: true, delete: true, states: this.validRouting().states }
  }

  async listBoardIssues(signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    throwIfAborted(signal)
    await this.mutationQueue
    const routing = this.validRouting()
    const store = await this.readStore()
    return (store.projects[routing.projectId]?.issues ?? []).map(issue => normalizeIssue(issue, routing))
  }

  async listIssuesByStates(states: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const wanted = new Set(states.map(normalizedState))
    return (await this.listBoardIssues(signal)).filter(issue => wanted.has(normalizedState(issue.state.name)))
  }

  async getIssuesByNativeRefs(nativeRefs: readonly string[], signal?: AbortSignal): Promise<readonly TaskIssue[]> {
    const wanted = new Set(nativeRefs.map(value => value.trim()).filter(Boolean))
    return (await this.listBoardIssues(signal)).filter(issue => wanted.has(issue.nativeRef))
  }

  async createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<TaskIssue> {
    return await this.serialize(async () => {
      throwIfAborted(signal)
      const routing = this.validRouting()
      const title = requiredTitle(input.title)
      const state = checkedState(input.state ?? routing.states[0] ?? routing.activeStates[0] ?? 'Todo', routing)
      const priority = checkedPriority(input.priority)
      const store = await this.readStore()
      const project = store.projects[routing.projectId] ?? { nextNumber: 1, issues: [] }
      const now = new Date().toISOString()
      const stored: StoredIssue = {
        id: randomUUID(),
        number: project.nextNumber,
        title,
        ...(input.description === undefined || input.description.trim() === '' ? {} : { description: input.description.trim() }),
        state,
        ...(priority === undefined ? {} : { priority }),
        createdAt: now,
        updatedAt: now,
      }
      project.nextNumber += 1
      project.issues.push(stored)
      store.projects[routing.projectId] = project
      await this.writeStore(store)
      return normalizeIssue(stored, routing)
    })
  }

  async updateTask(nativeRef: string, input: UpdateTaskInput, signal?: AbortSignal): Promise<TaskIssue> {
    return await this.serialize(async () => {
      throwIfAborted(signal)
      const routing = this.validRouting()
      const store = await this.readStore()
      const project = store.projects[routing.projectId]
      const index = project?.issues.findIndex(issue => issue.id === nativeRef) ?? -1
      if (project === undefined || index < 0) throw new Error(`Local task ${JSON.stringify(nativeRef)} was not found`)
      const previous = project.issues[index]!
      if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== previous.updatedAt) {
        throw new Error('Local task changed since the editor was opened; close and reopen it to load the latest version')
      }
      const description = input.description === undefined
        ? previous.description
        : input.description === null || input.description.trim() === '' ? undefined : input.description.trim()
      const priority = input.priority === undefined ? previous.priority : checkedPriority(input.priority ?? undefined)
      const updated: StoredIssue = {
        id: previous.id,
        number: previous.number,
        title: input.title === undefined ? previous.title : requiredTitle(input.title),
        ...(description === undefined ? {} : { description }),
        state: input.state === undefined ? previous.state : checkedState(input.state, routing),
        ...(priority === undefined ? {} : { priority }),
        createdAt: previous.createdAt,
        updatedAt: nextUpdatedAt(previous.updatedAt),
      }
      project.issues[index] = updated
      await this.writeStore(store)
      return normalizeIssue(project.issues[index]!, routing)
    })
  }

  async deleteTask(nativeRef: string, signal?: AbortSignal): Promise<boolean> {
    return await this.serialize(async () => {
      throwIfAborted(signal)
      const routing = this.validRouting()
      const store = await this.readStore()
      const project = store.projects[routing.projectId]
      if (project === undefined) return false
      const next = project.issues.filter(issue => issue.id !== nativeRef)
      if (next.length === project.issues.length) return false
      project.issues = next
      await this.writeStore(store)
      return true
    })
  }

  agentTool(): TaskSourceAgentTool {
    return {
      kind: 'task-mutation',
      name: 'local_task',
      description: 'Read or update a task in the configured local Dashboard project. Use update to keep the current task state and workpad current; deletion is intentionally unavailable to Agents.',
      execute: async (request, signal) => {
        if (request.operation === 'get') return (await this.getIssuesByNativeRefs([request.nativeRef], signal))[0] ?? null
        return await this.updateTask(request.nativeRef, {
          ...(request.title === undefined ? {} : { title: request.title }),
          ...(request.description === undefined ? {} : { description: request.description }),
          ...(request.state === undefined ? {} : { state: request.state }),
          ...(request.priority === undefined ? {} : { priority: request.priority }),
        }, signal)
      },
    }
  }

  private validRouting(): LocalRoutingConfig {
    const routing = this.routing()
    if (routing.projectId.trim() === '' || ['__proto__', 'prototype', 'constructor'].includes(routing.projectId)) {
      throw new Error('dsh-dashboard: local project_id is invalid')
    }
    if (routing.states.length === 0) throw new Error('dsh-dashboard: local tracker requires at least one workflow state')
    return routing
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)
    this.mutationQueue = result.then(() => undefined, () => undefined)
    return await result
  }

  private async readStore(): Promise<LocalStore> {
    let raw: string
    try {
      raw = await readFile(this.storePath, 'utf8')
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return { version: 1, projects: {} }
      throw error
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error(`dsh-dashboard: local task store ${this.storePath} is not valid JSON`)
    }
    return decodeStore(value, this.storePath)
  }

  private async writeStore(store: LocalStore): Promise<void> {
    const parent = dirname(this.storePath)
    await mkdir(parent, { recursive: true })
    try {
      const target = await lstat(this.storePath)
      if (target.isSymbolicLink() || !target.isFile()) throw new Error(`dsh-dashboard: local task store target is not a regular file: ${this.storePath}`)
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) throw error
    }
    const temporary = join(parent, `.${basename(this.storePath)}.${process.pid}.${randomUUID()}.tmp`)
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, this.storePath)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}

function normalizeIssue(issue: StoredIssue, routing: LocalRoutingConfig): TaskIssue {
  const terminal = new Set(routing.terminalStates.map(normalizedState))
  const position = Math.max(0, routing.states.findIndex(value => normalizedState(value) === normalizedState(issue.state)))
  const state: IssueState = {
    name: issue.state,
    type: terminal.has(normalizedState(issue.state)) ? 'completed' : 'started',
    position,
  }
  return {
    sourceKind: 'local',
    scopeRef: routing.projectId,
    nativeRef: issue.id,
    identifier: `LOCAL-${issue.number}`,
    title: issue.title,
    ...(issue.description === undefined ? {} : { description: issue.description }),
    ...(issue.priority === undefined ? {} : { priority: issue.priority }),
    state,
    branchName: slugBranch('local', String(issue.number), issue.title),
    labels: [],
    blockedBy: [],
    dispatchable: true,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }
}

function checkedState(value: string, routing: LocalRoutingConfig): string {
  const state = routing.states.find(candidate => normalizedState(candidate) === normalizedState(value))
  if (state !== undefined) return state
  throw new Error(`Local task state ${JSON.stringify(value)} is not declared by the current workflow`)
}

function requiredTitle(value: string): string {
  const title = value.trim()
  if (title === '') throw new Error('Local task title must not be empty')
  if (title.length > 500) throw new Error('Local task title must not exceed 500 characters')
  return title
}

function checkedPriority(value?: number): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1 || value > 4) throw new Error('Local task priority must be an integer from 1 to 4')
  return value
}

function nextUpdatedAt(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

function expandPath(value: string): string {
  const expanded = value === '~' ? homedir() : value.startsWith('~/') || value.startsWith('~\\') ? join(homedir(), value.slice(2)) : value
  return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded)
}

function decodeStore(value: unknown, path: string): LocalStore {
  if (!isObject(value) || value.version !== 1 || !isObject(value.projects)) {
    throw new Error(`dsh-dashboard: local task store ${path} has an unsupported schema`)
  }
  const projects: Record<string, StoredProject> = Object.create(null) as Record<string, StoredProject>
  for (const [projectId, projectValue] of Object.entries(value.projects)) {
    if (!isObject(projectValue) || !Number.isInteger(projectValue.nextNumber) || (projectValue.nextNumber as number) < 1 || !Array.isArray(projectValue.issues)) {
      throw new Error(`dsh-dashboard: local task store project ${JSON.stringify(projectId)} is invalid`)
    }
    const issues = projectValue.issues.map((issue, index) => decodeIssue(issue, projectId, index))
    projects[projectId] = { nextNumber: projectValue.nextNumber as number, issues }
  }
  return { version: 1, projects }
}

function decodeIssue(value: unknown, projectId: string, index: number): StoredIssue {
  if (!isObject(value)) throw new Error(`dsh-dashboard: local task ${projectId}[${index}] is invalid`)
  const id = readNonBlank(value.id)
  const title = readNonBlank(value.title)
  const state = readNonBlank(value.state)
  const createdAt = readDate(value.createdAt)
  const updatedAt = readDate(value.updatedAt)
  const number = typeof value.number === 'number' && Number.isInteger(value.number) && value.number > 0 ? value.number : undefined
  const description = typeof value.description === 'string' ? value.description : undefined
  const priority = value.priority === undefined ? undefined : checkedPriority(typeof value.priority === 'number' ? value.priority : Number.NaN)
  if (id === undefined || title === undefined || state === undefined || createdAt === undefined || updatedAt === undefined || number === undefined) {
    throw new Error(`dsh-dashboard: local task ${projectId}[${index}] is invalid`)
  }
  return { id, number, title, ...(description === undefined ? {} : { description }), state, ...(priority === undefined ? {} : { priority }), createdAt, updatedAt }
}

function readNonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function readDate(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw signal.reason
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value
}
