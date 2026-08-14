/** Same-thread multi-turn runner backed by the Harness Agent registry. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type AgentHandle, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-permission-presets'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type { TaskIssue } from '../domain/issue.ts'
import { issueKey, normalizedState } from '../domain/issue.ts'
import type { TaskSource } from '../task-source/index.ts'
import { resolveTaskSourceAgentTool } from '../task-source/index.ts'
import type { IssueRuntimeView, RuntimeEventView, TokenTotals } from '../runtime/types.ts'
import { emptyTokens } from '../runtime/types.ts'
import { promptFingerprint, renderIssuePrompt } from '../workflow/prompt.ts'
import type { WorkflowDefinition } from '../workflow/types.ts'

export interface HarnessRunnerConfig {
  readonly permissionPreset: string
  readonly agentPreset?: string
  readonly workerHost: string
}

export interface AgentRunRequest {
  readonly issue: TaskIssue
  readonly source: TaskSource
  readonly workflow: WorkflowDefinition
  readonly workspacePath: string
  readonly attempt: number
  readonly signal: AbortSignal
  readonly onRuntime: (view: IssueRuntimeView) => void
}

export interface AgentRunResult {
  readonly kind: 'terminal' | 'active' | 'inactive'
  readonly issue?: TaskIssue
  readonly runtime: IssueRuntimeView
}

/** Creates one Harness Agent per worker interval and continues in the same session up to max_turns. */
export class HarnessAgentRunner {
  constructor(private readonly ctx: Context, private readonly config: HarnessRunnerConfig) {
    ctx.permissionPresets.resolve(config.permissionPreset)
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const { issue, source, workflow, workspacePath, attempt, signal, onRuntime } = request
    const startedAt = new Date().toISOString()
    const sessionId = SessionId(`dsh-dashboard-${randomUUID()}`)
    const selection = this.ctx.agentDefaultModel.currentSelection()
    const selected: ModelSelectionRef = { current: selection, assembled: undefined }
    const presets = this.ctx.get('agentPresets')
    if (this.config.agentPreset !== undefined && presets === undefined) {
      throw new Error(`dsh-dashboard: agentPreset ${JSON.stringify(this.config.agentPreset)} was configured but ctx.agentPresets is unavailable`)
    }
    const resolvedPreset = presets === undefined ? undefined : await presets.resolve(this.config.agentPreset)
    let runtime: IssueRuntimeView = {
      key: issueKey(issue),
      identifier: issue.identifier,
      phase: 'running',
      state: issue.state.name,
      sessionId,
      turnCount: 0,
      startedAt,
      updatedAt: startedAt,
      workerHost: this.config.workerHost,
      workspacePath,
      tokens: emptyTokens(),
      recentEvents: [],
    }
    onRuntime(runtime)

    let handle: AgentHandle | undefined
    let removeEventListener: (() => void) | undefined
    const onAbort = (): void => {
      handle?.agent.cancel({ kind: 'hook', reason: 'dsh-dashboard orchestration cancelled' })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      handle = await this.ctx.agents.create({
        sessionId,
        meta: {
          cwd: workspacePath,
          ...(resolvedPreset === undefined ? {} : { agentPreset: resolvedPreset.id }),
        },
        agentOptions: { provider: selection.provider, model: selection.model },
        signal,
        setup: async (agentCtx) => {
          if (presets !== undefined) await presets.mount(agentCtx, resolvedPreset?.id)
          installModelSelection(agentCtx, selected)
          this.installTaskSourceTool(agentCtx, source)
        },
      })
      this.ctx.permissionPresets.set(handle.agent.session, this.config.permissionPreset)
      removeEventListener = this.ctx.on('session/event', (session, event) => {
        if (session.id !== sessionId) return
        runtime = projectEvent(runtime, event)
        onRuntime(runtime)
      })
      await handle.agent.whenIdle()

      for (let turn = 1; turn <= workflow.agent.max_turns; turn += 1) {
        if (signal.aborted) throw signal.reason
        const prompt = turn === 1
          ? await renderIssuePrompt(workflow.prompt, { issue, attempt })
          : continuationPrompt(turn, workflow.agent.max_turns)
        this.ctx.logger.info(
          'dsh-dashboard: model input issue=%s turn=%d/%d chars=%d sha256=%s',
          issue.identifier,
          turn,
          workflow.agent.max_turns,
          prompt.length,
          promptFingerprint(prompt),
        )
        const firstSeq = handle.agent.session.seq
        handle.agent.followup(createUserMessage({
          content: [{ type: 'text', text: prompt }],
          source: { kind: 'user' },
        }))
        await handle.agent.whenIdle()
        await this.ctx.sessions.flush(handle.agent.session)
        const end = lastTurnEnd(handle.agent.session.events, firstSeq)
        if (end?.data.reason.kind === 'error') {
          throw new Error(`${end.data.reason.error.code}: ${end.data.reason.error.message}`)
        }
        if (end?.data.reason.kind === 'blocked') {
          throw new AgentBlockedError(`Harness Agent reported a blocked turn for ${issue.identifier}`)
        }
        if (end?.data.reason.kind !== 'completed') {
          throw new Error(`Harness Agent turn ended as ${end?.data.reason.kind ?? 'unknown'}`)
        }

        const refreshed = (await source.getIssuesByNativeRefs([issue.nativeRef], signal))[0]
        if (refreshed === undefined) return { kind: 'inactive', runtime }
        const terminalStates = new Set(workflow.tracker.terminal_states.map(normalizedState))
        if (terminalStates.has(normalizedState(refreshed.state.name))) {
          return { kind: 'terminal', issue: refreshed, runtime: { ...runtime, state: refreshed.state.name } }
        }
        const activeStates = new Set(workflow.tracker.active_states.map(normalizedState))
        if (!activeStates.has(normalizedState(refreshed.state.name))) {
          return { kind: 'inactive', issue: refreshed, runtime: { ...runtime, state: refreshed.state.name } }
        }
        runtime = { ...runtime, state: refreshed.state.name, updatedAt: new Date().toISOString() }
        onRuntime(runtime)
        if (turn < workflow.agent.max_turns) await abortableDelay(1000, signal)
      }
      return { kind: 'active', issue, runtime }
    } finally {
      signal.removeEventListener('abort', onAbort)
      removeEventListener?.()
      if (handle !== undefined) {
        try {
          await this.ctx.sessions.flush(handle.agent.session)
        } finally {
          await handle.dispose()
        }
      }
    }
  }

