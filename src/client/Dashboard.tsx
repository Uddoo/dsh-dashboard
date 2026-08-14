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
import type { TaskIssue } from '../domain/issue.ts'
import { issueKey } from '../domain/issue.ts'
import type { BoardColumn, DashboardSnapshot, IssueRuntimeView, TokenTotals } from '../runtime/types.ts'
import type { CreateTaskInput, UpdateTaskInput } from '../task-source/index.ts'
import type { DashboardDataPort } from './controller.ts'
import { DashboardUiController } from './controller.ts'
import {
  BoardIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  DisplayIcon,
  EditIcon,
  ExternalIcon,
  FilterIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from './icons.tsx'

export interface DashboardFooterActionProps {
  readonly wide: boolean
  readonly ui: DashboardUiController
}

/** Sidebar entry; the Dashboard itself lives in the additive shell overlay. */
export function DashboardFooterAction({ wide, ui }: DashboardFooterActionProps) {
  const open = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot)
  return (
    <button
      type="button"
      className="dshd-entry"
      data-wide={wide || undefined}
      data-active={open || undefined}
      aria-pressed={open}
      aria-label="Dashboard"
      title="Dashboard"
      onClick={ui.toggle}
    >
      <BoardIcon size={18} />
      {wide ? <span>Dashboard</span> : null}
    </button>
  )
}

export interface DashboardOverlayProps {
  readonly ui: DashboardUiController
  readonly data: DashboardDataPort
  readonly openSession: (sessionId: string) => void
}

/** Dashboard content mounted in `shell.overlay` while preserving the Harness sidebar. */
export function DashboardOverlay({ ui, data, openSession }: DashboardOverlayProps) {
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
        onOpenSession={(sessionId) => { ui.close(); openSession(sessionId) }}
      />
    </div>
  )
}

export interface DashboardSurfaceProps {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly loading?: boolean | undefined
  readonly error?: string | undefined
  readonly initialSelectedKey?: string | undefined
  readonly onRefresh: () => Promise<void>
  readonly onPause: (paused: boolean) => Promise<void>
  readonly onStop: (key: string) => Promise<void>
  readonly onCreateTask: (input: CreateTaskInput) => Promise<void>
  readonly onUpdateTask: (nativeRef: string, changes: UpdateTaskInput) => Promise<void>
  readonly onDeleteTask: (nativeRef: string) => Promise<void>
  readonly onOpenSession: (sessionId: string) => void
}

