import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseWorkflow, type WorkflowParseOptions } from '../src/workflow/parser.ts'

const options: WorkflowParseOptions = {
  defaults: {
    pollingIntervalMs: 5000,
    workspaceRoot: '.dsh-dashboard/workspaces',
    hookTimeoutMs: 60_000,
    maxConcurrentAgents: 10,
    maxTurns: 20,
    maxRetryBackoffMs: 300_000,
  },
  agentProfile: {
    id: 'default',
    permissionPreset: 'workspace-write',
    workerHost: 'test-host',
  },
}

function workflow(overrides = '', prompt = 'Work on {{ issue.identifier }} until it leaves the active state.'): string {
  return `---
version: 1
project:
  name: Engineering
  agent_profile: default
tracker:
  kind: linear
  provider:
    project_slug: engineering
  active_states: [Todo, In Progress]
  terminal_states: [Done]
${overrides}---
${prompt}
`
}

describe('parseWorkflow', () => {
  it('resolves global defaults, project policy overrides, and the selected Agent Profile', () => {
    const result = parseWorkflow(workflow(`policy:
  polling:
    interval_ms: 8000
  workspace:
    root: .workspaces
  agent:
    max_turns: 12
`), 'C:\\repo\\WORKFLOW.md', options, new Date('2026-08-14T00:00:00Z'))

    expect(result.version).toBe(1)
    expect(result.project).toEqual({ name: 'Engineering', agent_profile: 'default' })
    expect(result.tracker.kind).toBe('linear')
    expect(result.tracker.active_states).toEqual(['Todo', 'In Progress'])
    expect(result.agent).toMatchObject({ max_concurrent_agents: 10, max_turns: 12 })
    expect(result.polling.interval_ms).toBe(8000)
    expect(result.workspace.root).toBe('.workspaces')
    expect(result.hooks.timeout_ms).toBe(60_000)
    expect(result.prompt).toContain('{{ issue.identifier }}')
    expect(result.loadedAt).toBe('2026-08-14T00:00:00.000Z')
  })

  it('rejects malformed boundaries and an empty prompt', () => {
    expect(() => parseWorkflow('tracker: {}', 'WORKFLOW.md', options)).toThrow('must start')
    expect(() => parseWorkflow(workflow('', '   '), 'WORKFLOW.md', options)).toThrow('prompt body must not be empty')
  })

  it.each([
    ['github', 'owner: openai\n    repo: example'],
    ['jira', 'site_url: https://example.atlassian.net\n    project_key: ENG'],
    ['asana', 'project_gid: "1200"'],
    ['gitlab', 'project_id: group/repo'],
    ['local', 'context_label: Personal'],
  ])('validates the built-in %s provider routing shape', (kind, provider) => {
    const result = parseWorkflow(`---
version: 1
project:
  name: Provider test
  agent_profile: default
tracker:
  kind: ${kind}
  provider:
    ${provider}
  active_states: [Todo]
  terminal_states: [Done]
---
Work on the task.
`, 'WORKFLOW.md', options)

    expect(result.tracker.kind).toBe(kind)
    if (kind === 'local') expect(result.tracker.provider.project_id).toBe('local')
  })

  it('fails early when a built-in provider is missing its routing identity', () => {
    expect(() => parseWorkflow(`---
version: 1
project:
  name: GitHub test
  agent_profile: default
tracker:
  kind: github
  provider:
    owner: openai
  active_states: [Todo]
  terminal_states: [Done]
---
Work on the task.
`, 'WORKFLOW.md', options)).toThrow('tracker.provider.repo')
  })

  it('accepts a positive numeric GitLab project id and normalizes it for API routing', () => {
    const result = parseWorkflow(`---
version: 1
project:
  name: GitLab test
  agent_profile: default
tracker:
  kind: gitlab
  provider:
    project_id: 12345
  active_states: [Todo]
  terminal_states: [Done]
---
Work on the task.
`, 'WORKFLOW.md', options)

    expect(result.tracker.provider.project_id).toBe('12345')
  })

  it('rejects the former single-workflow schema instead of silently applying a partial migration', () => {
    expect(() => parseWorkflow(`---
tracker:
  kind: linear
  provider:
    project_slug: engineering
workspace:
  root: .workspaces
---
Work on the task.
`, 'WORKFLOW.md', options)).toThrow('WORKFLOW.md configuration is invalid')
  })

  it('rejects a project that selects an Agent Profile which is not configured', () => {
    expect(() => parseWorkflow(workflow().replace('agent_profile: default', 'agent_profile: unattended'), 'WORKFLOW.md', options))
      .toThrow('project.agent_profile "unattended" is not configured')
  })

  it.each([
    ['linear', 'WORKFLOW.example.md'],
    ['github', 'examples/WORKFLOW.github.md'],
    ['jira', 'examples/WORKFLOW.jira.md'],
    ['asana', 'examples/WORKFLOW.asana.md'],
    ['gitlab', 'examples/WORKFLOW.gitlab.md'],
    ['local', 'examples/WORKFLOW.local.md'],
  ])('keeps the published %s example valid under the breaking v1 schema', async (kind, path) => {
    const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
    expect(parseWorkflow(text, path, options).tracker.kind).toBe(kind)
  })
})
