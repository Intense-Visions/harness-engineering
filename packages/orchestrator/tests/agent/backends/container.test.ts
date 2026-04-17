import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerBackend } from '../../../src/agent/backends/container';
import type {
  AgentBackend,
  AgentSession,
  AgentEvent,
  TurnResult,
  ContainerRuntime,
  ContainerHandle,
  SecretBackend,
  ContainerConfig,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

function createMockBackend(): AgentBackend {
  return {
    name: 'mock',
    startSession: vi.fn().mockResolvedValue(
      Ok({
        sessionId: 'session-1',
        workspacePath: '/workspace',
        backendName: 'mock',
        startedAt: new Date().toISOString(),
      })
    ),
    runTurn: vi.fn(function* () {
      yield {
        type: 'text',
        timestamp: new Date().toISOString(),
        content: 'hello',
        sessionId: 'session-1',
      } as AgentEvent;
      return {
        success: true,
        sessionId: 'session-1',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } as TurnResult;
    }),
    stopSession: vi.fn().mockResolvedValue(Ok(undefined)),
    healthCheck: vi.fn().mockResolvedValue(Ok(undefined)),
  };
}

function createMockRuntime(): ContainerRuntime {
  return {
    name: 'docker',
    createContainer: vi
      .fn()
      .mockResolvedValue(
        Ok({ containerId: 'container-abc', runtime: 'docker' } as ContainerHandle)
      ),
    execInContainer: vi.fn(async function* () {
      yield 'output line';
      return 0;
    }),
    removeContainer: vi.fn().mockResolvedValue(Ok(undefined)),
    healthCheck: vi.fn().mockResolvedValue(Ok(undefined)),
  };
}

function createMockSecretBackend(): SecretBackend {
  return {
    name: 'env',
    resolveSecrets: vi.fn().mockResolvedValue(Ok({ API_KEY: 'secret123' })),
    healthCheck: vi.fn().mockResolvedValue(Ok(undefined)),
  };
}

const defaultContainerConfig: ContainerConfig = {
  runtime: 'docker',
  image: 'node:22-slim',
  readOnly: true,
  user: '1000:1000',
  network: 'host',
};

describe('ContainerBackend', () => {
  let inner: AgentBackend;
  let runtime: ContainerRuntime;
  let secrets: SecretBackend;
  let backend: ContainerBackend;

  beforeEach(() => {
    inner = createMockBackend();
    runtime = createMockRuntime();
    secrets = createMockSecretBackend();
    backend = new ContainerBackend(inner, runtime, secrets, defaultContainerConfig, ['API_KEY']);
  });

  it('has composite name', () => {
    expect(backend.name).toBe('container:mock');
  });

  describe('startSession', () => {
    it('creates container, resolves secrets, and delegates to inner backend', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(true);
      // Secrets resolved
      expect(secrets.resolveSecrets).toHaveBeenCalled();
      // Container created with correct opts
      expect(runtime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          image: 'node:22-slim',
          workspacePath: '/tmp/workspace',
          readOnly: true,
          user: '1000:1000',
          network: 'host',
          env: { API_KEY: 'secret123' },
        })
      );
      // Inner backend started
      expect(inner.startSession).toHaveBeenCalled();
    });

    it('returns Err when container creation fails', async () => {
      (runtime.createContainer as any).mockResolvedValue(
        Err({ category: 'container_create_failed', message: 'no docker' })
      );

      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('response_error');
      }
    });

    it('returns Err when secret resolution fails', async () => {
      (secrets.resolveSecrets as any).mockResolvedValue(
        Err({ category: 'secret_not_found', message: 'missing key', key: 'API_KEY' })
      );

      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(false);
    });

    it('works without secret backend', async () => {
      const backendNoSecrets = new ContainerBackend(inner, runtime, null, defaultContainerConfig);

      const result = await backendNoSecrets.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(true);
      expect(runtime.createContainer).toHaveBeenCalledWith(expect.objectContaining({ env: {} }));
    });
  });

  describe('runTurn', () => {
    it('delegates to inner backend', async () => {
      // Start session first to set up container tracking
      await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      const session: AgentSession = {
        sessionId: 'session-1',
        workspacePath: '/workspace',
        backendName: 'container:mock',
        startedAt: new Date().toISOString(),
      };

      const events: AgentEvent[] = [];
      const gen = backend.runTurn(session, {
        sessionId: 'session-1',
        prompt: 'test',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('text');
      expect(inner.runTurn).toHaveBeenCalled();
    });
  });

  describe('stopSession', () => {
    it('delegates to inner backend and removes container', async () => {
      // Start session first
      await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      const session: AgentSession = {
        sessionId: 'session-1',
        workspacePath: '/workspace',
        backendName: 'container:mock',
        startedAt: new Date().toISOString(),
      };

      const result = await backend.stopSession(session);

      expect(result.ok).toBe(true);
      expect(inner.stopSession).toHaveBeenCalled();
      expect(runtime.removeContainer).toHaveBeenCalledWith(
        expect.objectContaining({ containerId: 'container-abc' })
      );
    });
  });

  describe('healthCheck', () => {
    it('checks both inner backend and runtime', async () => {
      const result = await backend.healthCheck();

      expect(result.ok).toBe(true);
      expect(inner.healthCheck).toHaveBeenCalled();
      expect(runtime.healthCheck).toHaveBeenCalled();
    });

    it('returns Err when runtime health check fails', async () => {
      (runtime.healthCheck as any).mockResolvedValue(
        Err({ category: 'runtime_not_found', message: 'docker not found' })
      );

      const result = await backend.healthCheck();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('docker not found');
      }
    });

    it('returns Err when inner backend health check fails', async () => {
      (inner.healthCheck as any).mockResolvedValue(
        Err({ category: 'agent_not_found', message: 'claude not found' })
      );

      const result = await backend.healthCheck();

      expect(result.ok).toBe(false);
    });
  });
});
