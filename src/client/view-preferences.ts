/** Versioned per-context view preferences kept in the browser profile. */

export type BoardLayout = 'board' | 'list'
export type BoardDensity = 'comfortable' | 'compact'

export interface BoardViewPreferences {
  readonly layout: BoardLayout
  readonly density: BoardDensity
  readonly showTerminalColumns: boolean
  readonly showEmptyColumns: boolean
  readonly showOrigin: boolean
  readonly showUpdatedAt: boolean
  readonly showRuntime: boolean
}

export const defaultBoardViewPreferences: BoardViewPreferences = {
  layout: 'board',
  density: 'comfortable',
  showTerminalColumns: true,
  showEmptyColumns: true,
  showOrigin: true,
  showUpdatedAt: true,
  showRuntime: true,
}

const storageKey = 'dsh-dashboard:view-preferences:v1'

interface StoredViewPreferences {
  readonly version: 1
  readonly scopes: Readonly<Record<string, BoardViewPreferences>>
}

export function loadBoardViewPreferences(): Record<string, BoardViewPreferences> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as Partial<StoredViewPreferences>
    if (parsed.version !== 1 || parsed.scopes === undefined || parsed.scopes === null || typeof parsed.scopes !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed.scopes).map(([scope, value]) => [scope, normalizePreferences(value)]))
  } catch {
    return {}
  }
}

export function saveBoardViewPreferences(scopes: Readonly<Record<string, BoardViewPreferences>>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, scopes } satisfies StoredViewPreferences))
  } catch {
    // Storage may be disabled by the host browser; the in-memory preference still applies.
  }
}

export function isDefaultBoardViewPreferences(value: BoardViewPreferences): boolean {
  return Object.entries(defaultBoardViewPreferences).every(([key, expected]) => value[key as keyof BoardViewPreferences] === expected)
}

function normalizePreferences(value: unknown): BoardViewPreferences {
  if (value === null || typeof value !== 'object') return defaultBoardViewPreferences
  const candidate = value as Partial<BoardViewPreferences>
  return {
    layout: candidate.layout === 'list' ? 'list' : 'board',
    density: candidate.density === 'compact' ? 'compact' : 'comfortable',
    showTerminalColumns: candidate.showTerminalColumns !== false,
    showEmptyColumns: candidate.showEmptyColumns !== false,
    showOrigin: candidate.showOrigin !== false,
    showUpdatedAt: candidate.showUpdatedAt !== false,
    showRuntime: candidate.showRuntime !== false,
  }
}
