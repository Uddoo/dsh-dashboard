/** Project-scoped runtime contexts and atomic Dashboard selection. */

import type { Context } from '@deepseek-ai/cordis'
import type { ProjectCatalog } from '../catalog/catalog.ts'
import type {
  AddDiscoveryRootInput,
  ProjectRecord,
  ProjectScanResult,
  ProjectView,
  RegisterProjectInput,
} from '../catalog/types.ts'
import type { IssueDetailView, DashboardSnapshot } from './types.ts'
import { issueKey } from '../domain/issue.ts'
import type { CreateTaskInput, UpdateTaskInput } from '../task-source/index.ts'
import type { DashboardOrchestrator } from '../orchestrator/orchestrator.ts'
import type { WorkflowParseOptions } from '../workflow/parser.ts'
import { providerString } from '../workflow/provider.ts'
import { WorkflowStore } from '../workflow/store.ts'
import type { WorkflowDefinition } from '../workflow/types.ts'
import { DashboardDomainError } from './errors.ts'
import { aggregateProjectSnapshots, globalRuntimeKey, issueOrigin } from './global.ts'

const GLOBAL_SCHEDULE_RECHECK_MS = 5_000

export interface ProjectRuntimeFactoryResult {
  readonly orchestrator: DashboardOrchestrator
  readonly disposeSources: () => void
}

export interface DashboardRuntimeCoordinatorOptions {
  readonly initialProject: ProjectRecord
  readonly parseOptions: WorkflowParseOptions
  readonly createRuntime: (project: ProjectRecord, workflow: WorkflowStore) => ProjectRuntimeFactoryResult
}

interface ProjectRuntimeContext {
  project: ProjectRecord
  readonly workflow: WorkflowStore
  watching: boolean
  lastOverviewAt?: number
  runtime?: ProjectRuntimeFactoryResult
  disposeOrchestrator?: () => Promise<void>
}

interface GlobalIssueRoute extends IssueDetailView {
  readonly projectId: string
  readonly sourceKey: string
}

/**
 * Owns one isolated Provider/Orchestrator graph per visited project. Only the
 * selected graph polls and dispatches; already-running Agents in other graphs
 * retain their original Workflow and Provider routing until they finish.
 */
