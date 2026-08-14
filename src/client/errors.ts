/** Localize plugin-owned failures while preserving unknown Provider/transport messages verbatim. */

import { decodeDashboardError } from '../runtime/errors.ts'
import type { DashboardErrorCode, DashboardErrorEnvelope, DashboardErrorParams } from '../runtime/errors.ts'
import type { DashboardTranslate } from './i18n.tsx'
import type { DashboardLocaleKey } from './locales.ts'

const ERROR_TRANSLATION_KEYS = {
  'catalog.candidateExpired': 'error.catalogCandidateExpired',
  'catalog.maxDepthInvalid': 'error.catalogMaxDepthInvalid',
  'catalog.pathAbsolute': 'error.catalogPathAbsolute',
  'catalog.pathEscapesRoot': 'error.catalogPathEscapesRoot',
  'catalog.pathNotDirectory': 'error.catalogPathNotDirectory',
  'catalog.projectNameInvalid': 'error.catalogProjectNameInvalid',
  'catalog.rootRemoved': 'error.catalogRootRemoved',
  'catalog.rootUnknown': 'error.catalogRootUnknown',
  'local.priorityInvalid': 'error.localPriorityInvalid',
  'local.projectInvalid': 'error.localProjectInvalid',
  'local.stateUnknown': 'error.localStateUnknown',
  'local.storeInvalidJson': 'error.localStoreInvalidJson',
  'local.storeProjectInvalid': 'error.localStoreProjectInvalid',
  'local.storeSchemaUnsupported': 'error.localStoreSchemaUnsupported',
  'local.storeTargetInvalid': 'error.localStoreTargetInvalid',
  'local.storeTaskInvalid': 'error.localStoreTaskInvalid',
  'local.taskChanged': 'error.localTaskChanged',
  'local.taskNotFound': 'error.localTaskNotFound',
  'local.titleEmpty': 'error.localTitleEmpty',
  'local.titleTooLong': 'error.localTitleTooLong',
  'local.workflowStatesMissing': 'error.localWorkflowStatesMissing',
  'request.cancelled': 'error.requestCancelled',
  'response.unsupportedScan': 'error.unsupportedScan',
  'response.unsupportedState': 'error.unsupportedState',
} as const satisfies Record<DashboardErrorCode, DashboardLocaleKey>

/** Error propagated by the client data port with optional stable Dashboard metadata. */
export class DashboardRequestError extends Error {
  readonly rpcCode: string | undefined
  readonly dashboardCode: DashboardErrorCode | undefined
  readonly params: DashboardErrorParams

  constructor(message: string, options: {
    readonly rpcCode?: string
    readonly dashboardCode?: DashboardErrorCode
    readonly params?: DashboardErrorParams
  } = {}) {
    super(message)
    this.name = 'DashboardRequestError'
    this.rpcCode = options.rpcCode
    this.dashboardCode = options.dashboardCode
    this.params = options.params ?? {}
  }
}

/** Preserve RPC diagnostics and decode plugin-owned localization metadata. */
export function dashboardRpcError(rpcCode: string, message: string): DashboardRequestError {
  const envelope = decodeDashboardError(message)
  const metadata = readMetadata(envelope)
  return new DashboardRequestError(`${rpcCode}: ${envelope?.fallbackMessage ?? message}`, {
    rpcCode,
    ...(metadata === undefined ? {} : metadata),
  })
}

/** Mark a client-side protocol rejection with a stable localization code. */
export function dashboardProtocolError(dashboardCode: 'response.unsupportedScan' | 'response.unsupportedState', message: string): DashboardRequestError {
  return new DashboardRequestError(message, { dashboardCode })
}

/** Normalize thrown values before publishing or rethrowing them through the UI port. */
export function normalizeDashboardError(error: unknown): DashboardRequestError {
  if (error instanceof DashboardRequestError) return error
  if (error instanceof Error) return new DashboardRequestError(error.message)
  return new DashboardRequestError(String(error))
}

/** Translate known plugin failures; unknown Provider and transport errors retain their source text. */
export function dashboardErrorMessage(error: unknown, t: DashboardTranslate): string {
  const normalized = normalizeDashboardError(error)
  if (normalized.dashboardCode === undefined) return normalized.message
  return t(ERROR_TRANSLATION_KEYS[normalized.dashboardCode], normalized.params)
}

function readMetadata(envelope: DashboardErrorEnvelope | undefined): {
  readonly dashboardCode: DashboardErrorCode
  readonly params?: DashboardErrorParams
} | undefined {
  if (envelope === undefined || !(envelope.dashboardCode in ERROR_TRANSLATION_KEYS)) return undefined
  const dashboardCode = envelope.dashboardCode as DashboardErrorCode
  return envelope.params === undefined ? { dashboardCode } : { dashboardCode, params: envelope.params }
}