type Tab = 'board' | 'runtime' | 'configuration'
type TaskEditorState =
  | { readonly mode: 'create'; readonly state: string }
  | { readonly mode: 'edit'; readonly issue: TaskIssue }

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
  onOpenSession,
}: DashboardSurfaceProps) {
  const [tab, setTab] = useState<Tab>('board')
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initialSelectedKey)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [showHidden, setShowHidden] = useState(true)
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<TaskIssue | undefined>()
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

  return (
    <div className="dshd-shell" role="region" aria-label="Dashboard">
      <section className="dshd-app">
        <header className="dshd-header">
          <div className="dshd-header-top">
            <div className="dshd-heading-cluster">
              <h1>Dashboard</h1>
              <button type="button" className="dshd-context" aria-label="Current task source">
                <span>{context?.providerLabel ?? 'Linear'}</span>
                <span aria-hidden>·</span>
                <span>{context?.projectLabel ?? '—'}</span>
                <ChevronIcon size={14} />
              </button>
            </div>
            <div className="dshd-toolbar">
              <div className="dshd-filter-wrap">
                <button type="button" className="dshd-plain-control" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}>
                  <FilterIcon size={17} /><span>Filter</span>
                </button>
                {filterOpen ? (
                  <div className="dshd-filter-popover">
                    <input autoFocus value={filter} onChange={event => setFilter(event.currentTarget.value)} placeholder="Filter issues" aria-label="Filter issues" />
                    {filter !== '' ? <button type="button" onClick={() => setFilter('')}>Clear</button> : null}
                  </div>
                ) : null}
              </div>
              <button type="button" className="dshd-plain-control" data-active={!showHidden || undefined} onClick={() => setShowHidden(value => !value)}>
                <DisplayIcon size={18} /><span>Display</span>
              </button>
              <button type="button" className="dshd-live-control" aria-label="Agent capacity">
                <span className="dshd-dot dshd-dot-green" />
                <span>{snapshot?.paused ? 'Paused' : 'Live'} · {snapshot?.runtime.running ?? 0}/{snapshot?.runtime.capacity ?? 0} agents</span>
                <ChevronIcon size={14} />
              </button>
              <button
                type="button"
                className="dshd-pause-control"
                disabled={loading || snapshot === undefined}
                onClick={() => onPause(!(snapshot?.paused ?? false))}
              >
                {snapshot?.paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
                <span>{snapshot?.paused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>
          </div>
          <nav className="dshd-tabs" aria-label="Dashboard views">
            <TabButton active={tab === 'board'} onClick={() => setTab('board')}>Board</TabButton>
            <TabButton active={tab === 'runtime'} onClick={() => setTab('runtime')}>Runtime</TabButton>
            <TabButton active={tab === 'configuration'} onClick={() => setTab('configuration')}>Configuration</TabButton>
          </nav>
        </header>

        <RuntimeRail snapshot={snapshot} loading={loading} onRefresh={onRefresh} />
        {error !== undefined ? <div className="dshd-error" role="alert">{error}</div> : null}
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
  return (
    <div className="dshd-runtime-rail">
      <Metric dot="green" label="Running" value={snapshot?.runtime.running ?? 0} />
      <span className="dshd-divider" />
      <Metric dot="amber" label="Retrying" value={snapshot?.runtime.retrying ?? 0} />
      <span className="dshd-divider" />
      <Metric dot="red" label="Blocked" value={snapshot?.runtime.blocked ?? 0} />
      <span className="dshd-divider" />
      <span>Tokens&nbsp;&nbsp;{compactNumber(snapshot?.runtime.tokens.total ?? 0)}</span>
      <span className="dshd-divider" />
      <span>Last refresh&nbsp;&nbsp;{relativeTime(snapshot?.runtime.lastRefreshAt)}</span>
      <button type="button" className="dshd-icon-button" aria-label="Refresh Dashboard" disabled={loading} onClick={() => { void onRefresh() }}>
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
  return (
    <div className="dshd-board">
      <div className="dshd-columns">
        {columns.map(column => (
          <IssueColumn key={column.name} column={column} selectedKey={selectedKey} runtimeMap={runtimeMap} onSelect={onSelect} onCreate={onCreate} />
        ))}
        {showHidden && hiddenColumns.length > 0 ? <HiddenColumns columns={hiddenColumns} /> : null}
        {columns.length === 0 ? <div className="dshd-empty">No issues match the current project and filter.</div> : null}
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
  return (
    <section className="dshd-column">
      <header className="dshd-column-header">
        <span className="dshd-state-ring" style={{ '--dshd-state': stateColor(column.name, column.type, column.color) } as React.CSSProperties} />
        <strong>{column.name}</strong>
        <span>{column.issues.length}</span>
        <span className="dshd-column-more"><MoreIcon size={18} /></span>
        {onCreate === undefined ? null : (
          <button type="button" className="dshd-column-add" aria-label={`Add task to ${column.name}`} onClick={() => onCreate(column.name)}>
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
  const key = issueKey(issue)
  return (
    <button type="button" className="dshd-card" data-selected={selected || undefined} onClick={() => onSelect(key)}>
      <div className="dshd-card-main">
        <div className="dshd-card-id">
          <span className="dshd-priority-ring" data-priority={priorityTone(issue.priority)} />
          <span>{issue.identifier}</span>
        </div>
        <strong>{issue.title}</strong>
        <span className="dshd-updated">Updated {relativeTime(issue.updatedAt)}</span>
      </div>
      {runtime !== undefined && runtime.phase !== 'blocked' ? (
        <div className="dshd-card-runtime">
          <span className={`dshd-dot dshd-dot-${runtime.phase === 'running' ? 'green' : 'amber'}`} />
          <span>Turn {runtime.turnCount}</span>
          <span className="dshd-divider" />
          <span>{elapsed(runtime.startedAt)}</span>
          <span>{compactNumber(runtime.tokens.total)} tokens</span>
          {runtime.retry !== undefined ? <span className="dshd-retry-label">Retry in {countdown(runtime.retry.dueAt)}</span> : null}
          <span className="dshd-card-more"><MoreIcon size={15} /></span>
        </div>
      ) : null}
    </button>
  )
})

function HiddenColumns({ columns }: { readonly columns: readonly BoardColumn[] }) {
  return (
    <aside className="dshd-hidden-columns">
      <header><ChevronIcon size={14} /><strong>Hidden columns</strong></header>
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
  const [copyLabel, setCopyLabel] = useState('Copy workspace')
  const copyWorkspace = async (): Promise<void> => {
    if (runtime?.workspacePath === undefined) return
    await navigator.clipboard.writeText(runtime.workspacePath)
    setCopyLabel('Copied')
    setTimeout(() => setCopyLabel('Copy workspace'), 1200)
  }
  return (
    <aside className="dshd-inspector" aria-label={`${issue.identifier} details`}>
      <header className="dshd-inspector-header">
        <div><strong>{issue.identifier}</strong><span>{issue.title}</span></div>
        <div>
          {issue.url !== undefined ? <a href={issue.url} target="_blank" rel="noreferrer" aria-label="Open issue"><ExternalIcon size={18} /></a> : null}
          {canUpdate ? <button type="button" aria-label="Edit local task" onClick={onEdit}><EditIcon size={17} /></button> : null}
          {canDelete ? <button type="button" aria-label="Delete local task" onClick={onDelete}><TrashIcon size={17} /></button> : null}
          <button type="button" aria-label="Close inspector" onClick={onClose}><CloseIcon size={18} /></button>
        </div>
      </header>
      <div className="dshd-inspector-status">
        <Metric dot={runtime === undefined ? 'gray' : runtime.phase === 'running' ? 'green' : runtime.phase === 'retrying' ? 'amber' : 'red'} label={runtimeLabel(runtime)} />
        <span className="dshd-divider" />
        <span className="dshd-state-inline"><span className="dshd-state-ring" style={{ '--dshd-state': stateColor(issue.state.name, issue.state.type, issue.state.color) } as React.CSSProperties} />{issue.state.name}</span>
      </div>
      <InspectorSection title="Runtime">
        <InspectorRow label="Session">
          <span className="dshd-mono dshd-ellipsis">{runtime?.sessionId ?? '—'}</span>
          {runtime?.sessionId !== undefined ? <button type="button" className="dshd-link" onClick={() => onOpenSession(runtime.sessionId!)}>Open session <ExternalIcon size={13} /></button> : null}
        </InspectorRow>
        <InspectorRow label="Runtime / turns"><span>{elapsed(runtime?.startedAt)} / {runtime?.turnCount ?? 0}</span></InspectorRow>
        <InspectorRow label="Worker"><span>{runtime?.workerHost ?? 'local'}</span></InspectorRow>
      </InspectorSection>
      <InspectorSection title="Workspace">
        <div className="dshd-workspace-line">
          <code>{runtime?.workspacePath ?? 'Not created'}</code>
          {runtime?.workspacePath !== undefined ? <button type="button" aria-label={copyLabel} title={copyLabel} onClick={() => { void copyWorkspace() }}><CopyIcon size={18} /></button> : null}
        </div>
      </InspectorSection>
      <InspectorSection title="Latest agent update">
        <div className="dshd-latest-update"><span className="dshd-dot dshd-dot-green" /><p>{runtime?.lastMessage ?? 'Waiting for an assistant update.'}</p></div>
        <span className="dshd-update-caption">{runtime?.lastEvent ?? 'No event'} · {relativeTime(runtime?.lastEventAt)}</span>
      </InspectorSection>
      <InspectorSection title="Tokens">
        <div className="dshd-token-grid">
          <TokenCell label="Total" value={runtime?.tokens.total ?? 0} />
          <TokenCell label="Input" value={(runtime?.tokens.input ?? 0) + (runtime?.tokens.cacheRead ?? 0) + (runtime?.tokens.cacheWrite ?? 0)} />
          <TokenCell label="Output" value={runtime?.tokens.output ?? 0} />
        </div>
      </InspectorSection>
      <InspectorSection title="Recent events" grow>
        <div className="dshd-timeline">
          {(runtime?.recentEvents ?? []).slice(0, 5).map((event, index) => (
            <div className="dshd-timeline-row" key={`${event.type}-${event.at}-${index}`}>
              <span className={`dshd-timeline-node ${index < 2 ? 'dshd-timeline-node-fill' : ''}`} />
              <div><strong>{event.title}</strong>{event.detail !== undefined ? <span>{event.detail}</span> : null}</div>
              <time>{relativeTime(event.at)}</time>
            </div>
          ))}
          {(runtime?.recentEvents.length ?? 0) === 0 ? <span className="dshd-muted">No Agent events yet.</span> : null}
        </div>
      </InspectorSection>
      <footer className="dshd-inspector-actions">
        <button type="button" className="dshd-danger" disabled={runtime?.phase !== 'running'} onClick={() => { void onStop(issueKey(issue)) }}><StopIcon size={14} />Stop agent</button>
        <button type="button" onClick={() => { void onRefresh() }}><RefreshIcon size={16} />Refresh issue</button>
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
  const issue = editor.mode === 'edit' ? editor.issue : undefined
  const [title, setTitle] = useState(issue?.title ?? '')
  const [description, setDescription] = useState(issue?.description ?? '')
  const [state, setState] = useState(issue?.state.name ?? (editor.mode === 'create' ? editor.state : states[0] ?? 'Todo'))
  const [priority, setPriority] = useState(issue?.priority?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
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
      setError(submitError instanceof Error ? submitError.message : String(submitError))
      setSaving(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <form className="dshd-task-editor" role="dialog" aria-modal="true" aria-labelledby="dshd-task-editor-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} onSubmit={event => { void submit(event) }}>
        <header>
          <div><span>Local task</span><h2 id="dshd-task-editor-title">{editor.mode === 'create' ? 'Create task' : `Edit ${editor.issue.identifier}`}</h2></div>
          <button type="button" aria-label="Close task editor" onClick={onClose}><CloseIcon size={18} /></button>
        </header>
        <div className="dshd-editor-fields">
          <label>
            <span>Title</span>
            <input autoFocus required maxLength={500} value={title} onChange={event => setTitle(event.currentTarget.value)} placeholder="What needs to be done?" />
          </label>
          <label>
            <span>Description</span>
            <textarea rows={6} value={description} onChange={event => setDescription(event.currentTarget.value)} placeholder="Add context, acceptance criteria, or a workpad." />
          </label>
          <div className="dshd-editor-row">
            <label>
              <span>State</span>
              <select value={state} onChange={event => setState(event.currentTarget.value)}>
                {states.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select value={priority} onChange={event => setPriority(event.currentTarget.value)}>
                <option value="">No priority</option>
                <option value="1">Urgent</option>
                <option value="2">High</option>
                <option value="3">Medium</option>
                <option value="4">Low</option>
              </select>
            </label>
          </div>
          {error === undefined ? null : <div className="dshd-editor-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="dshd-primary" disabled={saving || trimmedTitle === '' || !hasChanges}>{saving ? 'Saving…' : editor.mode === 'create' ? 'Create task' : 'Save changes'}</button>
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
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const confirm = async (): Promise<void> => {
    setDeleting(true)
    setError(undefined)
    try {
      await onConfirm()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
      setDeleting(false)
    }
  }
  return (
    <div className="dshd-modal" role="presentation">
      <section className="dshd-confirm" role="alertdialog" aria-modal="true" aria-labelledby="dshd-delete-title" aria-describedby="dshd-delete-description" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <header><TrashIcon size={20} /><h2 id="dshd-delete-title">Delete {issue.identifier}?</h2></header>
        <p id="dshd-delete-description">This removes the task from the Host-local task store. Existing Agent workspaces are preserved.</p>
        {error === undefined ? null : <div className="dshd-editor-error" role="alert">{error}</div>}
        <footer>
          <button type="button" onClick={onClose} disabled={deleting}>Cancel</button>
          <button type="button" className="dshd-delete-confirm" onClick={() => { void confirm() }} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete task'}</button>
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
  return <div><span>{label}</span><strong>{value.toLocaleString('en-US')}</strong></div>
}

function RuntimeView({ snapshot, onSelect }: { readonly snapshot?: DashboardSnapshot | undefined; readonly onSelect: (key: string) => void }) {
  const rows = snapshot?.runtime.issues ?? []
  return (
    <div className="dshd-table-view">
      <header><h2>Agent runtime</h2><p>Live workers, retries, blockers, and token usage.</p></header>
      <div className="dshd-runtime-table" role="table" aria-label="Agent runtime">
        <div className="dshd-table-head" role="row"><span>Issue</span><span>Phase</span><span>State</span><span>Turns</span><span>Tokens</span><span>Updated</span></div>
        {rows.map(row => (
          <button type="button" role="row" key={row.key} onClick={() => onSelect(row.key)}>
            <strong>{row.identifier}</strong>
            <span><span className={`dshd-dot dshd-dot-${row.phase === 'running' ? 'green' : row.phase === 'retrying' ? 'amber' : 'red'}`} />{row.phase}</span>
            <span>{row.state}</span><span>{row.turnCount}</span><span>{compactNumber(row.tokens.total)}</span><span>{relativeTime(row.updatedAt)}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="dshd-table-empty">No runtime records.</div> : null}
      </div>
    </div>
  )
}

function ConfigurationView({ snapshot }: { readonly snapshot?: DashboardSnapshot | undefined }) {
  const config = snapshot?.configuration
  return (
    <div className="dshd-config-view">
      <header><h2>Configuration</h2><p>Current last-good workflow and Harness integration boundaries.</p></header>
      <section>
        <h3>Workflow</h3>
        <ConfigRow label="Path" value={config?.workflowPath} mono />
        <ConfigRow label="Loaded" value={relativeTime(config?.workflowLoadedAt)} />
        <ConfigRow label="Polling" value={config?.pollingIntervalMs === undefined ? '—' : `${config.pollingIntervalMs.toLocaleString('en-US')} ms`} />
        <ConfigRow label="Workspace root" value={config?.workspaceRoot} mono />
        {config?.workflowError !== undefined ? <div className="dshd-config-error">Last reload rejected: {config.workflowError}</div> : null}
      </section>
      <section>
        <h3>Tracker</h3>
        <ConfigRow label="Provider" value={config?.trackerKind} />
        <ConfigRow label="Project" value={config?.projectRef} mono />
        {(config?.credentials.length ?? 0) === 0 ? <ConfigRow label="Credentials" value="Not required" /> : config?.credentials.map(credential => (
          <ConfigRow
            key={credential.ref}
            label={credential.label}
            value={`${credential.ref} · ${credential.configured ? `configured (${credential.source ?? 'provider'})` : 'not configured'}`}
            mono
          />
        ))}
        <ConfigRow label="Active states" value={config?.activeStates.join(', ')} />
        <ConfigRow label="Terminal states" value={config?.terminalStates.join(', ')} />
      </section>
      <section>
        <h3>Harness Agent</h3>
        <ConfigRow label="Permission preset" value={config?.permissionPreset} mono />
        <ConfigRow label="Agent preset" value={config?.agentPreset ?? 'Harness default'} mono />
        <ConfigRow label="Concurrency" value={config?.maxConcurrentAgents?.toString()} />
        <ConfigRow label="Maximum turns" value={config?.maxTurns?.toString()} />
      </section>
    </div>
  )
}

function ConfigRow({ label, value, mono = false }: { readonly label: string; readonly value?: string | undefined; readonly mono?: boolean | undefined }) {
  return <div className="dshd-config-row"><span>{label}</span><strong className={mono ? 'dshd-mono' : undefined}>{value === undefined || value === '' ? '—' : value}</strong></div>
}

function runtimeLabel(runtime?: IssueRuntimeView): string {
  if (runtime === undefined) return 'Idle'
  return runtime.phase.slice(0, 1).toLocaleUpperCase('en-US') + runtime.phase.slice(1)
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

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function relativeTime(value?: string): string {
  if (value === undefined) return '—'
  const delta = Date.now() - Date.parse(value)
  if (!Number.isFinite(delta)) return '—'
  if (delta < 0) return 'now'
  const seconds = Math.floor(delta / 1000)
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function elapsed(startedAt?: string): string {
  if (startedAt === undefined) return '—'
  const total = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, '0')
  const seconds = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function countdown(dueAt: string): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(dueAt) - Date.now()) / 1000))
  return `${seconds}s`
}

export function displayInputTokens(tokens: TokenTotals): number {
  return tokens.input + tokens.cacheRead + tokens.cacheWrite
}