export class DashboardRuntimeCoordinator {
  private readonly contexts = new Map<string, ProjectRuntimeContext>()
  private activeProjectId: string | undefined
  private globalSelected = false
  private globalTimer: NodeJS.Timeout | undefined
  private globalRefreshing: Promise<void> | undefined
  private globalRefreshForceRequested = false
  private readonly globalIssues = new Map<string, GlobalIssueRoute>()
  private switchTail: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    private readonly ctx: Context,
    private readonly catalog: ProjectCatalog,
    private readonly options: DashboardRuntimeCoordinatorOptions,
  ) {}

  async start(): Promise<void> {
    if (this.activeProjectId !== undefined) throw new Error('dsh-dashboard: runtime coordinator is already started')
    this.stopped = false
    if (this.catalog.selection()?.mode === 'global') {
      this.globalSelected = true
      await this.ensureGlobalContexts()
      await this.refreshGlobal(true)
      return
    }
    const project = this.catalog.activeProject() ?? this.options.initialProject
    const context = await this.ensureContext(project, true)
    const runtime = this.ensureRuntime(context)
    context.disposeOrchestrator = runtime.orchestrator.start(true)
    this.activeProjectId = project.id
    await this.preloadRegisteredProjects(project.id)
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.clearGlobalTimer()
    await this.switchTail.catch(() => undefined)
    await this.globalRefreshing?.catch(() => undefined)
    const contexts = [...this.contexts.values()]
    await Promise.allSettled(contexts.map(async (context) => {
      await context.disposeOrchestrator?.()
      context.workflow.stop()
      context.runtime?.disposeSources()
    }))
    this.contexts.clear()
    this.activeProjectId = undefined
    this.globalSelected = false
    this.globalRefreshForceRequested = false
    this.globalIssues.clear()
  }

  async switchProject(projectId: string): Promise<void> {
    await this.enqueueSwitch(async () => {
      if (this.stopped) throw new Error('dsh-dashboard: runtime coordinator is stopped')
      if (!this.globalSelected && projectId === this.activeProjectId) {
        await this.requireActive().orchestrator.refresh()
        return
      }
      const project = this.catalog.project(projectId)
      if (project === undefined) {
        throw new DashboardDomainError(
          'catalog.projectUnknown',
          `unknown registered project ${JSON.stringify(projectId)}`,
          { projectId },
        )
      }
      const target = await this.ensureContext(project, true)
      const loaded = await target.workflow.reload()
      if (!loaded) {
        const reason = target.workflow.status().error ?? 'WORKFLOW.md could not be loaded'
        throw new DashboardDomainError(
          'project.workflowInvalid',
          `cannot switch to ${project.name}: ${reason}`,
          { project: project.name, reason },
        )
      }
      target.workflow.require()
      const targetRuntime = this.ensureRuntime(target)
      if (target.disposeOrchestrator === undefined) {
        target.disposeOrchestrator = targetRuntime.orchestrator.start(false)
      }

      // Durable selection is the only fallible commit step. The current graph
      // remains active until this write succeeds.
      await this.catalog.activateProject(project.id)
      this.clearGlobalTimer()
      const previous = this.activeProjectId === undefined ? undefined : this.contexts.get(this.activeProjectId)?.runtime
      this.globalSelected = false
      this.globalRefreshForceRequested = false
      previous?.orchestrator.setActive(false)
      this.activeProjectId = project.id
      targetRuntime.orchestrator.setActive(true)
      await targetRuntime.orchestrator.refresh()
    })
  }

  async switchGlobal(): Promise<void> {
    await this.enqueueSwitch(async () => {
      if (this.stopped) throw new Error('dsh-dashboard: runtime coordinator is stopped')
      if (this.globalSelected) {
        await this.refreshGlobal(true)
        return
      }
      await this.ensureGlobalContexts()
      await this.catalog.activateGlobal()
      const previous = this.activeProjectId === undefined ? undefined : this.contexts.get(this.activeProjectId)?.runtime
      previous?.orchestrator.setActive(false)
      this.activeProjectId = undefined
      this.globalSelected = true
      await this.refreshGlobal(true)
    })
  }

  async snapshot(): Promise<DashboardSnapshot> {
    if (this.globalSelected) return await this.globalSnapshot()
    const snapshot = await this.requireActive().orchestrator.snapshot()
    const projects = snapshot.catalog.projects.map(project => this.enrichProject(project))
    const activeContext = this.activeProjectId === undefined ? undefined : this.contexts.get(this.activeProjectId)
    const includesActive = this.activeProjectId === undefined || projects.some(project => project.id === this.activeProjectId)
    return {
      ...snapshot,
      selection: { mode: 'project', ...(this.activeProjectId === undefined ? {} : { projectId: this.activeProjectId }) },
      catalog: {
        ...snapshot.catalog,
        projects: includesActive || activeContext === undefined
          ? projects
          : [this.enrichProject(projectView(activeContext.project, true)), ...projects],
      },
    }
  }

  async refresh(): Promise<void> {
    if (this.globalSelected) await this.refreshGlobal(true)
    else await this.requireActive().orchestrator.refresh()
  }

  setPaused(paused: boolean): void {
    this.requireProjectMode('pause or resume Agent dispatch').orchestrator.setPaused(paused)
  }

  stopIssue(key: string): boolean {
    if (!this.globalSelected) return this.requireActive().orchestrator.stopIssue(key)
    const route = this.globalIssues.get(key)
    const runtime = route === undefined ? undefined : this.contexts.get(route.projectId)?.runtime
    return route !== undefined && runtime !== undefined && runtime.orchestrator.stopIssue(route.sourceKey)
  }

  issueDetail(key: string): IssueDetailView | undefined {
    return this.globalSelected ? this.globalIssues.get(key) : this.requireActive().orchestrator.issueDetail(key)
  }

  async createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<void> {
    await this.requireProjectMode('create a task').orchestrator.createTask(input, signal)
  }

  async updateTask(nativeRef: string, input: UpdateTaskInput, signal?: AbortSignal): Promise<void> {
    await this.requireProjectMode('update a task').orchestrator.updateTask(nativeRef, input, signal)
  }

  async deleteTask(nativeRef: string, signal?: AbortSignal): Promise<boolean> {
    return await this.requireProjectMode('delete a task').orchestrator.deleteTask(nativeRef, signal)
  }

  async addDiscoveryRoot(input: AddDiscoveryRootInput): Promise<void> { await this.catalog.addDiscoveryRoot(input) }
  async removeDiscoveryRoot(id: string): Promise<boolean> { return await this.catalog.removeDiscoveryRoot(id) }
  async scanProjects(rootId: string, signal?: AbortSignal): Promise<ProjectScanResult> { return await this.catalog.scan(rootId, signal) }

  async registerProjectCandidate(token: string): Promise<void> {
    const project = await this.catalog.registerCandidate(token)
    await this.refreshProjectContext(project)
  }

  async registerProject(input: RegisterProjectInput): Promise<void> {
    const project = await this.catalog.registerProject(input)
    await this.refreshProjectContext(project)
  }

  private async globalSnapshot(): Promise<DashboardSnapshot> {
    const catalog = this.catalog.snapshot()
    const projects = catalog.projects.map(project => this.enrichProject(project))
    const projections: { project: ProjectView; snapshot: DashboardSnapshot }[] = []
    this.globalIssues.clear()
    for (const project of projects) {
      const runtime = this.contexts.get(project.id)?.runtime
      if (runtime === undefined) continue
      const snapshot = await runtime.orchestrator.snapshot()
      projections.push({ project, snapshot })
      const origin = issueOrigin(project, snapshot)
      const runtimes = new Map(snapshot.runtime.issues.map(item => [item.key, item]))
      for (const column of snapshot.board.columns) {
        for (const sourceIssue of column.issues) {
          const sourceKey = issueKey(sourceIssue)
          const key = globalRuntimeKey(project.id, sourceKey)
          const sourceRuntime = runtimes.get(sourceKey)
          this.globalIssues.set(key, {
            projectId: project.id,
            sourceKey,
            issue: { ...sourceIssue, origin },
            ...(sourceRuntime === undefined ? {} : {
              runtime: { ...sourceRuntime, key, origin },
            }),
          })
        }
      }
    }
    return aggregateProjectSnapshots(projections, { ...catalog, projects })
  }

  private async ensureGlobalContexts(): Promise<void> {
    const projects = this.catalog.snapshot().projects
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < projects.length) {
        const project = projects[nextIndex++]
        if (project === undefined) continue
        const context = await this.ensureContext(project, true)
        const runtime = this.ensureRuntime(context)
        if (context.disposeOrchestrator === undefined) context.disposeOrchestrator = runtime.orchestrator.start(false)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, projects.length) }, () => worker()))
  }

  private async refreshGlobal(force: boolean): Promise<void> {
    if (this.stopped || !this.globalSelected) return
    if (force) this.globalRefreshForceRequested = true
    if (this.globalRefreshing !== undefined) {
      await this.globalRefreshing
      if (this.globalRefreshForceRequested && !this.stopped && this.globalSelected) {
        await this.refreshGlobal(false)
      }
      return
    }
    const job = (async () => {
      do {
        const forcePass = this.globalRefreshForceRequested
        this.globalRefreshForceRequested = false
        await this.ensureGlobalContexts()
        const current = Date.now()
        const contexts = this.catalog.snapshot().projects
          .map(project => this.contexts.get(project.id))
          .filter((context): context is ProjectRuntimeContext => context?.runtime !== undefined)
          .filter(context => forcePass || this.overviewDue(context, current))
        let nextIndex = 0
        const worker = async (): Promise<void> => {
          while (nextIndex < contexts.length) {
            const context = contexts[nextIndex++]
            if (context?.runtime === undefined) continue
            try {
              await context.runtime.orchestrator.refreshOverview()
            } finally {
              context.lastOverviewAt = Date.now()
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, contexts.length) }, () => worker()))
      } while (this.globalRefreshForceRequested && !this.stopped && this.globalSelected)
    })().finally(() => {
      if (this.globalRefreshing === job) this.globalRefreshing = undefined
      this.scheduleGlobal()
    })
    this.globalRefreshing = job
    await job
  }

  private scheduleGlobal(): void {
    this.clearGlobalTimer()
    if (this.stopped || !this.globalSelected) return
    const current = Date.now()
    let delay = GLOBAL_SCHEDULE_RECHECK_MS
    for (const project of this.catalog.snapshot().projects) {
      const context = this.contexts.get(project.id)
      if (context === undefined) continue
      if (context.runtime === undefined) continue
      const dueAt = context.lastOverviewAt === undefined
        ? current
        : context.lastOverviewAt + context.runtime.orchestrator.pollingIntervalMs()
      delay = Math.min(delay, Math.max(0, dueAt - current))
    }
    this.globalTimer = setTimeout(() => {
      this.globalTimer = undefined
      void this.refreshGlobal(false)
    }, delay)
  }

  private overviewDue(context: ProjectRuntimeContext, current: number): boolean {
    if (context.runtime === undefined || context.lastOverviewAt === undefined) return true
    return context.lastOverviewAt + context.runtime.orchestrator.pollingIntervalMs() <= current
  }

  private clearGlobalTimer(): void {
    if (this.globalTimer !== undefined) clearTimeout(this.globalTimer)
    this.globalTimer = undefined
  }

  private async preloadRegisteredProjects(activeProjectId: string): Promise<void> {
    const projects = this.catalog.snapshot().projects.filter(project => project.id !== activeProjectId)
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < projects.length) {
        const project = projects[nextIndex++]
        if (project !== undefined) await this.ensureContext(project, false)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, projects.length) }, () => worker()))
  }

  private async refreshProjectContext(project: ProjectRecord): Promise<void> {
    const existing = this.contexts.get(project.id)
    if (existing !== undefined && project.id !== this.activeProjectId && !this.globalSelected) {
      await existing.disposeOrchestrator?.()
      existing.workflow.stop()
      existing.runtime?.disposeSources()
      this.contexts.delete(project.id)
    }
    if (this.globalSelected) {
      const context = await this.ensureContext(project, true)
      const runtime = this.ensureRuntime(context)
      if (context.disposeOrchestrator === undefined) context.disposeOrchestrator = runtime.orchestrator.start(false)
      try {
        await runtime.orchestrator.refreshOverview()
      } finally {
        context.lastOverviewAt = Date.now()
      }
      return
    }
    if (project.id !== this.activeProjectId) await this.ensureContext(project, false)
  }

  private async ensureContext(project: ProjectRecord, watch: boolean): Promise<ProjectRuntimeContext> {
    let context = this.contexts.get(project.id)
    if (context === undefined) {
      const workflow = new WorkflowStore(
        this.ctx,
        project.policyPath ?? 'WORKFLOW.md',
        this.options.parseOptions,
        project.root,
      )
      context = { project: { ...project, repositoryIds: [...project.repositoryIds] }, workflow, watching: false }
      this.contexts.set(project.id, context)
      if (watch) {
        await workflow.start()
        context.watching = true
      } else {
        await workflow.reload()
      }
      return context
    }
    context.project = { ...project, repositoryIds: [...project.repositoryIds] }
    if (watch && !context.watching) {
      await context.workflow.start()
      context.watching = true
    }
    return context
  }

  private ensureRuntime(context: ProjectRuntimeContext): ProjectRuntimeFactoryResult {
    context.runtime ??= this.options.createRuntime(context.project, context.workflow)
    return context.runtime
  }

  private requireActive(): ProjectRuntimeFactoryResult {
    const context = this.activeProjectId === undefined ? undefined : this.contexts.get(this.activeProjectId)
    if (context === undefined) throw new Error('dsh-dashboard: no active project runtime')
    return this.ensureRuntime(context)
  }

  private requireProjectMode(action: string): ProjectRuntimeFactoryResult {
    if (this.globalSelected) {
      throw new DashboardDomainError(
        'global.readOnly',
        `select a project before attempting to ${action}`,
        { action },
      )
    }
    return this.requireActive()
  }

  private enrichProject(project: ProjectView): ProjectView {
    const context = this.contexts.get(project.id)
    if (context === undefined) return { ...project, currentWorkspace: !this.globalSelected && project.id === this.activeProjectId }
    const status = context.workflow.status()
    const activity = context.runtime?.orchestrator.runtimeActivity()
    const definition = status.current
    return {
      ...project,
      currentWorkspace: !this.globalSelected && project.id === this.activeProjectId,
      configurationState: definition === undefined || status.error !== undefined ? 'invalid' : 'ready',
      ...(definition === undefined ? {} : {
        trackerKind: definition.tracker.kind,
        contextLabel: workflowContextLabel(definition),
      }),
      ...(status.error === undefined ? {} : { configurationError: status.error }),
      ...(activity === undefined ? {} : { runningAgents: activity.running, retryingAgents: activity.retrying }),
    }
  }

  private async enqueueSwitch(operation: () => Promise<void>): Promise<void> {
    const result = this.switchTail.then(operation)
    this.switchTail = result.catch(() => undefined)
    await result
  }
}

function workflowContextLabel(definition: WorkflowDefinition): string {
  const provider = definition.tracker.provider
  const configured = providerString(provider, 'context_label')
  if (configured !== undefined) return configured
  switch (definition.tracker.kind) {
    case 'linear': return providerString(provider, 'project_slug') ?? definition.project.name
    case 'github': {
      const owner = providerString(provider, 'owner')
      const repository = providerString(provider, 'repo')
      return owner === undefined || repository === undefined ? definition.project.name : `${owner}/${repository}`
    }
    case 'jira': return providerString(provider, 'project_key') ?? definition.project.name
    case 'asana': return providerString(provider, 'project_gid') ?? definition.project.name
    case 'gitlab': return providerString(provider, 'project_id') ?? definition.project.name
    case 'local': return providerString(provider, 'project_id') ?? definition.project.name
    default: return definition.project.name
  }
}

function projectView(project: ProjectRecord, currentWorkspace: boolean): ProjectView {
  return { ...project, repositoryIds: [...project.repositoryIds], repositories: [], currentWorkspace }
}
