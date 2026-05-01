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
      const resolver = (
        orch as unknown as {
          localModelResolver:
            | import('../../src/agent/local-model-resolver').LocalModelResolver
            | null;
        }
      ).localModelResolver;
      expect(resolver).not.toBeNull();
      expect(resolver!.getStatus().configured).toEqual(['gemma-4-e4b']);
    });
  });

  describe('SC2 — resolver gated by localBackend', () => {
    it('OT2a: cloud-only config does NOT instantiate the resolver', () => {
      const config = makeConfig({ backend: 'mock' }); // no localBackend
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const resolver = (
        orch as unknown as {
          localModelResolver: unknown;
        }
      ).localModelResolver;
      expect(resolver).toBeNull();
    });

    it('OT2b: claude/anthropic/openai/gemini configs do not instantiate the resolver', () => {
      for (const backend of ['claude', 'anthropic', 'openai', 'gemini'] as const) {
        const config = makeConfig({ backend, apiKey: 'test-key' });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        const resolver = (
          orch as unknown as {
            localModelResolver: unknown;
          }
        ).localModelResolver;
        expect(resolver, `resolver should be null for backend=${backend}`).toBeNull();
      }
    });
  });

  describe('SC-CON1 / SC-CON2 — single read site, single resolver consumer', () => {
    it('OT9: source has exactly one read of agent.localModel, at the resolver ctor site', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      const matches = src.match(/this\.config\.agent\.localModel/g) ?? [];
      expect(
        matches.length,
        `expected exactly 1 read of this.config.agent.localModel; got ${matches.length}`
      ).toBe(1);
      // The single read must live in a normalizeLocalModel(...) call.
      expect(src).toMatch(/normalizeLocalModel\(\s*this\.config\.agent\.localModel\s*\)/);
    });

    it('OT10: createLocalBackend and createAnalysisProvider both reference localModelResolver', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      // Pull each method body individually and assert resolver references.
      const localBackendMatch = src.match(/private createLocalBackend\(\)[\s\S]*?\n  \}/);
      expect(localBackendMatch, 'createLocalBackend method not found').not.toBeNull();
      expect(localBackendMatch![0]).toMatch(/this\.localModelResolver/);

      const analysisProviderMatch = src.match(/private createAnalysisProvider\(\)[\s\S]*?\n  \}/);
      expect(analysisProviderMatch, 'createAnalysisProvider method not found').not.toBeNull();
      expect(analysisProviderMatch![0]).toMatch(/this\.localModelResolver/);

      // No PHASE3-REMOVE markers remain.
      expect(src).not.toMatch(/PHASE3-REMOVE/);
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
      const resolver = (
        orch as unknown as {
          localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
        }
      ).localModelResolver;
      (
        resolver as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = fetchModels;

      await orch.start();
      try {
        expect(fetchModels).toHaveBeenCalledTimes(1);
        expect(resolver.resolveModel()).toBe('gemma-4-e4b');
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
      const resolver = (
        orch as unknown as {
          localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
        }
      ).localModelResolver;
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
      const resolver = (
        orch as unknown as {
          localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
        }
      ).localModelResolver;
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

      const resolver = (orch as unknown as { localModelResolver: unknown }).localModelResolver;
      expect(resolver).toBeNull();

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
        const resolver = (
          orch as unknown as {
            localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
          }
        ).localModelResolver;
        (
          resolver as unknown as {
            fetchModels: (e: string, k?: string) => Promise<string[]>;
          }
        ).fetchModels = fetchModels;

        await orch.start(); // probe 1 → []
        expect(resolver.resolveModel()).toBeNull();

        // Advance to trigger probe 2 → [gemma-4-e4b]
        await vi.advanceTimersByTimeAsync(1_000);
        // Allow microtasks (the probe is fire-and-forget on the timer tick)
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();
        await Promise.resolve();

        expect(resolver.resolveModel()).toBe('gemma-4-e4b');
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
        const resolver = (
          orch as unknown as {
            localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
          }
        ).localModelResolver;
        (
          resolver as unknown as {
            fetchModels: (e: string, k?: string) => Promise<string[]>;
          }
        ).fetchModels = fetchModels;

        await orch.start();

        // Initially unavailable — startSession would fail. Confirm by
        // pulling the localRunner's backend and inspecting the resolver-
        // bound getModel callback.
        expect(resolver.resolveModel()).toBeNull();

        // Advance to trigger recovery probe.
        await vi.advanceTimersByTimeAsync(1_000);
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();

        expect(resolver.resolveModel()).toBe('gemma-4-e4b');

        // Reach into the localRunner to grab the backend, then call
        // startSession directly. The runner stores the backend internally;
        // tests/agent/runner.test.ts shows the access pattern.
        const localRunner = (
          orch as unknown as {
            localRunner: { backend: import('@harness-engineering/types').AgentBackend };
          }
        ).localRunner;
        expect(localRunner).not.toBeNull();
        const result = await localRunner.backend.startSession({
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
        const resolver = (
          orch as unknown as {
            localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
          }
        ).localModelResolver;
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
