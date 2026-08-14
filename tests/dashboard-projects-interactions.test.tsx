// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { fixtureSnapshot } from '../src/client/fixture.ts'

afterEach(cleanup)

describe('Dashboard Project Catalog interactions', () => {
  it('renders registered Projects and confirms bounded scan candidates before registration', async () => {
    const onRegisterProjectCandidate = vi.fn(async () => {})
    const candidate = {
      token: 'candidate-token',
      name: 'candidate-project',
      path: 'F:\\Dev\\Code\\candidate-project',
      policyPath: 'F:\\Dev\\Code\\candidate-project\\WORKFLOW.md',
      repository: {
        kind: 'git' as const,
        root: 'F:\\Dev\\Code\\candidate-project',
        remoteUrl: 'https://github.com/example/candidate-project.git',
        branch: 'main',
      },
    }
    const onScanProjects = vi.fn(async () => ({
      root: fixtureSnapshot.catalog.discoveryRoots[0]!,
      candidates: [candidate],
      truncated: false,
    }))
    renderDashboard({ onScanProjects, onRegisterProjectCandidate })

    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    expect(screen.getByRole('table', { name: '已注册项目' }).textContent).toContain('dsh-dashboard')
    expect(screen.getByText('全局 Broker 已关闭')).toBeTruthy()
    expect(screen.queryByText('运行中')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '扫描根目录' }))
    await waitFor(() => expect(onScanProjects).toHaveBeenCalledWith(fixtureSnapshot.catalog.discoveryRoots[0]!.id))
    const dialog = await screen.findByRole('dialog', { name: '扫描发现根目录' })
    expect(dialog.textContent).toContain('candidate-project')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '注册所选项目' }))

    await waitFor(() => expect(onRegisterProjectCandidate).toHaveBeenCalledWith('candidate-token'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '扫描发现根目录' })).toBeNull())
  })

  it('asks which discovery root to scan when more than one root is configured', async () => {
    const secondRoot = {
      ...fixtureSnapshot.catalog.discoveryRoots[0]!,
      id: 'discovery-root-2',
      path: 'F:\\Dev\\Other',
    }
    const snapshot = {
      ...fixtureSnapshot,
      catalog: {
        ...fixtureSnapshot.catalog,
        discoveryRoots: [...fixtureSnapshot.catalog.discoveryRoots, secondRoot],
      },
    }
    const onScanProjects = vi.fn(async () => ({ root: secondRoot, candidates: [], truncated: false }))
    renderDashboard({ snapshot, onScanProjects })

    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '扫描根目录' }))

    const picker = screen.getByRole('dialog', { name: '选择发现根目录' })
    expect(onScanProjects).not.toHaveBeenCalled()
    fireEvent.click(within(picker).getByRole('button', { name: /F:\\Dev\\Other/u }))

    await waitFor(() => expect(onScanProjects).toHaveBeenCalledWith(secondRoot.id))
    expect(await screen.findByRole('dialog', { name: '扫描发现根目录' })).toBeTruthy()
  })

  it('submits explicit discovery-root and manual-project registrations', async () => {
    const onAddDiscoveryRoot = vi.fn(async () => {})
    const onRegisterProject = vi.fn(async () => {})
    renderDashboard({ onAddDiscoveryRoot, onRegisterProject })

    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '管理根目录' }))
    fireEvent.change(screen.getByLabelText('绝对目录路径'), { target: { value: 'F:\\Dev\\Projects' } })
    fireEvent.change(screen.getByLabelText('最大扫描深度'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '添加根目录' }))
    await waitFor(() => expect(onAddDiscoveryRoot).toHaveBeenCalledWith({ path: 'F:\\Dev\\Projects', maxDepth: 5 }))

    fireEvent.click(screen.getByRole('button', { name: '注册项目' }))
    fireEvent.change(screen.getByLabelText('项目绝对路径'), { target: { value: 'F:\\Dev\\Projects\\manual' } })
    fireEvent.change(screen.getByLabelText(/显示名称/u), { target: { value: 'Manual project' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: '注册项目' })).getByRole('button', { name: '注册项目' }))
    await waitFor(() => expect(onRegisterProject).toHaveBeenCalledWith({ path: 'F:\\Dev\\Projects\\manual', name: 'Manual project' }))
  })
})

function renderDashboard(overrides: Partial<ComponentProps<typeof DashboardSurface>> = {}): void {
  render(
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
