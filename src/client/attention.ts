/** Client-side attention projection derived from the lossless Dashboard snapshot. */

import type { DashboardSnapshot } from '../runtime/types.ts'

export type AttentionAlertKind = 'configuration' | 'runtime' | 'stale'

export interface AttentionAlert {
  readonly id: string
  readonly kind: AttentionAlertKind
  readonly projectName?: string | undefined
  readonly detail: string
}

export interface AttentionSummary {
  readonly issueKeys: ReadonlySet<string>
  readonly alerts: readonly AttentionAlert[]
  readonly count: number
}

export function buildAttentionSummary(snapshot: DashboardSnapshot | undefined, now = Date.now()): AttentionSummary {
  if (snapshot === undefined) return { issueKeys: new Set(), alerts: [], count: 0 }

  const issueKeys = new Set(snapshot.runtime.issues
    .filter(issue => issue.phase === 'retrying' || issue.phase === 'blocked')
    .map(issue => issue.key))
  const alerts: AttentionAlert[] = []

  if (snapshot.selection.mode === 'global') {
    for (const project of snapshot.catalog.projects) {
      if (project.configurationState !== 'invalid') continue
      alerts.push({
        id: `configuration:${project.id}`,
        kind: 'configuration',
        projectName: project.name,
        detail: project.configurationError ?? 'WORKFLOW.md configuration is invalid',
      })
    }
  } else {
    const selectedProjectId = snapshot.selection.projectId
    const project = snapshot.catalog.projects.find(candidate => (
      candidate.id === selectedProjectId
      || (selectedProjectId === undefined && candidate.currentWorkspace)
    ))
    const detail = snapshot.configuration.workflowError
      ?? (project?.configurationState === 'invalid' ? project.configurationError ?? 'WORKFLOW.md configuration is invalid' : undefined)
    if (detail !== undefined) {
      alerts.push({
        id: project === undefined ? 'configuration:workflow-reload' : `configuration:${project.id}`,
        kind: 'configuration',
        projectName: project?.name ?? snapshot.configuration.projectName,
        detail,
      })
    }
  }

  if (snapshot.runtime.lastError !== undefined) {
    alerts.push({ id: 'runtime:last-error', kind: 'runtime', detail: snapshot.runtime.lastError })
  }

  const refreshAt = snapshot.runtime.lastRefreshAt === undefined ? Number.NaN : Date.parse(snapshot.runtime.lastRefreshAt)
  const staleAfterMs = Math.max(30_000, (snapshot.configuration.pollingIntervalMs ?? 5_000) * 3)
  if (Number.isFinite(refreshAt) && now - refreshAt > staleAfterMs) {
    alerts.push({ id: 'runtime:stale', kind: 'stale', detail: snapshot.runtime.lastRefreshAt! })
  }

  return { issueKeys, alerts, count: issueKeys.size + alerts.length }
}
