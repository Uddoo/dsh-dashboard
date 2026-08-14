// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardDataController } from '../src/client/controller.ts'
import { dashboardErrorMessage } from '../src/client/errors.ts'
import { fixtureSnapshot, globalFixtureSnapshot } from '../src/client/fixture.ts'
import { DashboardI18nProvider, createDashboardTranslator } from '../src/client/i18n.tsx'
import { DashboardDomainError, encodeDashboardError } from '../src/runtime/errors.ts'

afterEach(cleanup)

describe('Dashboard i18n regressions', () => {
  it('opens a searchable project context menu with current and background activity state', () => {
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: '当前任务源' }))
    const switcher = screen.getByRole('dialog', { name: '项目上下文切换' })

    expect(within(switcher).getByText('Tracker 由目标项目的 WORKFLOW.md 决定。')).toBeTruthy()
    expect(within(switcher).getByRole('option', { name: /dsh-dashboard.*当前/u }).getAttribute('aria-selected')).toBe('true')
    expect(within(switcher).getByRole('option', { name: /dsh-dashboard-test/u }).textContent).toContain('1 个 Agent 运行中')

    fireEvent.change(within(switcher).getByLabelText('搜索可切换的项目'), { target: { value: '全局任务演示' } })
    expect(within(switcher).queryByRole('option', { name: /dsh-dashboard.*当前/u })).toBeNull()
    expect(within(switcher).getByRole('option', { name: /dsh-dashboard-test/u })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '项目上下文切换' })).toBeNull()
  })

  it('switches to a validated project and closes the context menu only after success', async () => {
    const onSwitchProject = vi.fn(async () => {})
    renderDashboard({ onSwitchProject })

    fireEvent.click(screen.getByRole('button', { name: '当前任务源' }))
    fireEvent.click(screen.getByRole('option', { name: /dsh-dashboard-test/u }))

    await waitFor(() => expect(onSwitchProject).toHaveBeenCalledWith('4bceae56-7cc1-4419-a912-a6ea110448fb'))
    expect(screen.queryByRole('dialog', { name: '项目上下文切换' })).toBeNull()
  })

  it('switches to the global composite view from the project context menu', async () => {
    const onSwitchGlobal = vi.fn(async () => {})
    renderDashboard({ onSwitchGlobal })

    fireEvent.click(screen.getByRole('button', { name: '当前任务源' }))
    fireEvent.click(screen.getByRole('option', { name: /全部项目/u }))

    await waitFor(() => expect(onSwitchGlobal).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: '项目上下文切换' })).toBeNull()
  })

  it('filters the global board by Provider and enters a task owning project', async () => {
    const onSwitchProject = vi.fn(async () => {})
    renderDashboard({ snapshot: globalFixtureSnapshot, onSwitchProject })

    expect(screen.getByRole('button', { name: '当前任务源' }).textContent).toContain('全局·全部项目')
    expect(screen.queryByRole('button', { name: '暂停' })).toBeNull()
    const sourceFilter = screen.getByLabelText('筛选全局任务来源')
    fireEvent.change(sourceFilter, { target: { value: 'provider:local' } })

    expect(screen.getByText('LOCAL-18')).toBeTruthy()
    expect(screen.queryByText('ENG-238')).toBeNull()
    fireEvent.click(screen.getByText('LOCAL-18'))
    const inspector = document.querySelector<HTMLElement>('.dshd-inspector')!
    expect(within(inspector).getByText('任务来源')).toBeTruthy()
    expect(within(inspector).getByText('dsh-dashboard-test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '进入项目' }))

    await waitFor(() => expect(onSwitchProject).toHaveBeenCalledWith('4bceae56-7cc1-4419-a912-a6ea110448fb'))
  })

  it('keeps the context menu open when Host validation rejects a project switch', async () => {
    const onSwitchProject = vi.fn(async () => { throw new Error('Invalid WORKFLOW.md') })
    renderDashboard({ onSwitchProject })

    fireEvent.click(screen.getByRole('button', { name: '当前任务源' }))
    fireEvent.click(screen.getByRole('option', { name: /dsh-dashboard-test/u }))

    await waitFor(() => expect(onSwitchProject).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog', { name: '项目上下文切换' })).toBeTruthy()
  })

  it('omits inactive column overflow placeholders while keeping Local create controls', () => {
    renderDashboard({
      snapshot: {
        ...fixtureSnapshot,
        context: { kind: 'local', providerLabel: 'Local', projectLabel: 'Personal', projectRef: 'personal' },
        taskMutations: { canCreate: true, canUpdate: true, canDelete: true, states: ['Backlog', 'Todo', 'In Progress', 'Done'] },
        configuration: { ...fixtureSnapshot.configuration, trackerKind: 'local', projectRef: 'personal', credentials: [] },
      },
    })

    expect(document.querySelector('.dshd-column-more')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^向“.+”添加任务$/u })).toHaveLength(4)
  })

  it('collapses and expands the hidden-column summary while preserving its contents', () => {
    renderDashboard()

    const hiddenColumns = document.querySelector<HTMLElement>('.dshd-hidden-columns')
    const collapseButton = screen.getByRole('button', { name: '收起隐藏分组' })
    const listId = collapseButton.getAttribute('aria-controls')
    const hiddenColumnList = listId === null ? null : document.getElementById(listId)

    expect(hiddenColumns?.hasAttribute('data-collapsed')).toBe(false)
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true')
    expect(hiddenColumnList?.hidden).toBe(false)

    fireEvent.click(collapseButton)

    const expandButton = screen.getByRole('button', { name: '展开隐藏分组' })
    expect(hiddenColumns?.hasAttribute('data-collapsed')).toBe(true)
    expect(expandButton.getAttribute('aria-expanded')).toBe('false')
    expect(hiddenColumnList?.hidden).toBe(true)

    fireEvent.click(expandButton)

    expect(screen.getByRole('button', { name: '收起隐藏分组' }).getAttribute('aria-expanded')).toBe('true')
    expect(hiddenColumns?.hasAttribute('data-collapsed')).toBe(false)
    expect(hiddenColumnList?.hidden).toBe(false)
  })

  it('filters board issues by runtime phase and composes with the text filter', () => {
    renderDashboard()

    const runtimeFilters = screen.getByRole('toolbar', { name: '任务运行状态筛选' })
    const runningFilter = within(runtimeFilters).getByRole('button', { name: '只显示运行中任务' })
    fireEvent.click(runningFilter)

    expect(runningFilter.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('ENG-238')).toBeTruthy()
    expect(screen.queryByText('ENG-236')).toBeNull()
    expect(screen.queryByText('ENG-241')).toBeNull()
    expect(screen.queryByText('ENG-240')).toBeNull()

    fireEvent.click(within(runtimeFilters).getByRole('button', { name: '只显示重试中任务' }))
    expect(screen.getByText('ENG-236')).toBeTruthy()
    expect(screen.queryByText('ENG-238')).toBeNull()

    fireEvent.click(within(runtimeFilters).getByRole('button', { name: '清除重试中筛选' }))
    expect(screen.getByText('ENG-240')).toBeTruthy()

    fireEvent.click(within(runtimeFilters).getByRole('button', { name: '只显示已阻塞任务' }))
    expect(screen.getByText('ENG-241')).toBeTruthy()
    expect(screen.queryByText('ENG-240')).toBeNull()
    fireEvent.click(within(runtimeFilters).getByRole('button', { name: '清除已阻塞筛选' }))

    fireEvent.click(screen.getByRole('button', { name: '筛选' }))
    fireEvent.change(screen.getByLabelText('筛选任务'), { target: { value: 'ENG-233' } })
    fireEvent.click(within(runtimeFilters).getByRole('button', { name: '只显示运行中任务' }))

    expect(screen.getByText('ENG-233')).toBeTruthy()
    expect(screen.queryByText('ENG-238')).toBeNull()
  })

  it('keeps the approved Linear header fallback without inventing a configuration Provider', () => {
    renderDashboard({ snapshot: undefined })

    expect(screen.getByText('Linear')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '配置' }))

    const providerRow = screen.getByText('提供方').parentElement
    expect(providerRow?.textContent).toBe('提供方—')
  })

  it('presents configuration as a contextual, semantic last-good inspector', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: '配置' }))

    expect(screen.queryByRole('button', { name: '筛选' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示' })).toBeNull()
    expect(screen.queryByRole('toolbar', { name: '任务运行状态筛选' })).toBeNull()
    expect(screen.getByText('当前使用最后一次有效配置')).toBeTruthy()
    expect(screen.getByText(/最后成功加载于/u)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '工作流与生效范围' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '任务源（Tracker）' })).toBeTruthy()
    expect(document.querySelectorAll('.dshd-config-section dl')).toHaveLength(3)
    expect(screen.getByRole('list', { name: '活动状态' }).children).toHaveLength(fixtureSnapshot.configuration.activeStates.length)

    fireEvent.click(screen.getByRole('button', { name: '复制 WORKFLOW.md 路径' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fixtureSnapshot.configuration.workflowPath))
    expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy()
  })

  it('keeps the active Dashboard tab visible after the viewport changes', () => {
    renderDashboard()
    const configurationTab = screen.getByRole('button', { name: '配置' })
    fireEvent.click(configurationTab)
    const tabs = configurationTab.parentElement
    expect(tabs).toBeTruthy()
    Object.defineProperties(configurationTab, {
      offsetLeft: { configurable: true, value: 360 },
      offsetWidth: { configurable: true, value: 55 },
    })
    Object.defineProperty(tabs, 'clientWidth', { configurable: true, value: 320 })

    fireEvent.resize(window)

    expect(tabs?.scrollLeft).toBe(111)
  })

  it('surfaces a rejected workflow reload as a last-good warning', () => {
    renderDashboard({
      snapshot: {
        ...fixtureSnapshot,
        configuration: {
          ...fixtureSnapshot.configuration,
          workflowError: 'tracker.provider.project_id: expected a non-empty string',
        },
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '配置' }))

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('当前使用最后一次有效配置')
    expect(status.textContent).toContain('tracker.provider.project_id: expected a non-empty string')
    expect(screen.getByText('重新加载失败')).toBeTruthy()
  })

  it('renders English singular counts for one discovery root and one candidate', async () => {
    const candidate = {
      token: 'only-candidate',
      name: 'one-project',
      path: 'F:\\Dev\\Code\\one-project',
    }
    renderDashboard({
      onScanProjects: async () => ({
        root: fixtureSnapshot.catalog.discoveryRoots[0]!,
        candidates: [candidate],
        truncated: false,
      }),
    }, 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(screen.getByText('1 discovery root')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scan roots' }))

    const dialog = await screen.findByRole('dialog', { name: 'Scan discovery roots' })
    expect(within(dialog).getByText('1 new candidate')).toBeTruthy()
  })

  it('translates known credential sources and preserves unknown source ids', () => {
    const snapshot = {
      ...fixtureSnapshot,
      configuration: {
        ...fixtureSnapshot.configuration,
        credentials: [
          ...fixtureSnapshot.configuration.credentials,
          { ref: 'custom/key', label: 'Custom key', configured: true, source: 'vault-plugin', writable: false },
        ],
      },
    }
    renderDashboard({ snapshot })
    fireEvent.click(screen.getByRole('button', { name: '配置' }))

    expect(screen.getByText(/已配置（凭据存储）/u)).toBeTruthy()
    expect(screen.getByText(/已配置（vault-plugin）/u)).toBeTruthy()
    expect(screen.queryByText(/credential-store/u)).toBeNull()
  })

  it('localizes a structured Host error in the catalog dialog', async () => {
    const message = encodeDashboardError(new DashboardDomainError(
      'catalog.pathAbsolute',
      'path must be absolute (or start with `~`)',
    ))!
    const rpc = {
      call: vi.fn(async () => ({
        ok: false,
        error: { code: 'bad-request', message, details: { issues: [] } },
      })),
    }
    const data = new DashboardDataController(rpc as never)
    renderDashboard({ onAddDiscoveryRoot: input => data.addDiscoveryRoot(input) })

    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '管理根目录' }))
    fireEvent.change(screen.getByLabelText('绝对目录路径'), { target: { value: 'relative-project' } })
    fireEvent.click(screen.getByRole('button', { name: '添加根目录' }))

    expect((await screen.findByRole('alert')).textContent).toBe('路径必须是绝对路径，也可以使用 ~ 开头的路径。')
    expect(rpc.call).toHaveBeenCalledWith('/dsh-dashboard', 'addDiscoveryRoot', {
      path: 'relative-project', maxDepth: 4,
    })
  })

  it('keeps unknown Provider errors verbatim', () => {
    expect(dashboardErrorMessage(
      new Error('GitHub API rate limit exceeded'),
      createDashboardTranslator('zh'),
    )).toBe('GitHub API rate limit exceeded')
  })
})

function renderDashboard(
  overrides: Partial<ComponentProps<typeof DashboardSurface>> = {},
  locale: 'zh' | 'en' = 'zh',
): void {
  render(withLocale(
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
    locale,
  ))
}

function withLocale(children: ReactNode, locale: 'zh' | 'en'): ReactNode {
  return <DashboardI18nProvider t={createDashboardTranslator(locale)}>{children}</DashboardI18nProvider>
}
