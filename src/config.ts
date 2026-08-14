/** Cordis plugin configuration for the multi-project Dashboard foundation. */

import z from '@deepseek-ai/schemastery'

export interface CurrentProjectConfig {
  /** Project root, resolved from the Harness process working directory. */
  root: string
  /** Project policy path, resolved from `root`. */
  policyPath: string
  /** Register the Harness-selected workspace in the Project Catalog at startup. */
  registerInCatalog: boolean
}

export interface AgentProfileConfig {
  /** Stable profile id referenced by project policies. */
  id: string
  /** Explicit Harness permission preset applied to orchestrated Agents. */
  permissionPreset: string
  /** Optional Harness Agent Preset; absent selects the roster default. */
  agentPreset?: string
  /** Runtime host label exposed by observability and future Broker matching. */
  workerHost: string
}

/** Global policy defaults overridden by a project's WORKFLOW.md `policy` block. */
export interface PolicyDefaultsConfig {
  pollingIntervalMs: number
  workspaceRoot: string
  hookTimeoutMs: number
  maxConcurrentAgents: number
  maxTurns: number
  maxRetryBackoffMs: number
}

export interface DiscoveryRootConfig {
  path: string
  maxDepth: number
}

export interface Config {
  currentProject: CurrentProjectConfig
  agentProfile: AgentProfileConfig
  policyDefaults: PolicyDefaultsConfig
  discovery: {
    /** Explicit roots seeded into the Catalog; every scanned candidate still requires confirmation. */
    roots: DiscoveryRootConfig[]
  }
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
  currentProject: z.object({
    root: z.string().default('.'),
    policyPath: z.string().default('WORKFLOW.md'),
    registerInCatalog: z.boolean().default(true),
  }).default({ root: '.', policyPath: 'WORKFLOW.md', registerInCatalog: true }),
  agentProfile: z.object({
    id: z.string().default('default'),
    // Required on purpose: unattended orchestration must never silently select
    // or elevate a sandbox/approval policy.
    permissionPreset: z.string().required(),
    agentPreset: z.string(),
    workerHost: z.string().default('local'),
  }),
  policyDefaults: z.object({
    pollingIntervalMs: z.number().step(1).min(1).default(5000),
    workspaceRoot: z.string().default('.dsh-dashboard/workspaces'),
    hookTimeoutMs: z.number().step(1).min(1).default(60000),
    maxConcurrentAgents: z.number().step(1).min(1).default(10),
    maxTurns: z.number().step(1).min(1).default(20),
    maxRetryBackoffMs: z.number().step(1).min(1).default(300000),
  }).default({
    pollingIntervalMs: 5000,
    workspaceRoot: '.dsh-dashboard/workspaces',
    hookTimeoutMs: 60000,
    maxConcurrentAgents: 10,
    maxTurns: 20,
    maxRetryBackoffMs: 300000,
  }),
  discovery: z.object({
    roots: z.array(z.object({
      path: z.string().required(),
      maxDepth: z.number().step(1).min(1).max(8).default(4),
    })).default([]),
  }).default({ roots: [] }),
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
