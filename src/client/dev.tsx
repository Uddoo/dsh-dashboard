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
      onAddDiscoveryRoot={async (input) => {
        const timestamp = new Date().toISOString()
        setSnapshot(current => ({
          ...current,
          catalog: {
            ...current.catalog,
            discoveryRoots: [...current.catalog.discoveryRoots, {
              id: crypto.randomUUID(), path: input.path, maxDepth: input.maxDepth ?? 4,
              confirmationRequired: true, createdAt: timestamp, updatedAt: timestamp,
            }],
          },
        }))
      }}
      onRemoveDiscoveryRoot={async (id) => {
        setSnapshot(current => ({ ...current, catalog: { ...current.catalog, discoveryRoots: current.catalog.discoveryRoots.filter(root => root.id !== id) } }))
      }}
      onScanProjects={async (rootId) => {
        const root = snapshot.catalog.discoveryRoots.find(item => item.id === rootId)
        if (root === undefined) throw new Error('Unknown fixture discovery root')
        return {
          root, truncated: false,
          candidates: [{
            token: 'fixture-candidate', name: 'symphony-adapter', path: `${root.path}\\symphony-adapter`,
            policyPath: `${root.path}\\symphony-adapter\\WORKFLOW.md`,
            repository: { kind: 'git', root: `${root.path}\\symphony-adapter`, remoteUrl: 'https://github.com/example/symphony-adapter.git', branch: 'main' },
          }],
        }
      }}
      onRegisterProjectCandidate={async () => {}}
      onRegisterProject={async (input) => {
        const timestamp = new Date().toISOString()
        setSnapshot(current => ({
          ...current,
          catalog: { ...current.catalog, projects: [...current.catalog.projects, {
            id: crypto.randomUUID(), name: input.name ?? input.path.split(/[\\/]/u).at(-1) ?? 'Project', root: input.path,
            repositoryIds: [], repositories: [], workspaceStrategy: 'controlled-directory', autonomousClaims: false,
            source: 'manual', currentWorkspace: false, createdAt: timestamp, updatedAt: timestamp,
          }] },
        }))
      }}
      onOpenSession={() => {}}
    />
  )
}

const root = document.querySelector('#root')
if (root === null) throw new Error('Missing #root for Dashboard fixture')
createRoot(root).render(<DevApp />)
