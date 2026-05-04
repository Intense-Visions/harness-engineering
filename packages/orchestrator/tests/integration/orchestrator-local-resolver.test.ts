import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';
import type { LocalModelResolver } from '../../src/agent/local-model-resolver';

let tmpDir: string;

/**
 * Spec 2 Phase 3 / Task 10: read the first registered LocalModelResolver
 * from the orchestrator's per-named-backend Map. Returns `null` when no
 * local resolver is registered (cloud-only configs). Replaces the
 * Phase 1 `localModelResolver` field — the Map is now the single source
 * of truth (SC37). Test-only: TypeScript private fields are
 * structurally accessible at runtime.
 */
function firstResolver(orch: Orchestrator): LocalModelResolver | null {
  const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
    .localResolvers;
  const first = map.values().next();
  return first.done ? null : first.value;
}

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-resolver-'));
  execSync(
    'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
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

describe('Orchestrator + LocalModelResolver wiring (Phase 3)', () => {
  describe('SC1 — backwards compat (string form)', () => {
    it('OT1: constructs resolver with normalized 1-element configured list', () => {
      const config = makeConfig({
        localBackend: 'openai-compatible',
        localModel: 'gemma-4-e4b',
        localEndpoint: 'http://localhost:11434/v1',
      });
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      // Access via test-only field exposure: TypeScript private fields are
      // structurally accessible at runtime — read with a typed cast.
      const resolver = firstResolver(orch);
      expect(resolver).not.toBeNull();
      expect(resolver!.getStatus().configured).toEqual(['gemma-4-e4b']);
    });
  });

  describe('SC2 — resolver gated by localBackend', () => {
    it('OT2a: cloud-only config does NOT instantiate any resolver', () => {
      const config = makeConfig({ backend: 'mock' }); // no localBackend
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      // Spec 2 SC37: localResolvers Map should be empty for cloud-only configs.
      const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
        .localResolvers;
      expect(map.size).toBe(0);
      expect(firstResolver(orch)).toBeNull();
    });

    it('OT2b: claude/anthropic/openai/gemini configs do not instantiate any resolver', () => {
      for (const backend of ['claude', 'anthropic', 'openai', 'gemini'] as const) {
        const config = makeConfig({ backend, apiKey: 'test-key' });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
          .localResolvers;
        expect(map.size, `localResolvers should be empty for backend=${backend}`).toBe(0);
      }
    });
  });

  describe('SC-CON1 / SC-CON2 — single read site, single resolver consumer (Phase 3)', () => {
    it('OT9: source has zero direct reads of agent.localModel (consumed by migrateAgentConfig)', () => {
      // Phase 3 / Task 9: migrateAgentConfig now consumes the legacy
      // agent.localModel field at the constructor's start. The resolver
      // ctor site reads `def.model` from the synthesized backends Map.
      // Asserting zero direct reads catches accidental regressions to
      // dual-path field consumption.
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      const matches = src.match(/this\.config\.agent\.localModel\b/g) ?? [];
      expect(
        matches.length,
        `expected zero reads of this.config.agent.localModel after Phase 3 migration; got ${matches.length}`
      ).toBe(0);
    });

    it('OT10: createAnalysisProvider references localResolvers; legacy createBackend/createLocalBackend gone', () => {
      // Phase 3 / Tasks 10-12: the single-resolver field has been
      // replaced by a per-named-backend Map (SC37) consumed by
      // `createAnalysisProvider`. The legacy two-runner methods
      // `createBackend()` and `createLocalBackend()` have been deleted
      // outright (SC30) — the per-dispatch `OrchestratorBackendFactory`
      // owns backend construction now.
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );

      const analysisProviderMatch = src.match(/private createAnalysisProvider\(\)[\s\S]*?\n  \}/);
      expect(analysisProviderMatch, 'createAnalysisProvider method not found').not.toBeNull();
      expect(analysisProviderMatch![0]).toMatch(/this\.localResolvers/);

      // No PHASE3-REMOVE markers remain.
      expect(src).not.toMatch(/PHASE3-REMOVE/);
      // The legacy single-resolver field must be gone (SC37).
      expect(src).not.toMatch(/private\s+localModelResolver\s*[:=]/);
      // Spec 2 SC30: legacy two-runner builders must be gone.
      expect(src).not.toMatch(/private\s+createBackend\s*\(/);
      expect(src).not.toMatch(/private\s+createLocalBackend\s*\(/);
      // Spec 2 SC30: per-dispatch factory must be wired.
      expect(src).toMatch(/this\.backendFactory/);
    });
  });

  describe('SC8 — start() probes once before resolving', () => {
    it('OT3: fetchModels called exactly once when start() resolves', async () => {
      const fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
      const config = makeConfig({
        localBackend: 'openai-compatible',
        localModel: 'gemma-4-e4b',
        localEndpoint: 'http://localhost:11434/v1',
        localProbeIntervalMs: 60_000, // long interval — only the start() probe matters
      });
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      // Inject the fetchModels stub onto the resolver before start().
      const resolver = firstResolver(orch);
      expect(resolver).not.toBeNull();
      (
        resolver as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = fetchModels;

      await orch.start();
      try {
        expect(fetchModels).toHaveBeenCalledTimes(1);
        expect(resolver!.resolveModel()).toBe('gemma-4-e4b');
      } finally {
        await orch.stop();
      }
    });
  });

  describe('SC13 — warn-level log on no candidate', () => {
    it('OT4: createAnalysisProvider logs warn when resolver reports unavailable', async () => {
      const fetchModels = vi.fn().mockResolvedValue(['some-other-model']);
      const config = makeConfig({
        localBackend: 'openai-compatible',
        localModel: ['a', 'b'],
        localEndpoint: 'http://localhost:11434/v1',
        localProbeIntervalMs: 60_000,
      });
      // intelligence enabled so createAnalysisProvider is called
      (config as WorkflowConfig & { intelligence?: { enabled: boolean } }).intelligence = {
        enabled: true,
      };
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const warnSpy = vi.fn();
      (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;
      const resolver = firstResolver(orch);
      expect(resolver).not.toBeNull();
      (
        resolver as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = fetchModels;

      await orch.start();
      try {
        const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
        const matched = warnCalls.find((m) => /Intelligence pipeline disabled/i.test(m));
        expect(matched, `expected warn log; got: ${JSON.stringify(warnCalls)}`).toBeTruthy();
        expect(matched).toContain('http://localhost:11434/v1');
        expect(matched).toMatch(/Configured: \[a, b\]/);
      } finally {
        await orch.stop();
      }
    });
  });

  describe('SC14 — intelligence pipeline disabled when local unavailable at startup', () => {
    it('OT5: this.pipeline === null after start() when local unavailable', async () => {
      const fetchModels = vi.fn().mockResolvedValue([]); // no models loaded
      const config = makeConfig({
        localBackend: 'openai-compatible',
        localModel: 'gemma-4-e4b',
        localEndpoint: 'http://localhost:11434/v1',
        localProbeIntervalMs: 60_000,
      });
      (config as WorkflowConfig & { intelligence?: { enabled: boolean } }).intelligence = {
        enabled: true,
      };
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const resolver = firstResolver(orch);
      expect(resolver).not.toBeNull();
      (
        resolver as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = fetchModels;

      await orch.start();
      try {
        const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
        expect(pipeline).toBeNull();
      } finally {
        await orch.stop();
      }
    });
  });

  describe('SC16 — cloud paths unaffected', () => {
    it('OT6: anthropic backend does not touch resolver and does not log local warnings', async () => {
      const config = makeConfig({
        backend: 'anthropic',
        apiKey: 'sk-test-key-not-real',
      });
      (config as WorkflowConfig & { intelligence?: { enabled: boolean } }).intelligence = {
        enabled: true,
      };
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const warnSpy = vi.fn();
      (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;

      // Cloud-only config: localResolvers Map should be empty.
      const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
        .localResolvers;
      expect(map.size).toBe(0);

      await orch.start();
      try {
        const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
        expect(warnCalls.find((m) => /Intelligence pipeline disabled/i.test(m))).toBeUndefined();
      } finally {
        await orch.stop();
      }
    });
  });

  describe('SC21 — resolver self-heals on next probe', () => {
    it('OT7: probe[1]=[]; probe[2]=[gemma-4-e4b]; broadcast fires twice', async () => {
      vi.useFakeTimers();
      try {
        const fetchModels = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(['gemma-4-e4b']);
        const broadcasts: import('@harness-engineering/types').LocalModelStatus[] = [];

        const config = makeConfig({
          localBackend: 'openai-compatible',
          localModel: 'gemma-4-e4b',
          localEndpoint: 'http://localhost:11434/v1',
          localProbeIntervalMs: 1_000,
        });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        // Inject a fake server stub so we can observe broadcast calls
        // without spinning up the HTTP server. Implements the minimal subset
        // of OrchestratorServer that orchestrator.start()/stop() touch.
        (
          orch as unknown as {
            server: {
              start: () => Promise<void>;
              stop: () => void;
              broadcastLocalModelStatus: (s: unknown) => void;
              setPipeline: (p: unknown) => void;
            };
          }
        ).server = {
          start: async () => {},
          stop: () => {},
          broadcastLocalModelStatus: (s: unknown) =>
            broadcasts.push(s as import('@harness-engineering/types').LocalModelStatus),
          setPipeline: () => {},
        };
        const resolver = firstResolver(orch);
        expect(resolver).not.toBeNull();
        (
          resolver as unknown as {
            fetchModels: (e: string, k?: string) => Promise<string[]>;
          }
        ).fetchModels = fetchModels;

        await orch.start(); // probe 1 → []
        expect(resolver!.resolveModel()).toBeNull();

        // Advance to trigger probe 2 → [gemma-4-e4b]
        await vi.advanceTimersByTimeAsync(1_000);
        // Allow microtasks (the probe is fire-and-forget on the timer tick)
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();
        await Promise.resolve();

        expect(resolver!.resolveModel()).toBe('gemma-4-e4b');
        expect(broadcasts.length).toBeGreaterThanOrEqual(2);
        // First broadcast: not available; subsequent broadcast: available.
        const lastBroadcast = broadcasts[broadcasts.length - 1]!;
        expect(lastBroadcast.available).toBe(true);
        expect(lastBroadcast.resolved).toBe('gemma-4-e4b');

        await orch.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('SC22 — post-self-heal sessions start successfully', () => {
    it('OT8: LocalBackend.startSession returns Ok after resolver self-heals', async () => {
      vi.useFakeTimers();
      try {
        const fetchModels = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(['gemma-4-e4b']);

        const config = makeConfig({
          localBackend: 'openai-compatible',
          localModel: 'gemma-4-e4b',
          localEndpoint: 'http://localhost:11434/v1',
          localProbeIntervalMs: 1_000,
        });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        const resolver = firstResolver(orch);
        expect(resolver).not.toBeNull();
        (
          resolver as unknown as {
            fetchModels: (e: string, k?: string) => Promise<string[]>;
          }
        ).fetchModels = fetchModels;

        await orch.start();

        // Initially unavailable — startSession would fail. Confirm by
        // pulling the localRunner's backend and inspecting the resolver-
        // bound getModel callback.
        expect(resolver!.resolveModel()).toBeNull();

        // Advance to trigger recovery probe.
        await vi.advanceTimersByTimeAsync(1_000);
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();

        expect(resolver!.resolveModel()).toBe('gemma-4-e4b');

        // Spec 2 SC30 / Task 11: the Phase 1 `localRunner` field is
        // gone. Build the backend through the factory the same way
        // `dispatchIssue` does (quick-fix tier → routed-default in
        // legacy single-backend configs → the synthesized `local`
        // backend). startSession should now return Ok because the
        // resolver-bound getModel returns the recovered model.
        const factory = (
          orch as unknown as {
            backendFactory:
              | import('../../src/agent/orchestrator-backend-factory').OrchestratorBackendFactory
              | null;
          }
        ).backendFactory;
        expect(factory).not.toBeNull();
        const backend = factory!.forUseCase({ kind: 'tier', tier: 'quick-fix' });
        const result = await backend.startSession({
          workspacePath: '/tmp/test',
          systemPrompt: 'sys',
        });
        expect(result.ok).toBe(true);

        await orch.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('OT11 — stop() halts resolver probing', () => {
    it('no further fetchModels calls after stop()', async () => {
      vi.useFakeTimers();
      try {
        const fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);

        const config = makeConfig({
          localBackend: 'openai-compatible',
          localModel: 'gemma-4-e4b',
          localEndpoint: 'http://localhost:11434/v1',
          localProbeIntervalMs: 1_000,
        });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        const resolver = firstResolver(orch);
        expect(resolver).not.toBeNull();
        (
          resolver as unknown as {
            fetchModels: (e: string, k?: string) => Promise<string[]>;
          }
        ).fetchModels = fetchModels;

        await orch.start();
        expect(fetchModels).toHaveBeenCalledTimes(1);
        await orch.stop();

        const callsBefore = fetchModels.mock.calls.length;
        await vi.advanceTimersByTimeAsync(10_000);
        await vi.runOnlyPendingTimersAsync();
        expect(fetchModels.mock.calls.length).toBe(callsBefore);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