  private installTaskSourceTool(agentCtx: Context, source: TaskSource): void {
    const tool = resolveTaskSourceAgentTool(source)
    if (tool === undefined) return
    const tools = agentCtx.get('tools')
    if (tools === undefined) throw new Error('dsh-dashboard: ctx.tools is unavailable in the Agent scope')
    if (tool.kind === 'graphql') {
      tools.register(defineTool({
        name: tool.name,
        description: tool.description,
        parameters: {
          query: { type: 'string', required: true, description: 'GraphQL query or mutation document.' },
          variables: { type: 'object', additionalProperties: true, description: 'Optional GraphQL variables object.' },
        },
        output: {
          schema: { type: 'json' },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          return await tool.execute(args.query, args.variables ?? {}, exec.signal) as never
        },
      }))
      return
    }
    if (tool.kind === 'rest') {
      tools.register(defineTool({
        name: tool.name,
        description: tool.description,
        parameters: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], required: true },
          path: { type: 'string', required: true, description: 'Provider-relative API path without an origin.' },
          query: { type: 'object', additionalProperties: true, description: 'Optional query parameters.' },
          body: { type: 'json', description: 'Optional lossless-JSON request body.' },
        },
        output: {
          schema: { type: 'json' },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          return await tool.execute({
            method: args.method,
            path: args.path,
            ...(args.query === undefined ? {} : { query: args.query }),
            ...(args.body === undefined ? {} : { body: args.body }),
          }, exec.signal) as never
        },
      }))
      return
    }
    tools.register(defineTool({
      name: tool.name,
      description: tool.description,
      parameters: {
        operation: { type: 'string', enum: ['get', 'update'], required: true },
        nativeRef: { type: 'string', required: true },
        title: { type: 'string' },
        description: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        state: { type: 'string' },
        priority: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        return await tool.execute({
          operation: args.operation,
          nativeRef: args.nativeRef,
          ...(args.title === undefined ? {} : { title: args.title }),
          ...(args.description === undefined ? {} : { description: args.description }),
          ...(args.state === undefined ? {} : { state: args.state }),
          ...(args.priority === undefined ? {} : { priority: args.priority }),
        }, exec.signal) as never
      },
    }))
  }
}

