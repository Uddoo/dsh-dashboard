/** Faithful code-native implementation of the approved Dashboard visual specification. */

import {
  memo,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskIssue } from '../domain/issue.ts'
import { issueKey } from '../domain/issue.ts'
import type { AddDiscoveryRootInput, DiscoveryRootRecord, ProjectScanResult, RegisterProjectInput } from '../catalog/types.ts'
import type { BoardColumn, DashboardSnapshot, IssueRuntimeView, TokenTotals } from '../runtime/types.ts'
import type { CreateTaskInput, UpdateTaskInput } from '../task-source/index.ts'
import type { DashboardDataPort } from './controller.ts'
import { DashboardUiController } from './controller.ts'
import { dashboardErrorMessage } from './errors.ts'
import { DashboardI18nProvider, useDashboardTranslation } from './i18n.tsx'
import {
  BoardIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  DisplayIcon,
  EditIcon,
  ExternalIcon,
  FilterIcon,
  FolderIcon,
  GitBranchIcon,
  MonitorIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from './icons.tsx'

export type DashboardFooterActionProps = {
  readonly wide: boolean
  readonly ui: DashboardUiController
} & PropsLocale<'dsh-dashboard'>

/** Sidebar entry; the Dashboard itself lives in the additive shell overlay. */
export function DashboardFooterAction({ wide, ui, t }: DashboardFooterActionProps) {
  const open = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot)
  const label = t('common.dashboard')
  return (
    <button
      type="button"
      className="dshd-entry"
      data-wide={wide || undefined}
      data-active={open || undefined}
      aria-pressed={open}
      aria-label={label}
      title={label}
      onClick={ui.toggle}
    >
      <BoardIcon size={18} />
      {wide ? <span>{label}</span> : null}
    </button>
  )
}

export type DashboardOverlayProps = {
  readonly ui: DashboardUiController
  readonly data: DashboardDataPort
  readonly openSession: (sessionId: string) => void
} & PropsLocale<'dsh-dashboard'>

/** Dashboard content mounted in `shell.overlay` while preserving the Harness sidebar. */
export function DashboardOverlay({ ui, data, openSession, t }: DashboardOverlayProps) {
  const open = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot)
  const state = useSyncExternalStore(data.subscribe, data.getSnapshot, data.getSnapshot)
  const sidebarInset = useHarnessSidebarInset(open)

  useEffect(() => open ? data.start() : undefined, [data, open])
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && document.querySelector('.dshd-modal') === null) ui.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, ui])

  if (!open) return null
  return (
    <div
      className="dshd-host-overlay"
      style={{ '--dshd-host-sidebar': `${sidebarInset}px` } as React.CSSProperties}
    >
      <DashboardI18nProvider t={t}>
        <DashboardSurface
          snapshot={state.snapshot}
          loading={state.loading}
          error={state.error}
          onRefresh={() => data.refresh()}
          onPause={paused => data.setPaused(paused)}
          onStop={key => data.stopIssue(key)}
          onCreateTask={input => data.createTask(input)}
          onUpdateTask={(nativeRef, changes) => data.updateTask(nativeRef, changes)}
          onDeleteTask={nativeRef => data.deleteTask(nativeRef)}
          onAddDiscoveryRoot={input => data.addDiscoveryRoot(input)}
          onRemoveDiscoveryRoot={id => data.removeDiscoveryRoot(id)}
          onScanProjects={rootId => data.scanProjects(rootId)}
          onRegisterProjectCandidate={token => data.registerProjectCandidate(token)}
          onRegisterProject={input => data.registerProject(input)}
          onOpenSession={(sessionId) => { ui.close(); openSession(sessionId) }}
        />
      </DashboardI18nProvider>
    </div>
  )
}

export interface DashboardSurfaceProps {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly loading?: boolean | undefined
  readonly error?: string | Error | undefined
  readonly initialSelectedKey?: string | undefined
  readonly onRefresh: () => Promise<void>
  readonly onPause: (paused: boolean) => Promise<void>
  readonly onStop: (key: string) => Promise<void>
  readonly onCreateTask: (input: CreateTaskInput) => Promise<void>
  readonly onUpdateTask: (nativeRef: string, changes: UpdateTaskInput) => Promise<void>
  readonly onDeleteTask: (nativeRef: string) => Promise<void>
  readonly onAddDiscoveryRoot: (input: AddDiscoveryRootInput) => Promise<void>
  readonly onRemoveDiscoveryRoot: (id: string) => Promise<void>
  readonly onScanProjects: (rootId: string) => Promise<ProjectScanResult>
  readonly onRegisterProjectCandidate: (token: string) => Promise<void>
  readonly onRegisterProject: (input: RegisterProjectInput) => Promise<void>
  readonly onOpenSession: (sessionId: string) => void
}

type Tab = 'board' | 'runtime' | 'projects' | 'configuration'
type TaskEditorState =
  | { readonly mode: 'create'; readonly state: string }
  | { readonly mode: 'edit'; readonly issue: TaskIssue }
type CatalogDialogState =
  | { readonly kind: 'add-root' }
  | { readonly kind: 'register-project' }
  | { readonly kind: 'choose-root' }
  | { readonly kind: 'scan'; readonly result: ProjectScanResult }

