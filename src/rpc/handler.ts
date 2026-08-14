/** Trusted-host Connection RPC adapter for the Dashboard client. */

import type { DashboardOrchestrator } from '../orchestrator/orchestrator.ts'
import type { RpcResult } from '@deepseek-ai/dsh-client-connection/client'

/** Dispatch the intentionally small Dashboard RPC surface. */
export async function handleDashboardRpc(
  orchestrator: DashboardOrchestrator,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  if (signal.aborted) return failure('cancelled', 'Dashboard request was cancelled')
  try {
    switch (endpoint) {
      case 'state':
        return success(await orchestrator.snapshot())
      case 'refresh':
        await orchestrator.refresh()
        return success(await orchestrator.snapshot())
      case 'issue': {
        const key = readStringField(payload, 'key')
        if (key === undefined) return badRequest('issue requires a non-empty `key`')
        const detail = orchestrator.issueDetail(key)
        return detail === undefined ? badRequest(`unknown issue key ${JSON.stringify(key)}`) : success(detail)
      }
      case 'pause': {
        const paused = readBooleanField(payload, 'paused')
        if (paused === undefined) return badRequest('pause requires a boolean `paused`')
        orchestrator.setPaused(paused)
        return success(await orchestrator.snapshot())
      }
      case 'stop': {
        const key = readStringField(payload, 'key')
        if (key === undefined) return badRequest('stop requires a non-empty `key`')
        if (!orchestrator.stopIssue(key)) return badRequest(`issue ${JSON.stringify(key)} has no running Agent`)
        return success(await orchestrator.snapshot())
      }
      default:
        return badRequest(`unknown Dashboard endpoint ${JSON.stringify(endpoint)}`)
    }
  } catch (error) {
    return failure('internal', error instanceof Error ? error.message : String(error))
  }
}

function success<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function badRequest(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

function failure(code: 'cancelled' | 'internal', message: string): RpcResult<never> {
  return { ok: false, error: { code, message, details: {} } }
}

function readStringField(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.trim() !== '' ? field : undefined
}

function readBooleanField(value: unknown, key: string): boolean | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'boolean' ? field : undefined
}
