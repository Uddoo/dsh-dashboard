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
      case 'createTask': {
        const input = readCreateTask(payload)
        if (typeof input === 'string') return badRequest(input)
        await orchestrator.createTask(input, signal)
        return success(await orchestrator.snapshot())
      }
      case 'updateTask': {
        const nativeRef = readStringField(payload, 'nativeRef')
        const changes = readUpdateTask(readObjectField(payload, 'changes'))
        if (nativeRef === undefined) return badRequest('updateTask requires a non-empty `nativeRef`')
        if (typeof changes === 'string') return badRequest(changes)
        await orchestrator.updateTask(nativeRef, changes, signal)
        return success(await orchestrator.snapshot())
      }
      case 'deleteTask': {
        const nativeRef = readStringField(payload, 'nativeRef')
        if (nativeRef === undefined) return badRequest('deleteTask requires a non-empty `nativeRef`')
        if (!await orchestrator.deleteTask(nativeRef, signal)) return badRequest(`unknown local task ${JSON.stringify(nativeRef)}`)
        return success(await orchestrator.snapshot())
      }
      default:
        return badRequest(`unknown Dashboard endpoint ${JSON.stringify(endpoint)}`)
    }
  } catch (error) {
    return failure('internal', error instanceof Error ? error.message : String(error))
  }
}

function readCreateTask(value: unknown): import('../task-source/index.ts').CreateTaskInput | string {
  const object = readObject(value)
  const title = readStringField(object, 'title')
  if (title === undefined) return 'createTask requires a non-empty `title`'
  const description = readOptionalString(object, 'description')
  if (description === false) return 'createTask `description` must be a string when provided'
  const state = readOptionalString(object, 'state')
  if (state === false) return 'createTask `state` must be a non-empty string when provided'
  const priority = readOptionalPriority(object, 'priority')
  if (priority === false || priority === null) return 'createTask `priority` must be an integer from 1 to 4 when provided'
  return {
    title,
    ...(description === undefined ? {} : { description }),
    ...(state === undefined ? {} : { state }),
    ...(priority === undefined ? {} : { priority }),
  }
}

function readUpdateTask(value: unknown): import('../task-source/index.ts').UpdateTaskInput | string {
  const object = readObject(value)
  const title = readOptionalString(object, 'title')
  if (title === false) return 'updateTask `title` must be a non-empty string when provided'
  const description = readOptionalNullableString(object, 'description')
  if (description === false) return 'updateTask `description` must be a string or null when provided'
  const state = readOptionalString(object, 'state')
  if (state === false) return 'updateTask `state` must be a non-empty string when provided'
  const priority = readOptionalPriority(object, 'priority')
  if (priority === false) return 'updateTask `priority` must be an integer from 1 to 4, null, or omitted'
  const expectedUpdatedAt = readOptionalTimestamp(object, 'expectedUpdatedAt')
  if (expectedUpdatedAt === false) return 'updateTask `expectedUpdatedAt` must be an ISO timestamp when provided'
  if (![title, description, state, priority].some(field => field !== undefined)) return 'updateTask requires at least one change'
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(state === undefined ? {} : { state }),
    ...(priority === undefined ? {} : { priority }),
    ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
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

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readObjectField(value: unknown, key: string): Record<string, unknown> | undefined {
  return readObject(readObject(value)?.[key])
}

function readOptionalString(value: unknown, key: string): string | undefined | false {
  const object = readObject(value)
  if (object === undefined || !(key in object)) return undefined
  const field = object[key]
  return typeof field === 'string' && field.trim() !== '' ? field.trim() : false
}

function readOptionalNullableString(value: unknown, key: string): string | null | undefined | false {
  const object = readObject(value)
  if (object === undefined || !(key in object)) return undefined
  const field = object[key]
  if (field === null) return null
  return typeof field === 'string' ? field.trim() : false
}

function readOptionalPriority(value: unknown, key: string): number | null | undefined | false {
  const object = readObject(value)
  if (object === undefined || !(key in object)) return undefined
  const field = object[key]
  if (field === null) return null
  return typeof field === 'number' && Number.isInteger(field) && field >= 1 && field <= 4 ? field : false
}

function readOptionalTimestamp(value: unknown, key: string): string | undefined | false {
  const object = readObject(value)
  if (object === undefined || !(key in object)) return undefined
  const field = object[key]
  return typeof field === 'string' && field.trim() !== '' && Number.isFinite(Date.parse(field))
    ? new Date(field).toISOString()
    : false
}

function readBooleanField(value: unknown, key: string): boolean | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'boolean' ? field : undefined
}
