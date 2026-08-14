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
  linear?: {
    endpoint: string
    apiKeyRef: string
  }
  github?: {
    endpoint: string
    tokenRef: string
  }
  jira?: {
    emailRef: string
    apiTokenRef: string
  }
  asana?: {
    endpoint: string
    tokenRef: string
  }
  gitlab?: {
    endpoint: string
    tokenRef: string
  }
  local?: {
    storePath: string
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
  }),
  github: z.object({
    endpoint: z.string().default('https://api.github.com'),
    tokenRef: z.string().default('GITHUB_TOKEN'),
  }),
  jira: z.object({
    emailRef: z.string().default('JIRA_EMAIL'),
    apiTokenRef: z.string().default('JIRA_API_TOKEN'),
  }),
  asana: z.object({
    endpoint: z.string().default('https://app.asana.com/api/1.0'),
    tokenRef: z.string().default('ASANA_ACCESS_TOKEN'),
  }),
  gitlab: z.object({
    endpoint: z.string().default('https://gitlab.com/api/v4'),
    tokenRef: z.string().default('GITLAB_TOKEN'),
  }),
  local: z.object({
    storePath: z.string().default('~/.dsh-dashboard/tasks.json'),
  }),
})
