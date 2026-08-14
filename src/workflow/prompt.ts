/** Liquid prompt rendering for normalized issues. */

import { Liquid } from 'liquidjs'
import { createHash } from 'node:crypto'
import type { TaskIssue } from '../domain/issue.ts'

const liquid = new Liquid({ strictVariables: true, strictFilters: true })

export interface PromptContext {
  readonly issue: TaskIssue
  readonly attempt: number
}

/** Render the WORKFLOW prompt with only the normalized issue and retry attempt. */
export async function renderIssuePrompt(template: string, context: PromptContext): Promise<string> {
  return await liquid.parseAndRender(template, {
    issue: {
      id: context.issue.nativeRef,
      native_ref: context.issue.nativeRef,
      identifier: context.issue.identifier,
      title: context.issue.title,
      description: context.issue.description ?? null,
      priority: context.issue.priority ?? null,
      state: context.issue.state.name,
      branch_name: context.issue.branchName ?? null,
      url: context.issue.url ?? null,
      assignee_id: context.issue.assigneeId ?? null,
      labels: [...context.issue.labels],
      blocked_by: context.issue.blockedBy.map(blocker => ({ ...blocker })),
      created_at: context.issue.createdAt ?? null,
      updated_at: context.issue.updatedAt ?? null,
    },
    attempt: context.attempt > 0 ? context.attempt : null,
  })
}

/** Non-secret diagnostic for one model-visible input. */
export function promptFingerprint(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 16)
}
