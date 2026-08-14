/** Stable, JSON-safe error metadata shared across the Dashboard Host/client boundary. */

export type DashboardErrorCode =
  | 'catalog.candidateExpired'
  | 'catalog.globalEmpty'
  | 'catalog.maxDepthInvalid'
  | 'catalog.pathAbsolute'
  | 'catalog.pathEscapesRoot'
  | 'catalog.pathNotDirectory'
  | 'catalog.projectNameInvalid'
  | 'catalog.projectUnknown'
  | 'catalog.rootRemoved'
  | 'catalog.rootUnknown'
  | 'local.priorityInvalid'
  | 'local.projectInvalid'
  | 'local.stateUnknown'
  | 'local.storeInvalidJson'
  | 'local.storeProjectInvalid'
  | 'local.storeSchemaUnsupported'
  | 'local.storeTargetInvalid'
  | 'local.storeTaskInvalid'
  | 'local.taskChanged'
  | 'local.taskNotFound'
  | 'local.titleEmpty'
  | 'local.titleTooLong'
  | 'local.workflowStatesMissing'
  | 'global.readOnly'
  | 'project.workflowInvalid'
  | 'request.cancelled'
  | 'response.unsupportedScan'
  | 'response.unsupportedState'

export type DashboardErrorParams = Readonly<Record<string, string | number>>

export interface DashboardErrorEnvelope {
  readonly dashboardCode: string
  readonly params?: DashboardErrorParams
  readonly fallbackMessage: string
}

const DASHBOARD_ERROR_PREFIX = 'dsh-dashboard-error:'

/** Plugin-owned failure whose localized presentation belongs to the Dashboard client. */
export class DashboardDomainError extends Error {
  readonly dashboardCode: DashboardErrorCode
  readonly params: DashboardErrorParams

  constructor(dashboardCode: DashboardErrorCode, message: string, params: DashboardErrorParams = {}) {
    super(message)
    this.name = 'DashboardDomainError'
    this.dashboardCode = dashboardCode
    this.params = params
  }
}

/** Encode metadata into the message because the Harness RpcError detail variants are closed. */
export function encodeDashboardError(error: unknown): string | undefined {
  if (!(error instanceof DashboardDomainError)) return undefined
  const envelope = Object.keys(error.params).length === 0
    ? { dashboardCode: error.dashboardCode, fallbackMessage: error.message }
    : { dashboardCode: error.dashboardCode, params: { ...error.params }, fallbackMessage: error.message }
  return `${DASHBOARD_ERROR_PREFIX}${JSON.stringify(envelope)}`
}

/** Decode trusted Dashboard metadata while treating malformed or foreign messages as ordinary text. */
export function decodeDashboardError(message: string): DashboardErrorEnvelope | undefined {
  if (!message.startsWith(DASHBOARD_ERROR_PREFIX)) return undefined
  try {
    const value = JSON.parse(message.slice(DASHBOARD_ERROR_PREFIX.length)) as unknown
    if (!isRecord(value) || typeof value.dashboardCode !== 'string' || typeof value.fallbackMessage !== 'string') {
      return undefined
    }
    const params = readParams(value.params)
    return params === undefined
      ? { dashboardCode: value.dashboardCode, fallbackMessage: value.fallbackMessage }
      : { dashboardCode: value.dashboardCode, params, fallbackMessage: value.fallbackMessage }
  } catch {
    return undefined
  }
}

function readParams(value: unknown): DashboardErrorParams | undefined {
  if (!isRecord(value)) return undefined
  const params: Record<string, string | number> = {}
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === 'string' || typeof field === 'number') params[key] = field
  }
  return Object.keys(params).length === 0 ? undefined : params
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
