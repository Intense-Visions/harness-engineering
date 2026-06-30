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
 * Opaque handle to a cold-started serverless workload. Producers
 * (`coldStart`) return one; consumers (`runOnHandle`, `teardown`)
 * accept one.
 */
export interface ServerlessHandle {
  /** Adapter-specific identifier (e.g., container id, Modal task id). */
  id: string;
  /** Backend name that produced this handle, for cross-adapter mismatch detection. */
  adapter: string;
  /** Optional metadata; adapters may stash anything they need here. */
  meta?: Record<string, unknown>;
}

/**
 * Abstract base class for serverless agent backends (Hermes Phase 5).
 *
 * Models the cold-start / run / teardown lifecycle as three primitives
 * and implements the {@link AgentBackend} session/turn protocol on top
 * of them. Concrete adapters override the three abstract methods only;
 * the session lifecycle, handle tracking, and protocol parsing are
 * shared.
 */
export abstract class ServerlessBackend implements AgentBackend {
  abstract readonly name: string;
  protected handles = new Map<string, ServerlessHandle>();

  protected abstract coldStart(
    params: SessionStartParams
  ): Promise<Result<ServerlessHandle, AgentError>>;
  protected abstract runOnHandle(
    handle: ServerlessHandle,
    params: TurnParams,
    session: AgentSession
  ): AsyncGenerator<AgentEvent, TurnResult, void>;
  protected abstract teardown(handle: ServerlessHandle): Promise<Result<void, AgentError>>;

  /**
   * Default health check verifies the adapter can list / probe its
   * own infrastructure. Concrete adapters should override this.
   */
  abstract healthCheck(): Promise<Result<void, AgentError>>;

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const start = await this.coldStart(params);
    if (!start.ok) return start as Result<AgentSession, AgentError>;
    const session: AgentSession = {
      sessionId: `${this.name}-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
    };
    this.handles.set(session.sessionId, start.value);
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const handle = this.handles.get(session.sessionId);
    if (!handle) {
      return {
        success: false,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        error: `no serverless handle for session ${session.sessionId}`,
      };
    }
    return yield* this.runOnHandle(handle, params, session);
  }

  async stopSession(session: AgentSession): Promise<Result<void, AgentError>> {
    const handle = this.handles.get(session.sessionId);
    if (!handle) return Ok(undefined);
    this.handles.delete(session.sessionId);
    return this.teardown(handle);
  }
}

// --- OCI adapter ---------------------------------------------------------

const FORBIDDEN_IMAGE_CHARS = /[;&|`$()\n\r<>]/;
const BLOCKED_DOCKER_FLAGS = [
  '--privileged',
  '--cap-add',
  '--security-opt',
  '--pid',
  '--ipc',
  '--userns',
];

export interface OciServerlessBackendConfig {
  image: string;
  registry?: string;
  pullPolicy?: 'always' | 'if-not-present' | 'never';
  envPassthrough?: string[];
  runtime?: 'docker' | 'podman';
  /** Per-turn timeout in ms. Default: 90_000. */
  timeoutMs?: number;
  /** Extra args passed to `docker run`. Sanitized against `BLOCKED_DOCKER_FLAGS`. */
  extraArgs?: string[];
  /** Test seam: override the `spawn` implementation. */
  spawnImpl?: typeof spawn;
  /** Test seam: override `process.env`. */
  envSource?: NodeJS.ProcessEnv;
}

const DEFAULT_OCI_TIMEOUT_MS = 90_000;

type ResolvedOciConfig = Required<
  Pick<
    OciServerlessBackendConfig,
    'image' | 'pullPolicy' | 'runtime' | 'envPassthrough' | 'timeoutMs' | 'extraArgs'
  >
> &
  Omit<
    OciServerlessBackendConfig,
    | 'image'
    | 'pullPolicy'
    | 'runtime'
    | 'envPassthrough'
    | 'timeoutMs'
    | 'extraArgs'
    | 'spawnImpl'
    | 'envSource'
  >;

/**
 * Concrete serverless adapter using OCI images via `docker` (or
 * `podman`). Cold-starts a detached container per session, execs into
 * it for each turn (sending the prompt on stdin, reading NDJSON events
 * on stdout), and stops + removes the container on session stop.
 */
export class OciServerlessBackend extends ServerlessBackend {
  readonly name = 'serverless:oci';
  private readonly config: ResolvedOciConfig;
  private readonly spawnImpl: typeof spawn;
  private readonly envSource: NodeJS.ProcessEnv;

  constructor(config: OciServerlessBackendConfig) {
    super();
    validateOciImage(config.image);
    this.config = resolveOciConfig(config);
    this.spawnImpl = config.spawnImpl ?? spawn;
    this.envSource = config.envSource ?? process.env;
  }

  /** Builds the argv for `docker run -d ...`. Exposed for tests. */
  buildRunArgs(): string[] {
    const env = this.collectEnv();
    const args = ['run', '-d', '--rm'];
    for (const [k, v] of Object.entries(env)) {
      args.push('-e', `${k}=${v}`);
    }
    for (const ea of this.config.extraArgs) {
      args.push(ea);
    }
    args.push('--');
    args.push(this.config.image);
    return args;
  }

