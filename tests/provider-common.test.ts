import { describe, expect, it } from 'vitest'
import { apiUrl } from '../src/providers/common.ts'

describe('provider API URL safety', () => {
  it('preserves endpoint path prefixes and encoded provider identifiers', () => {
    expect(String(apiUrl('https://gitlab.example/api/v4', '/projects/group%2Frepo/issues', { page: 2 })))
      .toBe('https://gitlab.example/api/v4/projects/group%2Frepo/issues?page=2')
  })

  it.each([
    '/repos/openai/example/issues/../../../../user',
    '/repos/openai/example/issues/%2e%2e/%2e%2e/user',
    '/repos/openai/example/issues/%252e%252e/user',
    '/repos/openai/example/issues\\..\\user',
    '/repos/openai/example/issues/%5c..%5cuser',
  ])('rejects path normalization escape %s', (path) => {
    expect(() => apiUrl('https://api.github.com', path)).toThrow(/dot segments|backslash/u)
  })
})
