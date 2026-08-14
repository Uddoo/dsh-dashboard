// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { fixtureSnapshot } from '../src/client/fixture.ts'

const catalogCallbacks = {
  onSwitchProject: async () => {},
  onAddDiscoveryRoot: async () => {},
  onRemoveDiscoveryRoot: async () => {},
  onScanProjects: async () => ({ root: fixtureSnapshot.catalog.discoveryRoots[0]!, candidates: [], truncated: false }),
  onRegisterProjectCandidate: async () => {},
  onRegisterProject: async () => {},
}

afterEach(cleanup)

describe('Dashboard local task interactions', () => {
  it('opens a column-scoped create dialog and sends validated task fields to the Host port', async () => {
    const onCreateTask = vi.fn(async () => {})
    const snapshot = {
      ...fixtureSnapshot,
      context: { kind: 'local', providerLabel: 'Local', projectLabel: 'Personal', projectRef: 'personal' },
      taskMutations: { canCreate: true, canUpdate: true, canDelete: true, states: ['Backlog', 'Todo', 'In Progress', 'Done'] },
      configuration: { ...fixtureSnapshot.configuration, trackerKind: 'local', projectRef: 'personal', credentials: [] },
    } as const
    render(
      <DashboardSurface
        {...catalogCallbacks}
        snapshot={snapshot}
        onRefresh={async () => {}}
        onPause={async () => {}}
        onStop={async () => {}}
        onCreateTask={onCreateTask}
        onUpdateTask={async () => {}}
        onDeleteTask={async () => {}}
        onOpenSession={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '向“Backlog”添加任务' }))
    expect(screen.getByRole('dialog', { name: '创建任务' }).getAttribute('aria-modal')).toBe('true')
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Local acceptance test' } })
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Created inside Dashboard' } })
    fireEvent.change(screen.getByLabelText('优先级'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => {
      expect(onCreateTask).toHaveBeenCalledWith({
        title: 'Local acceptance test', description: 'Created inside Dashboard', state: 'Backlog', priority: 2,
      })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends only edited fields plus the opened task revision when saving', async () => {
    const onUpdateTask = vi.fn(async () => {})
    const snapshot = {
      ...fixtureSnapshot,
      context: { kind: 'local', providerLabel: 'Local', projectLabel: 'Personal', projectRef: 'personal' },
      taskMutations: { canCreate: true, canUpdate: true, canDelete: true, states: ['Backlog', 'Todo', 'In Progress', 'Done'] },
      configuration: { ...fixtureSnapshot.configuration, trackerKind: 'local', projectRef: 'personal', credentials: [] },
    } as const
    render(
      <DashboardSurface
        {...catalogCallbacks}
        snapshot={snapshot}
        onRefresh={async () => {}}
        onPause={async () => {}}
        onStop={async () => {}}
        onCreateTask={async () => {}}
        onUpdateTask={onUpdateTask}
        onDeleteTask={async () => {}}
        onOpenSession={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Harden workspace cleanup boundaries/u }))
    fireEvent.click(screen.getByRole('button', { name: '编辑本地任务' }))
    const save = screen.getByRole('button', { name: '保存更改' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Harden scoped workspace cleanup' } })
    fireEvent.click(save)

    await waitFor(() => {
      expect(onUpdateTask).toHaveBeenCalledWith('issue-241', {
        title: 'Harden scoped workspace cleanup', expectedUpdatedAt: '2026-08-14T02:24:00.000Z',
      })
    })
  })
})
