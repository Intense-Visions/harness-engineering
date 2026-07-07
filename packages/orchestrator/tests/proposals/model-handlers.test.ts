import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ModelProposalRecord, Proposal } from '@harness-engineering/types';
import type {
  EvictPoolRequest,
  EvictPoolResult,
  InstallPoolRequest,
  InstallPoolResult,
  PoolEntry,
  PoolState,
} from '@harness-engineering/local-models';
import {
  onApproveModelProposal,
  onRejectModelProposal,
  type ModelHandlerDeps,
} from '../../src/proposals/model-handlers';

function modelProposal(model: Partial<ModelProposalRecord['model']> = {}): ModelProposalRecord {
  return {
    kind: 'model',
    id: 'proposal_m1',
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
      ...model,
    },
  };
}

const REPLACED: PoolEntry = {
  ollamaName: 'qwen2.5:32b',
  hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

interface FakePool {
  install: (r: InstallPoolRequest) => Promise<InstallPoolResult>;
  evict: (r: EvictPoolRequest) => Promise<EvictPoolResult>;
  snapshot: () => PoolState;
  installCalls: InstallPoolRequest[];
  evictCalls: EvictPoolRequest[];
}

function fakePool(opts: {
  install?: InstallPoolResult;
  evict?: EvictPoolResult;
  entries?: PoolEntry[];
}): FakePool {
  const installCalls: InstallPoolRequest[] = [];
  const evictCalls: EvictPoolRequest[] = [];
  const state: PoolState = {
    diskBudgetGb: 100,
    diskUsedGb: 0,
    entries: opts.entries ?? [REPLACED],
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
  return {
    installCalls,
    evictCalls,
    install(r) {
      installCalls.push(r);
      return Promise.resolve(opts.install ?? { status: 'success', entry: REPLACED, evicted: [] });
    },
    evict(r) {
      evictCalls.push(r);
      return Promise.resolve(
        opts.evict ?? { status: 'success', name: r.ollamaName, removed: REPLACED }
      );
    },
    snapshot() {
      return state;
    },
  };
}

interface Harness {
  deps: ModelHandlerDeps;
  pool: FakePool;
  bus: EventEmitter;
  events: Array<{ topic: string; data: unknown }>;
  updateCalls: Array<{ id: string; patch: Partial<ModelProposalRecord> }>;
}

function harness(pool: FakePool, proposal: ModelProposalRecord): Harness {
  const bus = new EventEmitter();
  const events: Harness['events'] = [];
  for (const topic of ['local-models:proposal', 'local-models:pool']) {
    bus.on(topic, (data) => events.push({ topic, data }));
  }
  const updateCalls: Harness['updateCalls'] = [];
  const deps: ModelHandlerDeps = {
    pool,
    bus,
    now: () => new Date('2026-07-07T12:00:00.000Z'),
    updateProposal: (id, patch) => {
      updateCalls.push({ id, patch });
      return Promise.resolve({ ...proposal, ...patch } as Proposal);
    },
  };
  return { deps, pool, bus, events, updateCalls };
}

describe('onApproveModelProposal (F11 stale-target cancellation)', () => {
  let proposal: ModelProposalRecord;
  beforeEach(() => {
    proposal = modelProposal();
  });

  it('transitions to failed_target_missing, emits local-models:proposal, leaves pool unchanged', async () => {
    const pool = fakePool({
      install: { status: 'error', code: 'failed_target_missing', message: 'HF 404', evicted: [] },
    });
    const h = harness(pool, proposal);
    const before = pool.snapshot().entries.slice();

    const outcome = await onApproveModelProposal(h.deps, proposal);

    expect(outcome.status).toBe('failed_target_missing');
    // proposal transitioned
    expect(h.updateCalls).toHaveLength(1);
    expect(h.updateCalls[0]!.patch.status).toBe('failed_target_missing');
    // bus event on the proposal topic
    const evt = h.events.find((e) => e.topic === 'local-models:proposal');
    expect(evt).toBeDefined();
    expect((evt!.data as { status: string }).status).toBe('failed_target_missing');
    // pool untouched — no evict, no pool event, snapshot identical
    expect(pool.evictCalls).toHaveLength(0);
    expect(h.events.some((e) => e.topic === 'local-models:pool')).toBe(false);
    expect(pool.snapshot().entries).toEqual(before);
  });

  it('success swap: installs, evicts the replaced entry, emits local-models:pool, approves', async () => {
    const pool = fakePool({
      install: { status: 'success', entry: REPLACED, evicted: [] },
      evict: { status: 'success', name: 'qwen2.5:32b', removed: REPLACED },
    });
    const h = harness(pool, proposal);

    const outcome = await onApproveModelProposal(h.deps, proposal);

    expect(outcome.status).toBe('approved');
    expect(pool.installCalls[0]!.ollamaName).toBe('qwen3:32b');
    expect(pool.evictCalls[0]!.ollamaName).toBe('qwen2.5:32b');
    expect(h.updateCalls[0]!.patch.status).toBe('approved');
    expect(h.updateCalls[0]!.patch.decision?.action).toBe('approved');
    expect(h.events.some((e) => e.topic === 'local-models:pool')).toBe(true);
  });

  it('swap evict-failure: does NOT approve, surfaces the evict error, event shows no completed swap', async () => {
    // Install of the target succeeds, but evicting `replaces` errors. The swap
    // is incomplete: the pool holds BOTH target and replaces. The handler must
    // not lie about a completed swap.
    const pool = fakePool({
      install: { status: 'success', entry: REPLACED, evicted: [] },
      evict: { status: 'error', code: 'installer_unavailable', message: 'ollama down' },
    });
    const h = harness(pool, proposal);

    const outcome = await onApproveModelProposal(h.deps, proposal);

    // Truthful failure surfaced (not a false 'approved').
    expect(outcome.status).toBe('error');
    expect(outcome).toMatchObject({ code: 'installer_unavailable' });
    // Proposal NOT marked approved (left pending for a retry of the failed evict).
    expect(h.updateCalls).toHaveLength(0);
    // The install still ran and mutated the pool, so a pool event fires — but it
    // reflects ACTUAL state: target installed, replaces NOT evicted.
    const poolEvt = h.events.find((e) => e.topic === 'local-models:pool');
    expect(poolEvt).toBeDefined();
    const data = poolEvt!.data as { installed?: string; evicted?: string; phase?: string };
    expect(data.installed).toBe('qwen3:32b');
    expect(data.evicted).toBeUndefined(); // no phantom "swap completed"
    expect(data.phase).toBe('swap_evict_failed');
    // replaces was targeted for eviction but the removal failed — still present.
    expect(pool.evictCalls[0]!.ollamaName).toBe('qwen2.5:32b');
  });

  it('allowlist/budget rejection surfaces a structured error and leaves pool unchanged', async () => {
    const pool = fakePool({
      install: { status: 'error', code: 'budget_exceeded', message: 'no room', evicted: [] },
    });
    const h = harness(pool, proposal);

    const outcome = await onApproveModelProposal(h.deps, proposal);

    expect(outcome.status).toBe('error');
    expect(outcome).toMatchObject({ code: 'budget_exceeded' });
    expect(pool.evictCalls).toHaveLength(0);
    expect(h.updateCalls).toHaveLength(0); // proposal left pending
    expect(h.events).toHaveLength(0);
  });
});

describe('onRejectModelProposal (F7 linkage)', () => {
  it('records a rejected decision and emits the proposal event', async () => {
    const proposal = modelProposal();
    const pool = fakePool({});
    const h = harness(pool, proposal);

    const updated = await onRejectModelProposal(h.deps, proposal, 'operator prefers current');

    expect(updated.status).toBe('rejected');
    expect(h.updateCalls[0]!.patch.status).toBe('rejected');
    expect(h.updateCalls[0]!.patch.decision).toMatchObject({
      action: 'rejected',
      reason: 'operator prefers current',
    });
    const evt = h.events.find((e) => e.topic === 'local-models:proposal');
    expect(evt).toBeDefined();
    expect(evt!.data).toMatchObject({
      status: 'rejected',
      target: 'qwen3:32b',
      replaces: 'qwen2.5:32b',
    });
  });
});
