/** WORKFLOW.md frontmatter parser and validator. */

import { load as loadYaml } from 'js-yaml'
import { z } from 'zod'
import type { WorkflowDefinition } from './types.ts'

const nonBlank = z.string().trim().min(1)

const schema = z.object({
  tracker: z.object({
    kind: nonBlank.default('linear'),
    provider: z.record(z.string(), z.unknown()),
    required_labels: z.array(nonBlank).default([]),
    active_states: z.array(nonBlank).min(1).default(['Todo', 'In Progress']),
    terminal_states: z.array(nonBlank).min(1).default(['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done']),
  }),
  polling: z.object({
    interval_ms: z.number().int().positive().default(5000),
  }).default({ interval_ms: 5000 }),
  workspace: z.object({
    root: nonBlank,
  }),
  hooks: z.object({
    after_create: z.string().min(1).optional(),
    before_run: z.string().min(1).optional(),
    after_run: z.string().min(1).optional(),
    before_remove: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().default(60000),
  }).default({ timeout_ms: 60000 }),
  agent: z.object({
    max_concurrent_agents: z.number().int().positive().default(10),
    max_concurrent_agents_by_state: z.record(z.string(), z.number().int().positive()).default({}),
    max_turns: z.number().int().positive().default(20),
    max_retry_backoff_ms: z.number().int().positive().default(300000),
  }).default({
    max_concurrent_agents: 10,
    max_concurrent_agents_by_state: {},
    max_turns: 20,
    max_retry_backoff_ms: 300000,
  }),
  dashboard: z.object({
    visible_states: z.array(nonBlank).default([]),
  }).default({ visible_states: [] }),
})

/** Parse exactly one YAML-frontmatter document and preserve its Markdown body. */
export function parseWorkflow(text: string, sourcePath: string, now = new Date()): WorkflowDefinition {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error('WORKFLOW.md must start with a YAML frontmatter delimiter (`---`)')
  }
  const closing = normalized.indexOf('\n---\n', 4)
  if (closing < 0) {
    throw new Error('WORKFLOW.md is missing the closing YAML frontmatter delimiter (`---`)')
  }
  const frontmatterText = normalized.slice(4, closing)
  const prompt = normalized.slice(closing + 5).trim()
  if (prompt === '') throw new Error('WORKFLOW.md prompt body must not be empty')

  let document: unknown
  try {
    document = loadYaml(frontmatterText)
  } catch (error) {
    throw new Error(`WORKFLOW.md YAML is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = schema.safeParse(document)
  if (!parsed.success) {
    const message = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ')
    throw new Error(`WORKFLOW.md configuration is invalid: ${message}`)
  }
  const value = parsed.data
  const provider = normalizeProvider(value.tracker.kind, value.tracker.provider)
  return {
    tracker: {
      kind: value.tracker.kind,
      provider,
      required_labels: value.tracker.required_labels,
      active_states: value.tracker.active_states,
      terminal_states: value.tracker.terminal_states,
    },
    polling: value.polling,
    workspace: value.workspace,
    hooks: {
      ...(value.hooks.after_create === undefined ? {} : { after_create: value.hooks.after_create }),
      ...(value.hooks.before_run === undefined ? {} : { before_run: value.hooks.before_run }),
      ...(value.hooks.after_run === undefined ? {} : { after_run: value.hooks.after_run }),
      ...(value.hooks.before_remove === undefined ? {} : { before_remove: value.hooks.before_remove }),
      timeout_ms: value.hooks.timeout_ms,
    },
    agent: value.agent,
    dashboard: value.dashboard,
    prompt,
    sourcePath,
    loadedAt: now.toISOString(),
  }
}

function normalizeProvider(kindValue: string, value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const kind = kindValue.trim().toLocaleLowerCase('en-US')
  const provider = { ...value }
  if (kind === 'gitlab' && typeof provider.project_id === 'number') {
    if (!Number.isSafeInteger(provider.project_id) || provider.project_id <= 0) {
      throw new Error('WORKFLOW.md configuration is invalid: tracker.provider.project_id: expected a positive integer or non-empty string')
    }
    provider.project_id = String(provider.project_id)
  }
  const requiredByKind: Readonly<Record<string, readonly string[]>> = {
    linear: ['project_slug'],
    github: ['owner', 'repo'],
    jira: ['site_url', 'project_key'],
    asana: ['project_gid'],
    gitlab: ['project_id'],
  }
  for (const field of requiredByKind[kind] ?? []) {
    if (typeof provider[field] !== 'string' || provider[field].trim() === '') {
      throw new Error(`WORKFLOW.md configuration is invalid: tracker.provider.${field}: required for tracker kind ${kind}`)
    }
  }
  for (const field of ['context_label', 'assignee']) {
    const candidate = provider[field]
    if (candidate !== undefined && (typeof candidate !== 'string' || candidate.trim() === '')) {
      throw new Error(`WORKFLOW.md configuration is invalid: tracker.provider.${field}: expected a non-empty string`)
    }
  }
  if (provider.state_labels !== undefined) {
    if (!isStringRecord(provider.state_labels)) {
      throw new Error('WORKFLOW.md configuration is invalid: tracker.provider.state_labels: expected a state-to-label string map')
    }
  }
  if (kind === 'local' && (typeof provider.project_id !== 'string' || provider.project_id.trim() === '')) {
    provider.project_id = 'local'
  }
  return provider
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.entries(value).every(([key, item]) => key.trim() !== '' && typeof item === 'string' && item.trim() !== '')
}
