import { describe, expect, it } from 'vitest'
import { fixtureSnapshot, globalFixtureSnapshot } from '../src/client/fixture.ts'
import { issueKey } from '../src/domain/issue.ts'
import { aggregateProjectSnapshots } from '../src/runtime/global.ts'

describe('global Dashboard projection', () => {
  it('combines Local and Linear tasks while preserving their project provenance and raw state', () => {
    expect(globalFixtureSnapshot.selection).toEqual({ mode: 'global', projectCount: 2, readyProjectCount: 2 })
    expect(globalFixtureSnapshot.board.total).toBe(17)
    expect(globalFixtureSnapshot.taskMutations).toEqual({ canCreate: false, canUpdate: false, canDelete: false, states: [] })

    const issues = globalFixtureSnapshot.board.columns.flatMap(column => column.issues)
    expect(new Set(issues.map(issue => issue.origin?.providerKind))).toEqual(new Set(['linear', 'local']))
    expect(new Set(issues.map(issue => issue.origin?.projectName))).toEqual(new Set(['dsh-dashboard', 'dsh-dashboard-test']))

    const local = issues.find(issue => issue.identifier === 'LOCAL-18')
    expect(local).toMatchObject({ state: { name: 'In Progress' }, origin: { providerKind: 'local', projectName: 'dsh-dashboard-test' } })
    expect(globalFixtureSnapshot.board.columns.find(column => column.name === 'In Progress')?.issues).toContain(local)

    const linear = issues.find(issue => issue.identifier === 'ENG-229')
    expect(linear).toMatchObject({ state: { name: 'Human Review' }, origin: { providerKind: 'linear', projectName: 'dsh-dashboard' } })
    expect(globalFixtureSnapshot.board.columns.find(column => column.name === 'Human Review')?.issues).toContain(linear)
  })

  it('qualifies otherwise identical provider keys by owning project', () => {
    const first = globalFixtureSnapshot.board.columns.flatMap(column => column.issues)[0]!
    const second = {
      ...first,
      origin: { ...first.origin!, projectId: 'another-project', projectName: 'Another project' },
    }

    expect(issueKey(first)).not.toBe(issueKey(second))
    expect(issueKey(first)).toContain(encodeURIComponent(first.origin!.projectId))
  })

  it('aggregates runtime counts, capacity, tokens, and project-qualified runtime keys', () => {
    expect(globalFixtureSnapshot.runtime).toMatchObject({ running: 3, retrying: 1, blocked: 1, capacity: 9 })
    expect(globalFixtureSnapshot.runtime.tokens.total).toBeGreaterThan(0)
    expect(globalFixtureSnapshot.runtime.issues.every(issue => issue.key.startsWith('project:'))).toBe(true)
    expect(globalFixtureSnapshot.runtime.issues.every(issue => issue.origin !== undefined)).toBe(true)
  })

  it('merges equivalent custom states and keeps the column visible when any project exposes it', () => {
    const [alpha, beta] = globalFixtureSnapshot.catalog.projects
    if (alpha === undefined || beta === undefined) throw new Error('global fixture requires two projects')
    const baseIssue = fixtureSnapshot.board.columns.flatMap(column => column.issues)[0]!
    const projectSnapshot = (name: string, hidden: boolean, nativeRef: string) => ({
      ...fixtureSnapshot,
      board: {
        total: 1,
        columns: [{
          name,
          position: 0,
          hidden,
          issues: [{ ...baseIssue, nativeRef, identifier: nativeRef, state: { name } }],
        }],
      },
    })

    const snapshot = aggregateProjectSnapshots([
      { project: alpha, snapshot: projectSnapshot('QA', true, 'ALPHA-1') },
      { project: beta, snapshot: projectSnapshot('qa', false, 'BETA-1') },
    ], { ...globalFixtureSnapshot.catalog, projects: [alpha, beta] })
    const columns = snapshot.board.columns.filter(column => column.name.toLocaleLowerCase('en-US') === 'qa')

    expect(columns).toHaveLength(1)
    expect(columns[0]).toMatchObject({ hidden: false })
    expect(columns[0]?.issues).toHaveLength(2)
  })
})