export class AgentBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentBlockedError'
  }
}

function projectEvent(current: IssueRuntimeView, event: SessionEvent): IssueRuntimeView {
  const at = new Date(event.time).toISOString()
  let tokens = current.tokens
  let lastMessage = current.lastMessage
  let title: string = event.type
  let detail: string | undefined
  let turnCount = current.turnCount
  if (event.type === 'turn/start') {
    title = 'Turn started'
    detail = `Turn ${event.data.turn} started`
    turnCount = Math.max(turnCount, event.data.turn)
  } else if (event.type === 'assistant/message') {
    title = 'Assistant message'
    const text = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
    if (text !== '') {
      lastMessage = text
      detail = text.length > 220 ? `${text.slice(0, 220)}…` : text
    }
    if (event.data.usage !== undefined) tokens = addUsage(tokens, event.data.usage)
  } else if (event.type === 'tool/call') {
    title = 'Tool started'
    detail = event.data.name
  } else if (event.type === 'tool/result') {
    title = 'Tool completed'
  } else if (event.type === 'turn/end') {
    title = 'Turn ended'
    detail = event.data.reason.kind
  }
  const recent: RuntimeEventView = { type: event.type, title, ...(detail === undefined ? {} : { detail }), at }
  return {
    ...current,
    turnCount,
    updatedAt: at,
    lastEvent: event.type,
    ...(lastMessage === undefined ? {} : { lastMessage }),
    lastEventAt: at,
    tokens,
    recentEvents: [recent, ...current.recentEvents].slice(0, 12),
  }
}

function addUsage(current: TokenTotals, usage: TokenUsage): TokenTotals {
  const input = usage.inputTokens
  const output = usage.outputTokens
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheWrite = usage.cacheWriteTokens ?? 0
  const reasoning = usage.reasoningTokens ?? 0
  return {
    input: current.input + input,
    output: current.output + output,
    cacheRead: current.cacheRead + cacheRead,
    cacheWrite: current.cacheWrite + cacheWrite,
    reasoning: current.reasoning + reasoning,
    total: current.total + input + output + cacheRead + cacheWrite,
  }
}

function lastTurnEnd(events: readonly SessionEvent[], firstSeq: number): SessionEvent<'turn/end'> | undefined {
  return events.filter((event): event is SessionEvent<'turn/end'> => event.seq >= firstSeq && event.type === 'turn/end').at(-1)
}

function continuationPrompt(turn: number, maxTurns: number): string {
  return [
    'Continue working on the current issue from the existing workspace and conversation state.',
    `This is continuation turn #${turn} of ${maxTurns}.`,
    'Do not repeat completed investigation. Re-read the tracker state, continue implementation and validation, and keep the issue workpad current.',
    'Only stop early for a true external blocker or when the issue has left an active state.',
  ].join('\n')
}

async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', onAbort)
      accept()
    }
    const timer = setTimeout(finish, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}
