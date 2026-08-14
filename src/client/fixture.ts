/** Deterministic local fixture used only by browser visual QA. */

import type { TaskIssue } from '../domain/issue.ts'
import type { DashboardSnapshot, IssueRuntimeView, TokenTotals } from '../runtime/types.ts'

const clock = '2026-08-14T02:30:00.000Z'

function issue(
  id: string,
  title: string,
  state: string,
  nativeRef: string,
  options: { readonly priority?: number; readonly labels?: readonly string[]; readonly dispatchable?: boolean } = {},
): TaskIssue {
  return {
    sourceKind: 'linear',
    scopeRef: 'ENG',
    nativeRef,
    identifier: id,
    title,
    state: { name: state },
    labels: options.labels ?? ['agent'],
    blockedBy: options.dispatchable === false ? [{ identifier: 'ENG-212', state: 'In Progress' }] : [],
    dispatchable: options.dispatchable ?? true,
    updatedAt: '2026-08-14T02:24:00.000Z',
    priority: options.priority ?? 3,
    branchName: `eng-${id.slice(4)}-${title.toLocaleLowerCase('en-US').replaceAll(/[^a-z0-9]+/g, '-').replace(/-$/u, '')}`,
    url: `https://linear.app/example/issue/${id}`,
  }
}

const issues = {
  eng241: issue('ENG-241', 'Harden workspace cleanup boundaries', 'Backlog', 'issue-241', { priority: 2, dispatchable: false }),
  eng240: issue('ENG-240', 'Document provider adapter contract', 'Backlog', 'issue-240'),
  eng239: issue('ENG-239', 'Add last-good workflow reload', 'Backlog', 'issue-239'),
  eng235: issue('ENG-235', 'Expose credential health in config', 'Backlog', 'issue-235', { priority: 4 }),
  eng236: issue('ENG-236', 'Handle rate-limit retry metadata', 'Todo', 'issue-236', { priority: 2 }),
  eng234: issue('ENG-234', 'Improve empty board guidance', 'Todo', 'issue-234'),
  eng238: issue('ENG-238', 'Implement issue detail inspector', 'In Progress', 'issue-238', { priority: 2 }),
  eng233: issue('ENG-233', 'Wire Harness session navigation', 'In Progress', 'issue-233'),
  eng231: issue('ENG-231', 'Add runtime token projection', 'In Progress', 'issue-231'),
  eng229: issue('ENG-229', 'Review Linear blocker semantics', 'Human Review', 'issue-229', { priority: 1 }),
  eng227: issue('ENG-227', 'Fix polling jitter regression', 'Rework', 'issue-227', { priority: 2 }),
  eng224: issue('ENG-224', 'Merge dashboard shell overlay', 'Merging', 'issue-224'),
  eng219: issue('ENG-219', 'Normalize provider state colors', 'Done', 'issue-219'),
  eng216: issue('ENG-216', 'Retire legacy tracker prototype', 'Canceled', 'issue-216'),
} as const

const totals = (input: number, output: number, cacheRead: number, cacheWrite: number, reasoning: number): TokenTotals => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  reasoning,
  total: input + output + cacheRead + cacheWrite,
})

