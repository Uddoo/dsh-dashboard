/** Faithful code-native implementation of the approved Dashboard visual specification. */

import {
  memo,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskIssue, TaskIssueOrigin } from '../domain/issue.ts'
import { issueKey } from '../domain/issue.ts'
import type { AddDiscoveryRootInput, DiscoveryRootRecord, ProjectScanResult, ProjectView, RegisterProjectInput } from '../catalog/types.ts'
import type { BoardColumn, DashboardSnapshot, IssueRuntimeView, TokenTotals } from '../runtime/types.ts'
import type { CreateTaskInput, UpdateTaskInput } from '../task-source/index.ts'
import type { DashboardDataPort } from './controller.ts'
import { DashboardUiController } from './controller.ts'
import { dashboardErrorMessage } from './errors.ts'
import { DashboardI18nProvider, useDashboardTranslation } from './i18n.tsx'
import { buildAttentionSummary } from './attention.ts'
import type { AttentionAlert, AttentionSummary } from './attention.ts'
import {
  defaultBoardViewPreferences,
  isDefaultBoardViewPreferences,
  loadBoardViewPreferences,
  saveBoardViewPreferences,
} from './view-preferences.ts'
import type { BoardViewPreferences } from './view-preferences.ts'
import {
  BoardIcon,
  CheckIcon,
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
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
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
          onSwitchProject={projectId => data.switchProject(projectId)}
          onSwitchGlobal={() => data.switchGlobal()}
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
  readonly onSwitchProject: (projectId: string) => Promise<void>
  readonly onSwitchGlobal?: (() => Promise<void>) | undefined
  readonly onAddDiscoveryRoot: (input: AddDiscoveryRootInput) => Promise<void>
  readonly onRemoveDiscoveryRoot: (id: string) => Promise<void>
  readonly onScanProjects: (rootId: string) => Promise<ProjectScanResult>
  readonly onRegisterProjectCandidate: (token: string) => Promise<void>
  readonly onRegisterProject: (input: RegisterProjectInput) => Promise<void>
  readonly onOpenSession: (sessionId: string) => void
}