  /** Builds the argv for `docker exec <id> -- agent`. Exposed for tests. */
  buildExecArgs(handleId: string): string[] {
    return ['exec', '-i', handleId, '/agent'];
  }

  protected async coldStart(
    _params: SessionStartParams
  ): Promise<Result<ServerlessHandle, AgentError>> {
    if (this.config.pullPolicy === 'always') {
      const pull = await this.runOneShot(this.config.runtime, ['pull', this.config.image]);
      if (!pull.ok) return pull as Result<ServerlessHandle, AgentError>;
    }
    const result = await this.runOneShot(this.config.runtime, this.buildRunArgs());
    if (!result.ok) return result as Result<ServerlessHandle, AgentError>;
    const id = result.value.trim().split(/\s+/)[0] ?? '';
    if (!id) {
      return Err({
        category: 'response_error',
        message: 'OciServerlessBackend: empty container id from runtime',
      });
    }
    return Ok({ id, adapter: this.name });
  }

  protected async *runOnHandle(
    handle: ServerlessHandle,
    params: TurnParams,
    session: AgentSession
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const child = this.spawnImpl(this.config.runtime, this.buildExecArgs(handle.id), {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    const payload = JSON.stringify({
      kind: 'turn',
      prompt: params.prompt,
      isContinuation: params.isContinuation,
    });
    try {
      child.stdin.write(payload + '\n');
      child.stdin.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to write to docker stdin';
      return turnFailure(session.sessionId, message);
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
        const ev = tryParseEvent(line, session.sessionId);
        if (!ev) continue;
        if (ev.usage) finalUsage = ev.usage;
        if (ev.type === 'error' && typeof ev.content === 'string') {
          success = false;
          lastError = ev.content;
        }
        yield ev;
      }
      const code = await waitForExit(child);
      if (code !== 0 && code !== null) {
        success = false;
        lastError = lastError ?? `runtime exec exited with code ${code}`;
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

  protected async teardown(handle: ServerlessHandle): Promise<Result<void, AgentError>> {
    if (handle.adapter !== this.name) {
      return Err({
        category: 'response_error',
        message: `handle adapter mismatch: got '${handle.adapter}', expected '${this.name}'`,
      });
    }
    const stop = await this.runOneShot(this.config.runtime, ['stop', handle.id]);
    if (!stop.ok) return stop as Result<void, AgentError>;
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    return mapOk(
      await this.runOneShot(this.config.runtime, ['version', '--format', '{{.Server.Version}}'])
    );
  }

  private collectEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of this.config.envPassthrough) {
      const val = this.envSource[key];
      if (typeof val === 'string') out[key] = val;
    }
    return out;
  }

  private runOneShot(binary: string, args: string[]): Promise<Result<string, AgentError>> {
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnImpl(binary, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        resolve(
          Err({
            category: 'agent_not_found',
            message: err instanceof Error ? err.message : 'failed to spawn runtime',
          })
        );
        return;
      }
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
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
          resolve(Ok(stdout));
        } else {
          resolve(
            Err({
              category: 'response_error',
              message: `runtime '${binary} ${args.join(' ')}' exited ${code ?? 'null'}: ${stderr.slice(0, 500)}`,
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

function validateOciImage(image: string): void {
  if (!image || typeof image !== 'string') {
    throw new Error('OciServerlessBackend: `image` is required');
  }
  if (FORBIDDEN_IMAGE_CHARS.test(image) || image.startsWith('-')) {
    throw new Error(
      `OciServerlessBackend: invalid image '${image}' (contains shell metacharacters or starts with '-')`
    );
  }
}

function resolveOciConfig(config: OciServerlessBackendConfig): ResolvedOciConfig {
  return {
    image: config.image,
    pullPolicy: config.pullPolicy ?? 'if-not-present',
    runtime: config.runtime ?? 'docker',
    envPassthrough: config.envPassthrough ?? [],
    timeoutMs: config.timeoutMs ?? DEFAULT_OCI_TIMEOUT_MS,
    extraArgs: sanitizeExtraArgs(config.extraArgs),
    ...(config.registry !== undefined ? { registry: config.registry } : {}),
  };
}

function sanitizeExtraArgs(extraArgs: string[] | undefined): string[] {
  if (!extraArgs) return [];
  return extraArgs.filter((arg) => !BLOCKED_DOCKER_FLAGS.some((flag) => arg.startsWith(flag)));
}

function mapOk(r: Result<string, AgentError>): Result<void, AgentError> {
  return r.ok ? Ok(undefined) : (r as Result<void, AgentError>);
}

function turnFailure(sessionId: string, message: string): TurnResult {
  return {
    success: false,
    sessionId,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    error: message,
  };
}

function tryParseEvent(line: string, sessionId: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string') return null;
  const ev: AgentEvent = {
    type: o.type,
    timestamp: typeof o.timestamp === 'string' ? o.timestamp : new Date().toISOString(),
    sessionId,
  };
  if (typeof o.subtype === 'string') ev.subtype = o.subtype;
  if (o.content !== undefined) ev.content = o.content;
  if (isUsage(o.usage)) ev.usage = o.usage;
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
