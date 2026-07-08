import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  EvictPoolRequest,
  EvictPoolResult,
  InstallPoolRequest,
  InstallPoolResult,
  PoolEntry,
  PoolState,
  RankedModel,
} from '@harness-engineering/local-models';
import { listProposals } from '@harness-engineering/core';
import {
  handleV1LocalModelsMutationRoute,
  type V1LocalModelsMutationDeps,
} from '../../../../src/server/routes/v1/local-models-pool-mutation';
import { V1_BRIDGE_ROUTES } from '../../../../src/server/v1-bridge-routes';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmlm-mutation-'));
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  process.nextTick(() => {
    if (body !== undefined) r.emit('data', Buffer.from(JSON.stringify(body)));
    r.emit('end');
  });
  return r;
}

function makeRes(): {
  res: ServerResponse;
  chunks: string[];
  statusCode: () => number;
  body: () => unknown;
  done: Promise<void>;
} {
  const r = new ServerResponse(new IncomingMessage(new Socket()));
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
  return {
    res: r,
    chunks,
    statusCode: () => r.statusCode,
    body: () => JSON.parse(chunks.join('')),
    done,
  };
}

const ENTRY: PoolEntry = {
  ollamaName: 'qwen3:32b',
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

function poolState(entries: PoolEntry[]): PoolState {
  return {
    diskBudgetGb: 100,
    diskUsedGb: entries.reduce((s, e) => s + e.sizeOnDiskGb, 0),
    entries,
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

interface FakePool {
  install: (r: InstallPoolRequest) => Promise<InstallPoolResult>;
  evict: (r: EvictPoolRequest) => Promise<EvictPoolResult>;
  snapshot: () => PoolState;
  markPendingEviction: (n: string) => void;
}

function fakePool(over: Partial<FakePool> & { entries?: PoolEntry[] } = {}): FakePool {
  const entries = over.entries ?? [];
  return {
    install:
      over.install ??
      (async (r) => ({
        status: 'success',
        entry: { ...ENTRY, ollamaName: r.ollamaName },
        evicted: [],
      })),
    evict: over.evict ?? (async (r) => ({ status: 'success', name: r.ollamaName, removed: ENTRY })),
    snapshot: over.snapshot ?? (() => poolState(entries)),
    markPendingEviction: over.markPendingEviction ?? (() => {}),
  };
}

const RANKED = {
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  ollamaName: 'qwen3:32b',
  sizeB: 32,
  quant: 'Q4_K_M',
  score: 71,
  evidence: 'direct',
  benchmarkSnapshot: '2026-05-28',
  fitsHardware: true,
} as unknown as RankedModel;

function deps(over: Partial<V1LocalModelsMutationDeps> = {}): V1LocalModelsMutationDeps {
  return {
    projectPath: tmpDir,
    bus: new EventEmitter(),
    getModelPool: over.getModelPool ?? (() => fakePool()),
    getRecommendations: over.getRecommendations ?? (async () => [RANKED]),
    isModelInUse: over.isModelInUse,
    ...over,
  };
}

describe('POST /local-models/pool/install', () => {
  it('installs an allow-listed recommendation and returns disposition:installed (SC1, SC8)', async () => {
    const d = deps({ getModelPool: () => fakePool() });
    const { res, body, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(200);
    expect(body()).toMatchObject({ disposition: 'installed' });
    // SC8: an auto-approved proposal was persisted for audit.
    const proposals = await listProposals(tmpDir, { kind: 'model' });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.status).toBe('approved');
  });

  it('sizes the install from an estimate, never a pre-pull inspect (regression: install 404 target-missing)', async () => {
    // Regression for the LMLM Recommendations "Install" 404 bug. The route used
    // to send diskImpactGb:0 so the pool would resolve the size via an ollama
    // `/api/show` inspect — which 404s for a not-yet-pulled model, surfacing as
    // `failed_target_missing` → bogus "no longer available on HuggingFace". The
    // fix hands the pool an estimated on-disk size so `install` is given a
    // concrete `sizeOnDiskGb` and the impossible pre-pull inspect never runs.
    let received: InstallPoolRequest | undefined;
    const d = deps({
      getModelPool: () =>
        fakePool({
          install: async (r) => {
            received = r;
            return {
              status: 'success',
              entry: { ...ENTRY, ollamaName: r.ollamaName },
              evicted: [],
            };
          },
        }),
    });
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(200);
    expect(received?.sizeOnDiskGb).toBeGreaterThan(0);
  });

  it('maps a budget_exceeded / not_allowed pool veto to 409 (SC2)', async () => {
    const d = deps({
      getModelPool: () =>
        fakePool({
          install: async () => ({
            status: 'error',
            code: 'budget_exceeded',
            message: 'no eviction plan fits',
            evicted: [],
          }),
        }),
    });
    const { res, body, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(409);
    expect(body()).toMatchObject({ code: 'budget_exceeded' });
  });

  it('returns 404 when no recommendation matches the hfRepoId (SC2)', async () => {
    const d = deps({ getRecommendations: async () => [] });
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {
        hfRepoId: 'unknown/model',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(404);
  });

  it('returns 400 when hfRepoId is missing', async () => {
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {}),
      res,
      deps()
    );
    await done;
    expect(statusCode()).toBe(400);
  });

  it('returns 503 when LMLM is disabled (SC5)', async () => {
    const d = deps({ getModelPool: () => null });
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/install', {
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(503);
  });
});

describe('POST /local-models/pool/remove', () => {
  it('removes an idle pool member and returns disposition:removed (SC3)', async () => {
    const d = deps({
      getModelPool: () => fakePool({ entries: [ENTRY] }),
      isModelInUse: () => false,
    });
    const { res, body, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/remove', {
        ollamaName: 'qwen3:32b',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(200);
    expect(body()).toMatchObject({ disposition: 'removed', evicted: ['qwen3:32b'] });
  });

  it('defers removal of an in-use member (202 deferred, SC4)', async () => {
    // In use → onApproveModelProposal marks pending instead of evicting; the
    // static snapshot keeps the member present, so the route reports deferred.
    const d = deps({
      getModelPool: () => fakePool({ entries: [ENTRY] }),
      isModelInUse: () => true,
    });
    const { res, body, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/remove', {
        ollamaName: 'qwen3:32b',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(202);
    expect(body()).toMatchObject({ disposition: 'deferred' });
  });

  it('returns 404 when the target is not in the pool', async () => {
    const d = deps({ getModelPool: () => fakePool({ entries: [] }) });
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/remove', {
        ollamaName: 'ghost:1b',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(404);
  });

  it('returns 503 when LMLM is disabled (SC5)', async () => {
    const d = deps({ getModelPool: () => null });
    const { res, statusCode, done } = makeRes();
    handleV1LocalModelsMutationRoute(
      makeReq('POST', '/api/v1/local-models/pool/remove', {
        ollamaName: 'qwen3:32b',
      }),
      res,
      d
    );
    await done;
    expect(statusCode()).toBe(503);
  });
});

describe('dispatch + auth registration', () => {
  it('does not own non-mutation or GET requests', () => {
    const { res } = makeRes();
    expect(
      handleV1LocalModelsMutationRoute(makeReq('GET', '/api/v1/local-models/pool'), res, deps())
    ).toBe(false);
    expect(
      handleV1LocalModelsMutationRoute(makeReq('POST', '/api/v1/local-models/refresh'), res, deps())
    ).toBe(false);
  });

  it('both routes require the manage-proposals scope (SC5)', () => {
    const install = V1_BRIDGE_ROUTES.find(
      (r) => r.method === 'POST' && r.pattern.test('/api/v1/local-models/pool/install')
    );
    const remove = V1_BRIDGE_ROUTES.find(
      (r) => r.method === 'POST' && r.pattern.test('/api/v1/local-models/pool/remove')
    );
    expect(install?.scope).toBe('manage-proposals');
    expect(remove?.scope).toBe('manage-proposals');
  });
});
