import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it, vi } from 'vitest'
import { LinearTaskSource } from '../src/linear/source.ts'

describe('LinearTaskSource', () => {
  it('resolves credentials for every operation, scopes by project slug, and decodes blockers', async () => {
    const resolveCredential = vi.fn(async () => ({ value: 'lin_api_fixture', source: 'test' }))
    const credentials = {
      resolve: resolveCredential,
      describe: vi.fn(async () => ({ configured: true, source: 'test', writable: false })),
    } as unknown as CredentialProvider
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> }
      if (payload.query.includes('DashboardLinearBoard')) expect(payload.variables.projectSlug).toBe('engineering')
      expect(init?.headers).toMatchObject({ authorization: 'lin_api_fixture' })
      return new Response(JSON.stringify({
        data: {
          issues: {
            nodes: [{
              id: 'native-1', identifier: 'ENG-1', title: 'Blocked work', priority: 2,
              state: { name: 'Todo', type: 'unstarted', color: '#999', position: 1 },
              labels: { nodes: [{ name: 'Agent' }, { name: 'agent' }] },
              inverseRelations: { nodes: [{ type: 'blocks', issue: { id: 'native-0', identifier: 'ENG-0', state: { name: 'In Progress' } } }] },
              createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const source = new LinearTaskSource(
      credentials,
      { endpoint: 'https://api.linear.app/graphql', apiKeyRef: 'LINEAR_API_KEY' },
      () => ({ projectSlug: 'engineering', contextLabel: 'ENG', terminalStates: ['Done'] }),
      fetchImpl,
    )

    const [task] = await source.listBoardIssues()
    expect(source.context()).toMatchObject({ providerLabel: 'Linear', projectLabel: 'ENG' })
    expect(task).toMatchObject({ identifier: 'ENG-1', labels: ['agent'], dispatchable: false })
    expect(task?.blockedBy).toEqual([{ nativeRef: 'native-0', identifier: 'ENG-0', state: 'In Progress' }])
    expect(resolveCredential).toHaveBeenCalledTimes(1)

    await source.executeRaw('query Health { viewer { id } }', {})
    expect(resolveCredential).toHaveBeenCalledTimes(2)
  })

  it('rejects plaintext non-loopback endpoints', () => {
    expect(() => new LinearTaskSource(
      {} as CredentialProvider,
      { endpoint: 'http://api.linear.app/graphql', apiKeyRef: 'LINEAR_API_KEY' },
      () => ({ projectSlug: 'engineering', terminalStates: ['Done'] }),
    )).toThrow('must use HTTPS')
  })
})
