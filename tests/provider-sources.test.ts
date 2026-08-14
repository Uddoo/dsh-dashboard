import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it, vi } from 'vitest'
import { AsanaTaskSource } from '../src/asana/source.ts'
import { GitHubTaskSource } from '../src/github/source.ts'
import { GitLabTaskSource } from '../src/gitlab/source.ts'
import { JiraTaskSource } from '../src/jira/source.ts'

describe('built-in REST task sources', () => {
  it('normalizes GitHub Issues, excludes pull requests, and maps configured state labels', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('/repos/openai/example/issues?')
      expect(init?.headers).toMatchObject({ authorization: 'Bearer github-fixture' })
      return jsonResponse([
        {
          number: 12, title: 'Wire provider', body: 'Implement it', state: 'open', html_url: 'https://github.com/openai/example/issues/12',
          labels: [{ name: 'status:progress' }, { name: 'priority:high' }], assignees: [{ login: 'octocat' }],
          created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
        },
        { number: 13, title: 'A pull request', state: 'open', pull_request: { url: 'x' }, labels: [] },
      ])
    })
    const source = new GitHubTaskSource(credentials({ GITHUB_TOKEN: 'github-fixture' }), {
      endpoint: 'https://api.github.com', tokenRef: 'GITHUB_TOKEN',
    }, () => ({
      owner: 'openai', repo: 'example', contextLabel: 'ENG', states: ['Backlog', 'Todo', 'In Progress', 'Done'],
      activeStates: ['Todo', 'In Progress'], terminalStates: ['Done'], stateLabels: { 'In Progress': 'status:progress' },
    }), fetchImpl)

    expect(await source.listBoardIssues()).toMatchObject([{
      sourceKind: 'github', scopeRef: 'openai/example', nativeRef: '12', identifier: '#12', priority: 2, state: { name: 'In Progress' }, labels: ['status:progress', 'priority:high'],
    }])
    const tool = source.agentTool()
    expect(tool.kind).toBe('rest')
    if (tool.kind !== 'rest') throw new Error('Expected GitHub REST tool')
    await expect(tool.execute({ method: 'GET', path: '/repos/another/repo/issues' })).rejects.toThrow('configured repository')
    await expect(tool.execute({ method: 'GET', path: '/repos/openai/example/issues/%2e%2e/%2e%2e/user' })).rejects.toThrow('dot segments')
  })

  it('normalizes GitLab project issues and preserves self-hosted project scoping', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('/api/v4/projects/group%2Frepo/issues?')
      expect(init?.headers).toMatchObject({ 'private-token': 'gitlab-fixture' })
      return jsonResponse([{
        iid: 7, title: 'Ship adapter', description: 'Ready', state: 'opened', web_url: 'https://gitlab.example/group/repo/-/issues/7',
        labels: ['Todo', 'P1'], assignees: [{ username: 'agent' }], created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
      }])
    })
    const source = new GitLabTaskSource(credentials({ GITLAB_TOKEN: 'gitlab-fixture' }), {
      endpoint: 'https://gitlab.example/api/v4', tokenRef: 'GITLAB_TOKEN',
    }, () => ({
      projectId: 'group/repo', states: ['Todo', 'Done'], activeStates: ['Todo'], terminalStates: ['Done'], stateLabels: {},
    }), fetchImpl)

    expect(await source.listBoardIssues()).toMatchObject([{
      sourceKind: 'gitlab', scopeRef: 'group/repo', nativeRef: '7', identifier: '#7', priority: 2, state: { name: 'Todo' }, assigneeId: 'agent',
    }])
  })

  it('uses Asana project memberships and sections as native board states', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('/api/1.0/projects/1200/tasks?')
      expect(init?.headers).toMatchObject({ authorization: 'Bearer asana-fixture' })
      return jsonResponse({
        data: [{
          gid: '998877', name: 'Test Asana', notes: 'Use section', completed: false,
          memberships: [{ project: { gid: '1200' }, section: { gid: '55', name: 'Human Review' } }],
          tags: [{ name: 'Medium' }], assignee: { gid: '42' }, permalink_url: 'https://app.asana.com/0/1200/998877',
          created_at: '2026-08-01T00:00:00Z', modified_at: '2026-08-14T00:00:00Z',
        }],
        next_page: null,
      })
    })
    const source = new AsanaTaskSource(credentials({ ASANA_ACCESS_TOKEN: 'asana-fixture' }), {
      endpoint: 'https://app.asana.com/api/1.0', tokenRef: 'ASANA_ACCESS_TOKEN',
    }, () => ({
      projectGid: '1200', states: ['Todo', 'Human Review', 'Done'], activeStates: ['Todo', 'Human Review'], terminalStates: ['Done'],
    }), fetchImpl)

    expect(await source.listBoardIssues()).toMatchObject([{
      sourceKind: 'asana', scopeRef: '1200', nativeRef: '998877', state: { name: 'Human Review' }, priority: 3, assigneeId: '42',
    }])
    const tool = source.agentTool()
    expect(tool.kind).toBe('rest')
    if (tool.kind !== 'rest') throw new Error('Expected Asana REST tool')
    await expect(tool.execute({ method: 'PUT', path: '/projects/1200/tasks', body: { data: {} } })).rejects.toThrow('read-only')
  })

  it('limits the Asana Agent tool to explicit project reads, task updates, and verified section moves', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/1.0/projects/1200/sections') {
        return jsonResponse({ data: [{ gid: '55', name: 'In Progress' }], next_page: null })
      }
      if (url.pathname === '/api/1.0/tasks/998877' && init?.method === 'GET') {
        return jsonResponse({ data: { gid: '998877', memberships: [{ project: { gid: '1200' } }] } })
      }
      if (url.pathname === '/api/1.0/tasks/998877' && init?.method === 'PUT') {
        return jsonResponse({ data: { gid: '998877', name: 'Updated' } })
      }
      throw new Error(`Unexpected Asana request ${init?.method} ${url.pathname}`)
    })
    const source = new AsanaTaskSource(credentials({ ASANA_ACCESS_TOKEN: 'asana-fixture' }), {
      endpoint: 'https://app.asana.com/api/1.0', tokenRef: 'ASANA_ACCESS_TOKEN',
    }, () => ({
      projectGid: '1200', states: ['Todo', 'In Progress', 'Done'], activeStates: ['Todo', 'In Progress'], terminalStates: ['Done'],
    }), fetchImpl)
    const tool = source.agentTool()
    if (tool.kind !== 'rest') throw new Error('Expected Asana REST tool')

    await expect(tool.execute({ method: 'GET', path: '/projects/1200/sections' })).resolves.toMatchObject({ data: [{ gid: '55' }] })
    await expect(tool.execute({ method: 'PUT', path: '/tasks/998877', body: { data: { notes: 'Workpad' } } })).resolves.toMatchObject({ data: { gid: '998877' } })
    await expect(tool.execute({ method: 'POST', path: '/tasks/998877/addProject', body: { data: { project: '9999' } } })).rejects.toThrow('allowlist')
    await expect(tool.execute({ method: 'POST', path: '/projects/1200/sections' })).rejects.toThrow('read-only')
  })

  it('uses Jira enhanced JQL search, native statuses, ADF descriptions, and Host-side basic auth', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.atlassian.net/rest/api/3/search/jql')
      expect(init?.headers).toMatchObject({ authorization: `Basic ${Buffer.from('user@example.com:jira-fixture').toString('base64')}` })
      const body = JSON.parse(String(init?.body)) as { jql: string }
      expect(body.jql).toContain('project = "ENG"')
      return jsonResponse({
        issues: [{
          key: 'ENG-42',
          fields: {
            summary: 'Jira task', description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ADF body' }] }] },
            status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, labels: ['agent'],
            priority: { name: 'Highest' }, assignee: { accountId: 'acct-1' },
            created: '2026-08-01T00:00:00Z', updated: '2026-08-14T00:00:00Z', issuelinks: [],
          },
        }],
        isLast: true,
      })
    })
    const source = new JiraTaskSource(credentials({ JIRA_EMAIL: 'user@example.com', JIRA_API_TOKEN: 'jira-fixture' }), {
      emailRef: 'JIRA_EMAIL', apiTokenRef: 'JIRA_API_TOKEN',
    }, () => ({
      siteUrl: 'https://example.atlassian.net', projectKey: 'ENG', states: ['Todo', 'In Progress', 'Done'],
      activeStates: ['Todo', 'In Progress'], terminalStates: ['Done'],
    }), fetchImpl)

    expect(await source.listBoardIssues()).toMatchObject([{
      sourceKind: 'jira', scopeRef: 'ENG', nativeRef: 'ENG-42', identifier: 'ENG-42', description: 'ADF body', priority: 1, state: { name: 'In Progress' },
    }])
  })
})

function credentials(values: Readonly<Record<string, string>>): CredentialProvider {
  return {
    resolve: vi.fn(async ref => values[String(ref)] === undefined ? undefined : { value: values[String(ref)]!, source: 'test' }),
    describe: vi.fn(async ref => ({ configured: values[String(ref)] !== undefined, source: 'test', writable: false })),
  } as unknown as CredentialProvider
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
