import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import {
  EmptyPoolState,
  type TickResult,
  type PoolState,
  type PoolStateView,
  type HardwareProfile,
  type RankedModel,
} from '@harness-engineering/local-models';
import type { Proposal } from '@harness-engineering/types';
import {
  handleV1LocalModelsRoute,
  type RefreshSchedulerOps,
  type V1LocalModelsDeps,
} from '../../../../src/server/routes/v1/local-models';

function makeReq(method: string, url: string): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  process.nextTick(() => r.emit('end'));
  return r;
}

function makeRes(): {
  res: ServerResponse;
  chunks: string[];
  statusCode: () => number;
  done: Promise<void>;
} {
  const sock = new Socket();
  const r = new ServerResponse(new IncomingMessage(sock));
  const chunks: string[] = [];
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  r.write = ((c: string) => {
    chunks.push(String(c));
    return true;
  }) as ServerResponse['write'];
  r.end = ((c?: string) => {
    if (c) chunks.push(String(c));
    resolveDone();
    return r;
  }) as ServerResponse['end'];
  return { res: r, chunks, statusCode: () => r.statusCode, done };
}

function tick(overrides: Partial<TickResult> = {}): TickResult {
  return {
    candidatesEvaluated: 3,
    proposalsEmitted: 2,
    reconciledRemoved: [],
    snapshotLoaded: true,
    hfReachable: true,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function scheduler(result: TickResult): RefreshSchedulerOps {
  return { forceRefresh: async () => result };
}

const MODEL_PROPOSAL = { id: 'proposal_abc', kind: 'model', status: 'open' } as unknown as Proposal;

describe('handleV1LocalModelsRoute (POST /api/v1/local-models/refresh)', () => {
  it('returns 200 with emitted count, proposals, and warnings on a clean tick', async () => {
    const deps: V1LocalModelsDeps = {
      getRefreshScheduler: () => scheduler(tick({ proposalsEmitted: 2 })),
      listModelProposals: async () => [MODEL_PROPOSAL],
    };
    const req = makeReq('POST', '/api/v1/local-models/refresh');
    const { res, chunks, statusCode, done } = makeRes();

    const handled = handleV1LocalModelsRoute(req, res, deps);
    expect(handled).toBe(true);
    await done;

    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join('')) as {
      emitted: number;
      proposals: Proposal[];
      warnings: string[];
    };
    expect(body.emitted).toBe(2);
    expect(body.proposals).toHaveLength(1);
    expect(body.warnings).toEqual([]);
  });

  it('returns 200 (soft warning) when HF is unreachable but the snapshot loaded (O4 exit 0)', async () => {
    const deps: V1LocalModelsDeps = {
      getRefreshScheduler: () =>
        scheduler(
          tick({
            snapshotLoaded: true,
            hfReachable: false,
            warnings: ['HuggingFace popularity probe failed'],
          })
        ),
    };
    const req = makeReq('POST', '/api/v1/local-models/refresh');
    const { res, statusCode, chunks, done } = makeRes();

    handleV1LocalModelsRoute(req, res, deps);
    await done;

    expect(statusCode()).toBe(200);
    expect(chunks.join('')).toContain('HuggingFace popularity probe failed');
  });

  it('returns 503 (O4 hard failure) when HF is unreachable AND no snapshot loaded', async () => {
    const deps: V1LocalModelsDeps = {
      getRefreshScheduler: () =>
        scheduler(
          tick({
            snapshotLoaded: false,
            hfReachable: false,
            warnings: ['benchmark snapshot load failed'],
          })
        ),
    };
    const req = makeReq('POST', '/api/v1/local-models/refresh');
    const { res, statusCode, chunks, done } = makeRes();

    handleV1LocalModelsRoute(req, res, deps);
    await done;

    expect(statusCode()).toBe(503);
    expect(chunks.join('')).toContain('hard failure');
  });

  it('returns 503 when LMLM is disabled (no scheduler)', () => {
    const deps: V1LocalModelsDeps = { getRefreshScheduler: () => null };
    const req = makeReq('POST', '/api/v1/local-models/refresh');
    const { res, statusCode, chunks } = makeRes();

    const handled = handleV1LocalModelsRoute(req, res, deps);
    expect(handled).toBe(true);
    expect(statusCode()).toBe(503);
    expect(chunks.join('')).toContain('LMLM disabled');
  });

  it('falls through (returns false) for non-matching path or method', () => {
    const deps: V1LocalModelsDeps = { getRefreshScheduler: () => scheduler(tick()) };
    const other = makeReq('POST', '/api/v1/local-models/pool');
    const getRefresh = makeReq('GET', '/api/v1/local-models/refresh');
    expect(handleV1LocalModelsRoute(other, makeRes().res, deps)).toBe(false);
    expect(handleV1LocalModelsRoute(getRefresh, makeRes().res, deps)).toBe(false);
  });
});

const HARDWARE: HardwareProfile = {
  totalRamGb: 64,
  vramGb: 24,
  gpuKind: 'nvidia',
  cpuCores: 16,
} as unknown as HardwareProfile;

const RANKED: RankedModel[] = [{ ollamaName: 'qwen3:32b', score: 88 } as unknown as RankedModel];

function poolState(overrides: Partial<PoolState> = {}): PoolState {
  return { ...EmptyPoolState(), diskBudgetGb: 100, ...overrides };
}

async function get(deps: V1LocalModelsDeps, url: string) {
  const req = makeReq('GET', url);
  const rr = makeRes();
  const handled = handleV1LocalModelsRoute(req, rr.res, deps);
  if (handled) await rr.done;
  return { handled, ...rr };
}

const baseDeps: V1LocalModelsDeps = { getRefreshScheduler: () => null };

describe('handleV1LocalModelsRoute (Phase 7 GET routes)', () => {
  describe('GET /api/v1/local-models/hardware', () => {
    it('returns 200 with the hardware profile', async () => {
      const { handled, statusCode, chunks } = await get(
        { ...baseDeps, getHardwareProfile: () => Promise.resolve(HARDWARE) },
        '/api/v1/local-models/hardware'
      );
      expect(handled).toBe(true);
      expect(statusCode()).toBe(200);
      expect(JSON.parse(chunks.join(''))).toMatchObject({ vramGb: 24 });
    });

    it('returns 503 when the accessor is null (LMLM disabled)', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getHardwareProfile: () => null },
        '/api/v1/local-models/hardware'
      );
      expect(statusCode()).toBe(503);
      expect(chunks.join('')).toContain('LMLM disabled');
    });

    it('returns 503 when the accessor is absent', async () => {
      const { statusCode } = await get(baseDeps, '/api/v1/local-models/hardware');
      expect(statusCode()).toBe(503);
    });
  });

  describe('GET /api/v1/local-models/pool', () => {
    it('returns 200 with viewState() when present', async () => {
      const view = poolState({ diskUsedGb: 40 });
      const { statusCode, chunks } = await get(
        {
          ...baseDeps,
          getModelPool: () => ({ snapshot: () => poolState(), viewState: () => view }),
        },
        '/api/v1/local-models/pool'
      );
      expect(statusCode()).toBe(200);
      expect(JSON.parse(chunks.join(''))).toMatchObject({ diskUsedGb: 40 });
    });

    it('surfaces pendingEviction:true entries from viewState() in the body (S1)', async () => {
      const view: PoolStateView = {
        ...poolState(),
        entries: [
          {
            ollamaName: 'qwen2.5:32b',
            hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
            sizeOnDiskGb: 20,
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUsedAt: null,
            currentScore: 71,
            pendingEviction: true,
          },
        ],
      };
      const { statusCode, chunks } = await get(
        {
          ...baseDeps,
          getModelPool: () => ({ snapshot: () => poolState(), viewState: () => view }),
        },
        '/api/v1/local-models/pool'
      );
      expect(statusCode()).toBe(200);
      const body = JSON.parse(chunks.join('')) as {
        entries: Array<{ ollamaName: string; pendingEviction?: boolean }>;
      };
      const deferred = body.entries.find((e) => e.ollamaName === 'qwen2.5:32b');
      expect(deferred?.pendingEviction).toBe(true);
    });

    it('falls back to snapshot() when viewState is absent', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getModelPool: () => ({ snapshot: () => poolState({ diskUsedGb: 7 }) }) },
        '/api/v1/local-models/pool'
      );
      expect(statusCode()).toBe(200);
      expect(JSON.parse(chunks.join(''))).toMatchObject({ diskUsedGb: 7 });
    });

    it('returns 503 when the pool is null (LMLM disabled)', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getModelPool: () => null },
        '/api/v1/local-models/pool'
      );
      expect(statusCode()).toBe(503);
      expect(chunks.join('')).toContain('LMLM disabled');
    });
  });

  describe('GET /api/v1/local-models/recommendations', () => {
    it('returns 200 with the ranked array (defaults top=10, profile=general)', async () => {
      const seen: Array<{ top: number; profile: string }> = [];
      const { statusCode, chunks } = await get(
        {
          ...baseDeps,
          getRecommendations: async (opts) => {
            seen.push(opts);
            return RANKED;
          },
        },
        '/api/v1/local-models/recommendations'
      );
      expect(statusCode()).toBe(200);
      expect(seen[0]).toEqual({ top: 10, profile: 'general' });
      expect(JSON.parse(chunks.join(''))).toHaveLength(1);
    });

    it('passes through valid top + profile', async () => {
      const seen: Array<{ top: number; profile: string }> = [];
      await get(
        {
          ...baseDeps,
          getRecommendations: async (opts) => {
            seen.push(opts);
            return [];
          },
        },
        '/api/v1/local-models/recommendations?top=3&profile=coding'
      );
      expect(seen[0]).toEqual({ top: 3, profile: 'coding' });
    });

    it('returns 400 for top=-1', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getRecommendations: async () => [] },
        '/api/v1/local-models/recommendations?top=-1'
      );
      expect(statusCode()).toBe(400);
      expect(chunks.join('')).toContain('invalid top');
    });

    it('returns 400 for a bogus profile', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getRecommendations: async () => [] },
        '/api/v1/local-models/recommendations?profile=bogus'
      );
      expect(statusCode()).toBe(400);
      expect(chunks.join('')).toContain('invalid profile');
    });

    it('returns 400 for top above the cap (100)', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, getRecommendations: async () => [] },
        '/api/v1/local-models/recommendations?top=101'
      );
      expect(statusCode()).toBe(400);
      expect(chunks.join('')).toContain('exceeds maximum');
    });

    it('accepts top exactly at the cap (100)', async () => {
      const seen: Array<{ top: number; profile: string }> = [];
      const { statusCode } = await get(
        {
          ...baseDeps,
          getRecommendations: async (opts) => {
            seen.push(opts);
            return [];
          },
        },
        '/api/v1/local-models/recommendations?top=100'
      );
      expect(statusCode()).toBe(200);
      expect(seen[0]?.top).toBe(100);
    });

    it('returns 503 when the accessor is absent (LMLM disabled)', async () => {
      const { statusCode } = await get(baseDeps, '/api/v1/local-models/recommendations');
      expect(statusCode()).toBe(503);
    });

    it('returns 503 (not 400) when disabled AND params are invalid — disabled wins (P7-SUG-RECS-VALIDATION-ORDER)', async () => {
      // `top=-5` is invalid, but a disabled instance must answer 503 like the
      // other 3 GETs rather than leaking a 400 for input it never services.
      const { statusCode, chunks } = await get(
        baseDeps,
        '/api/v1/local-models/recommendations?top=-5&profile=bogus'
      );
      expect(statusCode()).toBe(503);
      expect(chunks.join('')).toContain('LMLM disabled');
    });
  });

  describe('GET /api/v1/local-models/proposals', () => {
    it('returns 200 with the (model-only) proposal list', async () => {
      const { statusCode, chunks } = await get(
        { ...baseDeps, listModelProposals: async () => [MODEL_PROPOSAL] },
        '/api/v1/local-models/proposals'
      );
      expect(statusCode()).toBe(200);
      expect(JSON.parse(chunks.join(''))).toHaveLength(1);
    });

    it('returns 503 when the accessor is absent (LMLM disabled)', async () => {
      const { statusCode } = await get(baseDeps, '/api/v1/local-models/proposals');
      expect(statusCode()).toBe(503);
    });
  });

  it('maps a thrown accessor error to 500', async () => {
    const { statusCode, chunks } = await get(
      {
        ...baseDeps,
        getHardwareProfile: () => Promise.reject(new Error('probe boom')),
      },
      '/api/v1/local-models/hardware'
    );
    expect(statusCode()).toBe(500);
    expect(chunks.join('')).toContain('probe boom');
  });
});