/** Primary view kept framework-agnostic enough for dev fixture rendering and browser QA. */
export function DashboardSurface({
  snapshot,
  loading = false,
  error,
  initialSelectedKey,
  onRefresh,
  onPause,
  onStop,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onAddDiscoveryRoot,
  onRemoveDiscoveryRoot,
  onScanProjects,
  onRegisterProjectCandidate,
  onRegisterProject,
  onOpenSession,
}: DashboardSurfaceProps) {
  const t = useDashboardTranslation()
  const [tab, setTab] = useState<Tab>('board')
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initialSelectedKey)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [showHidden, setShowHidden] = useState(true)
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<TaskIssue | undefined>()
  const [catalogDialog, setCatalogDialog] = useState<CatalogDialogState | undefined>()
  const [catalogBusy, setCatalogBusy] = useState(false)
  const deferredFilter = useDeferredValue(filter.trim().toLocaleLowerCase('en-US'))
  const issueMap = useMemo(() => {
    const map = new Map<string, TaskIssue>()
    for (const column of snapshot?.board.columns ?? []) {
      for (const issue of column.issues) map.set(issueKey(issue), issue)
    }
    return map
  }, [snapshot])
  const runtimeMap = useMemo(() => new Map((snapshot?.runtime.issues ?? []).map(item => [item.key, item])), [snapshot])
  const selectedIssue = selectedKey === undefined ? undefined : issueMap.get(selectedKey)
  const selectedRuntime = selectedKey === undefined ? undefined : runtimeMap.get(selectedKey)
  const columns = useMemo(() => (snapshot?.board.columns ?? []).map(column => ({
    ...column,
    issues: deferredFilter === ''
      ? column.issues
      : column.issues.filter(issue => `${issue.identifier} ${issue.title} ${issue.labels.join(' ')}`.toLocaleLowerCase('en-US').includes(deferredFilter)),
  })), [deferredFilter, snapshot])
  const visibleColumns = columns.filter(column => !column.hidden)
  const hiddenColumns = columns.filter(column => column.hidden)
  const context = snapshot?.context
  const startProjectScan = async (rootId: string): Promise<void> => {
    setCatalogDialog(undefined)
    setCatalogBusy(true)
    try {
      setCatalogDialog({ kind: 'scan', result: await onScanProjects(rootId) })
    } catch {
      // The shared controller projects the trusted-host error into the banner.
    } finally {
      setCatalogBusy(false)
    }
  }
  const startDiscoveryScan = (): void => {
    const roots = snapshot?.catalog.discoveryRoots ?? []
    if (roots.length === 0) {
      setCatalogDialog({ kind: 'add-root' })
    } else if (roots.length === 1) {
      void startProjectScan(roots[0]!.id)
    } else {
      setCatalogDialog({ kind: 'choose-root' })
    }
  }

  return (
    <div className="dshd-shell" role="region" aria-label={t('shell.regionAria')}>
      <section className="dshd-app">
        <header className="dshd-header">
          <div className="dshd-header-top">
            <div className="dshd-heading-cluster">
              <h1>{t('common.dashboard')}</h1>
              <button type="button" className="dshd-context" aria-label={t('shell.currentSourceAria')}>
                <span>{providerLabel(context?.kind, context?.providerLabel ?? 'Linear', t)}</span>
                <span aria-hidden>·</span>
                <span>{context?.projectLabel ?? '—'}</span>
                <ChevronIcon size={14} />
              </button>
            </div>
            <div className="dshd-toolbar">
              <div className="dshd-filter-wrap">
                <button type="button" className="dshd-plain-control" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}>
                  <FilterIcon size={17} /><span>{t('shell.filter')}</span>
                </button>
                {filterOpen ? (
                  <div className="dshd-filter-popover">
                    <input autoFocus value={filter} onChange={event => setFilter(event.currentTarget.value)} placeholder={tab === 'projects' ? t('shell.filterProjects') : t('shell.filterIssues')} aria-label={tab === 'projects' ? t('shell.filterProjects') : t('shell.filterIssues')} />
                    {filter !== '' ? <button type="button" onClick={() => setFilter('')}>{t('common.clear')}</button> : null}
                  </div>
                ) : null}
              </div>
              <button type="button" className="dshd-plain-control" data-active={!showHidden || undefined} onClick={() => setShowHidden(value => !value)}>
                <DisplayIcon size={18} /><span>{t('shell.display')}</span>
              </button>
              <button type="button" className="dshd-live-control" aria-label={tab === 'projects' ? t('shell.dashboardModeAria') : t('shell.agentCapacityAria')}>
                {tab === 'projects' ? <MonitorIcon size={17} /> : <span className="dshd-dot dshd-dot-green" />}
                <span>{tab === 'projects'
                  ? t('shell.currentWorkspace')
                  : `${snapshot?.paused ? t('shell.paused') : t('shell.live')} · ${t('shell.agents', { running: snapshot?.runtime.running ?? 0, capacity: snapshot?.runtime.capacity ?? 0 })}`}</span>
                <ChevronIcon size={14} />
              </button>
              <button
                type="button"
                className="dshd-pause-control"
                disabled={loading || snapshot === undefined}
                onClick={() => onPause(!(snapshot?.paused ?? false))}
              >
                {snapshot?.paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
                <span>{snapshot?.paused ? t('shell.resume') : t('shell.pause')}</span>
              </button>
            </div>
          </div>
          <nav className="dshd-tabs" aria-label={t('shell.viewsAria')}>
            <TabButton active={tab === 'board'} onClick={() => setTab('board')}>{t('tab.board')}</TabButton>
            <TabButton active={tab === 'runtime'} onClick={() => setTab('runtime')}>{t('tab.runtime')}</TabButton>
            <TabButton active={tab === 'projects'} onClick={() => setTab('projects')}>{t('tab.projects')}</TabButton>
            <TabButton active={tab === 'configuration'} onClick={() => setTab('configuration')}>{t('tab.configuration')}</TabButton>
          </nav>
        </header>

        {tab === 'projects' ? null : <RuntimeRail snapshot={snapshot} loading={loading} onRefresh={onRefresh} />}
        <DashboardErrorNotice error={error} className="dshd-error" />
        {snapshot?.runtime.lastError !== undefined ? <div className="dshd-warning" role="status">{snapshot.runtime.lastError}</div> : null}

        <div className="dshd-view">
          {tab === 'board' ? (
            <BoardView
              columns={visibleColumns}
              hiddenColumns={hiddenColumns}
              showHidden={showHidden && selectedIssue === undefined}
              selectedKey={selectedKey}
              runtimeMap={runtimeMap}
              onSelect={setSelectedKey}
              onCreate={snapshot?.taskMutations.canCreate === true ? state => setTaskEditor({ mode: 'create', state }) : undefined}
            />
          ) : null}
          {tab === 'runtime' ? <RuntimeView snapshot={snapshot} onSelect={(key) => { setSelectedKey(key); setTab('board') }} /> : null}
          {tab === 'projects' ? (
            <ProjectsView
              snapshot={snapshot}
              filter={deferredFilter}
              showRoots={showHidden}
              busy={loading || catalogBusy}
              onAddRoot={() => setCatalogDialog({ kind: 'add-root' })}
              onRemoveRoot={onRemoveDiscoveryRoot}
              onScanRoots={startDiscoveryScan}
              onScan={startProjectScan}
              onRegister={() => setCatalogDialog({ kind: 'register-project' })}
            />
          ) : null}
          {tab === 'configuration' ? <ConfigurationView snapshot={snapshot} /> : null}
        </div>
      </section>
      {selectedIssue !== undefined ? (
        <IssueInspector
          issue={selectedIssue}
          runtime={selectedRuntime}
          onClose={() => setSelectedKey(undefined)}
          onRefresh={onRefresh}
          onStop={onStop}
          canUpdate={snapshot?.taskMutations.canUpdate === true}
          canDelete={snapshot?.taskMutations.canDelete === true}
          onEdit={() => setTaskEditor({ mode: 'edit', issue: selectedIssue })}
          onDelete={() => setDeleteTarget(selectedIssue)}
          onOpenSession={onOpenSession}
        />
      ) : null}
      {taskEditor !== undefined ? (
        <TaskEditor
          editor={taskEditor}
          states={snapshot?.taskMutations.states ?? []}
          onClose={() => setTaskEditor(undefined)}
          onCreate={async (input) => { await onCreateTask(input); setTaskEditor(undefined) }}
          onUpdate={async (nativeRef, changes) => { await onUpdateTask(nativeRef, changes); setTaskEditor(undefined) }}
        />
      ) : null}
      {deleteTarget !== undefined ? (
        <DeleteTaskDialog
          issue={deleteTarget}
          onClose={() => setDeleteTarget(undefined)}
          onConfirm={async () => {
            await onDeleteTask(deleteTarget.nativeRef)
            setDeleteTarget(undefined)
            setSelectedKey(undefined)
          }}
        />
      ) : null}
      {catalogDialog?.kind === 'add-root' ? (
        <DiscoveryRootDialog
          onClose={() => setCatalogDialog(undefined)}
          onSubmit={async (input) => { await onAddDiscoveryRoot(input); setCatalogDialog(undefined) }}
        />
      ) : null}
      {catalogDialog?.kind === 'register-project' ? (
        <RegisterProjectDialog
          onClose={() => setCatalogDialog(undefined)}
          onSubmit={async (input) => { await onRegisterProject(input); setCatalogDialog(undefined) }}
        />
      ) : null}
      {catalogDialog?.kind === 'choose-root' ? (
        <DiscoveryRootPickerDialog
          roots={snapshot?.catalog.discoveryRoots ?? []}
          onClose={() => setCatalogDialog(undefined)}
          onSelect={rootId => { void startProjectScan(rootId) }}
        />
      ) : null}
      {catalogDialog?.kind === 'scan' ? (
        <ProjectScanDialog
          result={catalogDialog.result}
          onClose={() => setCatalogDialog(undefined)}
          onRegister={onRegisterProjectCandidate}
        />
      ) : null}
    </div>
  )
}

