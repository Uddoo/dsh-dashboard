// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { fixtureSnapshot } from '../src/client/fixture.ts'

const catalogCallbacks = {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add task to Backlog' }))
    expect(screen.getByRole('dialog', { name: 'Create task' }).getAttribute('aria-modal')).toBe('true')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local acceptance test' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Created inside Dashboard' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Edit local task' }))
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Harden scoped workspace cleanup' } })
    fireEvent.click(save)

    await waitFor(() => {
      expect(onUpdateTask).toHaveBeenCalledWith('issue-241', {
        title: 'Harden scoped workspace cleanup', expectedUpdatedAt: '2026-08-14T02:24:00.000Z',
      })
    })
  })
})
