/** Standalone browser surface for deterministic visual and interaction QA. */

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DashboardSnapshot } from '../runtime/types.ts'
import { DashboardSurface } from './Dashboard.tsx'
import { fixtureSnapshot } from './fixture.ts'
import { installDashboardStyles } from './styles.ts'

installDashboardStyles()

function DevApp() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(fixtureSnapshot)
  return (
    <DashboardSurface
      snapshot={snapshot}
      initialSelectedKey="linear:ENG:issue-238"
      onRefresh={async () => {
        setSnapshot(current => ({
          ...current,
          generatedAt: new Date().toISOString(),
          runtime: { ...current.runtime, lastRefreshAt: new Date().toISOString() },
        }))
      }}
      onPause={async (paused) => { setSnapshot(current => ({ ...current, paused })) }}
      onStop={async (key) => {
        setSnapshot(current => ({
          ...current,
          runtime: {
            ...current.runtime,
            running: Math.max(0, current.runtime.running - 1),
            issues: current.runtime.issues.filter(issue => issue.key !== key),
          },
        }))
      }}
      onCreateTask={async () => {}}
      onUpdateTask={async () => {}}
      onDeleteTask={async () => {}}
      onOpenSession={() => {}}
    />
  )
}

const root = document.querySelector('#root')
if (root === null) throw new Error('Missing #root for Dashboard fixture')
createRoot(root).render(<DevApp />)
