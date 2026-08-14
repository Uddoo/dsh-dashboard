import { describe, expect, it } from 'vitest'
import { parseWorkflow } from '../src/workflow/parser.ts'

describe('parseWorkflow', () => {
  it('parses frontmatter, applies core defaults, and preserves the prompt', () => {
    const result = parseWorkflow(`---
tracker:
  provider:
    project_slug: engineering
workspace:
  root: .workspaces
---
Work on {{ issue.identifier }} until it leaves the active state.
`, 'C:\\repo\\WORKFLOW.md', new Date('2026-08-14T00:00:00Z'))

    expect(result.tracker.kind).toBe('linear')
    expect(result.tracker.active_states).toEqual(['Todo', 'In Progress'])
    expect(result.agent.max_concurrent_agents).toBe(10)
    expect(result.polling.interval_ms).toBe(5000)
    expect(result.prompt).toContain('{{ issue.identifier }}')
    expect(result.loadedAt).toBe('2026-08-14T00:00:00.000Z')
  })

  it('rejects malformed boundaries and an empty prompt', () => {
    expect(() => parseWorkflow('tracker: {}', 'WORKFLOW.md')).toThrow('must start')
    expect(() => parseWorkflow(`---
tracker:
  provider:
    project_slug: engineering
workspace:
  root: .workspaces
---
`, 'WORKFLOW.md')).toThrow('prompt body must not be empty')
  })

  it.each([
    ['github', 'owner: openai\n    repo: example'],
    ['jira', 'site_url: https://example.atlassian.net\n    project_key: ENG'],
    ['asana', 'project_gid: "1200"'],
    ['gitlab', 'project_id: group/repo'],
    ['local', 'context_label: Personal'],
  ])('validates the built-in %s provider routing shape', (kind, provider) => {
    const result = parseWorkflow(`---
tracker:
  kind: ${kind}
  provider:
    ${provider}
workspace:
  root: .workspaces
---
Work on the task.
`, 'WORKFLOW.md')

    expect(result.tracker.kind).toBe(kind)
    if (kind === 'local') expect(result.tracker.provider.project_id).toBe('local')
  })

  it('fails early when a built-in provider is missing its routing identity', () => {
    expect(() => parseWorkflow(`---
tracker:
  kind: github
  provider:
    owner: openai
workspace:
  root: .workspaces
---
Work on the task.
`, 'WORKFLOW.md')).toThrow('tracker.provider.repo')
  })

  it('accepts a positive numeric GitLab project id and normalizes it for API routing', () => {
    const result = parseWorkflow(`---
tracker:
  kind: gitlab
  provider:
    project_id: 12345
workspace:
  root: .workspaces
---
Work on the task.
`, 'WORKFLOW.md')

    expect(result.tracker.provider.project_id).toBe('12345')
  })
})