describe('handleV1LocalModelsRoute (POST /api/v1/local-models/candidates/refresh)', () => {
  it('returns 200 with the seeding source + count on a live refresh', async () => {
    const deps: V1LocalModelsDeps = {
      getRefreshScheduler: () => null,
      getRefreshCandidates: () => async () => ({ source: 'live', count: 6 }),
    };
    const req = makeReq('POST', '/api/v1/local-models/candidates/refresh');
    const { res, chunks, statusCode, done } = makeRes();

    expect(handleV1LocalModelsRoute(req, res, deps)).toBe(true);
    await done;
    expect(statusCode()).toBe(200);
    expect(JSON.parse(chunks.join(''))).toEqual({ source: 'live', count: 6 });
  });

  it('returns 503 when candidate refresh is unavailable (LMLM disabled)', async () => {
    const deps: V1LocalModelsDeps = {
      getRefreshScheduler: () => null,
      getRefreshCandidates: () => null,
    };
    const req = makeReq('POST', '/api/v1/local-models/candidates/refresh');
    const { res, statusCode, done } = makeRes();

    expect(handleV1LocalModelsRoute(req, res, deps)).toBe(true);
    await done;
    expect(statusCode()).toBe(503);
  });

  it('returns 503 when getRefreshCandidates is not configured', async () => {
    const deps: V1LocalModelsDeps = { getRefreshScheduler: () => null };
    const req = makeReq('POST', '/api/v1/local-models/candidates/refresh');
    const { res, statusCode, done } = makeRes();

    expect(handleV1LocalModelsRoute(req, res, deps)).toBe(true);
    await done;
    expect(statusCode()).toBe(503);
  });
});
