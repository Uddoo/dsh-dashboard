/** Small external stores for shell visibility and trusted-host RPC state. */

import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { DashboardSnapshot } from '../runtime/types.ts'
import type { AddDiscoveryRootInput, ProjectScanResult, RegisterProjectInput } from '../catalog/types.ts'
import type { CreateTaskInput, UpdateTaskInput } from '../task-source/index.ts'
import {
  DashboardRequestError,
  dashboardProtocolError,
  dashboardRpcError,
  normalizeDashboardError,
} from './errors.ts'

export interface DashboardDataState {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly loading: boolean
  readonly error?: DashboardRequestError | undefined
}

export interface DashboardDataPort {
  getSnapshot(): DashboardDataState
  subscribe(listener: () => void): () => void
  start(): () => void
  refresh(): Promise<void>
  setPaused(paused: boolean): Promise<void>
  stopIssue(key: string): Promise<void>
  createTask(input: CreateTaskInput): Promise<void>
  updateTask(nativeRef: string, changes: UpdateTaskInput): Promise<void>
  deleteTask(nativeRef: string): Promise<void>
  addDiscoveryRoot(input: AddDiscoveryRootInput): Promise<void>
  removeDiscoveryRoot(id: string): Promise<void>
  scanProjects(rootId: string): Promise<ProjectScanResult>
  registerProjectCandidate(token: string): Promise<void>
  registerProject(input: RegisterProjectInput): Promise<void>
}

/** Root overlay visibility shared by the sidebar trigger and shell-overlay entry. */
export class DashboardUiController {
  private openValue = false
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): boolean => this.openValue

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  open = (): void => { this.set(true) }
  close = (): void => { this.set(false) }
  toggle = (): void => { this.set(!this.openValue) }

  private set(value: boolean): void {
    if (this.openValue === value) return
    this.openValue = value
    for (const listener of [...this.listeners]) listener()
  }
}

/** Polling Dashboard projection; transport/business failures share one UI error path. */
export class DashboardDataController implements DashboardDataPort {
  private state: DashboardDataState = { loading: true }
  private readonly listeners = new Set<() => void>()
  private interval: ReturnType<typeof setInterval> | undefined
  private activeRequests = 0

  constructor(private readonly rpc: ClientConnectionRpc) {}

  getSnapshot = (): DashboardDataState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start = (): (() => void) => {
    void this.refresh()
    if (this.interval === undefined) this.interval = setInterval(() => { void this.readState() }, 5000)
    return () => {
      if (this.interval !== undefined) clearInterval(this.interval)
      this.interval = undefined
    }
  }

  async refresh(): Promise<void> {
    await this.call('refresh', {})
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.call('pause', { paused })
  }

  async stopIssue(key: string): Promise<void> {
    await this.call('stop', { key })
  }

  async createTask(input: CreateTaskInput): Promise<void> {
    await this.call('createTask', input, true, true)
  }

  async updateTask(nativeRef: string, changes: UpdateTaskInput): Promise<void> {
    await this.call('updateTask', { nativeRef, changes }, true, true)
  }

  async deleteTask(nativeRef: string): Promise<void> {
    await this.call('deleteTask', { nativeRef }, true, true)
  }

  async addDiscoveryRoot(input: AddDiscoveryRootInput): Promise<void> {
    await this.call('addDiscoveryRoot', input, true, true)
  }

  async removeDiscoveryRoot(id: string): Promise<void> {
    await this.call('removeDiscoveryRoot', { id }, true, true)
  }

  async scanProjects(rootId: string): Promise<ProjectScanResult> {
    return await this.callProjectScan(rootId)
  }

  async registerProjectCandidate(token: string): Promise<void> {
    await this.call('registerProjectCandidate', { token }, true, true)
  }

  async registerProject(input: RegisterProjectInput): Promise<void> {
    await this.call('registerProject', input, true, true)
  }

  private async readState(): Promise<void> {
    await this.call('state', {}, false)
  }

  private async call(endpoint: string, payload: unknown, announceLoading = true, propagateError = false): Promise<void> {
    this.activeRequests += 1
    if (announceLoading) {
      const { error: _previousError, ...current } = this.state
      this.publish({ ...current, loading: true })
    }
    try {
      const result = await this.rpc.call('/dsh-dashboard', endpoint, payload) as RpcResult<unknown>
      if (!result.ok) {
        throw dashboardRpcError(result.error.code, result.error.message)
      }
      const snapshot = parseSnapshot(result.value)
      this.publish({ snapshot, loading: false })
    } catch (error) {
      const normalized = normalizeDashboardError(error)
      this.publish({
        ...this.state,
        loading: false,
        error: normalized,
      })
      if (propagateError) throw normalized
    } finally {
      this.activeRequests -= 1
      if (this.activeRequests === 0 && this.state.loading) this.publish({ ...this.state, loading: false })
    }
  }

  private async callProjectScan(rootId: string): Promise<ProjectScanResult> {
    this.activeRequests += 1
    const { error: _previousError, ...current } = this.state
    this.publish({ ...current, loading: true })
    try {
      const result = await this.rpc.call('/dsh-dashboard', 'scanProjects', { rootId }) as RpcResult<unknown>
      if (!result.ok) {
        throw dashboardRpcError(result.error.code, result.error.message)
      }
      const scan = parseProjectScan(result.value)
      this.publish({ ...this.state, loading: false })
      return scan
    } catch (error) {
      const normalized = normalizeDashboardError(error)
      this.publish({
        ...this.state,
        loading: false,
        error: normalized,
      })
      throw normalized
    } finally {
      this.activeRequests -= 1
      if (this.activeRequests === 0 && this.state.loading) this.publish({ ...this.state, loading: false })
    }
  }

  private publish(next: DashboardDataState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}

function parseSnapshot(value: unknown): DashboardSnapshot {
  if (value === null || typeof value !== 'object' || (value as { version?: unknown }).version !== 2) {
    throw dashboardProtocolError('response.unsupportedState', 'Dashboard Host returned an unsupported state payload')
  }
  return value as DashboardSnapshot
}

function parseProjectScan(value: unknown): ProjectScanResult {
  if (value === null || typeof value !== 'object' || !Array.isArray((value as { candidates?: unknown }).candidates)) {
    throw dashboardProtocolError(
      'response.unsupportedScan',
      'Dashboard Host returned an unsupported Project Catalog scan payload',
    )
  }
  return value as ProjectScanResult
}
