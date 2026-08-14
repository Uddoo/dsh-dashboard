import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardFooterAction, DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardUiController } from '../src/client/controller.ts'
import { fixtureSnapshot } from '../src/client/fixture.ts'

const catalogCallbacks = {
  onAddDiscoveryRoot: async () => {},
  onRemoveDiscoveryRoot: async () => {},
  onScanProjects: async () => ({ root: fixtureSnapshot.catalog.discoveryRoots[0]!, candidates: [], truncated: false }),
  onRegisterProjectCandidate: async () => {},
  onRegisterProject: async () => {},
}

describe('Dashboard visual contract', () => {
  it('exposes the native sidebar entry as a toggle', () => {
    const ui = new DashboardUiController()
    ui.open()
    const markup = renderToStaticMarkup(<DashboardFooterAction wide ui={ui} />)

    expect(markup).toContain('aria-label="Dashboard"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('renders the approved title, dynamic remote context, board, and inspector without local create controls', () => {
    const markup = renderToStaticMarkup(
      <DashboardSurface
        {...catalogCallbacks}
        snapshot={fixtureSnapshot}
        initialSelectedKey="linear:ENG:issue-238"
        onRefresh={async () => {}}
        onPause={async () => {}}
        onStop={async () => {}}
        onCreateTask={async () => {}}
        onUpdateTask={async () => {}}
        onDeleteTask={async () => {}}
        onOpenSession={() => {}}
      />,
    )

    expect(markup).toContain('<h1>Dashboard</h1>')
    expect(markup).toContain('Linear')
    expect(markup).toContain('ENG')
    expect(markup).toContain('Implement issue detail inspector')
    expect(markup).toContain('Stop agent')
    expect(markup).toContain('role="region"')
    expect(markup).not.toContain('DeepSeek Harness navigation')
    expect(markup).not.toContain('aria-modal="true"')
    expect(markup).not.toMatch(/aria-label="Add task/u)
  })

  it('adds a column-scoped plus control only for the Host-local task source', () => {
    const localSnapshot = {
      ...fixtureSnapshot,
      context: { kind: 'local', providerLabel: 'Local', projectLabel: 'Personal', projectRef: 'personal' },
      taskMutations: { canCreate: true, canUpdate: true, canDelete: true, states: ['Backlog', 'Todo', 'In Progress', 'Done'] },
      configuration: { ...fixtureSnapshot.configuration, trackerKind: 'local', projectRef: 'personal', credentials: [] },
    } as const
    const markup = renderToStaticMarkup(
      <DashboardSurface
        {...catalogCallbacks}
        snapshot={localSnapshot}
        onRefresh={async () => {}}
        onPause={async () => {}}
        onStop={async () => {}}
        onCreateTask={async () => {}}
        onUpdateTask={async () => {}}
        onDeleteTask={async () => {}}
        onOpenSession={() => {}}
      />,
    )

    expect(markup).toContain('Local')
    expect(markup).toContain('Personal')
    expect(markup).toContain('aria-label="Add task to Backlog"')
  })
})
