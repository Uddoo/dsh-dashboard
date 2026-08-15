import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardFooterAction, DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardUiController } from '../src/client/controller.ts'
import { DashboardI18nProvider, createDashboardTranslator } from '../src/client/i18n.tsx'
import { fixtureSnapshot } from '../src/client/fixture.ts'

const catalogCallbacks = {
  onSwitchProject: async () => {},
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
    const markup = renderToStaticMarkup(<DashboardFooterAction wide ui={ui} t={createDashboardTranslator('zh')} />)

    expect(markup).toContain('aria-label="仪表盘"')
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

    expect(markup).toContain('<h1>仪表盘</h1>')
    expect(markup).toContain('Linear')
    expect(markup).toContain('ENG')
    expect(markup).toContain('Implement issue detail inspector')
    expect(markup).toContain('概览')
    expect(markup).toContain('时间线')
    expect(markup).toContain('打开会话')
    expect(markup).toContain('role="region"')
    expect(markup).not.toContain('DeepSeek Harness navigation')
    expect(markup).not.toContain('aria-modal="true"')
    expect(markup).not.toMatch(/aria-label="向.*添加任务/u)
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

    expect(markup).toContain('本地')
    expect(markup).toContain('Personal')
    expect(markup).toContain('aria-label="向“Backlog”添加任务"')
  })

  it('keeps a complete English surface available through the same i18n key set', () => {
    const markup = renderToStaticMarkup(
      <DashboardI18nProvider t={createDashboardTranslator('en')}>
        <DashboardSurface
          {...catalogCallbacks}
          snapshot={fixtureSnapshot}
          onRefresh={async () => {}}
          onPause={async () => {}}
          onStop={async () => {}}
          onCreateTask={async () => {}}
          onUpdateTask={async () => {}}
          onDeleteTask={async () => {}}
          onOpenSession={() => {}}
        />
      </DashboardI18nProvider>,
    )

    expect(markup).toContain('<h1>Dashboard</h1>')
    expect(markup).toContain('Agent capacity')
    expect(markup).toContain('aria-label="Issue runtime filters"')
    expect(markup).toContain('aria-label="Show only Running issues"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-label="Collapse hidden columns"')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('Hidden columns')
  })
})
