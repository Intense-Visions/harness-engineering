import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type {
  ModelProposalRecord,
  NotificationsConfig,
  Proposal,
} from '@harness-engineering/types';
import {
  PoolManager,
  PoolStateStore,
  type EvictRequest,
  type InstallAdapter,
  type InstallRequest,
  type InstallResult,
  type PoolEntry,
  type PoolFilesystem,
  type PoolState,
} from '@harness-engineering/local-models';
import { onApproveModelProposal, type ModelHandlerDeps } from '../../src/proposals/model-handlers';
import { OrchestratorServer } from '../../src/server/http';
import { SinkRegistry } from '../../src/notifications/registry';
import { wireNotificationSinks } from '../../src/notifications/events';

/**
 * LMLM Phase 7 — S1 ("no mid-dispatch swap") end-to-end integration (ADR 0060).
 *
 * Wires a REAL {@link PoolManager} (in-memory store + stub installer) into the
 * model-proposal approve handler with a controllable in-use probe, then proves
 * the full deferral → drain lifecycle:
 *
 *   pull → fake dispatch (probe=true) → approve swap → evict DEFERRED
 *        → probe=false → drain → evict COMPLETED.
 *
 * The drain here mirrors `Orchestrator.drainDeferredEvictions` (the real
 * completion trigger fires from `emitWorkerExit`); we invoke the same
 * evict + clearPendingEviction + `evict_completed` sequence against the live
 * pool so the pool/handler/drain contract is exercised end to end without
 * standing up a full Orchestrator.
 */

const POOL_PATH = '/tmp/lmlm-e2e/pool.json';