/**
 * Keep the Harness-owned sidebar interactive while the additive shell overlay
 * occupies only the center/details tracks. `data-shell-overlay` is the layout
 * package's stable overlay anchor; the first frame child is its sidebar track.
 */
function useHarnessSidebarInset(active: boolean): number {
  const [width, setWidth] = useState(() => readHarnessSidebarWidth())
  useLayoutEffect(() => {
    if (!active) return
    const sidebar = harnessSidebarElement()
    if (sidebar === undefined) { setWidth(0); return }
    const update = (): void => { setWidth(sidebar.getBoundingClientRect().width) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(sidebar)
    return () => { observer.disconnect() }
  }, [active])
  return width
}

function readHarnessSidebarWidth(): number {
  return harnessSidebarElement()?.getBoundingClientRect().width ?? 0
}

function harnessSidebarElement(): HTMLElement | undefined {
  const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
  const candidate = overlay?.parentElement?.firstElementChild
  return candidate instanceof HTMLElement ? candidate : undefined
}

function TabButton({ active, children, onClick }: { readonly active: boolean; readonly children: string; readonly onClick: () => void }) {
  return <button type="button" aria-current={active ? 'page' : undefined} data-active={active || undefined} onClick={onClick}>{children}</button>
}

function RuntimeRail({ snapshot, loading, onRefresh }: {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly loading: boolean
  readonly onRefresh: () => Promise<void>
}) {
  const t = useDashboardTranslation()
  return (
    <div className="dshd-runtime-rail">
      <Metric dot="green" label={t('runtime.running')} value={snapshot?.runtime.running ?? 0} />
      <span className="dshd-divider" />
      <Metric dot="amber" label={t('runtime.retrying')} value={snapshot?.runtime.retrying ?? 0} />
      <span className="dshd-divider" />
      <Metric dot="red" label={t('runtime.blocked')} value={snapshot?.runtime.blocked ?? 0} />
      <span className="dshd-divider" />
      <span>{t('runtime.tokens')}&nbsp;&nbsp;{compactNumber(snapshot?.runtime.tokens.total ?? 0, t)}</span>
      <span className="dshd-divider" />
      <span>{t('runtime.lastRefresh')}&nbsp;&nbsp;{relativeTime(snapshot?.runtime.lastRefreshAt, t)}</span>
      <button type="button" className="dshd-icon-button" aria-label={t('runtime.refreshDashboardAria')} disabled={loading} onClick={() => { void onRefresh() }}>
        <RefreshIcon size={15} className={loading ? 'dshd-spinning' : undefined} />
      </button>
    </div>
  )
}

function Metric({ dot, label, value }: { readonly dot: 'green' | 'amber' | 'red' | 'gray'; readonly label: string; readonly value?: number | undefined }) {
  return <span className="dshd-metric"><span className={`dshd-dot dshd-dot-${dot}`} />{label}{value === undefined ? null : <>&nbsp;&nbsp;{value}</>}</span>
}

function BoardView({ columns, hiddenColumns, showHidden, selectedKey, runtimeMap, onSelect, onCreate }: {
  readonly columns: readonly BoardColumn[]
  readonly hiddenColumns: readonly BoardColumn[]
  readonly showHidden: boolean
  readonly selectedKey?: string | undefined
  readonly runtimeMap: ReadonlyMap<string, IssueRuntimeView>
  readonly onSelect: (key: string) => void
  readonly onCreate: ((state: string) => void) | undefined
}) {
  const t = useDashboardTranslation()
  return (
    <div className="dshd-board">
      <div className="dshd-columns">
        {columns.map(column => (
          <IssueColumn key={column.name} column={column} selectedKey={selectedKey} runtimeMap={runtimeMap} onSelect={onSelect} onCreate={onCreate} />
        ))}
        {showHidden && hiddenColumns.length > 0 ? <HiddenColumns columns={hiddenColumns} /> : null}
        {columns.length === 0 ? <div className="dshd-empty">{t('board.empty')}</div> : null}
      </div>
    </div>
  )
}

const IssueColumn = memo(function IssueColumn({ column, selectedKey, runtimeMap, onSelect, onCreate }: {
  readonly column: BoardColumn
  readonly selectedKey?: string | undefined
  readonly runtimeMap: ReadonlyMap<string, IssueRuntimeView>
  readonly onSelect: (key: string) => void
  readonly onCreate: ((state: string) => void) | undefined
}) {
  const t = useDashboardTranslation()
  return (
    <section className="dshd-column">
      <header className="dshd-column-header">
        <span className="dshd-state-ring" style={{ '--dshd-state': stateColor(column.name, column.type, column.color) } as React.CSSProperties} />
        <strong>{column.name}</strong>
        <span>{column.issues.length}</span>
        <span className="dshd-column-more"><MoreIcon size={18} /></span>
        {onCreate === undefined ? null : (
          <button type="button" className="dshd-column-add" aria-label={t('board.addTaskAria', { state: column.name })} onClick={() => onCreate(column.name)}>
            <PlusIcon size={17} />
          </button>
        )}
      </header>
      <div className="dshd-card-list">
        {column.issues.map(issue => (
          <IssueCard
            key={issueKey(issue)}
            issue={issue}
            runtime={runtimeMap.get(issueKey(issue))}
            selected={selectedKey === issueKey(issue)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
})

const IssueCard = memo(function IssueCard({ issue, runtime, selected, onSelect }: {
  readonly issue: TaskIssue
  readonly runtime?: IssueRuntimeView | undefined
  readonly selected: boolean
  readonly onSelect: (key: string) => void
}) {
  const t = useDashboardTranslation()
  const key = issueKey(issue)
  return (
    <button type="button" className="dshd-card" data-selected={selected || undefined} onClick={() => onSelect(key)}>
      <div className="dshd-card-main">
        <div className="dshd-card-id">
          <span className="dshd-priority-ring" data-priority={priorityTone(issue.priority)} />
          <span>{issue.identifier}</span>
        </div>
        <strong>{issue.title}</strong>
        <span className="dshd-updated">{t('board.updated', { time: relativeTime(issue.updatedAt, t) })}</span>
      </div>
      {runtime !== undefined && runtime.phase !== 'blocked' ? (
        <div className="dshd-card-runtime">
          <span className={`dshd-dot dshd-dot-${runtime.phase === 'running' ? 'green' : 'amber'}`} />
          <span>{t('runtime.turn', { count: runtime.turnCount })}</span>
          <span className="dshd-divider" />
          <span>{elapsed(runtime.startedAt)}</span>
          <span>{t('runtime.tokenCount', { count: compactNumber(runtime.tokens.total, t) })}</span>
          {runtime.retry !== undefined ? <span className="dshd-retry-label">{t('runtime.retryIn', { time: countdown(runtime.retry.dueAt, t) })}</span> : null}
          <span className="dshd-card-more"><MoreIcon size={15} /></span>
        </div>
      ) : null}
    </button>
  )
})

function HiddenColumns({ columns }: { readonly columns: readonly BoardColumn[] }) {
  const t = useDashboardTranslation()
  return (
    <aside className="dshd-hidden-columns">
      <header><ChevronIcon size={14} /><strong>{t('board.hiddenColumns')}</strong></header>
      {columns.map(column => (
        <div key={column.name}>
          <span className="dshd-state-ring" style={{ '--dshd-state': stateColor(column.name, column.type, column.color) } as React.CSSProperties} />
          <span>{column.name}</span><span>{column.issues.length}</span>
        </div>
      ))}
    </aside>
  )
}

function IssueInspector({ issue, runtime, onClose, onRefresh, onStop, canUpdate, canDelete, onEdit, onDelete, onOpenSession }: {
  readonly issue: TaskIssue
  readonly runtime?: IssueRuntimeView | undefined
  readonly onClose: () => void
  readonly onRefresh: () => Promise<void>
  readonly onStop: (key: string) => Promise<void>
  readonly canUpdate: boolean
  readonly canDelete: boolean
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onOpenSession: (sessionId: string) => void
}) {
  const t = useDashboardTranslation()
  const [copied, setCopied] = useState(false)
  const copyLabel = copied ? t('inspector.copied') : t('inspector.copyWorkspace')
  const copyWorkspace = async (): Promise<void> => {
    if (runtime?.workspacePath === undefined) return
    await navigator.clipboard.writeText(runtime.workspacePath)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <aside className="dshd-inspector" aria-label={t('inspector.detailsAria', { identifier: issue.identifier })}>
      <header className="dshd-inspector-header">
        <div><strong>{issue.identifier}</strong><span>{issue.title}</span></div>
        <div>
          {issue.url !== undefined ? <a href={issue.url} target="_blank" rel="noreferrer" aria-label={t('inspector.openIssueAria')}><ExternalIcon size={18} /></a> : null}
          {canUpdate ? <button type="button" aria-label={t('inspector.editTaskAria')} onClick={onEdit}><EditIcon size={17} /></button> : null}
          {canDelete ? <button type="button" aria-label={t('inspector.deleteTaskAria')} onClick={onDelete}><TrashIcon size={17} /></button> : null}
          <button type="button" aria-label={t('inspector.closeAria')} onClick={onClose}><CloseIcon size={18} /></button>
        </div>
      </header>
      <div className="dshd-inspector-status">
        <Metric dot={runtime === undefined ? 'gray' : runtime.phase === 'running' ? 'green' : runtime.phase === 'retrying' ? 'amber' : 'red'} label={runtimeLabel(runtime, t)} />
        <span className="dshd-divider" />
        <span className="dshd-state-inline"><span className="dshd-state-ring" style={{ '--dshd-state': stateColor(issue.state.name, issue.state.type, issue.state.color) } as React.CSSProperties} />{issue.state.name}</span>
      </div>
      <InspectorSection title={t('inspector.runtime')}>
        <InspectorRow label={t('inspector.session')}>
          <span className="dshd-mono dshd-ellipsis">{runtime?.sessionId ?? '—'}</span>
          {runtime?.sessionId !== undefined ? <button type="button" className="dshd-link" onClick={() => onOpenSession(runtime.sessionId!)}>{t('inspector.openSession')} <ExternalIcon size={13} /></button> : null}
        </InspectorRow>
        <InspectorRow label={t('inspector.runtimeTurns')}><span>{elapsed(runtime?.startedAt)} / {runtime?.turnCount ?? 0}</span></InspectorRow>
        <InspectorRow label={t('inspector.worker')}><span>{runtime?.workerHost === 'local' ? t('common.local') : runtime?.workerHost ?? t('common.local')}</span></InspectorRow>
      </InspectorSection>
      <InspectorSection title={t('inspector.workspace')}>
        <div className="dshd-workspace-line">
          <code>{runtime?.workspacePath ?? t('inspector.notCreated')}</code>
          {runtime?.workspacePath !== undefined ? <button type="button" aria-label={copyLabel} title={copyLabel} onClick={() => { void copyWorkspace() }}><CopyIcon size={18} /></button> : null}
        </div>
      </InspectorSection>
      <InspectorSection title={t('inspector.latestUpdate')}>
        <div className="dshd-latest-update"><span className="dshd-dot dshd-dot-green" /><p>{runtime?.lastMessage ?? t('inspector.waitingUpdate')}</p></div>
        <span className="dshd-update-caption">{runtime?.lastEvent ?? t('inspector.noEvent')} · {relativeTime(runtime?.lastEventAt, t)}</span>
      </InspectorSection>
      <InspectorSection title={t('runtime.tokens')}>
        <div className="dshd-token-grid">
          <TokenCell label={t('inspector.total')} value={runtime?.tokens.total ?? 0} />
          <TokenCell label={t('inspector.input')} value={(runtime?.tokens.input ?? 0) + (runtime?.tokens.cacheRead ?? 0) + (runtime?.tokens.cacheWrite ?? 0)} />
          <TokenCell label={t('inspector.output')} value={runtime?.tokens.output ?? 0} />
        </div>
      </InspectorSection>
      <InspectorSection title={t('inspector.recentEvents')} grow>
        <div className="dshd-timeline">
          {(runtime?.recentEvents ?? []).slice(0, 5).map((event, index) => (
            <div className="dshd-timeline-row" key={`${event.type}-${event.at}-${index}`}>
              <span className={`dshd-timeline-node ${index < 2 ? 'dshd-timeline-node-fill' : ''}`} />
              <div><strong>{event.title}</strong>{event.detail !== undefined ? <span>{event.detail}</span> : null}</div>
              <time>{relativeTime(event.at, t)}</time>
            </div>
          ))}
          {(runtime?.recentEvents.length ?? 0) === 0 ? <span className="dshd-muted">{t('inspector.noAgentEvents')}</span> : null}
        </div>
      </InspectorSection>
      <footer className="dshd-inspector-actions">
        <button type="button" className="dshd-danger" disabled={runtime?.phase !== 'running'} onClick={() => { void onStop(issueKey(issue)) }}><StopIcon size={14} />{t('inspector.stopAgent')}</button>
        <button type="button" onClick={() => { void onRefresh() }}><RefreshIcon size={16} />{t('inspector.refreshIssue')}</button>
      </footer>
    </aside>
  )
}

function TaskEditor({ editor, states, onClose, onCreate, onUpdate }: {
  readonly editor: TaskEditorState
  readonly states: readonly string[]
  readonly onClose: () => void
  readonly onCreate: (input: CreateTaskInput) => Promise<void>
  readonly onUpdate: (nativeRef: string, changes: UpdateTaskInput) => Promise<void>
}) {
  const t = useDashboardTranslation()
  const issue = editor.mode === 'edit' ? editor.issue : undefined
  const [title, setTitle] = useState(issue?.title ?? '')
  const [description, setDescription] = useState(issue?.description ?? '')
  const [state, setState] = useState(issue?.state.name ?? (editor.mode === 'create' ? editor.state : states[0] ?? 'Todo'))
  const [priority, setPriority] = useState(issue?.priority?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | Error | undefined>()
  const trimmedTitle = title.trim()
  const normalizedDescription = description.trim() === '' ? undefined : description.trim()
  const parsedPriority = priority === '' ? undefined : Number(priority)
  const hasChanges = editor.mode === 'create' || trimmedTitle !== editor.issue.title
    || normalizedDescription !== editor.issue.description
    || state !== editor.issue.state.name
    || parsedPriority !== editor.issue.priority
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      if (editor.mode === 'create') {
        await onCreate({
          title: trimmedTitle,
          ...(normalizedDescription === undefined ? {} : { description: normalizedDescription }),
          state,
          ...(parsedPriority === undefined ? {} : { priority: parsedPriority }),
        })
      } else {
        const changes: UpdateTaskInput = {
          ...(trimmedTitle === editor.issue.title ? {} : { title: trimmedTitle }),
          ...(normalizedDescription === editor.issue.description ? {} : { description: normalizedDescription ?? null }),
          ...(state === editor.issue.state.name ? {} : { state }),
          ...(parsedPriority === editor.issue.priority ? {} : { priority: parsedPriority ?? null }),
          ...(editor.issue.updatedAt === undefined ? {} : { expectedUpdatedAt: editor.issue.updatedAt }),
        }
        await onUpdate(editor.issue.nativeRef, changes)
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError : String(submitError))
      setSaving(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <form className="dshd-task-editor" role="dialog" aria-modal="true" aria-labelledby="dshd-task-editor-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} onSubmit={event => { void submit(event) }}>
        <header>
          <div><span>{t('editor.localTask')}</span><h2 id="dshd-task-editor-title">{editor.mode === 'create' ? t('editor.createTask') : t('editor.editTask', { identifier: editor.issue.identifier })}</h2></div>
          <button type="button" aria-label={t('editor.closeAria')} onClick={onClose}><CloseIcon size={18} /></button>
        </header>
        <div className="dshd-editor-fields">
          <label>
            <span>{t('editor.title')}</span>
            <input autoFocus required maxLength={500} value={title} onChange={event => setTitle(event.currentTarget.value)} placeholder={t('editor.titlePlaceholder')} />
          </label>
          <label>
            <span>{t('editor.description')}</span>
            <textarea rows={6} value={description} onChange={event => setDescription(event.currentTarget.value)} placeholder={t('editor.descriptionPlaceholder')} />
          </label>
          <div className="dshd-editor-row">
            <label>
              <span>{t('editor.state')}</span>
              <select value={state} onChange={event => setState(event.currentTarget.value)}>
                {states.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>{t('editor.priority')}</span>
              <select value={priority} onChange={event => setPriority(event.currentTarget.value)}>
                <option value="">{t('editor.noPriority')}</option>
                <option value="1">{t('editor.priorityUrgent')}</option>
                <option value="2">{t('editor.priorityHigh')}</option>
                <option value="3">{t('editor.priorityMedium')}</option>
                <option value="4">{t('editor.priorityLow')}</option>
              </select>
            </label>
          </div>
          <DashboardErrorNotice error={error} className="dshd-editor-error" />
        </div>
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" className="dshd-primary" disabled={saving || trimmedTitle === '' || !hasChanges}>{saving ? t('editor.saving') : editor.mode === 'create' ? t('editor.createTask') : t('editor.saveChanges')}</button>
        </footer>
      </form>
    </div>
  )
}

function DeleteTaskDialog({ issue, onClose, onConfirm }: {
  readonly issue: TaskIssue
  readonly onClose: () => void
  readonly onConfirm: () => Promise<void>
}) {
  const t = useDashboardTranslation()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | Error | undefined>()
  const confirm = async (): Promise<void> => {
    setDeleting(true)
    setError(undefined)
    try {
      await onConfirm()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError : String(deleteError))
      setDeleting(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <section className="dshd-confirm" role="alertdialog" aria-modal="true" aria-labelledby="dshd-delete-title" aria-describedby="dshd-delete-description" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><TrashIcon size={20} /><h2 id="dshd-delete-title">{t('delete.title', { identifier: issue.identifier })}</h2></header>
        <p id="dshd-delete-description">{t('delete.description')}</p>
        <DashboardErrorNotice error={error} className="dshd-editor-error" />
        <footer>
          <button type="button" onClick={onClose} disabled={deleting}>{t('common.cancel')}</button>
          <button type="button" className="dshd-delete-confirm" onClick={() => { void confirm() }} disabled={deleting}>{deleting ? t('delete.deleting') : t('delete.confirm')}</button>
        </footer>
      </section>
    </div>
  )
}

function InspectorSection({ title, children, grow = false }: { readonly title: string; readonly children: React.ReactNode; readonly grow?: boolean }) {
  return <section className="dshd-inspector-section" data-grow={grow || undefined}><h2>{title}</h2>{children}</section>
}

function InspectorRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <div className="dshd-inspector-row"><span>{label}</span><div>{children}</div></div>
}

function TokenCell({ label, value }: { readonly label: string; readonly value: number }) {
  const t = useDashboardTranslation()
  return <div><span>{label}</span><strong>{value.toLocaleString(t('meta.locale'))}</strong></div>
}

function RuntimeView({ snapshot, onSelect }: { readonly snapshot?: DashboardSnapshot | undefined; readonly onSelect: (key: string) => void }) {
  const t = useDashboardTranslation()
  const rows = snapshot?.runtime.issues ?? []
  return (
    <div className="dshd-table-view">
      <header><h2>{t('runtime.title')}</h2><p>{t('runtime.description')}</p></header>
      <div className="dshd-runtime-table" role="table" aria-label={t('runtime.tableAria')}>
        <div className="dshd-table-head" role="row"><span>{t('runtime.issue')}</span><span>{t('runtime.phase')}</span><span>{t('runtime.state')}</span><span>{t('runtime.turns')}</span><span>{t('runtime.tokens')}</span><span>{t('runtime.updated')}</span></div>
        {rows.map(row => (
          <button type="button" role="row" key={row.key} onClick={() => onSelect(row.key)}>
            <strong>{row.identifier}</strong>
            <span><span className={`dshd-dot dshd-dot-${row.phase === 'running' ? 'green' : row.phase === 'retrying' ? 'amber' : 'red'}`} />{runtimePhaseLabel(row.phase, t)}</span>
            <span>{row.state}</span><span>{row.turnCount}</span><span>{compactNumber(row.tokens.total, t)}</span><span>{relativeTime(row.updatedAt, t)}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="dshd-table-empty">{t('runtime.empty')}</div> : null}
      </div>
    </div>
  )
}

function ProjectsView({ snapshot, filter, showRoots, busy, onAddRoot, onRemoveRoot, onScanRoots, onScan, onRegister }: {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly filter: string
  readonly showRoots: boolean
  readonly busy: boolean
  readonly onAddRoot: () => void
  readonly onRemoveRoot: (id: string) => Promise<void>
  readonly onScanRoots: () => void
  readonly onScan: (rootId: string) => Promise<void>
  readonly onRegister: () => void
}) {
  const t = useDashboardTranslation()
  const catalog = snapshot?.catalog
  const projects = (catalog?.projects ?? []).filter(project => {
    if (filter === '') return true
    const repositories = project.repositories.map(repository => `${repository.root} ${repository.remoteUrl ?? ''}`).join(' ')
    return `${project.name} ${project.root} ${project.policyPath ?? ''} ${repositories}`.toLocaleLowerCase('en-US').includes(filter)
  })
  const roots = catalog?.discoveryRoots ?? []
  return (
    <div className="dshd-projects-view">
      <header className="dshd-projects-heading">
        <div><h2>{t('tab.projects')}</h2><p>{t('projects.description')}</p></div>
        <div className="dshd-project-actions">
          <button type="button" disabled={busy} onClick={onScanRoots}><RefreshIcon size={15} />{t('projects.scanRoots')}</button>
          <button type="button" className="dshd-project-primary" disabled={busy} onClick={onRegister}><PlusIcon size={16} />{t('projects.registerProject')}</button>
        </div>
      </header>
      <div className="dshd-project-summary" aria-label={t('projects.summaryAria')}>
        <span>{t('projects.registeredCount', { count: catalog?.projects.length ?? 0 })}</span><span className="dshd-divider" />
        <span>{t(roots.length === 1 ? 'projects.discoveryRootCountOne' : 'projects.discoveryRootCountOther', { count: roots.length })}</span><span className="dshd-divider" />
        <span>{t('projects.globalBrokerOff')}</span>
      </div>
      <div className="dshd-project-table-scroll">
        <div className="dshd-project-table" role="table" aria-label={t('projects.tableAria')}>
          <div className="dshd-project-table-head" role="row">
            <span>{t('projects.project')}</span><span>{t('projects.workspace')}</span><span>{t('projects.repository')}</span><span>{t('projects.policy')}</span><span>{t('projects.autonomousClaims')}</span><span>{t('runtime.updated')}</span><span />
          </div>
          {projects.map(project => {
            const repository = project.repositories[0]
            return (
              <div className="dshd-project-row" role="row" key={project.id} data-current={project.currentWorkspace || undefined}>
                <strong>{project.name}{project.currentWorkspace ? <small>{t('projects.current')}</small> : null}</strong>
                <span className="dshd-mono" title={project.root}>{project.root}</span>
                <span title={repository?.remoteUrl ?? repository?.root}>{repository === undefined ? t('projects.notGitRepository') : <><GitBranchIcon size={15} />{repository.remoteUrl ?? repository.root}</>}</span>
                <span>{project.policyPath === undefined ? t('common.none') : pathLeaf(project.policyPath)}</span>
                <span>{project.autonomousClaims ? t('common.on') : t('common.off')}</span>
                <span>{relativeTime(project.updatedAt, t)}</span>
                <span className="dshd-project-more"><MoreIcon size={16} /></span>
              </div>
            )
          })}
          {projects.length === 0 ? <div className="dshd-table-empty">{t('projects.empty')}</div> : null}
        </div>
      </div>
      {showRoots ? (
        <section className="dshd-discovery-roots">
          <header><h3>{t('projects.discoveryRoots')}</h3><button type="button" onClick={onAddRoot}>{t('projects.manageRoots')}</button></header>
          {roots.map(root => (
            <div className="dshd-discovery-root" key={root.id}>
              <span><FolderIcon size={17} /><code>{root.path}</code></span>
              <span>{t('projects.manualConfirmation', { depth: root.maxDepth })}</span>
              <span>{relativeTime(root.updatedAt, t)}</span>
              <button type="button" aria-label={t('projects.scanRootAria', { path: root.path })} title={t('projects.scanRootTitle')} disabled={busy} onClick={() => { void onScan(root.id) }}><RefreshIcon size={15} /></button>
              <button type="button" aria-label={t('projects.removeRootAria', { path: root.path })} title={t('projects.removeRootTitle')} disabled={busy} onClick={() => { void onRemoveRoot(root.id).catch(() => undefined) }}><TrashIcon size={15} /></button>
            </div>
          ))}
          {roots.length === 0 ? <div className="dshd-table-empty">{t('projects.noRoots')}</div> : null}
        </section>
      ) : null}
    </div>
  )
}

function DiscoveryRootPickerDialog({ roots, onClose, onSelect }: {
  readonly roots: readonly DiscoveryRootRecord[]
  readonly onClose: () => void
  readonly onSelect: (rootId: string) => void
}) {
  const t = useDashboardTranslation()
  return (
    <div className="dshd-modal" role="presentation">
      <section className="dshd-catalog-dialog dshd-catalog-small" role="dialog" aria-modal="true" aria-labelledby="dshd-root-picker-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><div><h2 id="dshd-root-picker-title">{t('rootPicker.title')}</h2><p>{t('rootPicker.description')}</p></div><button type="button" aria-label={t('common.close')} onClick={onClose}><CloseIcon size={18} /></button></header>
        <div className="dshd-root-choices">
          {roots.map(root => (
            <button type="button" key={root.id} onClick={() => onSelect(root.id)}>
              <span><FolderIcon size={17} /><code>{root.path}</code></span>
              <small>{t('rootPicker.maximumDepth', { depth: root.maxDepth })}<ChevronIcon size={15} /></small>
            </button>
          ))}
        </div>
        <footer><button type="button" onClick={onClose}>{t('common.cancel')}</button></footer>
      </section>
    </div>
  )
}

function DiscoveryRootDialog({ onClose, onSubmit }: {
  readonly onClose: () => void
  readonly onSubmit: (input: AddDiscoveryRootInput) => Promise<void>
}) {
  const t = useDashboardTranslation()
  const [path, setPath] = useState('')
  const [maxDepth, setMaxDepth] = useState('4')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | Error | undefined>()
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await onSubmit({ path: path.trim(), maxDepth: Number(maxDepth) })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError : String(submitError))
      setSaving(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <form className="dshd-catalog-dialog dshd-catalog-small" role="dialog" aria-modal="true" aria-labelledby="dshd-root-title" onSubmit={event => { void submit(event) }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><div><h2 id="dshd-root-title">{t('rootDialog.title')}</h2><p>{t('rootDialog.description')}</p></div><button type="button" aria-label={t('common.close')} onClick={onClose}><CloseIcon size={18} /></button></header>
        <div className="dshd-catalog-fields">
          <label><span>{t('rootDialog.absolutePath')}</span><input autoFocus required value={path} onChange={event => setPath(event.currentTarget.value)} placeholder="F:\\Dev\\Code" /></label>
          <label><span>{t('rootDialog.maximumDepth')}</span><input required type="number" min="1" max="8" value={maxDepth} onChange={event => setMaxDepth(event.currentTarget.value)} /></label>
          <DashboardErrorNotice error={error} className="dshd-editor-error" />
        </div>
        <footer><button type="button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="dshd-primary" disabled={saving || path.trim() === ''}>{saving ? t('rootDialog.adding') : t('rootDialog.addRoot')}</button></footer>
      </form>
    </div>
  )
}

function RegisterProjectDialog({ onClose, onSubmit }: {
  readonly onClose: () => void
  readonly onSubmit: (input: RegisterProjectInput) => Promise<void>
}) {
  const t = useDashboardTranslation()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | Error | undefined>()
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await onSubmit({ path: path.trim(), ...(name.trim() === '' ? {} : { name: name.trim() }) })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError : String(submitError))
      setSaving(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <form className="dshd-catalog-dialog dshd-catalog-small" role="dialog" aria-modal="true" aria-labelledby="dshd-register-title" onSubmit={event => { void submit(event) }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><div><h2 id="dshd-register-title">{t('register.title')}</h2><p>{t('register.description')}</p></div><button type="button" aria-label={t('common.close')} onClick={onClose}><CloseIcon size={18} /></button></header>
        <div className="dshd-catalog-fields">
          <label><span>{t('register.absolutePath')}</span><input autoFocus required value={path} onChange={event => setPath(event.currentTarget.value)} placeholder="F:\\Dev\\Code\\my-project" /></label>
          <label><span>{t('register.displayName')} <small>{t('common.optional')}</small></span><input maxLength={200} value={name} onChange={event => setName(event.currentTarget.value)} placeholder={t('register.namePlaceholder')} /></label>
          <DashboardErrorNotice error={error} className="dshd-editor-error" />
        </div>
        <footer><button type="button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="dshd-primary" disabled={saving || path.trim() === ''}>{saving ? t('register.registering') : t('projects.registerProject')}</button></footer>
      </form>
    </div>
  )
}

function ProjectScanDialog({ result, onClose, onRegister }: {
  readonly result: ProjectScanResult
  readonly onClose: () => void
  readonly onRegister: (token: string) => Promise<void>
}) {
  const t = useDashboardTranslation()
  const available = result.candidates.filter(candidate => candidate.alreadyRegisteredProjectId === undefined)
  const [selected, setSelected] = useState(() => new Set(available.map(candidate => candidate.token)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | Error | undefined>()
  const submit = async (): Promise<void> => {
    setSaving(true)
    setError(undefined)
    try {
      for (const candidate of available) {
        if (!selected.has(candidate.token)) continue
        await onRegister(candidate.token)
        setSelected(current => {
          const next = new Set(current)
          next.delete(candidate.token)
          return next
        })
      }
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError : String(submitError))
      setSaving(false)
    }
  }
  const toggle = (token: string): void => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }
  return (
    <div className="dshd-modal" role="presentation">
      <section className="dshd-catalog-dialog dshd-scan-dialog" role="dialog" aria-modal="true" aria-labelledby="dshd-scan-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><div><h2 id="dshd-scan-title">{t('scan.title')}</h2><p>{t('scan.description')}</p></div><button type="button" aria-label={t('common.close')} onClick={onClose}><CloseIcon size={18} /></button></header>
        <div className="dshd-scan-content">
          <label className="dshd-readonly-field"><span>{t('scan.discoveryRoot')}</span><input readOnly value={result.root.path} /></label>
          <div className="dshd-candidate-label">{t('scan.candidates')}</div>
          <div className="dshd-candidate-table" role="table" aria-label={t('scan.tableAria')}>
            <div className="dshd-candidate-head" role="row"><span /><span>{t('scan.name')}</span><span>{t('scan.path')}</span><span>{t('scan.metadata')}</span></div>
            {result.candidates.map(candidate => {
              const disabled = candidate.alreadyRegisteredProjectId !== undefined
              return (
                <label className="dshd-candidate-row" role="row" key={candidate.token} data-disabled={disabled || undefined}>
                  <input type="checkbox" disabled={disabled || saving} checked={!disabled && selected.has(candidate.token)} onChange={() => toggle(candidate.token)} />
                  <strong>{candidate.name}</strong><span className="dshd-mono" title={candidate.path}>{candidate.path}</span>
                  <span>{disabled ? t('scan.alreadyRegistered') : `${candidate.repository === undefined ? t('scan.directory') : t('scan.gitRepository')}${candidate.policyPath === undefined ? '' : ' · WORKFLOW.md'}`}</span>
                </label>
              )
            })}
            {result.candidates.length === 0 ? <div className="dshd-table-empty">{t('scan.empty')}</div> : null}
          </div>
          <div className="dshd-candidate-status">{t(available.length === 1 ? 'scan.newCandidatesOne' : 'scan.newCandidatesOther', { count: available.length })}{result.truncated ? ` · ${t('scan.limitReached')}` : ''}</div>
          <DashboardErrorNotice error={error} className="dshd-editor-error" />
        </div>
        <footer><button type="button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button><button type="button" className="dshd-primary" disabled={saving || selected.size === 0} onClick={() => { void submit() }}>{saving ? t('register.registering') : t('scan.registerSelected')}</button></footer>
      </section>
    </div>
  )
}

function ConfigurationView({ snapshot }: { readonly snapshot?: DashboardSnapshot | undefined }) {
  const t = useDashboardTranslation()
  const config = snapshot?.configuration
  return (
    <div className="dshd-config-view">
      <header><h2>{t('tab.configuration')}</h2><p>{t('configuration.description')}</p></header>
      <section>
        <h3>{t('configuration.workflow')}</h3>
        <ConfigRow label={t('configuration.path')} value={config?.workflowPath} mono />
        <ConfigRow label={t('configuration.project')} value={config?.projectName} />
        <ConfigRow label={t('configuration.loaded')} value={relativeTime(config?.workflowLoadedAt, t)} />
        <ConfigRow label={t('configuration.polling')} value={config?.pollingIntervalMs === undefined ? '—' : `${config.pollingIntervalMs.toLocaleString(t('meta.locale'))} ms`} />
        <ConfigRow label={t('configuration.workspaceRoot')} value={config?.workspaceRoot} mono />
        {config?.workflowError !== undefined ? <div className="dshd-config-error">{t('configuration.reloadRejected', { error: config.workflowError })}</div> : null}
      </section>
      <section>
        <h3>{t('configuration.tracker')}</h3>
        <ConfigRow label={t('configuration.provider')} value={providerLabel(config?.trackerKind, config?.trackerKind, t)} />
        <ConfigRow label={t('configuration.project')} value={config?.projectRef} mono />
        {(config?.credentials.length ?? 0) === 0 ? <ConfigRow label={t('configuration.credentials')} value={t('configuration.notRequired')} /> : config?.credentials.map(credential => (
          <ConfigRow
            key={credential.ref}
            label={credentialLabel(credential.label, t)}
            value={`${credential.ref} · ${credential.configured ? t('configuration.configured', { source: credentialSourceLabel(credential.source, t) }) : t('configuration.notConfigured')}`}
            mono
          />
        ))}
        <ConfigRow label={t('configuration.activeStates')} value={config?.activeStates.join(', ')} />
        <ConfigRow label={t('configuration.terminalStates')} value={config?.terminalStates.join(', ')} />
      </section>
      <section>
        <h3>{t('configuration.harnessAgent')}</h3>
        <ConfigRow label={t('configuration.profile')} value={config?.agentProfile} mono />
        <ConfigRow label={t('configuration.permissionPreset')} value={config?.permissionPreset} mono />
        <ConfigRow label={t('configuration.agentPreset')} value={config?.agentPreset ?? t('configuration.harnessDefault')} mono />
        <ConfigRow label={t('configuration.concurrency')} value={config?.maxConcurrentAgents?.toString()} />
        <ConfigRow label={t('configuration.maximumTurns')} value={config?.maxTurns?.toString()} />
      </section>
    </div>
  )
}

function ConfigRow({ label, value, mono = false }: { readonly label: string; readonly value?: string | undefined; readonly mono?: boolean | undefined }) {
  return <div className="dshd-config-row"><span>{label}</span><strong className={mono ? 'dshd-mono' : undefined}>{value === undefined || value === '' ? '—' : value}</strong></div>
}

function runtimeLabel(runtime: IssueRuntimeView | undefined, t: ReturnType<typeof useDashboardTranslation>): string {
  return runtime === undefined ? t('runtime.idle') : runtimePhaseLabel(runtime.phase, t)
}

function runtimePhaseLabel(phase: IssueRuntimeView['phase'], t: ReturnType<typeof useDashboardTranslation>): string {
  if (phase === 'running') return t('runtime.running')
  if (phase === 'retrying') return t('runtime.retrying')
  return t('runtime.blocked')
}

function stateColor(name: string, type?: string, providerColor?: string): string {
  if (providerColor?.startsWith('#')) return providerColor
  const normalized = `${name} ${type ?? ''}`.toLocaleLowerCase('en-US')
  if (normalized.includes('progress') || normalized.includes('started')) return '#f3bd19'
  if (normalized.includes('review') || normalized.includes('rework')) return '#f04452'
  if (normalized.includes('done') || normalized.includes('complete') || normalized.includes('merge')) return '#35b88a'
  if (normalized.includes('cancel') || normalized.includes('duplicate')) return '#929eb1'
  return '#8a9ab4'
}

function priorityTone(priority?: number): string {
  if (priority === 1) return 'urgent'
  if (priority === 2) return 'high'
  if (priority === 3) return 'medium'
  return 'none'
}

function compactNumber(value: number, t: ReturnType<typeof useDashboardTranslation>): string {
  return new Intl.NumberFormat(t('meta.locale'), { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function pathLeaf(value: string): string {
  const parts = value.split(/[\\/]/u).filter(Boolean)
  return parts.at(-1) ?? value
}

function relativeTime(value: string | undefined, t: ReturnType<typeof useDashboardTranslation>): string {
  if (value === undefined) return '—'
  const delta = Date.now() - Date.parse(value)
  if (!Number.isFinite(delta)) return '—'
  const formatter = new Intl.RelativeTimeFormat(t('meta.locale'), { numeric: 'auto' })
  if (delta < 0) return formatter.format(0, 'second')
  const seconds = Math.floor(delta / 1000)
  if (seconds < 5) return formatter.format(0, 'second')
  if (seconds < 60) return formatter.format(-seconds, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')
  return formatter.format(-Math.floor(hours / 24), 'day')
}

function elapsed(startedAt?: string): string {
  if (startedAt === undefined) return '—'
  const total = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, '0')
  const seconds = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function countdown(dueAt: string, t: ReturnType<typeof useDashboardTranslation>): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(dueAt) - Date.now()) / 1000))
  return new Intl.NumberFormat(t('meta.locale'), { style: 'unit', unit: 'second', unitDisplay: 'short' }).format(seconds)
}

function providerLabel(kind: string | undefined, fallback: string | undefined, t: ReturnType<typeof useDashboardTranslation>): string | undefined {
  if (kind === 'local') return t('common.local')
  if (kind === 'github') return 'GitHub'
  if (kind === 'gitlab') return 'GitLab'
  if (kind === 'jira') return 'Jira'
  if (kind === 'asana') return 'Asana'
  if (kind === 'linear') return 'Linear'
  return fallback
}

function credentialLabel(label: string, t: ReturnType<typeof useDashboardTranslation>): string {
  if (label === 'API key') return t('credential.apiKey')
  if (label === 'Personal access token') return t('credential.personalAccessToken')
  if (label === 'Account email') return t('credential.accountEmail')
  if (label === 'API token') return t('credential.apiToken')
  return label
}

function credentialSourceLabel(source: string | undefined, t: ReturnType<typeof useDashboardTranslation>): string {
  if (source === undefined || source === 'provider') return t('credentialSource.provider')
  if (source === 'env') return t('credentialSource.env')
  if (source === 'environment') return t('credentialSource.environment')
  if (source === 'file') return t('credentialSource.file')
  if (source === 'project-env') return t('credentialSource.projectEnv')
  if (source === 'user-env') return t('credentialSource.userEnv')
  if (source === 'credential-store') return t('credentialSource.credentialStore')
  if (source === 'memory') return t('credentialSource.memory')
  return source
}

function DashboardErrorNotice({ error, className }: {
  readonly error?: string | Error | undefined
  readonly className: string
}) {
  const t = useDashboardTranslation()
  return error === undefined
    ? null
    : <div className={className} role="alert">{dashboardErrorMessage(error, t)}</div>
}

export function displayInputTokens(tokens: TokenTotals): number {
  return tokens.input + tokens.cacheRead + tokens.cacheWrite
}
