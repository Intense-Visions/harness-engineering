import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { BackendRouter } from '../../../agent/backend-router';
import { RoutingDecisionBus } from '../../../routing/decision-bus';
import { handleV1RoutingRoute } from './routing';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

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
} {
  const sock = new Socket();
  const r = new ServerResponse(new IncomingMessage(sock));
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

describe('handleV1RoutingRoute — GET /api/v1/routing/config', () => {
  it('returns 200 with routing + resolvedChains + backends', () => {
    const backends: Record<string, BackendDef> = {
      'claude-opus': { type: 'anthropic', model: 'claude-opus-4-7' },
      'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
    };
    const routing: RoutingConfig = {
      default: 'claude-opus',
      'quick-fix': ['local-fast', 'claude-opus'],
      skills: { 'harness-debugging': 'local-fast' },
    };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    const req = makeReq('GET', '/api/v1/routing/config');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    expect(handled).toBe(true);
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join(''));
    expect(body.backends).toEqual(['claude-opus', 'local-fast']);
    expect(body.routing).toEqual(routing);
    expect(body.resolvedChains['default']).toEqual([{ candidate: 'claude-opus', exists: true }]);
    expect(body.resolvedChains['tier:quick-fix']).toEqual([
      { candidate: 'local-fast', exists: true },
      { candidate: 'claude-opus', exists: true },
    ]);
    expect(body.resolvedChains['skill:harness-debugging']).toEqual([
      { candidate: 'local-fast', exists: true },
    ]);
  });

  it('returns 503 when router is null', () => {
    const req = makeReq('GET', '/api/v1/routing/config');
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1RoutingRoute(req, res, {
      router: null,
      bus: null,
      routing: null,
      backends: null,
    });
    expect(handled).toBe(true);
    expect(statusCode()).toBe(503);
    expect(chunks.join('')).toContain('BackendRouter not available');
  });
});

describe('handleV1RoutingRoute — GET /api/v1/routing/decisions', () => {
  it('returns 200 with decisions[] filtered by skill+limit, newest-first', () => {
    const backends: Record<string, BackendDef> = {
      'claude-opus': { type: 'anthropic', model: 'x' },
    };
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: { 'harness-debugging': 'claude-opus' },
    };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    // Seed: 3 skill decisions for harness-debugging, 2 tier decisions.
    for (let i = 0; i < 3; i++) {
      bus.emit({
        timestamp: `2026-05-26T00:00:0${i}.000Z`,
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        resolutionPath: [],
        backendName: 'claude-opus',
        backendType: 'anthropic',
        durationMs: 0,
      });
    }
    for (let i = 0; i < 2; i++) {
      bus.emit({
        timestamp: `2026-05-26T00:01:0${i}.000Z`,
        useCase: { kind: 'tier', tier: 'quick-fix' },
        resolutionPath: [],
        backendName: 'claude-opus',
        backendType: 'anthropic',
        durationMs: 0,
      });
    }
    const req = makeReq('GET', '/api/v1/routing/decisions?skill=harness-debugging&limit=2');
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join(''));
    expect(body.decisions.length).toBe(2);
    // newest-first: latest two seeded skill decisions are 00:00:02 then 00:00:01.
    expect(body.decisions[0].timestamp).toBe('2026-05-26T00:00:02.000Z');
    expect(body.decisions[1].timestamp).toBe('2026-05-26T00:00:01.000Z');
  });

  it('returns 503 when bus is null', () => {
    const req = makeReq('GET', '/api/v1/routing/decisions');
    const { res, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, {
      router: null,
      bus: null,
      routing: null,
      backends: null,
    });
    expect(statusCode()).toBe(503);
  });
});

function makeJsonReq(method: string, url: string, body: unknown): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  r.headers['content-type'] = 'application/json';
  const data = JSON.stringify(body);
  process.nextTick(() => {
    r.emit('data', Buffer.from(data));
    r.emit('end');
  });
  return r;
}

describe('handleV1RoutingRoute — POST /api/v1/routing/trace', () => {
  it('returns 200 with { decision, def: { type } } and does NOT emit on bus', async () => {
    const backends: Record<string, BackendDef> = {
      'claude-opus': { type: 'anthropic', model: 'x' },
    };
    const routing: RoutingConfig = { default: 'claude-opus' };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    const ringBefore = bus.recent().length;
    const req = makeJsonReq('POST', '/api/v1/routing/trace', {
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join(''));
    expect(body.decision.backendName).toBe('claude-opus');
    expect(body.def).toEqual({ type: 'anthropic' });
    // dry-run: production bus must not have grown.
    expect(bus.recent().length).toBe(ringBefore);
  });

  it('returns 400 on invalid body (missing useCase.kind)', async () => {
    const backends: Record<string, BackendDef> = {
      'claude-opus': { type: 'anthropic', model: 'x' },
    };
    const routing: RoutingConfig = { default: 'claude-opus' };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    const req = makeJsonReq('POST', '/api/v1/routing/trace', { useCase: { tier: 'quick-fix' } });
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(400);
    expect(chunks.join('')).toContain('error');
  });

  it('returns 503 when routing/backends are null (legacy single-backend config)', async () => {
    const req = makeJsonReq('POST', '/api/v1/routing/trace', {
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    const { res, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, {
      router: null,
      bus: null,
      routing: null,
      backends: null,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(503);
  });

  it('SC10: synthetic complexity/risk return derived tierRequired + estCostUsd, ring unchanged', async () => {
    const backends: Record<string, BackendDef> = {
      strong: {
        type: 'anthropic',
        model: 'claude-opus',
        capabilities: {
          tier: 'strong',
          costPer1kTokens: 6,
          privacyClass: 'shared-cloud',
          contextWindow: 200000,
        },
      },
    };
    const routing: RoutingConfig = { default: 'strong' };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    const ringBefore = bus.recent().length;
    const req = makeJsonReq('POST', '/api/v1/routing/trace', {
      useCase: { kind: 'tier', tier: 'quick-fix' },
      complexity: 'complex',
      risk: 'high',
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join(''));
    expect(body.decision.backendName).toBe('strong');
    expect(body.def).toEqual({ type: 'anthropic' });
    // complex + high risk ⇒ strong tier; est cost positive for a priced backend.
    expect(body.tierRequired).toBe('strong');
    expect(typeof body.estCostUsd).toBe('number');
    expect(body.estCostUsd).toBeGreaterThan(0);
    // dry-run invariant preserved.
    expect(bus.recent().length).toBe(ringBefore);
  });

  it('back-compat: a trace WITHOUT complexity/risk returns the legacy shape (no tier/cost)', async () => {
    const backends: Record<string, BackendDef> = {
      'claude-opus': { type: 'anthropic', model: 'x' },
    };
    const routing: RoutingConfig = { default: 'claude-opus' };
    const router = new BackendRouter({ backends, routing });
    const bus = new RoutingDecisionBus();
    const req = makeJsonReq('POST', '/api/v1/routing/trace', {
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1RoutingRoute(req, res, { router, bus, routing, backends });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join(''));
    expect(body.decision.backendName).toBe('claude-opus');
    expect(body.tierRequired).toBeUndefined();
    expect(body.estCostUsd).toBeUndefined();
  });
});
