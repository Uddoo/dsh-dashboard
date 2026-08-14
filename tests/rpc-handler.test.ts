import { describe, expect, it, vi } from 'vitest'
import { fixtureSnapshot } from '../src/client/fixture.ts'
import { handleDashboardRpc } from '../src/rpc/handler.ts'
import { DashboardDomainError, decodeDashboardError } from '../src/runtime/errors.ts'
import type { DashboardRuntimeCoordinator } from '../src/runtime/coordinator.ts'

describe('Dashboard RPC project switching', () => {
  it('switches to the global composite selection', async () => {
    const switchGlobal = vi.fn(async () => undefined)
    const runtime = {
      switchGlobal,
      snapshot: vi.fn(async () => fixtureSnapshot),
    } as unknown as DashboardRuntimeCoordinator

    const result = await handleDashboardRpc(runtime, 'switchGlobal', {}, new AbortController().signal)

    expect(switchGlobal).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, value: fixtureSnapshot })
  })

  it('dispatches a non-empty project id and returns the post-switch snapshot', async () => {
    const switchProject = vi.fn(async () => undefined)
    const runtime = {
      switchProject,
      snapshot: vi.fn(async () => fixtureSnapshot),
    } as unknown as DashboardRuntimeCoordinator

    const result = await handleDashboardRpc(
      runtime,
      'switchProject',
      { projectId: 'project-2' },
      new AbortController().signal,
    )

    expect(switchProject).toHaveBeenCalledWith('project-2')
    expect(result).toEqual({ ok: true, value: fixtureSnapshot })
  })

  it('preserves structured validation errors and rejects empty project ids before dispatch', async () => {
    const switchProject = vi.fn(async () => {
      throw new DashboardDomainError(
        'project.workflowInvalid',
        'cannot switch to Invalid: invalid workflow',
        { project: 'Invalid', reason: 'invalid workflow' },
      )
    })
    const runtime = { switchProject } as unknown as DashboardRuntimeCoordinator

    const invalid = await handleDashboardRpc(
      runtime,
      'switchProject',
      { projectId: 'invalid-project' },
      new AbortController().signal,
    )
    expect(invalid.ok).toBe(false)
    if (invalid.ok) throw new Error('expected failure')
    expect(invalid.error.code).toBe('bad-request')
    expect(decodeDashboardError(invalid.error.message)).toMatchObject({
      dashboardCode: 'project.workflowInvalid',
      params: { project: 'Invalid', reason: 'invalid workflow' },
    })

    switchProject.mockClear()
    const missing = await handleDashboardRpc(
      runtime,
      'switchProject',
      { projectId: '  ' },
      new AbortController().signal,
    )
    expect(missing).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    expect(switchProject).not.toHaveBeenCalled()
  })
})
