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

    it('OT10: intelligence-factory consults localResolvers; legacy createBackend/createLocalBackend gone', () => {
      // Phase 3 / Tasks 10-12: the single-resolver field has been
      // replaced by a per-named-backend Map (SC37). The legacy two-runner
      // methods `createBackend()` / `createLocalBackend()` were deleted
      // outright (SC30) — the per-dispatch `OrchestratorBackendFactory`
      // owns backend construction now.
      //
      // Phase 4 (Spec 2 SC31-SC36): per-type AnalysisProvider construction
      // is the responsibility of `buildAnalysisProvider` from
      // `analysis-provider-factory`, invoked via the layer-resolver helper
      // in `agent/intelligence-factory.ts` (extracted from orchestrator.ts
      // to keep the god class in check). Orchestrator delegates to it via
      // `buildIntelligencePipeline`; the factory module is the single home
      // of routing-driven AnalysisProvider lookup.
      const orchSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      const factorySrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'agent', 'intelligence-factory.ts'),
        'utf8'
      );

      // Orchestrator delegates pipeline construction to the factory module.
      expect(orchSrc).toMatch(/buildIntelligencePipeline/);

      // The factory consults buildAnalysisProvider, the routed-backend
      // resolver, and the localResolvers map.
      expect(factorySrc).toMatch(/buildAnalysisProvider/);
      expect(factorySrc).toMatch(/resolveRoutedBackend/);
      expect(factorySrc).toMatch(/localResolvers\.get/);

      // No PHASE3-REMOVE markers remain in the orchestrator source.
      expect(orchSrc).not.toMatch(/PHASE3-REMOVE/);
      // The legacy single-resolver field must be gone (SC37).
      expect(orchSrc).not.toMatch(/private\s+localModelResolver\s*[:=]/);
      // Spec 2 SC30: legacy two-runner builders must be gone.
      expect(orchSrc).not.toMatch(/private\s+createBackend\s*\(/);
      expect(orchSrc).not.toMatch(/private\s+createLocalBackend\s*\(/);
      // Spec 2 SC30: per-dispatch factory must be wired.
      expect(orchSrc).toMatch(/this\.backendFactory/);
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
      // Phase 4: routing-driven createAnalysisProvider needs the SEL
      // layer (or routing.default) to point at the local backend for
      // the local-resolver-unavailable warn path to fire. We use the
      // pure-modern shape (`agent.backends` + `agent.routing`) so the
      // test asserts the new behavior directly.
      const config = makeConfig({
        backends: {
          local: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: ['a', 'b'],
            probeIntervalMs: 60_000,
          },
        },
        routing: { default: 'local', intelligence: { sel: 'local' } },
      } as unknown as Partial<WorkflowConfig['agent']>);
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
        // Phase 4 wording: "Intelligence pipeline disabled for backend
        // 'local' at <endpoint>: no configured local model loaded.
        // Configured: [...]. Detected: [...]."
        //
        // Spec 2 P3-IMP-1 fixup: the Configured/Detected diagnostic lists
        // were dropped during the Phase 4 factory rewrite, masking
        // operator-triage data. The factory now exposes a status-snapshot
        // hook so the warn message includes both lists. This assertion
        // restores the regression catcher that was previously dropped at
        // line 284 of the pre-Phase-4 OT4 (`expect(matched).toMatch(/Configured: \[a, b\]/)`).
        const matched = warnCalls.find((m) =>
          /Intelligence pipeline disabled for backend/i.test(m)
        );
        expect(matched, `expected warn log; got: ${JSON.stringify(warnCalls)}`).toBeTruthy();
        expect(matched).toContain('http://localhost:11434/v1');
        expect(matched).toMatch(/Configured: \[a, b\]/);
        expect(matched).toMatch(/Detected: \[some-other-model\]/);
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

  // Spec 2 P2-S4 fixup: createAnalysisProvider previously gated the
  // local-resolver branch on legacy `agent.localBackend`, blocking
  // pure-modern configs (only `agent.backends` set) from reaching the
  // intelligence pipeline. Drop the legacy gate and confirm a pure-modern
  // config with a healthy local resolver builds an OpenAICompatible
  // analysis provider instead of falling through to the (warn-emitting)
  // primary-backend branch.
  describe('P2-S4 — pure-modern config reaches local intelligence pipeline', () => {
    it('OT-P2S4: builds an OpenAICompatible analysis provider for agent.backends.local without legacy localBackend', async () => {
      const fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
      // Pure-modern config: backends + routing only; NO `agent.backend`,
      // NO `agent.localBackend`.
      const config = makeConfig({
        backends: {
          local: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: 'gemma-4-e4b',
          },
        },
        routing: { default: 'local' },
      } as Partial<WorkflowConfig['agent']>);
      delete (config.agent as Partial<WorkflowConfig['agent']>).backend;
      (config as WorkflowConfig & { intelligence?: { enabled: boolean } }).intelligence = {
        enabled: true,
      };

      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const resolver = firstResolver(orch);
      expect(resolver, 'pure-modern config must register a local resolver').not.toBeNull();
      (
        resolver as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = fetchModels;

      await orch.start();
      try {
        // The intelligence pipeline is a non-null IntelligencePipeline
        // instance only when createAnalysisProvider returned non-null.
        // Pre-fix-up, the legacy `&& agent.localBackend` gate would
        // have returned null here (pipeline === null).
        const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
        expect(pipeline).not.toBeNull();
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

  describe('multi-resolver broadcast (Spec 2 Phase 5 — SC39, SC40 server-side)', () => {
    it('broadcasts NamedLocalModelStatus per-resolver, each tagged with backendName+endpoint', async () => {
      // Two local backends: 'local-a' (healthy) and 'local-b' (unhealthy).
      const broadcasts: import('@harness-engineering/types').NamedLocalModelStatus[] = [];
      const config = makeConfig({
        backends: {
          'local-a': {
            type: 'local',
            endpoint: 'http://localhost:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
          'local-b': {
            type: 'local',
            endpoint: 'http://192.168.1.50:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
        },
        routing: { default: 'local-a' },
      } as unknown as Partial<WorkflowConfig['agent']>);
      delete (config.agent as Partial<WorkflowConfig['agent']>).backend;

      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      // Inject fake server stub to capture broadcasts.
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
          broadcasts.push(s as import('@harness-engineering/types').NamedLocalModelStatus),
        setPipeline: () => {},
      };

      // Stub each resolver's fetchModels with distinct outcomes.
      const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
        .localResolvers;
      expect(map.size).toBe(2);
      (
        map.get('local-a') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
      (
        map.get('local-b') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue([]);

      await orch.start();
      try {
        // Each resolver fires at least one broadcast on its first probe diff
        // (default state -> probe-1 result). Exactly two broadcasts —
        // one per resolver — tagged with distinct backendName+endpoint.
        const byName = new Map<
          string,
          import('@harness-engineering/types').NamedLocalModelStatus
        >();
        for (const b of broadcasts) byName.set(b.backendName, b);

        expect(byName.has('local-a'), 'expected broadcast for local-a').toBe(true);
        expect(byName.has('local-b'), 'expected broadcast for local-b').toBe(true);
        expect(byName.get('local-a')!.endpoint).toBe('http://localhost:1234/v1');
        expect(byName.get('local-b')!.endpoint).toBe('http://192.168.1.50:1234/v1');
        expect(byName.get('local-a')!.available).toBe(true);
        expect(byName.get('local-b')!.available).toBe(false);
      } finally {
        await orch.stop();
      }
    });

    it('exposes getLocalModelStatuses callback returning both backends', async () => {
      // Same 2-backend config; assert the orchestrator wires the
      // getLocalModelStatuses callback into the server with both entries
      // (backendName + endpoint).
      const config = makeConfig({
        backends: {
          'local-a': {
            type: 'local',
            endpoint: 'http://localhost:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
          'local-b': {
            type: 'local',
            endpoint: 'http://192.168.1.50:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
        },
        routing: { default: 'local-a' },
      } as unknown as Partial<WorkflowConfig['agent']>);
      delete (config.agent as Partial<WorkflowConfig['agent']>).backend;
      // Set a random port so the Orchestrator constructs its server
      // (which is gated on config.server.port truthy). The server bind
      // is deferred until orch.start().
      const port = 30000 + Math.floor(Math.random() * 20000);
      (config as WorkflowConfig).server = { port };

      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });

      // Stub fetchModels so resolvers settle without real network calls.
      const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
        .localResolvers;
      (
        map.get('local-a') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
      (
        map.get('local-b') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue([]);

      await orch.start();
      try {
        // Read the private getLocalModelStatuses field off the constructed
        // server. The orchestrator wires this callback in its OrchestratorServer
        // constructor call.
        const server = (
          orch as unknown as { server: import('../../src/server/http').OrchestratorServer }
        ).server;
        const cb = (
          server as unknown as {
            getLocalModelStatuses:
              | (() => import('@harness-engineering/types').NamedLocalModelStatus[])
              | null;
          }
        ).getLocalModelStatuses;
        expect(typeof cb, 'getLocalModelStatuses callback should be wired').toBe('function');
        const statuses = cb!();
        expect(statuses).toHaveLength(2);
        const byName = new Map(statuses.map((s) => [s.backendName, s]));
        expect(byName.has('local-a')).toBe(true);
        expect(byName.has('local-b')).toBe(true);
        expect(byName.get('local-a')!.endpoint).toBe('http://localhost:1234/v1');
        expect(byName.get('local-b')!.endpoint).toBe('http://192.168.1.50:1234/v1');
      } finally {
        await orch.stop();
      }
    });

    it('legacy /local-model/status (singular) still returns first-resolver LocalModelStatus (deprecation alias)', async () => {
      // Spec 2 §5 (line 35): the singular endpoint is retained as a
      // deprecated alias for one minor release after Spec 1 ships. This
      // regression test guarantees the legacy callback wiring (orchestrator.ts
      // getLocalModelStatus) keeps returning the first-registered resolver's
      // LocalModelStatus shape — no backendName/endpoint fields, no array.
      const config = makeConfig({
        backends: {
          'local-a': {
            type: 'local',
            endpoint: 'http://localhost:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
          'local-b': {
            type: 'local',
            endpoint: 'http://192.168.1.50:1234/v1',
            model: ['gemma-4-e4b'],
            probeIntervalMs: 60_000,
          },
        },
        routing: { default: 'local-a' },
      } as unknown as Partial<WorkflowConfig['agent']>);
      delete (config.agent as Partial<WorkflowConfig['agent']>).backend;
      const port = 30000 + Math.floor(Math.random() * 20000);
      (config as WorkflowConfig).server = { port };

      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });

      const map = (orch as unknown as { localResolvers: Map<string, LocalModelResolver> })
        .localResolvers;
      (
        map.get('local-a') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
      (
        map.get('local-b') as unknown as {
          fetchModels: (e: string, k?: string) => Promise<string[]>;
        }
      ).fetchModels = vi.fn().mockResolvedValue([]);

      await orch.start();
      try {
        const server = (
          orch as unknown as { server: import('../../src/server/http').OrchestratorServer }
        ).server;
        const cb = (
          server as unknown as {
            getLocalModelStatus:
              | (() => import('@harness-engineering/types').LocalModelStatus | null)
              | null;
          }
        ).getLocalModelStatus;
        expect(typeof cb, 'getLocalModelStatus (singular alias) should be wired').toBe('function');
        const status = cb!();
        expect(status, 'first-resolver status should be non-null').not.toBeNull();
        // Shape assertion: the singular alias returns LocalModelStatus,
        // NOT NamedLocalModelStatus. The Spec 1 contract did not include
        // backendName/endpoint, so the deprecation alias must not leak them.
        expect(status).not.toHaveProperty('backendName');
        expect(status).not.toHaveProperty('endpoint');
        // The first-registered resolver is 'local-a' (insertion order on the
        // backends Map matches Object.keys iteration in config-migration).
        expect(status!.available).toBe(true);
        expect(status!.resolved).toBe('gemma-4-e4b');
      } finally {
        await orch.stop();
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
