import { describe, it, expect, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { BackendRouter } from '../../../agent/backend-router';
import { RoutingDecisionBus } from '../../../routing/decision-bus';
import { handleV1RoutingRoute, type RoutingRouteDeps } from './routing';
import type { BackendDef, RoutingConfig, RoutingTelemetry } from '@harness-engineering/types';

/**
 * AMR Phase 5 (routing endpoints) route-level coverage:
 *   PUT  /api/v1/routing/policy    — validate → ingest → 204 (D1/D4/D5, SC5)
 *   GET  /api/v1/routing/telemetry — Shuttle wire projection (D2, SC3)
 */

function makeRes(): { res: ServerResponse; chunks: string[]; statusCode: () => number } {
  const r = new ServerResponse(new IncomingMessage(new Socket()));
  const chunks: string[] = [];
  r.write = ((c: string) => {
    chunks.push(String(c));
    return true;
  }) as ServerResponse['write'];
  r.end = ((c?: string) => {
    if (c) chunks.push(String(c));
    return r;
  }) as ServerResponse['end'];
  return { res: r, chunks, statusCode: () => r.statusCode };
}

function makeReq(method: string, url: string): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  process.nextTick(() => r.emit('end'));
  return r;
}

function makeBodyReq(method: string, url: string, body: unknown, raw?: string): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  r.headers['content-type'] = 'application/json';
  const data = raw ?? JSON.stringify(body);
  process.nextTick(() => {
    r.emit('data', Buffer.from(data));
    r.emit('end');
  });
  return r;
}

const backends: Record<string, BackendDef> = {
  'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
};
const routing: RoutingConfig = { default: 'local-fast' };

function baseDeps(over: Partial<RoutingRouteDeps> = {}): RoutingRouteDeps {
  return {
    router: new BackendRouter({ backends, routing }),
    bus: new RoutingDecisionBus(),
    routing,
    backends,
    ...over,
  };
}

// A PUT resolves via process.nextTick body emit → await a macrotask so the
// async handler has run before assertions.
const flush = () => new Promise((r) => setTimeout(r, 0));

interface PutResult {
  handled: boolean;
  chunks: string[];
  statusCode: () => number;
}

// Dispatch a PUT /routing/policy, await the async handler, and hand back the
// response probe. `body`/`raw` mirror makeBodyReq; `deps` defaults to baseDeps
// wired with `ingest`. Collapses the per-test request/response/flush boilerplate
// so each `it` is just its distinct arrange + assert.
async function putPolicy(
  body: unknown,
  ingest: NonNullable<RoutingRouteDeps['ingestRoutingPolicy']> & ReturnType<typeof vi.fn>,
  opts: { raw?: string; deps?: RoutingRouteDeps } = {}
): Promise<PutResult> {
  const req = makeBodyReq('PUT', '/api/v1/routing/policy', body, opts.raw);
  const { res, chunks, statusCode } = makeRes();
  const deps = opts.deps ?? baseDeps({ ingestRoutingPolicy: ingest });
  const handled = handleV1RoutingRoute(req, res, deps);
  await flush();
  return { handled, chunks, statusCode };
}

