import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  Err,
  AgentError,
} from '@harness-engineering/types';

function resolveExitCode(
  code: number | null,
  command: string,
  resolve: (value: Result<void, AgentError>) => void
): void {
  if (code === 0) {
    resolve(Ok(undefined));
  } else {
    resolve(
      Err({
        category: 'agent_not_found',
        message: `Claude command '${command}' not found or failed`,
      })
    );
  }
}

function resolveSpawnError(
  command: string,
  resolve: (value: Result<void, AgentError>) => void
): void {
  resolve(Err({ category: 'agent_not_found', message: `Claude command '${command}' not found` }));
}

/**
 * Extract a human-readable summary from a Claude result event.
 * The content field can be a string, an array of content blocks, or the full response object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeResultContent(rawEvent: any): string {
  if (typeof rawEvent.result === 'string') return rawEvent.result;

  const content = rawEvent.content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string);
    if (textParts.length > 0) return textParts.join('\n');

    const toolNames = content.filter((b) => b.type === 'tool_use').map((b) => b.name);
    if (toolNames.length > 0) return `Tool calls: ${toolNames.join(', ')}`;
  }

  if (typeof content === 'string') return content;
  return 'Turn completed';
}

function mkEvent(type: string, content: unknown, sessionId: string): AgentEvent {
  return { type, timestamp: new Date().toISOString(), content, sessionId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractToolResultText(blockContent: any): string {
  if (typeof blockContent === 'string') return blockContent;
  if (!Array.isArray(blockContent)) return '';
  return (
    blockContent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (typeof c === 'string' ? c : (c.text ?? '')))
      .join('\n')
  );
}

/** Map a single assistant content block to an AgentEvent, or null to skip. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAssistantBlock(block: any, sessionId: string): AgentEvent | null {
  if (block.type === 'text' && typeof block.text === 'string') {
    return mkEvent('text', block.text, sessionId);
  }
  if (block.type === 'tool_use') {
    return mkEvent(
      'call',
      `Calling ${block.name}(${JSON.stringify(block.input ?? {})})`,
      sessionId
    );
  }
  if (block.type === 'thinking' && typeof block.thinking === 'string') {
    return mkEvent('thought', block.thinking, sessionId);
  }
  return null;
}

/** Walk an assistant message's content blocks, emitting granular events. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAssistantBlocks(rawEvent: any, sessionId: string): AgentEvent[] {
  const blocks = rawEvent.message?.content;
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((b) => mapAssistantBlock(b, sessionId))
    .filter((e): e is AgentEvent => e !== null);
}

/** Walk a user message's tool_result blocks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserBlocks(rawEvent: any, sessionId: string): AgentEvent[] {
  const blocks = rawEvent.message?.content;
  if (!Array.isArray(blocks)) return [];

  const events: AgentEvent[] = [];
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      const text = extractToolResultText(block.content).slice(0, 500);
      events.push(mkEvent('status', text, sessionId));
    }
  }
  return events;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClaudeEventHandler = (rawEvent: any, sessionId: string) => AgentEvent[];

const CLAUDE_EVENT_HANDLERS: Record<string, ClaudeEventHandler> = {
  text: (e, s) => [mkEvent('text', e.content ?? e.text ?? '', s)],
  progress: (e, s) => (e.content ? [mkEvent('thought', e.content, s)] : []),
  call: (e, s) => [mkEvent('call', `Calling ${e.tool}(${JSON.stringify(e.args)})`, s)],
  rate_limit_event: (_e, s) => [mkEvent('rate_limit', 'Rate limit hit - waiting...', s)],
  result: (e, s) => [mkEvent('result', summarizeResultContent(e), s)],
  turn_complete: (e, s) => [mkEvent('result', summarizeResultContent(e), s)],
  assistant: mapAssistantBlocks,
  user: mapUserBlocks,
  system: () => [],
  message: () => [],
};

/**
 * Map a Claude stream-json event to one or more AgentEvents.
 *
 * Claude's stream-json emits: system (init), assistant (model response with
 * content blocks), user (tool results), result (final summary). Each assistant
 * message may contain multiple content blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClaudeEvent(rawEvent: any, sessionId: string): AgentEvent[] {
  const handler = CLAUDE_EVENT_HANDLERS[rawEvent.type];
  if (handler) return handler(rawEvent, sessionId);
  return typeof rawEvent.message === 'string'
    ? [mkEvent('status', rawEvent.message, sessionId)]
    : [];
}

export class ClaudeBackend implements AgentBackend {
  readonly name = 'claude';
  private command: string;

  constructor(command = 'claude') {
    this.command = command;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: AgentSession = {
      sessionId: randomUUID(),
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const args = [
      '--print',
      '-p',
      params.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
    ];

    if (params.isContinuation) {
      args.push('--resume', session.sessionId);
    } else {
      args.push('--session-id', session.sessionId);
    }

    const child = spawn(this.command, args, {
      cwd: session.workspacePath,
      env: process.env,
    });

    // Close stdin to signal no input is coming
    child.stdin.end();

    child.on('error', (err) => {
      console.error(`[claude spawn error] ${err.message}`);
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    const errRl = readline.createInterface({
      input: child.stderr,
      terminal: false,
    });

    // Log stderr for debugging
    errRl.on('line', (line) => {
      console.error(`[claude stderr] ${line}`);
    });

    let lastResult: TurnResult | null = null;
    let exitCode: number | null = null;

    child.on('exit', (code) => {
      exitCode = code;
    });

    try {
      for await (const line of rl) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawEvent = JSON.parse(line) as any;

          // Capture token usage and lastResult from result events
          if (rawEvent.type === 'result' || rawEvent.type === 'turn_complete') {
            lastResult = rawEvent as TurnResult;
            if (rawEvent.usage) {
              lastResult.usage = {
                inputTokens: rawEvent.usage.input_tokens ?? 0,
                outputTokens: rawEvent.usage.output_tokens ?? 0,
                totalTokens:
                  (rawEvent.usage.input_tokens ?? 0) + (rawEvent.usage.output_tokens ?? 0),
                cacheCreationTokens: rawEvent.usage.cache_creation_input_tokens ?? 0,
                cacheReadTokens: rawEvent.usage.cache_read_input_tokens ?? 0,
              };
            }
          }

          for (const mapped of mapClaudeEvent(rawEvent, session.sessionId)) {
            yield mapped;
          }
        } catch {
          // Ignore non-JSON output
        }
      }
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
      rl.close();
      errRl.close();
    }

    // Wait briefly for exit event if not already set
    if (exitCode === null) {
      await new Promise((resolve) => {
        child.on('exit', (code) => {
          exitCode = code;
          resolve(null);
        });
      });
    }

    if (exitCode !== 0 && !lastResult) {
      return {
        success: false,
        sessionId: session.sessionId,
        error: `Claude process exited with code ${exitCode}`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    return (
      lastResult || {
        success: true,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }
    );
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ['--version']);
      child.on('exit', (code) => resolveExitCode(code, this.command, resolve));
      child.on('error', () => resolveSpawnError(this.command, resolve));
    });
  }
}
