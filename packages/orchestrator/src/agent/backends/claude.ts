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
  // Direct string result
  if (typeof rawEvent.result === 'string') return rawEvent.result;

  // Content is an array of blocks — extract text blocks
  const content = rawEvent.content;
  if (Array.isArray(content)) {
    const textParts = content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === 'text' && typeof b.text === 'string')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text as string);
    if (textParts.length > 0) return textParts.join('\n');

    // No text blocks — summarize what's there (e.g., tool_use blocks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolNames = content.filter((b: any) => b.type === 'tool_use').map((b: any) => b.name);
    if (toolNames.length > 0) return `Tool calls: ${toolNames.join(', ')}`;
  }

  // Content is a plain string
  if (typeof content === 'string') return content;

  return 'Turn completed';
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

          // Map Claude's stream-json events to our AgentEvent interface
          const event: AgentEvent = {
            type: 'status',
            timestamp: new Date().toISOString(),
            sessionId: session.sessionId,
          };

          if (rawEvent.type === 'text') {
            event.type = 'text';
            event.content = rawEvent.content ?? rawEvent.text ?? '';
          } else if (rawEvent.type === 'progress' && rawEvent.content) {
            event.type = 'thought';
            event.content = rawEvent.content;
          } else if (rawEvent.type === 'call') {
            event.type = 'call';
            event.content = `Calling ${rawEvent.tool}(${JSON.stringify(rawEvent.args)})`;
          } else if (rawEvent.type === 'rate_limit_event') {
            event.type = 'rate_limit';
            event.content = 'Rate limit hit - waiting...';
          } else if (rawEvent.type === 'result' || rawEvent.type === 'turn_complete') {
            event.type = 'result';
            event.content = summarizeResultContent(rawEvent);
            lastResult = rawEvent as TurnResult;

            // Capture token usage from the result event
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
          } else if (rawEvent.type === 'message') {
            // Full Claude API message object — skip (content arrives via text/call events)
            continue;
          } else {
            event.type = 'status';
            event.content =
              typeof rawEvent.message === 'string'
                ? rawEvent.message
                : (rawEvent.type ?? 'unknown');
          }

          yield event;
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
