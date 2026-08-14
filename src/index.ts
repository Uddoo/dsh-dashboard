/** dsh-dashboard Host plugin: Symphony semantics over Harness-native services. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Config as ConfigSchema, type Config as PluginConfig } from './config.ts'
import { HarnessAgentRunner } from './agent/harness-runner.ts'
import { LinearTaskSource } from './linear/source.ts'
import { DashboardOrchestrator } from './orchestrator/orchestrator.ts'
import { handleDashboardRpc } from './rpc/handler.ts'
import { TaskSourceRegistry } from './task-source/index.ts'
import { WorkflowStore } from './workflow/store.ts'
import { WorkspaceManager } from './workspace/manager.ts'

export { TaskSourceRegistry } from './task-source/index.ts'
export type { TaskSource } from './task-source/index.ts'
export type { DashboardSnapshot, IssueDetailView } from './runtime/types.ts'

/** Stable Cordis plugin name. */
export const name = 'dsh-dashboard'

/** Harness-native capabilities required by the first-phase Web bundle. */
export const inject = [
  'agentDefaultModel',
  'agents',
  'connection',
  'credentials',
  'permissionPresets',
  'sessions',
  'tools',
]

/** Public plugin configuration schema. */
export const Config = ConfigSchema

/** Compose the provider seam, Linear adapter, orchestrator, and trusted client RPC. */
export function apply(ctx: Context, config: PluginConfig): void {
  credentialRef(config.linear.apiKeyRef)
  const workflow = new WorkflowStore(ctx, config.workflowPath)
  const sources = new TaskSourceRegistry(ctx)
  const linear = new LinearTaskSource(ctx.credentials, config.linear, () => {
    const current = workflow.require().tracker
    return {
      projectSlug: current.provider.project_slug,
      ...(current.provider.context_label === undefined ? {} : { contextLabel: current.provider.context_label }),
      ...(current.provider.assignee === undefined ? {} : { assignee: current.provider.assignee }),
      terminalStates: current.terminal_states,
    }
  })
  sources.register(linear)
  const workspaces = new WorkspaceManager(ctx, config.workerHost)
  const runner = new HarnessAgentRunner(ctx, {
    permissionPreset: config.permissionPreset,
    ...(config.agentPreset === undefined ? {} : { agentPreset: config.agentPreset }),
    workerHost: config.workerHost,
  })
  const orchestrator = new DashboardOrchestrator(
    ctx,
    workflow,
    sources,
    workspaces,
    runner,
    linear,
    {
      permissionPreset: config.permissionPreset,
      ...(config.agentPreset === undefined ? {} : { agentPreset: config.agentPreset }),
      credentialRef: config.linear.apiKeyRef,
      workerHost: config.workerHost,
    },
  )

  ctx.connection.rpc.handle(
    '/dsh-dashboard',
    (endpoint, payload, signal) => handleDashboardRpc(orchestrator, endpoint, payload, signal),
    { authority: 'trusted-host' },
  )

  ctx.effect(() => {
    let disposeOrchestrator: (() => Promise<void>) | undefined
    let disposed = false
    void workflow.start().then(() => {
      if (disposed) return
      disposeOrchestrator = orchestrator.start()
    }).catch((error: unknown) => {
      ctx.logger.error('dsh-dashboard: workflow watcher failed to start: %s', error instanceof Error ? error.message : String(error))
    })
    return async () => {
      disposed = true
      workflow.stop()
      await disposeOrchestrator?.()
    }
  }, 'dsh-dashboard runtime')
}
