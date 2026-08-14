import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertContained, resolveWorkspaceRoot, workspaceLeaf } from '../src/workspace/path-safety.ts'

describe('workspace path safety', () => {
  it('keeps already-safe identifiers unchanged', () => {
    expect(workspaceLeaf('ENG-238')).toBe('ENG-238')
  })

  it('adds a deterministic hash whenever sanitization changes an identifier', () => {
    const identifier = 'team/ENG 238'
    const digest = createHash('sha256').update(identifier, 'utf8').digest('hex').slice(0, 16)
    expect(workspaceLeaf(identifier)).toBe(`team-ENG-238-${digest}`)
  })

  it('accepts only strict descendants of the configured workspace root', () => {
    const root = resolve('C:\\workspaces')
    expect(() => assertContained(root, resolve(root, 'ENG-238'))).not.toThrow()
    expect(() => assertContained(root, root)).toThrow('escapes')
    expect(() => assertContained(root, resolve(root, '..', 'outside'))).toThrow('escapes')
  })

  it('resolves relative roots against the supplied process directory', () => {
    expect(resolveWorkspaceRoot('.dashboard', 'C:\\repo')).toBe(resolve('C:\\repo', '.dashboard'))
  })
})
