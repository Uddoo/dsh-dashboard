/** dsh-dashboard Host plugin: Symphony semantics over Harness-native services. */

import type { Context } from '@deepseek-ai/cordis'
import { basename, resolve } from 'node:path'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Config as ConfigSchema, type Config as PluginConfig } from './config.ts'
import { ProjectCatalog } from './catalog/catalog.ts'
import type { ProjectRecord } from './catalog/types.ts'
import { HarnessAgentRunner } from './agent/harness-runner.ts'
import { AsanaTaskSource } from './asana/source.ts'
import { GitHubTaskSource } from './github/source.ts'
import { GitLabTaskSource } from './gitlab/source.ts'
import { JiraTaskSource } from './jira/source.ts'
import { LinearTaskSource } from './linear/source.ts'
import { LocalTaskSource } from './local/source.ts'
import { DashboardOrchestrator } from './orchestrator/orchestrator.ts'
import { handleDashboardRpc } from './rpc/handler.ts'
import { ScopedTaskSourceRegistry, TaskSourceRegistry } from './task-source/index.ts'
import { DashboardRuntimeCoordinator } from './runtime/coordinator.ts'
import { WorkflowStore } from './workflow/store.ts'
import { providerString, providerStringMap, requireProviderString, workflowStateOrder } from './workflow/provider.ts'
import { WorkspaceManager } from './workspace/manager.ts'
import { resolveWorkspaceRoot } from './workspace/path-safety.ts'

export { TaskSourceRegistry } from './task-source/index.ts'
export type { TaskSource } from './task-source/index.ts'
export type { DashboardSnapshot, IssueDetailView } from './runtime/types.ts'

/** Stable Cordis plugin name. */
export const name = 'dsh-dashboard'

/** Harness-native capabilities required by the Web bundle. */
export const inject = [
  'agentDefaultModel',
  'agents',
  'connection',
  'credentials',
  'permissionPresets',
  'sessions',
  'storageDomain',
  'tools',
]

/** Public plugin configuration schema. */
export const Config = ConfigSchema

