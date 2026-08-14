/** Small external stores for shell visibility and trusted-host RPC state. */

import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { DashboardSnapshot } from '../runtime/types.ts'

export interface DashboardDataState {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly loading: boolean
  readonly error?: string | undefined
}

export interface DashboardDataPort {
  getSnapshot(): DashboardDataState
  subscribe(listener: () => void): () => void
  start(): () => void
  refresh(): Promise<void>
  setPaused(paused: boolean): Promise<void>
  stopIssue(key: string): Promise<void>
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

  private async readState(): Promise<void> {
    await this.call('state', {}, false)
  }

  private async call(endpoint: string, payload: unknown, announceLoading = true): Promise<void> {
    this.activeRequests += 1
    if (announceLoading) {
      const { error: _previousError, ...current } = this.state
      this.publish({ ...current, loading: true })
    }
    try {
      const result = await this.rpc.call('/dsh-dashboard', endpoint, payload) as RpcResult<unknown>
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const snapshot = parseSnapshot(result.value)
      this.publish({ snapshot, loading: false })
    } catch (error) {
      this.publish({
        ...this.state,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
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
  if (value === null || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    throw new Error('Dashboard Host returned an unsupported state payload')
  }
  return value as DashboardSnapshot
}
