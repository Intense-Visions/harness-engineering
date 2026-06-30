import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  type AgentBackend,
  type SessionStartParams,
  type AgentSession,
  type TurnParams,
  type AgentEvent,
  type TurnResult,
  type TokenUsage,
  type Result,
  Ok,
  Err,
  type AgentError,
} from '@harness-engineering/types';

/**
 * Configuration for {@link SshBackend}. Mirrors the public
 * `SshBackendDef` minus the `type` discriminant.
 */
export interface SshBackendConfig {
  host: string;
  user?: string;
  port?: number;
  identityFile?: string;
  remoteCommand: string;
  sshOptions?: string[];
  sshBinary?: string;
  /** Per-turn timeout in ms. Default: 90_000. */
  timeoutMs?: number;
  /** Test seam: override the `spawn` implementation. */
  spawnImpl?: typeof spawn;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const FORBIDDEN_HOST_CHARS = /[;&|`$()\n\r<>]/;

interface SshSession extends AgentSession {
  systemPrompt?: string;
}

/** Resolved internal config shape held by {@link SshBackend}. */
type ResolvedSshConfig = Required<
  Pick<SshBackendConfig, 'host' | 'remoteCommand' | 'sshBinary' | 'sshOptions' | 'timeoutMs'>
> &
  Omit<
    SshBackendConfig,
    'spawnImpl' | 'host' | 'remoteCommand' | 'sshBinary' | 'sshOptions' | 'timeoutMs'
  >;

/**
 * SSH agent dispatch backend (Hermes Phase 5).
 *
 * Spawns the agent process on a remote host via the operator's `ssh`
 * binary. Each turn is its own short-lived `ssh` child process — the
 * remote command is expected to read a single prompt from stdin and
 * stream NDJSON agent events on stdout, terminating with `\n`. Returned
 * events are deserialized and yielded to the caller; final usage and
 * success status are derived from the last `usage` event seen.
 *
 * D3 (proposal): uses the operator's existing `~/.ssh/config` rather
 * than a separate Node SSH client — no new transitive dependency, and
 * authentication / known-hosts are the operator's existing trust
 * anchor. The constructor validates that `host` does not contain shell
 * metacharacters; arguments are passed as an array to `spawn` so there
 * is no shell interpolation.
 */
export class SshBackend implements AgentBackend {
  readonly name = 'ssh';
  private readonly config: ResolvedSshConfig;
  private readonly spawnImpl: typeof spawn;

  constructor(config: SshBackendConfig) {
    validateSshConfig(config);
    this.config = normalizeSshConfig(config);
    this.spawnImpl = config.spawnImpl ?? spawn;
  }

  /**
   * Builds the argv passed to the `ssh` binary. Exported as a method on
   * the class so tests can assert the exact shape without spawning.
   *
   * Layout: `[options..., target, '--', remoteCommand]`
   */
  buildSshArgs(): string[] {
    const args: string[] = [];
    if (this.config.identityFile) {
      args.push('-i', this.config.identityFile);
    }
    if (this.config.port !== undefined) {
      args.push('-p', String(this.config.port));
    }
    args.push('-o', 'BatchMode=yes');
    for (const opt of this.config.sshOptions) {
      args.push('-o', opt);
    }
    const target = this.config.user ? `${this.config.user}@${this.config.host}` : this.config.host;
    args.push(target);
    // `--` terminates option parsing so a maliciously crafted remoteCommand
    // cannot be interpreted as an ssh flag.
    args.push('--');
    args.push(this.config.remoteCommand);
    return args;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: SshSession = {
      sessionId: `ssh-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
      ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const child = this.spawnImpl(this.config.sshBinary, this.buildSshArgs(), {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    const payload = JSON.stringify({
      kind: 'turn',
      prompt: params.prompt,
      isContinuation: params.isContinuation,
      systemPrompt: (session as SshSession).systemPrompt,
    });
    try {
      child.stdin.write(payload + '\n');
      child.stdin.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to write to ssh stdin';
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      return errResult(session.sessionId, message);
    }

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }, this.config.timeoutMs);

    let finalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let success = true;
    let lastError: string | undefined;

    try {
      for await (const line of readLines(child.stdout)) {
        let event: AgentEvent | null;
        try {
          event = parseEvent(line, session.sessionId);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unparseable ssh event';
          success = false;
          lastError = message;
          break;
        }
        if (!event) continue;
        if (event.usage) finalUsage = event.usage;
        if (event.type === 'error' && typeof event.content === 'string') {
          lastError = event.content;
          success = false;
        }
        yield event;
      }
      const exitCode = await waitForExit(child);
      if (exitCode !== 0 && exitCode !== null) {
        success = false;
        lastError = lastError ?? `ssh exited with code ${exitCode}`;
      }
    } finally {
      clearTimeout(timeout);
    }

    return {
      success,
      sessionId: session.sessionId,
      usage: finalUsage,
      ...(lastError !== undefined ? { error: lastError } : {}),
    };
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    const args = [...this.buildSshArgs()];
    // Replace the remote command (final arg) with a trivial probe.
    args[args.length - 1] = 'true';
    return new Promise<Result<void, AgentError>>((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnImpl(this.config.sshBinary, args, {
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch (err) {
        resolve(
          Err({
            category: 'agent_not_found',
            message: err instanceof Error ? err.message : 'failed to spawn ssh',
          })
        );
        return;
      }
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }, this.config.timeoutMs);
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(Ok(undefined));
        } else {
          resolve(
            Err({
              category: 'agent_not_found',
              message: `ssh health check failed (exit=${code ?? 'null'}): ${stderr.slice(0, 500)}`,
            })
          );
        }
      });
      child.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve(Err({ category: 'agent_not_found', message: err.message }));
      });
    });
  }
}

