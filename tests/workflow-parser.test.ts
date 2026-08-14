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
})