const running: readonly IssueRuntimeView[] = [
  {
    key: 'linear:ENG:issue-238', identifier: 'ENG-238', phase: 'running', state: 'In Progress',
    sessionId: 'dsh-dashboard-a9e7f13c', turnCount: 4, startedAt: '2026-08-14T02:11:00.000Z',
    updatedAt: clock, workerHost: 'DESKTOP-ENG-01', workspacePath: 'F:\\Workspaces\\dsh-dashboard\\ENG-238',
    lastEvent: 'tool/result', lastEventAt: '2026-08-14T02:29:31.000Z',
    lastMessage: 'Inspector data flow is connected. I am validating the session handoff and keyboard exit path now.',
    tokens: totals(118_420, 21_180, 366_700, 14_100, 6_820),
    recentEvents: [
      { type: 'tool/result', title: 'Tool completed', detail: 'TypeScript check passed', at: '2026-08-14T02:29:31.000Z' },
      { type: 'assistant/message', title: 'Assistant update', detail: 'Validating session handoff', at: '2026-08-14T02:28:48.000Z' },
      { type: 'tool/call', title: 'Tool started', detail: 'Read client session contract', at: '2026-08-14T02:27:52.000Z' },
      { type: 'turn/start', title: 'Turn started', detail: 'Turn 4 started', at: '2026-08-14T02:26:10.000Z' },
    ],
  },
  {
    key: 'linear:ENG:issue-233', identifier: 'ENG-233', phase: 'running', state: 'In Progress',
    sessionId: 'dsh-dashboard-f03f933a', turnCount: 2, startedAt: '2026-08-14T02:20:00.000Z',
    updatedAt: clock, workerHost: 'DESKTOP-ENG-01', workspacePath: 'F:\\Workspaces\\dsh-dashboard\\ENG-233',
    lastEvent: 'assistant/message', lastEventAt: '2026-08-14T02:29:05.000Z',
    lastMessage: 'Session navigation is registered through the browser runtime contract.',
    tokens: totals(74_600, 13_800, 206_400, 8_200, 4_100), recentEvents: [],
  },
  {
    key: 'linear:ENG:issue-231', identifier: 'ENG-231', phase: 'running', state: 'In Progress',
    sessionId: 'dsh-dashboard-7bf2a908', turnCount: 3, startedAt: '2026-08-14T02:17:00.000Z',
    updatedAt: clock, workerHost: 'DESKTOP-ENG-01', workspacePath: 'F:\\Workspaces\\dsh-dashboard\\ENG-231',
    lastEvent: 'tool/call', lastEventAt: '2026-08-14T02:28:14.000Z',
    lastMessage: 'Checking retry totals against the archived runtime baseline.',
    tokens: totals(91_300, 17_400, 250_300, 10_700, 5_900), recentEvents: [],
  },
  {
    key: 'linear:ENG:issue-236', identifier: 'ENG-236', phase: 'retrying', state: 'Todo', turnCount: 1,
    startedAt: '2026-08-14T02:25:00.000Z', updatedAt: clock, workerHost: 'DESKTOP-ENG-01',
    workspacePath: 'F:\\Workspaces\\dsh-dashboard\\ENG-236', tokens: totals(24_200, 6_300, 53_800, 2_900, 1_800),
    retry: { attempt: 2, dueAt: '2026-08-14T02:30:28.000Z', error: 'Linear rate limit; retry scheduled' }, recentEvents: [],
  },
  {
    key: 'linear:ENG:issue-241', identifier: 'ENG-241', phase: 'blocked', state: 'Backlog', turnCount: 0,
    updatedAt: clock, workerHost: 'DESKTOP-ENG-01', tokens: totals(0, 0, 0, 0, 0),
    blocked: { reason: 'Blocked by ENG-212 (In Progress)' }, recentEvents: [],
  },
]