/**
 * Validates an {@link SshBackendConfig}, throwing on any invalid field.
 * Extracted from the constructor to keep its complexity bounded.
 */
function validateSshConfig(config: SshBackendConfig): void {
  if (!config.host || typeof config.host !== 'string') {
    throw new Error('SshBackend: `host` is required');
  }
  if (FORBIDDEN_HOST_CHARS.test(config.host) || config.host.startsWith('-')) {
    throw new Error(
      `SshBackend: invalid host '${config.host}' (contains shell metacharacters or starts with '-')`
    );
  }
  if (!config.remoteCommand || typeof config.remoteCommand !== 'string') {
    throw new Error('SshBackend: `remoteCommand` is required');
  }
  if (config.user !== undefined && /[\s;&|`$]/.test(config.user)) {
    throw new Error(`SshBackend: invalid user '${config.user}'`);
  }
}

/**
 * Applies defaults and drops optional-unset fields, producing the
 * resolved config shape held by {@link SshBackend}.
 */
function normalizeSshConfig(config: SshBackendConfig): ResolvedSshConfig {
  return {
    host: config.host,
    remoteCommand: config.remoteCommand,
    sshBinary: config.sshBinary ?? 'ssh',
    sshOptions: config.sshOptions ?? [],
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(config.user !== undefined ? { user: config.user } : {}),
    ...(config.port !== undefined ? { port: config.port } : {}),
    ...(config.identityFile !== undefined ? { identityFile: config.identityFile } : {}),
  };
}

function errResult(sessionId: string, message: string): TurnResult {
  return {
    success: false,
    sessionId,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    error: message,
  };
}

function parseEvent(line: string, sessionId: string): AgentEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const raw = JSON.parse(trimmed) as Record<string, unknown>;
  if (typeof raw.type !== 'string') {
    throw new Error(`ssh event missing 'type': ${trimmed.slice(0, 200)}`);
  }
  const ev: AgentEvent = {
    type: raw.type,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    sessionId,
  };
  if (typeof raw.subtype === 'string') ev.subtype = raw.subtype;
  if (raw.content !== undefined) ev.content = raw.content;
  if (isUsage(raw.usage)) ev.usage = raw.usage;
  return ev;
}

function isUsage(u: unknown): u is TokenUsage {
  if (!u || typeof u !== 'object') return false;
  const o = u as Record<string, unknown>;
  return (
    typeof o.inputTokens === 'number' &&
    typeof o.outputTokens === 'number' &&
    typeof o.totalTokens === 'number'
  );
}

async function* readLines(stream: NodeJS.ReadableStream): AsyncGenerator<string, void, void> {
  let buffer = '';
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
    }
  }
  if (buffer.length > 0) yield buffer;
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once('close', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });
}