function makeFs(initial: Record<string, string> = {}): PoolFilesystem {
  const files: Record<string, string> = { ...initial };
  return {
    async readFile(path) {
      if (path in files) return files[path] as string;
      const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
    async writeFile(path, contents) {
      files[path] = contents;
    },
    async rename(from, to) {
      files[to] = files[from] as string;
      delete files[from];
    },
    async mkdir() {},
  };
}

/** Stub Ollama adapter: install/evict always succeed; list/inspect unused here. */
function stubInstaller(): {
  adapter: InstallAdapter;
  evicts: EvictRequest[];
  installs: InstallRequest[];
} {
  const evicts: EvictRequest[] = [];
  const installs: InstallRequest[] = [];
  return {
    evicts,
    installs,
    adapter: {
      async install(req: InstallRequest): Promise<InstallResult> {
        installs.push(req);
        return { status: 'success', name: req.name };
      },
      async evict(req: EvictRequest): Promise<InstallResult> {
        evicts.push(req);
        return { status: 'success', name: req.name };
      },
      async list() {
        return [];
      },
      async inspect() {
        throw new Error('inspect not configured');
      },
    },
  };
}

const REPLACES: PoolEntry = {
  ollamaName: 'qwen2.5:32b',
  hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

function seededState(entries: PoolEntry[]): PoolState {
  return {
    diskBudgetGb: 100,
    diskUsedGb: entries.reduce((s, e) => s + e.sizeOnDiskGb, 0),
    entries,
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

async function makePool(entries: PoolEntry[]): Promise<{
  manager: PoolManager;
  evicts: EvictRequest[];
}> {
  const fs = makeFs({
    [POOL_PATH]: JSON.stringify({ version: 1, state: seededState(entries) }, null, 2),
  });
  const store = new PoolStateStore({ path: POOL_PATH, fs });
  await store.load();
  const installer = stubInstaller();
  const manager = new PoolManager({ store, installer: installer.adapter });
  return { manager, evicts: installer.evicts };
}

function swapProposal(): ModelProposalRecord {
  return {
    kind: 'model',
    id: 'proposal_s1',
    createdAt: '2026-07-07T00:00:00.000Z',
    proposedBy: 'orchestrator:lmlm',
    status: 'open',
    source: { justification: 'A newer model beats the current pool member by a wide margin.' },
    model: {
      action: 'swap',
      target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
      replaces: { ollamaName: 'qwen2.5:32b' },
      scoreDelta: 7.4,
      justification: {
        summary: 's',
        benchmarkBasis: ['b'],
        hardwareFit: '27GB',
        evidence: 'direct',
        freshness: '2026-05-21',
      },
      diskImpactGb: 3.2,
    },
  };
}

/**
 * Mirror of `Orchestrator.drainDeferredEvictions`: complete every deferred
 * eviction whose probe now reports it idle, clearing the transient flag and
 * emitting `evict_completed`. Best-effort; a still-busy or failed evict stays
 * pending.
 */
async function drain(
  manager: PoolManager,
  bus: EventEmitter,
  isModelInUse: (name: string) => boolean
): Promise<void> {
  for (const ollamaName of manager.listPendingEvictions()) {
    if (isModelInUse(ollamaName)) continue;
    const result = await manager.evict({ ollamaName });
    if (result.status === 'error') continue;
    manager.clearPendingEviction(ollamaName);
    bus.emit('local-models:pool', {
      action: 'evict',
      evicted: ollamaName,
      phase: 'evict_completed',
    });
  }
}

describe('LMLM Phase 7 — S1 no-mid-dispatch-swap deferral + drain (ADR 0060)', () => {
  it('defers eviction of an in-use replaced model, then completes it once idle', async () => {
    const { manager, evicts } = await makePool([REPLACES]);
    const bus = new EventEmitter();
    const poolEvents: Array<{ phase?: string; deferred?: string; evicted?: string }> = [];
    bus.on('local-models:pool', (d) =>
      poolEvents.push(d as { phase?: string; deferred?: string; evicted?: string })
    );

    // A fake long-running dispatch pins `replaces` in use.
    let replacesInUse = true;
    const isModelInUse = (name: string): boolean => name === 'qwen2.5:32b' && replacesInUse;

    const proposal = swapProposal();
    const updates: Array<Partial<ModelProposalRecord>> = [];
    const deps: ModelHandlerDeps = {
      pool: manager,
      bus,
      isModelInUse,
      updateProposal: (id, patch) => {
        updates.push(patch);
        return Promise.resolve({ ...proposal, ...patch } as Proposal);
      },
    };

    // ── Approve the swap while `replaces` is in use ──
    const outcome = await onApproveModelProposal(deps, proposal);

    // Install applied (target now present); eviction of `replaces` DEFERRED.
    expect(outcome.status).toBe('approved');
    expect(manager.snapshot().entries.some((e) => e.ollamaName === 'qwen3:32b')).toBe(true);
    // `replaces` NOT evicted — still in the pool.
    expect(evicts).toHaveLength(0);
    expect(manager.snapshot().entries.some((e) => e.ollamaName === 'qwen2.5:32b')).toBe(true);
    // viewState() overlays pendingEviction:true on the deferred entry.
    const deferredEntry = manager.viewState().entries.find((e) => e.ollamaName === 'qwen2.5:32b');
    expect(deferredEntry?.pendingEviction).toBe(true);
    // evict_deferred pool event fired with the deferred name.
    const deferredEvt = poolEvents.find((e) => e.phase === 'evict_deferred');
    expect(deferredEvt?.deferred).toBe('qwen2.5:32b');
    // proposal recorded approved.
    expect(updates.at(-1)?.status).toBe('approved');

    // ── Dispatch drains; the probe now reports `replaces` idle ──
    replacesInUse = false;
    await drain(manager, bus, isModelInUse);

    // Deferred eviction now completed: `replaces` gone, flag cleared, event fired.
    expect(evicts.map((e) => e.name)).toContain('qwen2.5:32b');
    expect(manager.snapshot().entries.some((e) => e.ollamaName === 'qwen2.5:32b')).toBe(false);
    expect(manager.listPendingEvictions()).toHaveLength(0);
    expect(manager.viewState().entries.some((e) => e.pendingEviction)).toBe(false);
    const completedEvt = poolEvents.find((e) => e.phase === 'evict_completed');
    expect(completedEvt?.evicted).toBe('qwen2.5:32b');
  });

  it('drain leaves the eviction pending while the model is still in use', async () => {
    const { manager, evicts } = await makePool([REPLACES]);
    const bus = new EventEmitter();
    const proposal = swapProposal();
    const deps: ModelHandlerDeps = {
      pool: manager,
      bus,
      isModelInUse: () => true, // never idle
      updateProposal: (id, patch) => Promise.resolve({ ...proposal, ...patch } as Proposal),
    };

    await onApproveModelProposal(deps, proposal);
    expect(manager.listPendingEvictions()).toEqual(['qwen2.5:32b']);

    // Drain while still in use → no completion.
    await drain(manager, bus, () => true);
    expect(evicts).toHaveLength(0);
    expect(manager.listPendingEvictions()).toEqual(['qwen2.5:32b']);
  });
});

// ── Task 15: Phase 7 WS + sink delivery smoke (the spec's Phase 7 checkpoint) ──

const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

function sinkConfig(): NotificationsConfig {
  return {
    sinks: [
      {
        id: 'team',
        kind: 'slack',
        events: ['local-models.*'],
        wrap_response: true,
        config: { webhookUrlEnv: 'HARNESS_SLACK_TEST_URL' },
      },
    ],
  };
}

describe('LMLM Phase 7 — WS + sink delivery smoke', () => {
  it('emit local-models:proposal → WS /ws frame AND local-models.proposal sink envelope', async () => {
    // One orchestrator bus feeds BOTH the server's WS fan-out and the sink registry.
    const bus = Object.assign(new EventEmitter(), {
      getSnapshot: () => ({ running: [], retryAttempts: [], claimed: [] }),
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const registry = SinkRegistry.fromConfig(sinkConfig(), {
      env: { HARNESS_SLACK_TEST_URL: SLACK_URL },
      fetchImpl,
    });
    const offSinks = wireNotificationSinks({ bus, registry });

    const port = Math.floor(Math.random() * 4000) + 51000;
    const server = new OrchestratorServer(bus, port);
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', () => r()));
    const frames: Array<{ type: string; data: unknown }> = [];
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())));

    try {
      // The scheduler emits this on new-proposal creation.
      bus.emit('local-models:proposal', {
        id: 'p1',
        status: 'created',
        action: 'add',
        target: 'qwen3:32b',
      });
      await new Promise((r) => setTimeout(r, 100));

      // (a) WS client received the frame.
      expect(frames).toContainEqual({
        type: 'local-models:proposal',
        data: { id: 'p1', status: 'created', action: 'add', target: 'qwen3:32b' },
      });

      // (b) the sink delivered the derived local-models.proposal envelope.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const body = String((fetchImpl.mock.calls[0]![1] as { body: string }).body);
      expect(body).toContain('qwen3:32b');
    } finally {
      ws.close();
      offSinks();
      server.stop();
      await new Promise((r) => setTimeout(r, 50));
    }
  });
});