type Tab = 'board' | 'runtime' | 'projects' | 'configuration'
type RuntimePhaseFilter = Extract<IssueRuntimeView['phase'], 'running' | 'retrying' | 'blocked'>
type RuntimeFilter = RuntimePhaseFilter | 'attention'
type ActionToastState = { readonly tone: 'success' | 'error'; readonly message: string }
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
  onSwitchProject,
  onSwitchGlobal = async () => undefined,
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
  const [displayOpen, setDisplayOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFilter | undefined>()
  const [sourceFilter, setSourceFilter] = useState('all')
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<TaskIssue | undefined>()
  const [catalogDialog, setCatalogDialog] = useState<CatalogDialogState | undefined>()
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [pendingActions, setPendingActions] = useState<ReadonlySet<string>>(() => new Set())
  const [toast, setToast] = useState<ActionToastState | undefined>()
  const [storedViewPreferences, setStoredViewPreferences] = useState(loadBoardViewPreferences)
  const deferredFilter = useDeferredValue(filter.trim().toLocaleLowerCase('en-US'))
  const issueMap = useMemo(() => {
    const map = new Map<string, TaskIssue>()
    for (const column of snapshot?.board.columns ?? []) {
      for (const issue of column.issues) map.set(issueKey(issue), issue)
    }
    return map
  }, [snapshot])
  const runtimeMap = useMemo(() => new Map((snapshot?.runtime.issues ?? []).map(item => [item.key, item])), [snapshot])
  const attention = useMemo(() => buildAttentionSummary(snapshot), [snapshot])
  const selectedIssue = selectedKey === undefined ? undefined : issueMap.get(selectedKey)
  const selectedRuntime = selectedKey === undefined ? undefined : runtimeMap.get(selectedKey)
  const global = snapshot?.selection.mode === 'global'
  const viewScope = global
    ? 'global'
    : `project:${snapshot?.selection.mode === 'project' ? snapshot.selection.projectId ?? snapshot.context?.projectRef ?? 'unknown' : 'unknown'}`
  const viewPreferences = storedViewPreferences[viewScope] ?? defaultBoardViewPreferences
  const columns = useMemo(() => (snapshot?.board.columns ?? []).map(column => ({
    ...column,
    issues: column.issues.filter((issue) => {
      const matchesText = deferredFilter === ''
        || `${issue.identifier} ${issue.title} ${issue.labels.join(' ')} ${issue.origin?.projectName ?? ''} ${issue.origin?.providerLabel ?? ''}`.toLocaleLowerCase('en-US').includes(deferredFilter)
      const matchesRuntime = runtimeFilter === undefined
        || (runtimeFilter === 'attention'
          ? attention.issueKeys.has(issueKey(issue))
          : runtimeMap.get(issueKey(issue))?.phase === runtimeFilter)
      return matchesText && matchesRuntime && matchesSource(issue.origin, sourceFilter)
    }),
  })), [attention.issueKeys, deferredFilter, runtimeFilter, runtimeMap, snapshot, sourceFilter])
  const visibleColumns = columns.filter(column => !column.hidden && (viewPreferences.showEmptyColumns || column.issues.length > 0))
  const hiddenColumns = columns.filter(column => column.hidden && (viewPreferences.showEmptyColumns || column.issues.length > 0))
  const context = snapshot?.context
  const updateViewPreferences = (patch: Partial<BoardViewPreferences>): void => {
    setStoredViewPreferences((current) => {
      const next = { ...current, [viewScope]: { ...viewPreferences, ...patch } }
      saveBoardViewPreferences(next)
      return next
    })
  }
  const resetViewPreferences = (): void => {
    setStoredViewPreferences((current) => {
      const next = { ...current, [viewScope]: defaultBoardViewPreferences }
      saveBoardViewPreferences(next)
      return next
    })
  }
  const isPending = (key: string): boolean => pendingActions.has(key)
  const runAction = async <T,>(
    key: string,
    action: () => Promise<T>,
    successMessage?: string,
    notifyError = true,
  ): Promise<T> => {
    setPendingActions(current => new Set([...current, key]))
    try {
      const result = await action()
      if (successMessage !== undefined) setToast({ tone: 'success', message: successMessage })
      return result
    } catch (actionError) {
      if (notifyError) setToast({ tone: 'error', message: dashboardErrorMessage(actionError, t) })
      throw actionError
    } finally {
      setPendingActions((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }
  useEffect(() => {
    if (toast === undefined) return
    const timeout = window.setTimeout(() => setToast(undefined), 3600)
    return () => window.clearTimeout(timeout)
  }, [toast])
  const clearProjectScopedUi = (): void => {
    setSelectedKey(undefined)
    setTaskEditor(undefined)
    setDeleteTarget(undefined)
    setFilter('')
    setRuntimeFilter(undefined)
    setSourceFilter('all')
  }
  const startProjectScan = async (rootId: string): Promise<void> => {
    setCatalogDialog(undefined)
    setCatalogBusy(true)
    try {
      setCatalogDialog({ kind: 'scan', result: await runAction('catalog:scan', () => onScanProjects(rootId)) })
    } catch {
      // The action toast keeps this transport error next to the active workflow.
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
              <ProjectContextSwitcher
                context={context}
                selection={snapshot?.selection}
                projects={snapshot?.catalog.projects ?? []}
                loading={loading}
                onSwitchProject={projectId => runAction(`switch:${projectId}`, () => onSwitchProject(projectId), t('feedback.projectSwitched'))}
                onSwitchGlobal={() => runAction('switch:global', onSwitchGlobal, t('feedback.globalSwitched'))}
                onSwitched={clearProjectScopedUi}
                onManageProjects={() => setTab('projects')}
              />
            </div>
            <div className="dshd-toolbar">
              {tab === 'configuration' ? null : (
                <>
                  {global && (tab === 'board' || tab === 'runtime') ? (
                    <GlobalSourceFilter
                      projects={snapshot?.catalog.projects ?? []}
                      value={sourceFilter}
                      onChange={(value) => { setSourceFilter(value); setSelectedKey(undefined) }}
                    />
                  ) : null}
                  <div className="dshd-filter-wrap">
                    <button type="button" className="dshd-plain-control" aria-expanded={filterOpen} onClick={() => { setFilterOpen(value => !value); setDisplayOpen(false) }}>
                      <FilterIcon size={17} /><span>{t('shell.filter')}</span>
                    </button>
                    {filterOpen ? (
                      <div className="dshd-filter-popover">
                        <input autoFocus value={filter} onChange={event => setFilter(event.currentTarget.value)} placeholder={tab === 'projects' ? t('shell.filterProjects') : t('shell.filterIssues')} aria-label={tab === 'projects' ? t('shell.filterProjects') : t('shell.filterIssues')} />
                        {filter !== '' ? <button type="button" onClick={() => setFilter('')}>{t('common.clear')}</button> : null}
                      </div>
                    ) : null}
                  </div>
                  {tab === 'board' ? (
                    <div className="dshd-display-wrap">
                      <button
                        type="button"
                        className="dshd-plain-control"
                        data-active={!isDefaultBoardViewPreferences(viewPreferences) || displayOpen || undefined}
                        aria-haspopup="dialog"
                        aria-expanded={displayOpen}
                        onClick={() => { setDisplayOpen(value => !value); setFilterOpen(false) }}
                      >
                        <DisplayIcon size={18} /><span>{t('shell.display')}</span>
                      </button>
                      {displayOpen ? (
                        <DisplaySettings
                          preferences={viewPreferences}
                          onChange={updateViewPreferences}
                          onReset={resetViewPreferences}
                          onClose={() => setDisplayOpen(false)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              <div className="dshd-live-control" role="group" aria-label={tab === 'projects' || global ? t('shell.dashboardModeAria') : t('shell.agentCapacityAria')}>
                {tab === 'projects' || global ? <MonitorIcon size={17} /> : <span className="dshd-dot dshd-dot-green" />}
                <span>{tab === 'projects'
                  ? t('shell.currentWorkspace')
                  : `${snapshot?.paused ? t('shell.paused') : t('shell.live')} · ${t('shell.agents', { running: snapshot?.runtime.running ?? 0, capacity: snapshot?.runtime.capacity ?? 0 })}`}</span>
              </div>
              {global ? null : <button
                type="button"
                className="dshd-pause-control"
                disabled={loading || snapshot === undefined || isPending('pause')}
                aria-busy={isPending('pause')}
                onClick={() => { void runAction(
                  'pause',
                  () => onPause(!(snapshot?.paused ?? false)),
                  snapshot?.paused ? t('feedback.resumed') : t('feedback.paused'),
                ).catch(() => undefined) }}
              >
                {snapshot?.paused ? <PlayIcon size={15} className={isPending('pause') ? 'dshd-spinning' : undefined} /> : <PauseIcon size={15} className={isPending('pause') ? 'dshd-pulsing' : undefined} />}
                <span>{snapshot?.paused ? t('shell.resume') : t('shell.pause')}</span>
              </button>}
            </div>
          </div>
          <nav className="dshd-tabs" aria-label={t('shell.viewsAria')}>
            <TabButton active={tab === 'board'} onClick={() => setTab('board')}>{t('tab.board')}</TabButton>
            <TabButton active={tab === 'runtime'} onClick={() => setTab('runtime')}>{t('tab.runtime')}</TabButton>
            <TabButton active={tab === 'projects'} onClick={() => setTab('projects')}>{t('tab.projects')}</TabButton>
            <TabButton active={tab === 'configuration'} onClick={() => setTab('configuration')}>{t('tab.configuration')}</TabButton>
          </nav>
        </header>

        {tab !== 'board' && tab !== 'runtime' ? null : (
          <RuntimeRail
            snapshot={snapshot}
            refreshPending={loading || isPending('refresh')}
            filter={runtimeFilter}
            attention={attention}
            onFilterChange={(nextFilter) => {
              setRuntimeFilter(nextFilter)
              setSelectedKey(undefined)
              setTab('board')
            }}
            onRefresh={() => runAction('refresh', onRefresh, t('feedback.refreshed'))}
          />
        )}
        <DashboardErrorNotice error={error} className="dshd-error" />
        {snapshot?.runtime.lastError !== undefined && runtimeFilter !== 'attention' ? <div className="dshd-warning" role="status">{snapshot.runtime.lastError}</div> : null}

        <div className="dshd-view">
          {tab === 'board' && runtimeFilter === 'attention' && attention.alerts.length > 0 ? <AttentionAlerts alerts={attention.alerts} /> : null}
          {tab === 'board' ? (
            viewPreferences.layout === 'board' ? (
              <BoardView
                columns={visibleColumns}
                hiddenColumns={hiddenColumns}
                showHidden={viewPreferences.showTerminalColumns && selectedIssue === undefined}
                selectedKey={selectedKey}
                runtimeMap={runtimeMap}
                preferences={viewPreferences}
                attentionMode={runtimeFilter === 'attention'}
                onSelect={setSelectedKey}
                onCreate={snapshot?.taskMutations.canCreate === true ? state => setTaskEditor({ mode: 'create', state }) : undefined}
                emptyLabel={global ? t('board.globalEmpty') : t('board.empty')}
              />
            ) : (
              <BoardListView
                columns={viewPreferences.showTerminalColumns ? [...visibleColumns, ...hiddenColumns] : visibleColumns}
                selectedKey={selectedKey}
                runtimeMap={runtimeMap}
                preferences={viewPreferences}
                attentionMode={runtimeFilter === 'attention'}
                onSelect={setSelectedKey}
                onCreate={snapshot?.taskMutations.canCreate === true ? state => setTaskEditor({ mode: 'create', state }) : undefined}
                emptyLabel={global ? t('board.globalEmpty') : t('board.empty')}
              />
            )
          ) : null}
          {tab === 'runtime' ? <RuntimeView snapshot={snapshot} sourceFilter={sourceFilter} onSelect={(key) => { setSelectedKey(key); setTab('board') }} /> : null}
          {tab === 'projects' ? (
            <ProjectsView
              snapshot={snapshot}
              filter={deferredFilter}
              showRoots
              busy={loading || catalogBusy}
              isRemoveRootPending={id => isPending(`catalog:remove-root:${id}`)}
              onAddRoot={() => setCatalogDialog({ kind: 'add-root' })}
              onRemoveRoot={id => runAction(`catalog:remove-root:${id}`, () => onRemoveDiscoveryRoot(id), t('feedback.rootRemoved'))}
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
          onRefresh={() => runAction('refresh', onRefresh, t('feedback.refreshed'))}
          refreshPending={isPending('refresh')}
          onStop={key => runAction(`stop:${key}`, () => onStop(key), t('feedback.agentStopped'))}
          stopPending={isPending(`stop:${issueKey(selectedIssue)}`)}
          canUpdate={snapshot?.taskMutations.canUpdate === true}
          canDelete={snapshot?.taskMutations.canDelete === true}
          onEdit={() => setTaskEditor({ mode: 'edit', issue: selectedIssue })}
          onDelete={() => setDeleteTarget(selectedIssue)}
          onOpenSession={onOpenSession}
          enterProjectPending={selectedIssue.origin !== undefined && isPending(`switch:${selectedIssue.origin.projectId}`)}
          onEnterProject={selectedIssue.origin === undefined ? undefined : async () => {
            await runAction(`switch:${selectedIssue.origin!.projectId}`, () => onSwitchProject(selectedIssue.origin!.projectId), t('feedback.projectSwitched'))
            clearProjectScopedUi()
          }}
        />
      ) : null}
      {taskEditor !== undefined ? (
        <TaskEditor
          editor={taskEditor}
          states={snapshot?.taskMutations.states ?? []}
          onClose={() => setTaskEditor(undefined)}
          onCreate={async (input) => { await runAction('task:create', () => onCreateTask(input), t('feedback.taskCreated'), false); setTaskEditor(undefined) }}
          onUpdate={async (nativeRef, changes) => { await runAction(`task:update:${nativeRef}`, () => onUpdateTask(nativeRef, changes), t('feedback.taskUpdated'), false); setTaskEditor(undefined) }}
        />
      ) : null}
      {deleteTarget !== undefined ? (
        <DeleteTaskDialog
          issue={deleteTarget}
          onClose={() => setDeleteTarget(undefined)}
          onConfirm={async () => {
            await runAction(`task:delete:${deleteTarget.nativeRef}`, () => onDeleteTask(deleteTarget.nativeRef), t('feedback.taskDeleted'), false)
            setDeleteTarget(undefined)
            setSelectedKey(undefined)
          }}
        />
      ) : null}
      {catalogDialog?.kind === 'add-root' ? (
        <DiscoveryRootDialog
          onClose={() => setCatalogDialog(undefined)}
          onSubmit={async (input) => { await runAction('catalog:add-root', () => onAddDiscoveryRoot(input), t('feedback.rootAdded'), false); setCatalogDialog(undefined) }}
        />
      ) : null}
      {catalogDialog?.kind === 'register-project' ? (
        <RegisterProjectDialog
          onClose={() => setCatalogDialog(undefined)}
          onSubmit={async (input) => { await runAction('catalog:register-project', () => onRegisterProject(input), t('feedback.projectRegistered'), false); setCatalogDialog(undefined) }}
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
          onRegister={token => runAction(`catalog:register-candidate:${token}`, () => onRegisterProjectCandidate(token), t('feedback.projectRegistered'), false)}
        />
      ) : null}
      {toast === undefined ? null : <ActionToast toast={toast} onClose={() => setToast(undefined)} />}
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

function ProjectContextSwitcher({
  context,
  selection,
  projects,
  loading,
  onSwitchProject,
  onSwitchGlobal,
  onSwitched,
  onManageProjects,
}: {
  readonly context?: DashboardSnapshot['context'] | undefined
  readonly selection?: DashboardSnapshot['selection'] | undefined
  readonly projects: readonly ProjectView[]
  readonly loading: boolean
  readonly onSwitchProject: (projectId: string) => Promise<void>
  readonly onSwitchGlobal: () => Promise<void>
  readonly onSwitched: () => void
  readonly onManageProjects: () => void
}) {
  const t = useDashboardTranslation()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [switchingProjectId, setSwitchingProjectId] = useState<string | undefined>()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const normalizedFilter = filter.trim().toLocaleLowerCase('en-US')
  const visibleProjects = useMemo(() => projects.filter((project) => {
    if (normalizedFilter === '') return true
    return [project.name, project.root, project.trackerKind, project.contextLabel]
      .filter((value): value is string => value !== undefined)
      .some(value => value.toLocaleLowerCase('en-US').includes(normalizedFilter))
  }), [normalizedFilter, projects])
  const globalVisible = normalizedFilter === ''
    || `${t('context.globalLabel')} ${t('context.allProjects')}`.toLocaleLowerCase('en-US').includes(normalizedFilter)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
        setFilter('')
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
      setFilter('')
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const chooseProject = async (project: ProjectView): Promise<void> => {
    if (project.currentWorkspace || switchingProjectId !== undefined) return
    setSwitchingProjectId(project.id)
    try {
      await onSwitchProject(project.id)
      setOpen(false)
      setFilter('')
      onSwitched()
    } catch {
      // The shared controller keeps the trusted Host error visible above the view.
    } finally {
      setSwitchingProjectId(undefined)
    }
  }

  const chooseGlobal = async (): Promise<void> => {
    if (selection?.mode === 'global' || switchingProjectId !== undefined || projects.length === 0) return
    setSwitchingProjectId('global')
    try {
      await onSwitchGlobal()
      setOpen(false)
      setFilter('')
      onSwitched()
    } catch {
      // The shared controller keeps the trusted Host error visible above the view.
    } finally {
      setSwitchingProjectId(undefined)
    }
  }

  const global = selection?.mode === 'global'
  const currentProvider = global
    ? t('context.globalLabel')
    : providerLabel(context?.kind, context?.providerLabel ?? 'Linear', t) ?? t('context.unavailable')
  return (
    <div className="dshd-context-wrap" ref={rootRef}>
      <button
        type="button"
        className="dshd-context"
        data-open={open || undefined}
        aria-label={t('shell.currentSourceAria')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
      >
        <span>{currentProvider}</span>
        <span aria-hidden>·</span>
        <span>{global ? t('context.allProjects') : context?.projectLabel ?? '—'}</span>
        <ChevronIcon size={14} />
      </button>
      {open ? (
        <section id={menuId} className="dshd-context-popover" role="dialog" aria-label={t('context.switcherAria')}>
          <header>
            <strong>{t('context.title')}</strong>
            <span>{t('context.description')}</span>
          </header>
          <label className="dshd-context-search">
            <SearchIcon size={16} />
            <input
              autoFocus
              value={filter}
              onChange={event => setFilter(event.currentTarget.value)}
              placeholder={t('context.searchPlaceholder')}
              aria-label={t('context.searchAria')}
            />
            {filter === '' ? null : (
              <button type="button" aria-label={t('context.clearSearchAria')} onClick={() => setFilter('')}>
                <CloseIcon size={14} />
              </button>
            )}
          </label>
          <div className="dshd-context-list" role="listbox" aria-label={t('context.projectsAria')}>
            {globalVisible ? (
              <button
                type="button"
                className="dshd-context-option dshd-context-option-global"
                role="option"
                aria-selected={global}
                data-current={global || undefined}
                disabled={loading || switchingProjectId !== undefined || global || projects.length === 0}
                onClick={() => { void chooseGlobal() }}
              >
                <span className="dshd-context-option-main">
                  <span className="dshd-context-option-title">
                    <strong>{t('context.allProjects')}</strong>
                    {global ? <span className="dshd-context-current">{t('context.current')}</span> : null}
                    {switchingProjectId === 'global' ? <span className="dshd-context-switching">{t('context.switching')}</span> : null}
                  </span>
                  <span className="dshd-context-option-meta">{t('context.globalDescription')}</span>
                  <span className="dshd-context-option-path">{t('context.globalReady', { ready: projects.filter(project => project.configurationState === 'ready').length, total: projects.length })}</span>
                </span>
                <span className="dshd-context-option-check" aria-hidden>{global ? <CheckIcon size={17} /> : null}</span>
              </button>
            ) : null}
            {visibleProjects.map((project) => {
              const projectProvider = providerLabel(project.trackerKind, project.trackerKind, t) ?? t('context.unavailable')
              const busy = switchingProjectId === project.id
              return (
                <button
                  type="button"
                  className="dshd-context-option"
                  key={project.id}
                  role="option"
                  aria-selected={project.currentWorkspace}
                  data-current={project.currentWorkspace || undefined}
                  data-invalid={project.configurationState === 'invalid' || undefined}
                  disabled={loading || switchingProjectId !== undefined || project.currentWorkspace}
                  onClick={() => { void chooseProject(project) }}
                >
                  <span className="dshd-context-option-main">
                    <span className="dshd-context-option-title">
                      <strong>{project.name}</strong>
                      {project.currentWorkspace ? <span className="dshd-context-current">{t('context.current')}</span> : null}
                      {busy ? <span className="dshd-context-switching">{t('context.switching')}</span> : null}
                    </span>
                    <span className="dshd-context-option-meta">
                      {projectProvider}
                      {project.contextLabel === undefined ? null : <><span aria-hidden>·</span>{project.contextLabel}</>}
                    </span>
                    <span className="dshd-context-option-path" title={project.root}>{project.root}</span>
                    {project.configurationState === 'invalid' ? (
                      <span className="dshd-context-invalid" title={project.configurationError}>
                        {t('context.invalidConfiguration')}
                      </span>
                    ) : null}
                    {(project.runningAgents ?? 0) + (project.retryingAgents ?? 0) > 0 ? (
                      <span className="dshd-context-activity">
                        {project.runningAgents === undefined || project.runningAgents === 0
                          ? null
                          : t('context.runningAgents', { count: project.runningAgents })}
                        {project.retryingAgents === undefined || project.retryingAgents === 0
                          ? null
                          : t('context.retryingAgents', { count: project.retryingAgents })}
                      </span>
                    ) : null}
                  </span>
                  <span className="dshd-context-option-check" aria-hidden>
                    {project.currentWorkspace ? <CheckIcon size={17} /> : null}
                  </span>
                </button>
              )
            })}
            {visibleProjects.length === 0 && !globalVisible ? <p className="dshd-context-empty">{t('context.noResults')}</p> : null}
          </div>
          <footer>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setFilter('')
                onManageProjects()
              }}
            >
              <FolderIcon size={16} />
              <span>{t('context.manageProjects')}</span>
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  )
}

function TabButton({ active, children, onClick }: { readonly active: boolean; readonly children: string; readonly onClick: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (!active) return
    const revealActiveTab = () => {
      const button = buttonRef.current
      const tabs = button?.parentElement
      if (!button || !tabs) return
      const visibleLeft = tabs.scrollLeft
      const visibleRight = visibleLeft + tabs.clientWidth
      const buttonLeft = button.offsetLeft
      const buttonRight = buttonLeft + button.offsetWidth
      if (buttonLeft < visibleLeft) tabs.scrollLeft = Math.max(0, buttonLeft - 16)
      else if (buttonRight > visibleRight) tabs.scrollLeft = buttonRight - tabs.clientWidth + 16
    }
    revealActiveTab()
    window.addEventListener('resize', revealActiveTab)
    return () => window.removeEventListener('resize', revealActiveTab)
  }, [active])
  return <button ref={buttonRef} type="button" aria-current={active ? 'page' : undefined} data-active={active || undefined} onClick={onClick}>{children}</button>
}

function GlobalSourceFilter({ projects, value, onChange }: {
  readonly projects: readonly ProjectView[]
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  const t = useDashboardTranslation()
  const providers = useMemo(() => [...new Set(projects
    .map(project => project.trackerKind)
    .filter((kind): kind is string => kind !== undefined))]
    .toSorted((left, right) => left.localeCompare(right, 'en-US')), [projects])
  return (
    <label className="dshd-source-filter">
      <FilterIcon size={15} />
      <select value={value} aria-label={t('shell.sourceFilterAria')} onChange={event => onChange(event.currentTarget.value)}>
        <option value="all">{t('shell.allSources')}</option>
        {providers.length === 0 ? null : <optgroup label={t('shell.providers')}>
          {providers.map(kind => <option key={kind} value={`provider:${kind}`}>{providerLabel(kind, kind, t)}</option>)}
        </optgroup>}
        <optgroup label={t('shell.projects')}>
          {projects.map(project => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}
        </optgroup>
      </select>
      <ChevronIcon size={12} />
    </label>
  )
}

function DisplaySettings({ preferences, onChange, onReset, onClose }: {
  readonly preferences: BoardViewPreferences
  readonly onChange: (patch: Partial<BoardViewPreferences>) => void
  readonly onReset: () => void
  readonly onClose: () => void
}) {
  const t = useDashboardTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Element && event.target.closest('.dshd-display-wrap') !== null) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])
  return (
    <section ref={panelRef} className="dshd-display-popover" role="dialog" aria-labelledby={titleId}>
      <header><strong id={titleId}>{t('display.title')}</strong><button type="button" aria-label={t('common.close')} onClick={onClose}><CloseIcon size={16} /></button></header>
      <DisplaySegment
        label={t('display.layout')}
        options={[{ value: 'board', label: t('display.board') }, { value: 'list', label: t('display.list') }]}
        value={preferences.layout}
        onChange={layout => onChange({ layout })}
      />
      <DisplaySegment
        label={t('display.density')}
        options={[{ value: 'comfortable', label: t('display.comfortable') }, { value: 'compact', label: t('display.compact') }]}
        value={preferences.density}
        onChange={density => onChange({ density })}
      />
      <fieldset>
        <legend>{t('display.groups')}</legend>
        <DisplayToggle checked={preferences.showTerminalColumns} label={t('display.terminalColumns')} onChange={showTerminalColumns => onChange({ showTerminalColumns })} />
        <DisplayToggle checked={preferences.showEmptyColumns} label={t('display.emptyColumns')} onChange={showEmptyColumns => onChange({ showEmptyColumns })} />
      </fieldset>
      <fieldset>
        <legend>{t('display.cardProperties')}</legend>
        <DisplayToggle checked={preferences.showOrigin} label={t('display.origin')} onChange={showOrigin => onChange({ showOrigin })} />
        <DisplayToggle checked={preferences.showUpdatedAt} label={t('display.updatedAt')} onChange={showUpdatedAt => onChange({ showUpdatedAt })} />
        <DisplayToggle checked={preferences.showRuntime} label={t('display.runtime')} onChange={showRuntime => onChange({ showRuntime })} />
      </fieldset>
      <footer><button type="button" disabled={isDefaultBoardViewPreferences(preferences)} onClick={onReset}>{t('display.reset')}</button><span>{t('display.savedPerContext')}</span></footer>
    </section>
  )
}

function DisplaySegment<T extends string>({ label, options, value, onChange }: {
  readonly label: string
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly value: T
  readonly onChange: (value: T) => void
}) {
  return (
    <div className="dshd-display-section">
      <span>{label}</span>
      <div className="dshd-display-segment">
        {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
      </div>
    </div>
  )
}

function DisplayToggle({ checked, label, onChange }: {
  readonly checked: boolean
  readonly label: string
  readonly onChange: (value: boolean) => void
}) {
  return <label className="dshd-display-toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.currentTarget.checked)} /></label>
}

function RuntimeRail({ snapshot, refreshPending, filter, attention, onFilterChange, onRefresh }: {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly refreshPending: boolean
  readonly filter?: RuntimeFilter | undefined
  readonly attention: AttentionSummary
  readonly onFilterChange: (filter: RuntimeFilter | undefined) => void
  readonly onRefresh: () => Promise<void>
}) {
  const t = useDashboardTranslation()
  return (
    <div className="dshd-runtime-rail" role="toolbar" aria-label={t('runtime.filtersAria')}>
      <RuntimeFilterMetric
        filter="attention"
        dot="red"
        label={t('runtime.attention')}
        value={attention.count}
        active={filter === 'attention'}
        onToggle={onFilterChange}
      />
      <span className="dshd-divider" />
      <RuntimeFilterMetric
        filter="running"
        dot="green"
        label={t('runtime.running')}
        value={snapshot?.runtime.running ?? 0}
        active={filter === 'running'}
        onToggle={onFilterChange}
      />
      <span className="dshd-divider" />
      <RuntimeFilterMetric
        filter="retrying"
        dot="amber"
        label={t('runtime.retrying')}
        value={snapshot?.runtime.retrying ?? 0}
        active={filter === 'retrying'}
        onToggle={onFilterChange}
      />
      <span className="dshd-divider" />
      <RuntimeFilterMetric
        filter="blocked"
        dot="red"
        label={t('runtime.blocked')}
        value={snapshot?.runtime.blocked ?? 0}
        active={filter === 'blocked'}
        onToggle={onFilterChange}
      />
      <span className="dshd-divider" />
      <span>{t('runtime.tokens')}&nbsp;&nbsp;{compactNumber(snapshot?.runtime.tokens.total ?? 0, t)}</span>
      <span className="dshd-divider" />
      <span>{t('runtime.lastRefresh')}&nbsp;&nbsp;{relativeTime(snapshot?.runtime.lastRefreshAt, t)}</span>
      <button type="button" className="dshd-icon-button" aria-label={t('runtime.refreshDashboardAria')} aria-busy={refreshPending} disabled={refreshPending} onClick={() => { void onRefresh().catch(() => undefined) }}>
        <RefreshIcon size={15} className={refreshPending ? 'dshd-spinning' : undefined} />
      </button>
    </div>
  )
}

function RuntimeFilterMetric({ filter, dot, label, value, active, onToggle }: {
  readonly filter: RuntimeFilter
  readonly dot: 'green' | 'amber' | 'red'
  readonly label: string
  readonly value: number
  readonly active: boolean
  readonly onToggle: (filter: RuntimeFilter | undefined) => void
}) {
  const t = useDashboardTranslation()
  const actionLabel = filter === 'attention'
    ? t(active ? 'runtime.clearAttentionFilterAria' : 'runtime.filterByAttentionAria')
    : t(active ? 'runtime.clearPhaseFilterAria' : 'runtime.filterByPhaseAria', { phase: label })
  return (
    <button
      type="button"
      className="dshd-metric dshd-metric-filter"
      data-active={active || undefined}
      aria-pressed={active}
      aria-label={actionLabel}
      title={actionLabel}
      onClick={() => onToggle(active ? undefined : filter)}
    >
      <span className={`dshd-dot dshd-dot-${dot}`} />
      <span>{label}&nbsp;&nbsp;{value}</span>
    </button>
  )
}

function Metric({ dot, label, value }: {
  readonly dot: 'green' | 'amber' | 'red' | 'gray'
  readonly label: string
  readonly value?: number | undefined
}) {
  return (
    <span className="dshd-metric">
      <span className={`dshd-dot dshd-dot-${dot}`} />
      {label}{value === undefined ? null : <>&nbsp;&nbsp;{value}</>}
    </span>
  )
}

function AttentionAlerts({ alerts }: { readonly alerts: readonly AttentionAlert[] }) {
  const t = useDashboardTranslation()
  return (
    <section className="dshd-attention-alerts" aria-labelledby="dshd-attention-title">
      <header><span className="dshd-dot dshd-dot-red" /><div><strong id="dshd-attention-title">{t('attention.title')}</strong><span>{t('attention.description')}</span></div></header>
      <div>
        {alerts.map(alert => (
          <article key={alert.id} data-kind={alert.kind}>
            <strong>{alert.kind === 'configuration' ? t('attention.configuration') : alert.kind === 'stale' ? t('attention.stale') : t('attention.runtime')}</strong>
            <span>{alert.projectName === undefined ? null : <b>{alert.projectName} · </b>}{alert.kind === 'stale' ? t('attention.staleDetail', { time: relativeTime(alert.detail, t) }) : alert.detail}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

function BoardView({ columns, hiddenColumns, showHidden, selectedKey, runtimeMap, preferences, attentionMode, onSelect, onCreate, emptyLabel }: {
  readonly columns: readonly BoardColumn[]
  readonly hiddenColumns: readonly BoardColumn[]
  readonly showHidden: boolean
  readonly selectedKey?: string | undefined
  readonly runtimeMap: ReadonlyMap<string, IssueRuntimeView>
  readonly preferences: BoardViewPreferences
  readonly attentionMode: boolean
  readonly onSelect: (key: string) => void
  readonly onCreate: ((state: string) => void) | undefined
  readonly emptyLabel: string
}) {
  return (
    <div className="dshd-board" data-density={preferences.density}>
      <div className="dshd-columns">
        {columns.map(column => (
          <IssueColumn key={column.name} column={column} selectedKey={selectedKey} runtimeMap={runtimeMap} preferences={preferences} attentionMode={attentionMode} onSelect={onSelect} onCreate={onCreate} />
        ))}
        {showHidden && hiddenColumns.length > 0 ? <HiddenColumns columns={hiddenColumns} /> : null}
        {columns.length === 0 || columns.every(column => column.issues.length === 0) ? <div className="dshd-empty">{emptyLabel}</div> : null}
      </div>
    </div>
  )
}

const IssueColumn = memo(function IssueColumn({ column, selectedKey, runtimeMap, preferences, attentionMode, onSelect, onCreate }: {
  readonly column: BoardColumn
  readonly selectedKey?: string | undefined
  readonly runtimeMap: ReadonlyMap<string, IssueRuntimeView>
  readonly preferences: BoardViewPreferences
  readonly attentionMode: boolean
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
            preferences={preferences}
            attentionMode={attentionMode}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
})

const IssueCard = memo(function IssueCard({ issue, runtime, selected, preferences, attentionMode, onSelect }: {
  readonly issue: TaskIssue
  readonly runtime?: IssueRuntimeView | undefined
  readonly selected: boolean
  readonly preferences: BoardViewPreferences
  readonly attentionMode: boolean
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
        {!preferences.showOrigin || issue.origin === undefined ? null : (
          <span className="dshd-card-origin" title={`${issue.origin.projectName} · ${issue.origin.providerLabel}`}>
            {issue.origin.providerLabel}<span aria-hidden>·</span>{issue.origin.projectName}
          </span>
        )}
        <strong>{issue.title}</strong>
        {preferences.showUpdatedAt ? <span className="dshd-updated">{t('board.updated', { time: relativeTime(issue.updatedAt, t) })}</span> : null}
      </div>
      {attentionMode && runtime?.phase === 'blocked' ? (
        <div className="dshd-card-attention" title={runtime.blocked?.reason}>
          <span className="dshd-dot dshd-dot-red" />
          <span>{runtime.blocked?.reason ?? t('runtime.blocked')}</span>
        </div>
      ) : preferences.showRuntime && runtime !== undefined && runtime.phase !== 'blocked' ? (
        <div className="dshd-card-runtime">
          <span className={`dshd-dot dshd-dot-${runtime.phase === 'running' ? 'green' : 'amber'}`} />
          <span>{t('runtime.turn', { count: runtime.turnCount })}</span>
          <span className="dshd-divider" />
          <span>{elapsed(runtime.startedAt)}</span>
          <span>{t('runtime.tokenCount', { count: compactNumber(runtime.tokens.total, t) })}</span>
          {runtime.retry !== undefined ? <span className="dshd-retry-label">{t('runtime.retryIn', { time: countdown(runtime.retry.dueAt, t) })}</span> : null}
        </div>
      ) : null}
    </button>
  )
})

function BoardListView({ columns, selectedKey, runtimeMap, preferences, attentionMode, onSelect, onCreate, emptyLabel }: {
  readonly columns: readonly BoardColumn[]
  readonly selectedKey?: string | undefined
  readonly runtimeMap: ReadonlyMap<string, IssueRuntimeView>
  readonly preferences: BoardViewPreferences
  readonly attentionMode: boolean
  readonly onSelect: (key: string) => void
  readonly onCreate: ((state: string) => void) | undefined
  readonly emptyLabel: string
}) {
  const t = useDashboardTranslation()
  const empty = columns.length === 0 || columns.every(column => column.issues.length === 0)
  return (
    <div className="dshd-board-list" data-density={preferences.density}>
      {columns.map(column => (
        <section className="dshd-board-list-group" key={column.name}>
          <header>
            <span className="dshd-state-ring" style={{ '--dshd-state': stateColor(column.name, column.type, column.color) } as React.CSSProperties} />
            <strong>{column.name}</strong>
            <span>{column.issues.length}</span>
            {onCreate === undefined ? null : (
              <button type="button" aria-label={t('board.addTaskAria', { state: column.name })} onClick={() => onCreate(column.name)}><PlusIcon size={16} /></button>
            )}
          </header>
          <div>
            {column.issues.map((issue) => {
              const key = issueKey(issue)
              const runtime = runtimeMap.get(key)
              return (
                <button type="button" className="dshd-board-list-row" data-selected={selectedKey === key || undefined} key={key} onClick={() => onSelect(key)}>
                  <span className="dshd-priority-ring" data-priority={priorityTone(issue.priority)} />
                  <span className="dshd-board-list-id">{issue.identifier}</span>
                  <strong>{issue.title}</strong>
                  {!preferences.showOrigin || issue.origin === undefined ? null : <span className="dshd-board-list-origin">{issue.origin.providerLabel} · {issue.origin.projectName}</span>}
                  {preferences.showRuntime && runtime !== undefined ? (
                    <span className="dshd-board-list-runtime" title={runtime.blocked?.reason ?? runtime.retry?.error}>
                      <span className={`dshd-dot dshd-dot-${runtime.phase === 'running' ? 'green' : runtime.phase === 'retrying' ? 'amber' : 'red'}`} />
                      {attentionMode && runtime.phase === 'blocked' ? runtime.blocked?.reason ?? t('runtime.blocked') : runtimePhaseLabel(runtime.phase, t)}
                    </span>
                  ) : null}
                  {preferences.showUpdatedAt ? <span className="dshd-updated">{relativeTime(issue.updatedAt, t)}</span> : null}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {empty ? <div className="dshd-empty">{emptyLabel}</div> : null}
    </div>
  )
}

function HiddenColumns({ columns }: { readonly columns: readonly BoardColumn[] }) {
  const t = useDashboardTranslation()
  const [expanded, setExpanded] = useState(true)
  const listId = useId()
  const toggleLabel = t(expanded ? 'board.collapseHiddenColumnsAria' : 'board.expandHiddenColumnsAria')
  return (
    <aside className="dshd-hidden-columns" data-collapsed={!expanded || undefined}>
      <header>
        <button
          type="button"
          className="dshd-hidden-columns-toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setExpanded(value => !value)}
        >
          <ChevronIcon size={14} />
          <strong>{t('board.hiddenColumns')}</strong>
        </button>
      </header>
      <div id={listId} className="dshd-hidden-column-list" hidden={!expanded}>
        {columns.map(column => (
          <div className="dshd-hidden-column-row" key={column.name}>
            <span className="dshd-state-ring" style={{ '--dshd-state': stateColor(column.name, column.type, column.color) } as React.CSSProperties} />
            <span>{column.name}</span><span>{column.issues.length}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function IssueInspector({ issue, runtime, onClose, onRefresh, refreshPending, onStop, stopPending, canUpdate, canDelete, onEdit, onDelete, onOpenSession, enterProjectPending, onEnterProject }: {
  readonly issue: TaskIssue
  readonly runtime?: IssueRuntimeView | undefined
  readonly onClose: () => void
  readonly onRefresh: () => Promise<void>
  readonly refreshPending: boolean
  readonly onStop: (key: string) => Promise<void>
  readonly stopPending: boolean
  readonly canUpdate: boolean
  readonly canDelete: boolean
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onOpenSession: (sessionId: string) => void
  readonly enterProjectPending: boolean
  readonly onEnterProject?: (() => Promise<void>) | undefined
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
      {issue.origin === undefined ? null : (
        <InspectorSection title={t('inspector.source')}>
          <InspectorRow label={t('inspector.project')}><span>{issue.origin.projectName}</span></InspectorRow>
          <InspectorRow label={t('inspector.provider')}><span>{issue.origin.providerLabel} · {issue.origin.contextLabel}</span></InspectorRow>
          <InspectorRow label={t('inspector.rawState')}><span>{issue.state.name}</span></InspectorRow>
        </InspectorSection>
      )}
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
        {onEnterProject === undefined
          ? <button type="button" className="dshd-danger" disabled={runtime?.phase !== 'running' || stopPending} aria-busy={stopPending} onClick={() => { void onStop(issueKey(issue)).catch(() => undefined) }}><StopIcon size={14} />{t('inspector.stopAgent')}</button>
          : <button type="button" className="dshd-primary" disabled={enterProjectPending} aria-busy={enterProjectPending} onClick={() => { void onEnterProject().catch(() => undefined) }}><ExternalIcon size={14} />{t('inspector.enterProject')}</button>}
        <button type="button" disabled={refreshPending} aria-busy={refreshPending} onClick={() => { void onRefresh().catch(() => undefined) }}><RefreshIcon size={16} className={refreshPending ? 'dshd-spinning' : undefined} />{t('inspector.refreshIssue')}</button>
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

function RuntimeView({ snapshot, sourceFilter, onSelect }: {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly sourceFilter: string
  readonly onSelect: (key: string) => void
}) {
  const t = useDashboardTranslation()
  const rows = (snapshot?.runtime.issues ?? []).filter(row => matchesSource(row.origin, sourceFilter))
  return (
    <div className="dshd-table-view">
      <header><h2>{t('runtime.title')}</h2><p>{t('runtime.description')}</p></header>
      <div className="dshd-runtime-table" role="table" aria-label={t('runtime.tableAria')}>
        <div className="dshd-table-head" role="row"><span>{t('runtime.issue')}</span><span>{t('runtime.phase')}</span><span>{t('runtime.state')}</span><span>{t('runtime.turns')}</span><span>{t('runtime.tokens')}</span><span>{t('runtime.updated')}</span></div>
        {rows.map(row => (
          <button type="button" role="row" key={row.key} onClick={() => onSelect(row.key)}>
            <strong>{row.identifier}{row.origin === undefined ? null : <small>{row.origin.providerLabel} · {row.origin.projectName}</small>}</strong>
            <span><span className={`dshd-dot dshd-dot-${row.phase === 'running' ? 'green' : row.phase === 'retrying' ? 'amber' : 'red'}`} />{runtimePhaseLabel(row.phase, t)}</span>
            <span>{row.state}</span><span>{row.turnCount}</span><span>{compactNumber(row.tokens.total, t)}</span><span>{relativeTime(row.updatedAt, t)}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="dshd-table-empty">{t('runtime.empty')}</div> : null}
      </div>
    </div>
  )
}

function ProjectsView({ snapshot, filter, showRoots, busy, isRemoveRootPending, onAddRoot, onRemoveRoot, onScanRoots, onScan, onRegister }: {
  readonly snapshot?: DashboardSnapshot | undefined
  readonly filter: string
  readonly showRoots: boolean
  readonly busy: boolean
  readonly isRemoveRootPending: (id: string) => boolean
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
            <span>{t('projects.project')}</span><span>{t('projects.workspace')}</span><span>{t('projects.repository')}</span><span>{t('projects.policy')}</span><span>{t('projects.autonomousClaims')}</span><span>{t('runtime.updated')}</span>
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
              </div>
            )
          })}
          {projects.length === 0 ? <div className="dshd-table-empty">{t('projects.empty')}</div> : null}
        </div>
      </div>
      {showRoots ? (
        <section className="dshd-discovery-roots">
          <header><h3>{t('projects.discoveryRoots')}</h3><button type="button" onClick={onAddRoot}>{t('projects.manageRoots')}</button></header>
          {roots.map(root => {
            const removePending = isRemoveRootPending(root.id)
            return (
              <div className="dshd-discovery-root" key={root.id}>
                <span><FolderIcon size={17} /><code>{root.path}</code></span>
                <span>{t('projects.manualConfirmation', { depth: root.maxDepth })}</span>
                <span>{relativeTime(root.updatedAt, t)}</span>
                <button type="button" aria-label={t('projects.scanRootAria', { path: root.path })} title={t('projects.scanRootTitle')} disabled={busy} onClick={() => { void onScan(root.id) }}><RefreshIcon size={15} /></button>
                <button type="button" aria-label={t('projects.removeRootAria', { path: root.path })} title={t('projects.removeRootTitle')} disabled={busy || removePending} aria-busy={removePending} onClick={() => { void onRemoveRoot(root.id).catch(() => undefined) }}><TrashIcon size={15} /></button>
              </div>
            )
          })}
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
  if (snapshot?.selection.mode === 'global') {
    const ready = snapshot.selection.readyProjectCount
    const total = snapshot.selection.projectCount
    const tone = ready === total && total > 0 ? 'success' : 'warning'
    return (
      <div className="dshd-config-view">
        <header className="dshd-config-heading">
          <div><h2>{t('configuration.globalTitle')}</h2><p>{t('configuration.globalDescription')}</p></div>
          <span className="dshd-config-status-badge" data-tone={tone}><span className="dshd-config-status-dot" />{t('configuration.globalStatus')}</span>
        </header>
        <div className="dshd-config-status" data-tone={tone} role="status">
          <span className="dshd-config-status-dot" />
          <div><strong>{t('configuration.globalReadyCount', { ready, total })}</strong><p>{t('configuration.globalScope')}</p></div>
        </div>
        <div className="dshd-config-grid">
          <ConfigSection title={t('configuration.globalProjects')} wide>
            {snapshot.catalog.projects.map(project => (
              <ConfigRow
                key={project.id}
                label={project.name}
                value={`${providerLabel(project.trackerKind, project.trackerKind, t) ?? t('context.unavailable')} · ${project.contextLabel ?? '—'}`}
                secondary={project.configurationState === 'invalid' ? project.configurationError ?? t('context.invalidConfiguration') : project.root}
                mono={project.configurationState === 'invalid'}
              />
            ))}
          </ConfigSection>
        </div>
      </div>
    )
  }
  const config = snapshot?.configuration
  const hasReloadError = config?.workflowError !== undefined
  const statusTone = config === undefined ? 'neutral' : hasReloadError ? 'warning' : 'success'
  const statusLabel = config === undefined
    ? t('configuration.statusWaitingShort')
    : hasReloadError ? t('configuration.statusErrorShort') : t('configuration.statusLoadedShort')
  const statusTitle = config === undefined
    ? t('configuration.statusWaiting')
    : hasReloadError ? t('configuration.statusLastGood') : t('configuration.statusCurrent')
  const loadedSummary = config?.workflowLoadedAt === undefined
    ? t('configuration.noValidConfiguration')
    : t('configuration.lastGoodLoaded', {
        absolute: absoluteTime(config.workflowLoadedAt, t),
        relative: relativeTime(config.workflowLoadedAt, t),
      })
  return (
    <div className="dshd-config-view">
      <header className="dshd-config-heading">
        <div><h2>{t('tab.configuration')}</h2><p>{t('configuration.description')}</p></div>
        <span className="dshd-config-status-badge" data-tone={statusTone}>
          <span className="dshd-config-status-dot" />
          {statusLabel}
        </span>
      </header>

      <div className="dshd-config-status" data-tone={statusTone} role="status">
        <span className="dshd-config-status-dot" />
        <div>
          <strong>{statusTitle}</strong>
          <p>{loadedSummary}</p>
          {config === undefined ? null : <p>{t('configuration.autoReloadScope')}</p>}
          {config?.workflowError === undefined ? null : <code>{config.workflowError}</code>}
        </div>
      </div>

      <div className="dshd-config-grid">
        <ConfigSection title={t('configuration.workflow')} wide>
          <ConfigRow
            label={t('configuration.source')}
            value={config?.workflowPath}
            mono
            copyValue={config?.workflowPath}
            copyLabel={t('configuration.copyWorkflowPath')}
          />
          <ConfigRow label={t('configuration.project')} value={config?.projectName} />
          <ConfigRow
            label={t('configuration.loaded')}
            value={config?.workflowLoadedAt === undefined ? undefined : absoluteTime(config.workflowLoadedAt, t)}
            secondary={config?.workflowLoadedAt === undefined ? undefined : relativeTime(config.workflowLoadedAt, t)}
          />
          <ConfigRow label={t('configuration.polling')} value={formatPollingInterval(config?.pollingIntervalMs, t)} />
          <ConfigRow
            label={t('configuration.workspaceRoot')}
            value={config?.workspaceRoot}
            mono
            copyValue={config?.workspaceRoot}
            copyLabel={t('configuration.copyWorkspaceRoot')}
          />
          <ConfigRow label={t('configuration.appliesTo')} value={t('configuration.futureScope')} />
        </ConfigSection>

        <ConfigSection title={t('configuration.tracker')}>
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
          <ConfigStateRow label={t('configuration.activeStates')} values={config?.activeStates ?? []} tone="active" />
          <ConfigStateRow label={t('configuration.terminalStates')} values={config?.terminalStates ?? []} tone="terminal" />
        </ConfigSection>

        <ConfigSection title={t('configuration.harnessAgent')}>
          <ConfigRow label={t('configuration.profile')} value={config?.agentProfile} mono />
          <ConfigRow label={t('configuration.permissionPreset')} value={config?.permissionPreset} mono />
          <ConfigRow label={t('configuration.agentPreset')} value={config?.agentPreset ?? t('configuration.harnessDefault')} mono />
          <ConfigRow
            label={t('configuration.concurrency')}
            value={config?.maxConcurrentAgents?.toString()}
            secondary={t('configuration.concurrencyHelp')}
          />
          <ConfigRow
            label={t('configuration.maximumTurns')}
            value={config?.maxTurns?.toString()}
            secondary={t('configuration.maximumTurnsHelp')}
          />
        </ConfigSection>
      </div>
    </div>
  )
}

function ConfigSection({ title, wide = false, children }: {
  readonly title: string
  readonly wide?: boolean | undefined
  readonly children: ReactNode
}) {
  const headingId = useId()
  return (
    <section className="dshd-config-section" data-wide={wide || undefined} aria-labelledby={headingId}>
      <header><h3 id={headingId}>{title}</h3></header>
      <dl>{children}</dl>
    </section>
  )
}

function ConfigRow({ label, value, secondary, mono = false, copyValue, copyLabel }: {
  readonly label: string
  readonly value?: ReactNode
  readonly secondary?: string | undefined
  readonly mono?: boolean | undefined
  readonly copyValue?: string | undefined
  readonly copyLabel?: string | undefined
}) {
  const t = useDashboardTranslation()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])
  const empty = value === undefined || value === ''
  const actionLabel = copied ? t('configuration.copied') : copyLabel
  const copy = async (): Promise<void> => {
    if (copyValue === undefined || navigator.clipboard === undefined) return
    await navigator.clipboard.writeText(copyValue)
    setCopied(true)
  }
  return (
    <div className="dshd-config-row">
      <dt>{label}</dt>
      <dd>
        <div className="dshd-config-value-line">
          <span className={mono ? 'dshd-mono' : undefined}>{empty ? '—' : value}</span>
          {copyValue === undefined || copyLabel === undefined ? null : (
            <button type="button" className="dshd-config-copy" aria-label={actionLabel} title={actionLabel} onClick={() => { void copy() }}>
              <CopyIcon size={15} />
              <span>{copied ? t('configuration.copied') : t('configuration.copy')}</span>
            </button>
          )}
        </div>
        {secondary === undefined ? null : <small>{secondary}</small>}
      </dd>
    </div>
  )
}

function ConfigStateRow({ label, values, tone }: {
  readonly label: string
  readonly values: readonly string[]
  readonly tone: 'active' | 'terminal'
}) {
  return (
    <div className="dshd-config-row">
      <dt>{label}</dt>
      <dd>
        {values.length === 0 ? <span>—</span> : (
          <ul className="dshd-config-tags" aria-label={label}>
            {values.map(value => <li key={value} data-tone={tone}>{value}</li>)}
          </ul>
        )}
      </dd>
    </div>
  )
}

function runtimeLabel(runtime: IssueRuntimeView | undefined, t: ReturnType<typeof useDashboardTranslation>): string {
  return runtime === undefined ? t('runtime.idle') : runtimePhaseLabel(runtime.phase, t)
}

function runtimePhaseLabel(phase: IssueRuntimeView['phase'], t: ReturnType<typeof useDashboardTranslation>): string {
  if (phase === 'running') return t('runtime.running')
  if (phase === 'retrying') return t('runtime.retrying')
  return t('runtime.blocked')
}

function matchesSource(origin: TaskIssueOrigin | undefined, filter: string): boolean {
  if (filter === 'all') return true
  if (origin === undefined) return false
  if (filter.startsWith('provider:')) return origin.providerKind === filter.slice('provider:'.length)
  if (filter.startsWith('project:')) return origin.projectId === filter.slice('project:'.length)
  return false
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

function absoluteTime(value: string, t: ReturnType<typeof useDashboardTranslation>): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(t('meta.locale'), {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function formatPollingInterval(value: number | undefined, t: ReturnType<typeof useDashboardTranslation>): string | undefined {
  if (value === undefined) return undefined
  const milliseconds = value.toLocaleString(t('meta.locale'))
  if (value < 1_000 || value % 1_000 !== 0) return `${milliseconds} ms`
  const seconds = (value / 1_000).toLocaleString(t('meta.locale'))
  return t('configuration.pollingSeconds', { seconds, milliseconds })
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

function ActionToast({ toast, onClose }: { readonly toast: ActionToastState; readonly onClose: () => void }) {
  const t = useDashboardTranslation()
  return (
    <div className="dshd-action-toast" data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'} aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}>
      <span className={`dshd-dot dshd-dot-${toast.tone === 'success' ? 'green' : 'red'}`} />
      <span>{toast.message}</span>
      <button type="button" aria-label={t('feedback.dismiss')} onClick={onClose}><CloseIcon size={15} /></button>
    </div>
  )
}

export function displayInputTokens(tokens: TokenTotals): number {
  return tokens.input + tokens.cacheRead + tokens.cacheWrite
}
