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

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(screen.getByRole('table', { name: 'Registered projects' }).textContent).toContain('dsh-dashboard')
    expect(screen.getByText('Global Broker off')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Scan roots' }))
    await waitFor(() => expect(onScanProjects).toHaveBeenCalledWith(fixtureSnapshot.catalog.discoveryRoots[0]!.id))
    const dialog = await screen.findByRole('dialog', { name: 'Scan discovery roots' })
    expect(dialog.textContent).toContain('candidate-project')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Register selected' }))

    await waitFor(() => expect(onRegisterProjectCandidate).toHaveBeenCalledWith('candidate-token'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Scan discovery roots' })).toBeNull())
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

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scan roots' }))

    const picker = screen.getByRole('dialog', { name: 'Choose discovery root' })
    expect(onScanProjects).not.toHaveBeenCalled()
    fireEvent.click(within(picker).getByRole('button', { name: /F:\\Dev\\Other/u }))

    await waitFor(() => expect(onScanProjects).toHaveBeenCalledWith(secondRoot.id))
    expect(await screen.findByRole('dialog', { name: 'Scan discovery roots' })).toBeTruthy()
  })

  it('submits explicit discovery-root and manual-project registrations', async () => {
    const onAddDiscoveryRoot = vi.fn(async () => {})
    const onRegisterProject = vi.fn(async () => {})
    renderDashboard({ onAddDiscoveryRoot, onRegisterProject })

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage roots' }))
    fireEvent.change(screen.getByLabelText('Absolute directory path'), { target: { value: 'F:\\Dev\\Projects' } })
    fireEvent.change(screen.getByLabelText('Maximum scan depth'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add root' }))
    await waitFor(() => expect(onAddDiscoveryRoot).toHaveBeenCalledWith({ path: 'F:\\Dev\\Projects', maxDepth: 5 }))

    fireEvent.click(screen.getByRole('button', { name: 'Register project' }))
    fireEvent.change(screen.getByLabelText('Absolute project path'), { target: { value: 'F:\\Dev\\Projects\\manual' } })
    fireEvent.change(screen.getByLabelText(/Display name/u), { target: { value: 'Manual project' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Register project' })).getByRole('button', { name: 'Register project' }))
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
