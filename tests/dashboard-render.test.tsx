import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardFooterAction, DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardUiController } from '../src/client/controller.ts'
import { fixtureSnapshot } from '../src/client/fixture.ts'

describe('Dashboard visual contract', () => {
  it('exposes the native sidebar entry as a toggle', () => {
    const ui = new DashboardUiController()
    ui.open()
    const markup = renderToStaticMarkup(<DashboardFooterAction wide ui={ui} />)

    expect(markup).toContain('aria-label="Dashboard"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('renders the approved Phase 1 title, dynamic context, board, and inspector without a create control', () => {
    const markup = renderToStaticMarkup(
      <DashboardSurface
        snapshot={fixtureSnapshot}
        initialSelectedKey="linear:issue-238"
        onRefresh={async () => {}}
        onPause={async () => {}}
        onStop={async () => {}}
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
    expect(markup).not.toMatch(/aria-label="(Add|Create)|>\+</u)
  })
})
