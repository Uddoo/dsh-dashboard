/** Cordis plugin configuration: assembly facts that do not belong in WORKFLOW.md. */

import z from '@deepseek-ai/schemastery'

export interface Config {
  /** WORKFLOW.md path, resolved from the Harness process working directory. */
  workflowPath: string
  /** Explicit Harness permission preset applied to every orchestrated Agent. */
  permissionPreset: string
  /** Optional Harness Agent Preset; absent selects the roster default when available. */
  agentPreset?: string
  /** Runtime host label exposed by Symphony-compatible observability. */
  workerHost: string
  /** Linear transport and credential-reference configuration. */
  linear: {
    endpoint: string
    apiKeyRef: string
  }
}

export const Config: z<Config> = z.object({
  workflowPath: z.string().default('WORKFLOW.md'),
  // Required on purpose: unattended orchestration must never silently select
  // or elevate a sandbox/approval policy.
  permissionPreset: z.string().required(),
  agentPreset: z.string(),
  workerHost: z.string().default('local'),
  linear: z.object({
    endpoint: z.string().default('https://api.linear.app/graphql'),
    apiKeyRef: z.string().default('LINEAR_API_KEY'),
  }).required(),
})
