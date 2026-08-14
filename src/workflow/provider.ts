/** Narrow provider-owned WORKFLOW fields at adapter boundaries. */

export function providerString(provider: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = provider[field]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function requireProviderString(provider: Readonly<Record<string, unknown>>, field: string, kind: string): string {
  const value = providerString(provider, field)
  if (value !== undefined) return value
  throw new Error(`dsh-dashboard: tracker.provider.${field} is required for ${kind}`)
}

export function providerStringMap(provider: Readonly<Record<string, unknown>>, field: string): Readonly<Record<string, string>> {
  const value = provider[field]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (key.trim() === '' || typeof item !== 'string' || item.trim() === '') return []
    return [[key.trim(), item.trim()]]
  }))
}

export function workflowStateOrder(
  active: readonly string[],
  terminal: readonly string[],
  visible: readonly string[],
): readonly string[] {
  return [...new Set([...visible, ...active, ...terminal].map(value => value.trim()).filter(Boolean))]
}
