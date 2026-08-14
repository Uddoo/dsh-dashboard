// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardSurface } from '../src/client/Dashboard.tsx'
import { DashboardDataController } from '../src/client/controller.ts'
import { dashboardErrorMessage } from '../src/client/errors.ts'
import { fixtureSnapshot } from '../src/client/fixture.ts'
import { DashboardI18nProvider, createDashboardTranslator } from '../src/client/i18n.tsx'
import { DashboardDomainError, encodeDashboardError } from '../src/runtime/errors.ts'

afterEach(cleanup)

describe('Dashboard i18n regressions', () => {
  it('keeps the approved Linear header fallback without inventing a configuration Provider', () => {
    renderDashboard({ snapshot: undefined })

    expect(screen.getByText('Linear')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '配置' }))

    const providerRow = screen.getByText('Provider').parentElement
    expect(providerRow?.textContent).toBe('Provider—')
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