/** Compose built-in providers, the orchestrator, and trusted client RPC. */
export function apply(ctx: Context, config: PluginConfig): void {
  const agentProfile = config.agentProfile
  const linearConfig = config.linear ?? { endpoint: 'https://api.linear.app/graphql', apiKeyRef: 'LINEAR_API_KEY' }
  const githubConfig = config.github ?? { endpoint: 'https://api.github.com', tokenRef: 'GITHUB_TOKEN' }
  const jiraConfig = config.jira ?? { emailRef: 'JIRA_EMAIL', apiTokenRef: 'JIRA_API_TOKEN' }
  const asanaConfig = config.asana ?? { endpoint: 'https://app.asana.com/api/1.0', tokenRef: 'ASANA_ACCESS_TOKEN' }
  const gitlabConfig = config.gitlab ?? { endpoint: 'https://gitlab.com/api/v4', tokenRef: 'GITLAB_TOKEN' }
  const localConfig = config.local ?? { storePath: '~/.dsh-dashboard/tasks.json' }
  for (const ref of [
    linearConfig.apiKeyRef,
    githubConfig.tokenRef,
    jiraConfig.emailRef,
    jiraConfig.apiTokenRef,
    asanaConfig.tokenRef,
    gitlabConfig.tokenRef,
  ]) credentialRef(ref)
  const currentProjectRoot = resolveWorkspaceRoot(config.currentProject.root)
  const catalog = new ProjectCatalog(ctx, {
    currentProject: config.currentProject,
    discoveryRoots: config.discovery.roots,
  })
  const sourceRegistry = new TaskSourceRegistry(ctx)
  const runner = new HarnessAgentRunner(ctx, {
    permissionPreset: agentProfile.permissionPreset,
    ...(agentProfile.agentPreset === undefined ? {} : { agentPreset: agentProfile.agentPreset }),
    workerHost: agentProfile.workerHost,
  })
  const timestamp = new Date().toISOString()
  const initialProject: ProjectRecord = {
    id: 'current-workspace',
    name: basename(currentProjectRoot),
    root: currentProjectRoot,
    policyPath: resolve(currentProjectRoot, config.currentProject.policyPath),
    repositoryIds: [],
    workspaceStrategy: 'controlled-directory',
    autonomousClaims: false,
    source: 'current-workspace',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const providerConfigs = { linearConfig, githubConfig, jiraConfig, asanaConfig, gitlabConfig, localConfig }
  const runtime = new DashboardRuntimeCoordinator(ctx, catalog, {
    initialProject,
    parseOptions: { defaults: config.policyDefaults, agentProfile },
    createRuntime: (project, workflow) => {
      const sources = sourceRegistry.scope(project.id)
      const disposeSources = registerProjectSources(ctx, sources, workflow, providerConfigs)
      const workspaces = new WorkspaceManager(
        ctx,
        agentProfile.workerHost,
        () => catalog.projectWorkspaceSource(project.id) ?? (project.id === initialProject.id ? catalog.executionWorkspaceSource() : undefined),
      )
      const orchestrator = new DashboardOrchestrator(
        ctx,
        workflow,
        sources,
        workspaces,
        runner,
        catalog,
        {
          agentProfile: agentProfile.id,
          permissionPreset: agentProfile.permissionPreset,
          ...(agentProfile.agentPreset === undefined ? {} : { agentPreset: agentProfile.agentPreset }),
          workerHost: agentProfile.workerHost,
        },
      )
      return { orchestrator, disposeSources }
    },
  })

  let disposed = false
  const startup = catalog.start().then(async () => {
    if (disposed) return
    await runtime.start()
  })

  ctx.connection.rpc.handle(
    '/dsh-dashboard',
    (endpoint, payload, signal) => handleDashboardRpc(runtime, endpoint, payload, signal, startup),
    { authority: 'trusted-host' },
  )

  ctx.effect(() => {
    void startup.catch((error: unknown) => {
      ctx.logger.error('dsh-dashboard: runtime failed to start: %s', error instanceof Error ? error.message : String(error))
    })
    return async () => {
      disposed = true
      await startup.catch(() => undefined)
      await runtime.stop()
      await catalog.stop()
    }
  }, 'dsh-dashboard runtime')
}

interface ProviderConfigs {
  readonly linearConfig: NonNullable<PluginConfig['linear']>
  readonly githubConfig: NonNullable<PluginConfig['github']>
  readonly jiraConfig: NonNullable<PluginConfig['jira']>
  readonly asanaConfig: NonNullable<PluginConfig['asana']>
  readonly gitlabConfig: NonNullable<PluginConfig['gitlab']>
  readonly localConfig: NonNullable<PluginConfig['local']>
}

function registerProjectSources(
  ctx: Context,
  sources: ScopedTaskSourceRegistry,
  workflow: WorkflowStore,
  configs: ProviderConfigs,
): () => void {
  const disposers = [
    sources.register(new LinearTaskSource(ctx.credentials, configs.linearConfig, () => {
      const current = workflow.require().tracker
      return {
        projectSlug: requireProviderString(current.provider, 'project_slug', 'linear'),
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        ...(providerString(current.provider, 'assignee') === undefined ? {} : { assignee: providerString(current.provider, 'assignee')! }),
        terminalStates: current.terminal_states,
      }
    })),
    sources.register(new GitHubTaskSource(ctx.credentials, configs.githubConfig, () => {
      const current = workflow.require().tracker
      return {
        owner: requireProviderString(current.provider, 'owner', 'github'),
        repo: requireProviderString(current.provider, 'repo', 'github'),
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        ...(providerString(current.provider, 'assignee') === undefined ? {} : { assignee: providerString(current.provider, 'assignee')! }),
        states: workflowStateOrder(current.active_states, current.terminal_states, workflow.require().dashboard.visible_states),
        activeStates: current.active_states,
        terminalStates: current.terminal_states,
        stateLabels: providerStringMap(current.provider, 'state_labels'),
      }
    })),
    sources.register(new JiraTaskSource(ctx.credentials, configs.jiraConfig, () => {
      const definition = workflow.require()
      const current = definition.tracker
      return {
        siteUrl: requireProviderString(current.provider, 'site_url', 'jira'),
        projectKey: requireProviderString(current.provider, 'project_key', 'jira'),
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        ...(providerString(current.provider, 'assignee') === undefined ? {} : { assignee: providerString(current.provider, 'assignee')! }),
        ...(providerString(current.provider, 'jql') === undefined ? {} : { jql: providerString(current.provider, 'jql')! }),
        states: workflowStateOrder(current.active_states, current.terminal_states, definition.dashboard.visible_states),
        activeStates: current.active_states,
        terminalStates: current.terminal_states,
      }
    })),
    sources.register(new AsanaTaskSource(ctx.credentials, configs.asanaConfig, () => {
      const definition = workflow.require()
      const current = definition.tracker
      return {
        projectGid: requireProviderString(current.provider, 'project_gid', 'asana'),
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        ...(providerString(current.provider, 'assignee') === undefined ? {} : { assignee: providerString(current.provider, 'assignee')! }),
        states: workflowStateOrder(current.active_states, current.terminal_states, definition.dashboard.visible_states),
        activeStates: current.active_states,
        terminalStates: current.terminal_states,
      }
    })),
    sources.register(new GitLabTaskSource(ctx.credentials, configs.gitlabConfig, () => {
      const definition = workflow.require()
      const current = definition.tracker
      return {
        projectId: requireProviderString(current.provider, 'project_id', 'gitlab'),
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        ...(providerString(current.provider, 'assignee') === undefined ? {} : { assignee: providerString(current.provider, 'assignee')! }),
        states: workflowStateOrder(current.active_states, current.terminal_states, definition.dashboard.visible_states),
        activeStates: current.active_states,
        terminalStates: current.terminal_states,
        stateLabels: providerStringMap(current.provider, 'state_labels'),
      }
    })),
    sources.register(new LocalTaskSource(configs.localConfig, () => {
      const definition = workflow.require()
      const current = definition.tracker
      return {
        projectId: providerString(current.provider, 'project_id') ?? 'local',
        ...(providerString(current.provider, 'context_label') === undefined ? {} : { contextLabel: providerString(current.provider, 'context_label')! }),
        states: workflowStateOrder(current.active_states, current.terminal_states, definition.dashboard.visible_states),
        activeStates: current.active_states,
        terminalStates: current.terminal_states,
      }
    })),
  ]
  return () => {
    for (const dispose of disposers.toReversed()) dispose()
  }
}
