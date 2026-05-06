/**
 * Spec 2 Phase 3 / Task 16: integration test for multi-resolver
 * independence (SC37).
 *
 * With two `local`/`pi` backends at distinct endpoints, the unreachable
 * resolver reports `available: false` while the reachable one reports
 * `available: true` independently. Routing each backend through its
 * own resolver is the foundation for the multi-status dashboard
 * surface (SC38-40, autopilot Phase 4).
 *
 * The test injects a custom `fetchModels` per resolver — `up` returns a
 * non-empty model list immediately; `down` rejects every probe.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import type { LocalModelResolver } from '../../src/agent/local-model-resolver';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

let tmpDir: string;

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  } as unknown as IssueTrackerClient;
}

function makeConfig(overrides: Partial<WorkflowConfig['agent']> = {}): WorkflowConfig {
  return {
    tracker: {
      kind: 'mock',
      activeStates: ['planned'],
      terminalStates: ['done'],
    },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
      ...overrides,
    },
    server: { port: null },
  } as WorkflowConfig;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-multi-resolver-'));
  execFileSync(
    'sh',
    [
      '-c',
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
    ],
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('Multi-resolver independence (Spec 2 SC37)', () => {
  it('two pi backends at distinct endpoints report independent availability', async () => {
    const config = makeConfig({
      backend: 'mock',
      backends: {
        // Two pi backends at distinct endpoints. The Orchestrator
        // constructor populates `localResolvers` with one resolver per
        // entry, each scoped to its own endpoint.
        up: {
          type: 'pi',
          endpoint: 'http://up:1234/v1',
          model: 'gemma-4-e4b',
          probeIntervalMs: 60_000,
        },
        down: {
          type: 'pi',
          endpoint: 'http://down:9999/v1',
          model: 'phi-3-mini',
          probeIntervalMs: 60_000,
        },
      },
      routing: { default: 'up', 'quick-fix': 'down' },
    });
    const orch = new Orchestrator(config, 'Prompt', {
      tracker: makeMockTracker(),
      execFileFn: noopExecFile,
    });

    // Inject per-resolver fetchModels stubs so we can drive
    // availability deterministically without network.
    const resolvers = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
      .localResolvers;
    expect(resolvers.size).toBe(2);

    const upResolver = resolvers.get('up');
    const downResolver = resolvers.get('down');
    expect(upResolver).not.toBeUndefined();
    expect(downResolver).not.toBeUndefined();

    (
      upResolver as unknown as {
        fetchModels: (e: string, k?: string) => Promise<string[]>;
      }
    ).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    (
      downResolver as unknown as {
        fetchModels: (e: string, k?: string) => Promise<string[]>;
      }
    ).fetchModels = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await orch.start();

      // Spec 2 SC37: independent availability.
      const upStatus = upResolver!.getStatus();
      const downStatus = downResolver!.getStatus();
      expect(upStatus.available).toBe(true);
      expect(upStatus.resolved).toBe('gemma-4-e4b');
      expect(downStatus.available).toBe(false);

      // Independence — the up resolver's recovery does not leak into
      // the down resolver's status. (Verifies no shared state via the
      // observable surface: configured candidate lists are per-resolver,
      // resolved model is per-resolver, lastError is per-resolver.)
      expect(upStatus.configured).toEqual(['gemma-4-e4b']);
      expect(downStatus.configured).toEqual(['phi-3-mini']);
      expect(upStatus.resolved).toBe('gemma-4-e4b');
      expect(downStatus.resolved).toBeNull();
      // Down should record an error from the rejected fetchModels;
      // up should be clean.
      expect(upStatus.lastError).toBeNull();
      expect(downStatus.lastError).not.toBeNull();
    } finally {
      await orch.stop();
    }
  });

  it('factory routes to the correct resolver-bound backend per use-case', async () => {
    const config = makeConfig({
      backend: 'mock',
      backends: {
        up: {
          type: 'pi',
          endpoint: 'http://up:1234/v1',
          model: 'gemma-4-e4b',
          probeIntervalMs: 60_000,
        },
        down: {
          type: 'pi',
          endpoint: 'http://down:9999/v1',
          model: 'phi-3-mini',
          probeIntervalMs: 60_000,
        },
      },
      routing: { default: 'up', 'quick-fix': 'down' },
    });
    const orch = new Orchestrator(config, 'Prompt', {
      tracker: makeMockTracker(),
      execFileFn: noopExecFile,
    });

    const resolvers = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
      .localResolvers;
    (
      resolvers.get('up') as unknown as {
        fetchModels: (e: string, k?: string) => Promise<string[]>;
      }
    ).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    (
      resolvers.get('down') as unknown as {
        fetchModels: (e: string, k?: string) => Promise<string[]>;
      }
    ).fetchModels = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await orch.start();
      // Drive backend instantiation per useCase via the orchestrator's
      // factory directly (analogue of dispatch). Each pi backend's
      // `getModel` is bound to its own resolver, so the up backend
      // resolves a model and the down backend does not.
      const factory = (
        orch as unknown as {
          backendFactory: import('../../src/agent/orchestrator-backend-factory').OrchestratorBackendFactory;
        }
      ).backendFactory;

      const upBackend = factory.forUseCase({ kind: 'maintenance' }); // → default=up
      const downBackend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' }); // → down

      // The resolver-bound getModel for `up` returns the loaded model;
      // for `down` it returns null (resolver unavailable). Since
      // PiBackend.getModel is opaque from outside, we observe via the
      // resolver's resolveModel() — same callback used by getModel.
      expect(resolvers.get('up')!.resolveModel()).toBe('gemma-4-e4b');
      expect(resolvers.get('down')!.resolveModel()).toBeNull();

      // The factory returned distinct instances (no caching across
      // calls).
      expect(upBackend).not.toBe(downBackend);
    } finally {
      await orch.stop();
    }
  });
});
