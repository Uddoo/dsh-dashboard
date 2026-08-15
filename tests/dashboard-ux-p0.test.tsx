// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAttentionSummary } from '../src/client/attention.ts'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardDataController } from '../src/client/controller.ts'
import { fixtureSnapshot, globalFixtureSnapshot } from '../src/client/fixture.ts'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('Dashboard P0 operator UX', () => {
  it('shows the active project configuration failure once without leaking failures from other projects', () => {
    const now = Date.parse('2026-08-14T02:30:05.000Z')
    const snapshot = {
      ...fixtureSnapshot,
      configuration: {
        ...fixtureSnapshot.configuration,
        workflowError: 'Tracker credential is missing',
      },
      catalog: {
        ...fixtureSnapshot.catalog,
        projects: fixtureSnapshot.catalog.projects.map((project, index) => ({
          ...project,
          configurationState: 'invalid' as const,
          configurationError: index === 0 ? 'Tracker credential is missing' : 'Unrelated project failure',
        })),
      },
    }

    const summary = buildAttentionSummary(snapshot, now)

    expect([...summary.issueKeys]).toEqual(['linear:ENG:issue-236', 'linear:ENG:issue-241'])
    expect(summary.alerts).toEqual([
      expect.objectContaining({ id: `configuration:${fixtureSnapshot.catalog.projects[0]!.id}`, kind: 'configuration', projectName: 'dsh-dashboard', detail: 'Tracker credential is missing' }),
    ])
    expect(summary.count).toBe(3)
  })

  it('aggregates every invalid project configuration in the global view', () => {
    const snapshot = {
      ...globalFixtureSnapshot,
      catalog: {
        ...globalFixtureSnapshot.catalog,
        projects: globalFixtureSnapshot.catalog.projects.map((project, index) => ({
          ...project,
          configurationState: 'invalid' as const,
          configurationError: `Project failure ${index + 1}`,
        })),
      },
    }

    const summary = buildAttentionSummary(snapshot, Date.parse(globalFixtureSnapshot.generatedAt))

    expect(summary.alerts.map(alert => alert.detail)).toEqual(['Project failure 1', 'Project failure 2'])
  })

  it('filters the board to tasks that need attention and explains the blocked reason', () => {
    renderDashboard({ snapshot: { ...fixtureSnapshot, runtime: { ...fixtureSnapshot.runtime, lastRefreshAt: new Date().toISOString() } } })

    fireEvent.click(screen.getByRole('button', { name: '只显示需要关注的任务' }))

    expect(screen.getByText('ENG-236')).toBeTruthy()
    expect(screen.getByText('ENG-241')).toBeTruthy()
    expect(screen.getByText('Blocked by ENG-212 (In Progress)')).toBeTruthy()
    expect(screen.queryByText('ENG-238')).toBeNull()
    expect(screen.getByRole('button', { name: '清除需要关注筛选' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('provides a persistent Display panel with real layout, density, group, and card settings', () => {
    const first = renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: '显示' }))
    const display = screen.getByRole('dialog', { name: '视图设置' })

    expect(within(display).getByLabelText('卡片内 Agent 状态')).toBeTruthy()
    fireEvent.click(within(display).getByRole('button', { name: '列表' }))
    fireEvent.click(within(display).getByLabelText('任务来源'))
    fireEvent.click(within(display).getByLabelText('显示空分组'))

    expect(document.querySelector('.dshd-board-list')).toBeTruthy()
    expect(document.querySelector('.dshd-board-list-origin')).toBeNull()
    expect(document.querySelectorAll('.dshd-board-list-group')).toHaveLength(8)

    first.unmount()
    renderDashboard()

    expect(document.querySelector('.dshd-board-list')).toBeTruthy()
    expect(screen.getByRole('button', { name: '显示' }).hasAttribute('data-active')).toBe(true)
  })

  it('removes misleading menu affordances until real menus exist', () => {
    renderDashboard()

    expect(screen.queryByRole('button', { name: 'Agent 容量' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Agent 容量' })).toBeTruthy()
    expect(document.querySelector('.dshd-card-more')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    expect(document.querySelector('.dshd-project-more')).toBeNull()
  })

  it('keeps mutation progress local to its control and announces success', async () => {
    let resolvePause: (() => void) | undefined
    const onPause = vi.fn(() => new Promise<void>((resolve) => { resolvePause = resolve }))
    renderDashboard({ onPause })
    const pause = screen.getByRole('button', { name: '暂停' })

    fireEvent.click(pause)

    expect(pause.getAttribute('aria-busy')).toBe('true')
    expect((pause as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: '筛选' })).toBeTruthy()
    resolvePause?.()

    expect((await screen.findByRole('status')).textContent).toContain('任务调度已暂停')
    await waitFor(() => expect((pause as HTMLButtonElement).disabled).toBe(false))
  })

  it('disables only the discovery root being removed until the request settles', async () => {
    let resolveRemoval: (() => void) | undefined
    const onRemoveDiscoveryRoot = vi.fn(() => new Promise<void>((resolve) => { resolveRemoval = resolve }))
    renderDashboard({ onRemoveDiscoveryRoot })
    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    const root = fixtureSnapshot.catalog.discoveryRoots[0]!
    const remove = screen.getByRole('button', { name: `移除 ${root.path}` })

    fireEvent.click(remove)

    expect(remove.getAttribute('aria-busy')).toBe('true')
    expect((remove as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(remove)
    expect(onRemoveDiscoveryRoot).toHaveBeenCalledOnce()

    resolveRemoval?.()
    await waitFor(() => expect((remove as HTMLButtonElement).disabled).toBe(false))
  })

  it('prevents duplicate project switches from the global issue inspector', async () => {
    let resolveSwitch: (() => void) | undefined
    const onSwitchProject = vi.fn(() => new Promise<void>((resolve) => { resolveSwitch = resolve }))
    renderDashboard({ snapshot: globalFixtureSnapshot, onSwitchProject })
    fireEvent.click(screen.getByText('LOCAL-18'))
    const enterProject = screen.getByRole('button', { name: '进入项目' })

    fireEvent.click(enterProject)

    expect(enterProject.getAttribute('aria-busy')).toBe('true')
    expect((enterProject as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(enterProject)
    expect(onSwitchProject).toHaveBeenCalledOnce()

    resolveSwitch?.()
    await waitFor(() => expect(screen.queryByRole('button', { name: '进入项目' })).toBeNull())
  })

  it('announces an action failure without replacing the current snapshot', async () => {
    renderDashboard({ onRefresh: async () => { throw new Error('Provider temporarily unavailable') } })

    fireEvent.click(screen.getByRole('button', { name: '刷新仪表盘' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Provider temporarily unavailable')
    expect(screen.getByText('ENG-238')).toBeTruthy()
  })

  it('does not promote a caller-owned mutation to global Dashboard loading', async () => {
    let resolvePause: ((value: unknown) => void) | undefined
    const rpc = {
      call: vi.fn(async (_namespace: string, endpoint: string) => {
        if (endpoint === 'pause') return await new Promise(resolve => { resolvePause = resolve })
        return { ok: true, value: fixtureSnapshot }
      }),
    }
    const controller = new DashboardDataController(rpc as never)
    await controller.refresh()

    const pause = controller.setPaused(true)

    expect(controller.getSnapshot().loading).toBe(false)
    resolvePause?.({ ok: true, value: fixtureSnapshot })
    await pause
    expect(controller.getSnapshot().loading).toBe(false)
  })
})

function renderDashboard(overrides: Partial<ComponentProps<typeof DashboardSurface>> = {}) {
  return render(
    <DashboardSurface
      snapshot={fixtureSnapshot}
      onRefresh={async () => {}}
      onPause={async () => {}}
      onStop={async () => {}}
      onCreateTask={async () => {}}
      onUpdateTask={async () => {}}
      onDeleteTask={async () => {}}
      onSwitchProject={async () => {}}
      onAddDiscoveryRoot={async () => {}}
      onRemoveDiscoveryRoot={async () => {}}
      onScanProjects={async () => ({ root: fixtureSnapshot.catalog.discoveryRoots[0]!, candidates: [], truncated: false })}
      onRegisterProjectCandidate={async () => {}}
      onRegisterProject={async () => {}}
      onOpenSession={() => {}}
      {...overrides}
    />,
  )
}
