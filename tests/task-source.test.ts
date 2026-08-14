import { describe, expect, it, vi } from 'vitest'
import type { TaskSource } from '../src/task-source/index.ts'
import { resolveTaskSourceAgentTool } from '../src/task-source/index.ts'

describe('TaskSource Agent tool compatibility', () => {
  it('adapts a legacy executeRaw-only provider to the GraphQL Agent tool contract', async () => {
    const executeRaw = vi.fn(async () => ({ data: { ok: true } }))
    const source = {
      kind: 'legacy-linear',
      context: () => ({ kind: 'legacy-linear', providerLabel: 'Legacy', projectLabel: 'ENG', projectRef: 'ENG' }),
      listBoardIssues: async () => [],
      listIssuesByStates: async () => [],
      getIssuesByNativeRefs: async () => [],
      executeRaw,
    } satisfies TaskSource

    const tool = resolveTaskSourceAgentTool(source)
    expect(tool).toMatchObject({ kind: 'graphql', name: 'legacy_linear_graphql' })
    if (tool?.kind !== 'graphql') throw new Error('Expected legacy GraphQL adapter')
    await expect(tool.execute('query Viewer { viewer { id } }', { limit: 1 })).resolves.toEqual({ data: { ok: true } })
    expect(executeRaw).toHaveBeenCalledWith('query Viewer { viewer { id } }', { limit: 1 }, undefined)
  })
})
