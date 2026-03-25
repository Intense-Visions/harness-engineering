import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
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

export class ClaudeBackend implements AgentBackend {
  readonly name = 'claude';
  private command: string;

  constructor(command = 'claude') {
    this.command = command;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: AgentSession = {
      sessionId: `claude-session-${Date.now()}`,
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
    const args = ['-p', params.prompt, '--output-format', 'json'];

    if (params.isContinuation) {
      args.push('--resume', session.sessionId);
    }

    const child = spawn(this.command, args, {
      cwd: session.workspacePath,
      env: process.env,
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    let lastResult: TurnResult | null = null;

    try {
      for await (const line of rl) {
        try {
          const event = JSON.parse(line) as AgentEvent;
          yield event;
          if (event.type === 'result') {
            lastResult = event.content as TurnResult;
          }
        } catch {
          // Ignore non-JSON output (e.g. streaming thoughts)
        }
      }
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
      rl.close();
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
      child.on('exit', (code) => {
        if (code === 0) {
          resolve(Ok(undefined));
        } else {
          resolve(
            Err({
              category: 'agent_not_found',
              message: `Claude command '${this.command}' not found or failed`,
            })
          );
        }
      });
      child.on('error', () => {
        resolve(
          Err({
            category: 'agent_not_found',
            message: `Claude command '${this.command}' not found`,
          })
        );
      });
    });
  }
}
