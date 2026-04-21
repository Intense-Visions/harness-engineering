import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Err,
  AgentError,
} from '@harness-engineering/types';
import type {
  ContainerRuntime,
  ContainerHandle,
  SecretBackend,
  ContainerConfig,
} from '@harness-engineering/types';

function toAgentError(message: string, details?: unknown): AgentError {
  return { category: 'response_error', message, details };
}

const BLOCKED_FLAGS = ['--privileged', '--cap-add', '--security-opt', '--pid', '--ipc', '--userns'];

function sanitizeExtraArgs(extraArgs: string[] | undefined): string[] {
  if (!extraArgs) return [];
  return extraArgs.filter((arg) => !BLOCKED_FLAGS.some((flag) => arg.startsWith(flag)));
}

/**
 * Decorator that wraps any AgentBackend, running sessions inside containers.
 *
 * Container lifecycle:
 * - startSession: resolve secrets -> create container -> delegate to inner backend
 * - runTurn: delegate directly to inner backend (runs inside container)
 * - stopSession: delegate to inner backend -> remove container
 */
export class ContainerBackend implements AgentBackend {
  readonly name: string;
  private containerHandles = new Map<string, ContainerHandle>();

  constructor(
    private inner: AgentBackend,
    private runtime: ContainerRuntime,
    private secretBackend: SecretBackend | null,
    private containerConfig: ContainerConfig,
    private secretKeys: string[] = []
  ) {
    this.name = `container:${inner.name}`;
  }

  private async resolveEnv(): Promise<Result<Record<string, string>, AgentError>> {
    if (!this.secretBackend || this.secretKeys.length === 0) {
      return { ok: true, value: {} } as Result<Record<string, string>, AgentError>;
    }
    const result = await this.secretBackend.resolveSecrets(this.secretKeys);
    if (!result.ok) {
      return Err(toAgentError(`Secret resolution failed: ${result.error.message}`, result.error));
    }
    return { ok: true, value: result.value } as Result<Record<string, string>, AgentError>;
  }

  private buildCreateOpts(
    params: SessionStartParams,
    env: Record<string, string>
  ): import('@harness-engineering/types').ContainerCreateOpts {
    const opts: import('@harness-engineering/types').ContainerCreateOpts = {
      image: this.containerConfig.image,
      workspacePath: params.workspacePath,
      readOnly: this.containerConfig.readOnly ?? true,
      user: this.containerConfig.user ?? '1000:1000',
      network: this.containerConfig.network ?? 'none',
      env,
    };
    const sanitized = sanitizeExtraArgs(this.containerConfig.extraArgs);
    if (sanitized.length > 0) {
      opts.extraArgs = sanitized;
    }
    return opts;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const envResult = await this.resolveEnv();
    if (!envResult.ok) return envResult as Result<AgentSession, AgentError>;

    const createOpts = this.buildCreateOpts(params, envResult.value);
    const containerResult = await this.runtime.createContainer(createOpts);
    if (!containerResult.ok) {
      return Err(
        toAgentError(
          `Container creation failed: ${containerResult.error.message}`,
          containerResult.error
        )
      );
    }

    const sessionResult = await this.inner.startSession(params);
    if (!sessionResult.ok) {
      await this.runtime.removeContainer(containerResult.value);
      return sessionResult;
    }

    this.containerHandles.set(sessionResult.value.sessionId, containerResult.value);
    return sessionResult;
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    return yield* this.inner.runTurn(session, params);
  }

  async stopSession(session: AgentSession): Promise<Result<void, AgentError>> {
    const stopResult = await this.inner.stopSession(session);

    const handle = this.containerHandles.get(session.sessionId);
    if (handle) {
      this.containerHandles.delete(session.sessionId);
      const removeResult = await this.runtime.removeContainer(handle);
      if (!removeResult.ok) {
        return Err(
          toAgentError(
            `Container removal failed: ${removeResult.error.message}`,
            removeResult.error
          )
        );
      }
    }

    return stopResult;
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    const runtimeResult = await this.runtime.healthCheck();
    if (!runtimeResult.ok) {
      return Err({
        category: 'agent_not_found',
        message: `Container runtime unhealthy: ${runtimeResult.error.message}`,
        details: runtimeResult.error,
      });
    }

    return this.inner.healthCheck();
  }
}