export const fixtureSnapshot: DashboardSnapshot = {
  version: 2,
  generatedAt: clock,
  context: { kind: 'linear', providerLabel: 'Linear', projectLabel: 'ENG', projectRef: 'engineering' },
  taskMutations: { canCreate: false, canUpdate: false, canDelete: false, states: [] },
  paused: false,
  board: {
    columns: [
      { name: 'Backlog', type: 'backlog', color: '#8a9ab4', position: 0, hidden: false, issues: [issues.eng241, issues.eng240, issues.eng239, issues.eng235] },
      { name: 'Todo', type: 'unstarted', color: '#8a9ab4', position: 1, hidden: false, issues: [issues.eng236, issues.eng234] },
      { name: 'In Progress', type: 'started', color: '#f3bd19', position: 2, hidden: false, issues: [issues.eng238, issues.eng233, issues.eng231] },
      { name: 'Human Review', type: 'started', color: '#f04452', position: 3, hidden: false, issues: [issues.eng229] },
      { name: 'Rework', type: 'started', color: '#e99b2f', position: 4, hidden: true, issues: [issues.eng227] },
      { name: 'Merging', type: 'started', color: '#35b88a', position: 5, hidden: true, issues: [issues.eng224] },
      { name: 'Done', type: 'completed', color: '#5867c6', position: 6, hidden: true, issues: [issues.eng219] },
      { name: 'Canceled', type: 'canceled', color: '#929eb1', position: 7, hidden: true, issues: [issues.eng216] },
    ],
    total: 14,
  },
  runtime: {
    running: 3,
    retrying: 1,
    blocked: 1,
    capacity: 6,
    tokens: totals(308_520, 65_080, 870_500, 35_900, 18_620),
    lastRefreshAt: clock,
    nextRefreshAt: '2026-08-14T02:30:05.000Z',
    issues: running,
  },
  configuration: {
    workflowPath: 'F:\\Projects\\example\\WORKFLOW.md',
    workflowLoadedAt: '2026-08-14T02:29:55.000Z',
    trackerKind: 'linear', projectName: 'dsh-dashboard', projectRef: 'engineering', activeStates: ['Todo', 'In Progress', 'Human Review'],
    terminalStates: ['Done', 'Canceled', 'Duplicate'], workspaceRoot: 'F:\\Workspaces\\dsh-dashboard',
    maxConcurrentAgents: 6, maxTurns: 20, pollingIntervalMs: 5000,
    agentProfile: 'default', permissionPreset: 'workspace-write', agentPreset: 'default', credentialRef: 'linear/default',
    credentialConfigured: true, credentialSource: 'credential-store', credentialWritable: false,
    credentials: [{ ref: 'linear/default', label: 'API key', configured: true, source: 'credential-store', writable: false }],
  },
  catalog: {
    globalBrokerEnabled: false,
    projects: [
      {
        id: '08b8e62d-5a7c-4a3a-a582-b63278347db0', name: 'dsh-dashboard', root: 'F:\\Dev\\Code\\05_Apps_Tools\\deepseek\\dsh-dashboard',
        policyPath: 'F:\\Dev\\Code\\05_Apps_Tools\\deepseek\\dsh-dashboard\\WORKFLOW.md', repositoryIds: ['3731aa25-c8f5-4c50-b056-b662bf0a8717'],
        workspaceStrategy: 'worktree', autonomousClaims: false, source: 'current-workspace', createdAt: clock, updatedAt: clock, currentWorkspace: true,
        repositories: [{ id: '3731aa25-c8f5-4c50-b056-b662bf0a8717', kind: 'git', root: 'F:\\Dev\\Code\\05_Apps_Tools\\deepseek\\dsh-dashboard', remoteUrl: 'https://github.com/Uddoo/dsh-dashboard.git', branch: 'main', createdAt: clock, updatedAt: clock }],
      },
      {
        id: '4bceae56-7cc1-4419-a912-a6ea110448fb', name: 'dsh-dashboard-test', root: 'F:\\Dev\\Code\\05_Apps_Tools\\deepseek\\dsh-dashboard-test',
        policyPath: 'F:\\Dev\\Code\\05_Apps_Tools\\deepseek\\dsh-dashboard-test\\WORKFLOW.md', repositoryIds: [], workspaceStrategy: 'controlled-directory', autonomousClaims: false,
        source: 'manual', createdAt: clock, updatedAt: clock, currentWorkspace: false, repositories: [],
      },
    ],
    discoveryRoots: [{ id: 'cbf5928c-bc76-43e2-944a-d41e96044fd9', path: 'F:\\Dev\\Code\\05_Apps_Tools', maxDepth: 4, confirmationRequired: true, createdAt: clock, updatedAt: clock }],
  },
}
