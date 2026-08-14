import { describe, expect, it } from 'vitest'
import type { TaskIssue } from '../src/domain/issue.ts'
import { compareCandidates, failureRetryDelay, stateLimit } from '../src/orchestrator/scheduling.ts'

function task(identifier: string, priority?: number, createdAt?: string): TaskIssue {
  return {
    sourceKind: 'fixture', scopeRef: 'fixture-project', nativeRef: identifier, identifier, title: identifier,
    ...(priority === undefined ? {} : { priority }),
    ...(createdAt === undefined ? {} : { createdAt }),
    state: { name: 'Todo' }, labels: [], blockedBy: [], dispatchable: true,
  }
}

describe('Symphony scheduling rules', () => {
  it('sorts by non-zero priority, creation time, then identifier', () => {
    const unordered = [
      task('ENG-9', 0, '2026-01-01T00:00:00Z'),
      task('ENG-3', 2, '2026-02-01T00:00:00Z'),
      task('ENG-2', 2, '2026-01-01T00:00:00Z'),
      task('ENG-1', 1, '2026-03-01T00:00:00Z'),
    ]
    expect(unordered.sort(compareCandidates).map(issue => issue.identifier)).toEqual(['ENG-1', 'ENG-2', 'ENG-3', 'ENG-9'])
  })

  it('uses 10-second exponential failure backoff capped by configuration', () => {
    expect(failureRetryDelay(1, 300_000)).toBe(10_000)
    expect(failureRetryDelay(4, 300_000)).toBe(80_000)
    expect(failureRetryDelay(20, 300_000)).toBe(300_000)
    expect(() => failureRetryDelay(0, 300_000)).toThrow(TypeError)
  })

  it('matches per-state concurrency limits case-insensitively', () => {
    expect(stateLimit({ Merging: 1 }, ' merging ')).toBe(1)
    expect(stateLimit({ Merging: 1 }, 'Todo')).toBeUndefined()
  })
})
