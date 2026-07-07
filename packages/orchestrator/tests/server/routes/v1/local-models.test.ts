import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { TickResult } from '@harness-engineering/local-models';
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