describe('PUT /api/v1/routing/policy', () => {
  it('validates a policy, ingests it, and returns 204 (no body)', async () => {
    const ingest = vi.fn();
    const { handled, chunks, statusCode } = await putPolicy(
      { privacyFloor: 'on-device', budget: { capUsd: 10, onBudgetExhausted: 'degrade' } },
      ingest
    );
    expect(handled).toBe(true);
    expect(statusCode()).toBe(204);
    expect(chunks.join('')).toBe(''); // 204 = no body
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]![0]).toMatchObject({
      privacyFloor: 'on-device',
      budget: { capUsd: 10, onBudgetExhausted: 'degrade' },
    });
  });

  it('accepts an empty {} policy (default-off restore, D5) → 204', async () => {
    const ingest = vi.fn();
    const { statusCode } = await putPolicy({}, ingest);
    expect(statusCode()).toBe(204);
    expect(ingest).toHaveBeenCalledWith({});
  });

  it('tolerates an UNKNOWN allowedProviders string (fails closed at routing, not 4xx)', async () => {
    // Shuttle types allowedProviders as string[]; an unknown provider must pass
    // the wire and fail closed at selection, NOT reject the whole push.
    const ingest = vi.fn();
    const { statusCode } = await putPolicy(
      { allowedProviders: ['local', 'some-future-provider'] },
      ingest
    );
    expect(statusCode()).toBe(204);
    expect(ingest.mock.calls[0]![0]).toEqual({
      allowedProviders: ['local', 'some-future-provider'],
    });
  });

  it('rejects invalid JSON with 400', async () => {
    const ingest = vi.fn();
    const { statusCode } = await putPolicy(undefined, ingest, { raw: '{not json' });
    expect(statusCode()).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects a schema-invalid policy with 400 (bad privacyFloor)', async () => {
    const ingest = vi.fn();
    const { statusCode } = await putPolicy({ privacyFloor: 'nonsense' }, ingest);
    expect(statusCode()).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects an unknown-fields-only body with 400 (strip-to-empty ≠ disable)', async () => {
    // A typo'd/unknown-only body strips to {} under the tolerant schema; it must
    // NOT be treated as the intentional {} disable (which tears down the live
    // router). Only a LITERAL {} disables.
    const ingest = vi.fn();
    const { statusCode } = await putPolicy({ complexityTierMatrics: { trivial: 'fast' } }, ingest);
    expect(statusCode()).toBe(400);
    expect(ingest).not.toHaveBeenCalled(); // never silently disabled
  });

  it('returns 500 (not an unhandled rejection) if ingestion throws', async () => {
    const ingest = vi.fn(() => {
      throw new Error('router construction blew up');
    });
    const { statusCode } = await putPolicy({ privacyFloor: 'on-device' }, ingest);
    expect(statusCode()).toBe(500);
  });

  it('returns 503 when routing is unavailable (no router / no ingestion fn)', async () => {
    const ingest = vi.fn();
    const { statusCode } = await putPolicy({ privacyFloor: 'on-device' }, ingest, {
      deps: { router: null, bus: null, routing: null, backends: null },
    });
    expect(statusCode()).toBe(503);
  });
});

describe('GET /api/v1/routing/telemetry', () => {
  it('returns the Shuttle wire projection (200)', () => {
    const telemetry: RoutingTelemetry = {
      decisions: [
        {
          decisionTs: '2026-07-12T00:00:00.000Z',
          tierRequired: 'strong',
          backend: 'local-fast',
          estCostUsd: 0.4,
        },
      ],
      spentUsd: 0.4,
    };
    const req = makeReq('GET', '/api/v1/routing/telemetry');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1RoutingRoute(req, res, baseDeps({ getTelemetry: () => telemetry }));
    expect(handled).toBe(true);
    expect(statusCode()).toBe(200);
    expect(JSON.parse(chunks.join(''))).toEqual(telemetry);
  });

  it('returns an empty payload (200) when no telemetry accessor is wired', () => {
    const req = makeReq('GET', '/api/v1/routing/telemetry');
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, baseDeps());
    expect(statusCode()).toBe(200);
    expect(JSON.parse(chunks.join(''))).toEqual({ decisions: [], spentUsd: 0 });
  });
});

describe('GET /api/v1/routing/status', () => {
  it('returns the live status payload (200)', () => {
    const status = {
      active: true,
      budget: {
        spentUsd: 40,
        capUsd: 100,
        degradeAtPct: 90,
        spentPct: 40,
        degrading: false,
        exhausted: false,
      },
      escalation: [{ coherenceUnit: 'issue-1', floor: 'standard' as const }],
      allowedProviders: ['local' as const],
    };
    const req = makeReq('GET', '/api/v1/routing/status');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1RoutingRoute(req, res, baseDeps({ getStatus: () => status }));
    expect(handled).toBe(true);
    expect(statusCode()).toBe(200);
    expect(JSON.parse(chunks.join(''))).toEqual(status);
  });

  it('returns an inactive payload (200) when no status accessor is wired', () => {
    const req = makeReq('GET', '/api/v1/routing/status');
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, baseDeps());
    expect(statusCode()).toBe(200);
    expect(JSON.parse(chunks.join(''))).toEqual({
      active: false,
      budget: null,
      escalation: [],
      allowedProviders: null,
    });
  });
});
