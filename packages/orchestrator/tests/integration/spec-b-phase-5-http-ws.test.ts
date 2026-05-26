import { describe, it, expect, vi, beforeEach, afterEach, type TestOptions } from 'vitest';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { OrchestratorServer } from '../../src/server/http';
import { BackendRouter } from '../../src/agent/backend-router';
import { RoutingDecisionBus } from '../../src/routing/decision-bus';
import type { BackendDef, RoutingConfig, RoutingDecision } from '@harness-engineering/types';

const RETRY: TestOptions = { retry: 2 };

/**
 * Spec B Phase 5 acceptance — HTTP routes + WS topic + Phase 4 review
 * S1/S2 closures.
 *
 * Pinned criteria:
 *   - F10: BackendRouter.resolve → WS frame within 100 ms.
 *   - F8 + ordering: /api/v1/routing/decisions filters by skill & limits
 *     newest-first.
 *   - O3 partial: /api/v1/routing/trace returns the decision via
 *     resolveDecisionAndDef without growing the production ring buffer.
 *   - 503 fallback: all 3 routes 503 when the backend factory is null.
 *   - Phase 4 S1: recent() returns newest-first.
 *   - Phase 4 S2: server.stop() unsubscribes the WS broadcaster.
 *
 * Constructed with a mock Orchestrator (EventEmitter + getSnapshot)
 * matching the existing http.test.ts pattern rather than booting a full
 * Orchestrator — the Phase 5 surface (routing routes + WS broadcaster
 * subscription) lives entirely on OrchestratorServer + its
 * ServerDependencies closures, so a full Orchestrator construction
 * would add SQLite + filesystem dependencies without exercising any
 * Phase 5 contract not already covered here.
 */

const backends: Record<string, BackendDef> = {
  'claude-opus': { type: 'anthropic', model: 'x' },
  'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
};

const routing: RoutingConfig = {
  default: 'claude-opus',
  skills: { 'harness-debugging': 'local-fast' },
};

function httpGet(port: number, path: string): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${port}${path}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
        });
      })
      .on('error', reject);
  });
}

function httpPost(
  port: number,
  path: string,
  body: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let chunk = '';
        res.on('data', (c) => (chunk += c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: chunk ? JSON.parse(chunk) : null,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('Spec B Phase 5: HTTP routes + WS topic acceptance', () => {
  let server: OrchestratorServer;
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };
  let bus: RoutingDecisionBus;
  let router: BackendRouter;
  let port: number;

  beforeEach(() => {
    port = Math.floor(Math.random() * 10000) + 20000;
    bus = new RoutingDecisionBus();
    router = new BackendRouter({ backends, routing, decisionBus: bus });
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    server = new OrchestratorServer(mockOrchestrator, port, {
      getBackendRouter: () => router,
      getRoutingDecisionBus: () => bus,
      getRoutingConfig: () => routing,
      getBackends: () => backends,
    });
  });

  afterEach(async () => {
    server.stop();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('F10: BackendRouter.resolve → WS routing:decision frame within 100ms', RETRY, async () => {
    await server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const received: { t: number; msg: unknown }[] = [];
    ws.on('message', (data) => {
      received.push({ t: performance.now(), msg: JSON.parse(data.toString()) });
    });

    const dispatchT0 = performance.now();
    router.resolve({ kind: 'tier', tier: 'quick-fix' });

    // Allow up to 100 ms for the WS write to land (F10 budget).
    await new Promise((r) => setTimeout(r, 100));

    const decisionFrames = received.filter(
      (e) => (e.msg as { type: string }).type === 'routing:decision'
    );
    expect(decisionFrames.length).toBeGreaterThanOrEqual(1);
    const firstDecision = decisionFrames[0]!;
    expect(firstDecision.t - dispatchT0).toBeLessThan(100);
    const payload = firstDecision.msg as { data: RoutingDecision };
    expect(payload.data.backendName).toBe('claude-opus');
    expect(payload.data.useCase).toMatchObject({ kind: 'tier', tier: 'quick-fix' });

    ws.close();
  });

  it('F8: GET /api/v1/routing/decisions filters by skill + limits newest-first', async () => {
    await server.start();
    // Seed 3 skill + 2 tier dispatches (skill decisions chronologically
    // earliest, so newest-first ordering puts the latest skill at [0]).
    for (let i = 0; i < 3; i++) {
      router.resolve({ kind: 'skill', skillName: 'harness-debugging' });
    }
    for (let i = 0; i < 2; i++) {
      router.resolve({ kind: 'tier', tier: 'quick-fix' });
    }
    const { statusCode, body } = await httpGet(
      port,
      '/api/v1/routing/decisions?skill=harness-debugging&limit=2'
    );
    expect(statusCode).toBe(200);
    const decisions = (body as { decisions: RoutingDecision[] }).decisions;
    expect(decisions.length).toBe(2);
    // Both filtered decisions are skill:harness-debugging — newest-first
    // returns the last two emitted (which are the 2nd + 3rd skill emit).
    for (const d of decisions) {
      expect(d.useCase).toMatchObject({ kind: 'skill', skillName: 'harness-debugging' });
    }
    // Newest-first: decisions[0].timestamp >= decisions[1].timestamp.
    expect(
      new Date(decisions[0]!.timestamp).getTime() >= new Date(decisions[1]!.timestamp).getTime()
    ).toBe(true);
  });

  it('O3 partial: POST /api/v1/routing/trace returns decision without growing ring buffer', async () => {
    await server.start();
    // Seed one real dispatch so the ring buffer length is observable.
    router.resolve({ kind: 'tier', tier: 'quick-fix' });
    const before = bus.recent().length;

    const { statusCode, body } = await httpPost(port, '/api/v1/routing/trace', {
      useCase: { kind: 'skill', skillName: 'harness-debugging' },
    });
    expect(statusCode).toBe(200);
    const parsed = body as { decision: RoutingDecision; def: { type: string } };
    expect(parsed.decision.backendName).toBe('local-fast');
    expect(parsed.def).toEqual({ type: 'local' });
    // Dry-run: production bus length is unchanged.
    expect(bus.recent().length).toBe(before);
  });

  it('503 fallback: all 3 routes return 503 when accessors return null', async () => {
    // Reconstruct server with null accessors (legacy single-backend
    // config — no backendFactory means no router/bus/routing/backends).
    server.stop();
    await new Promise((r) => setTimeout(r, 30));
    port = Math.floor(Math.random() * 10000) + 30000;
    server = new OrchestratorServer(mockOrchestrator, port, {
      getBackendRouter: () => null,
      getRoutingDecisionBus: () => null,
      getRoutingConfig: () => null,
      getBackends: () => null,
    });
    await server.start();

    const configRes = await httpGet(port, '/api/v1/routing/config');
    expect(configRes.statusCode).toBe(503);
    const decisionsRes = await httpGet(port, '/api/v1/routing/decisions');
    expect(decisionsRes.statusCode).toBe(503);
    const traceRes = await httpPost(port, '/api/v1/routing/trace', {
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    expect(traceRes.statusCode).toBe(503);
  });

  it('Phase 4 S1 (latest-N): /api/v1/routing/decisions?limit=10 returns the newest 10', async () => {
    await server.start();
    // Seed 600 decisions — exceeds default capacity (500); newest-first
    // returns the latest 10 of the surviving 500.
    for (let i = 0; i < 600; i++) {
      router.resolve({ kind: 'tier', tier: 'quick-fix' });
    }
    const { statusCode, body } = await httpGet(port, '/api/v1/routing/decisions?limit=10');
    expect(statusCode).toBe(200);
    const decisions = (body as { decisions: RoutingDecision[] }).decisions;
    expect(decisions.length).toBe(10);
    // Newest-first: decisions[0] is the latest emit.
    for (let i = 1; i < decisions.length; i++) {
      expect(
        new Date(decisions[i - 1]!.timestamp).getTime() >=
          new Date(decisions[i]!.timestamp).getTime()
      ).toBe(true);
    }
  });

  it('Phase 4 S2: server.stop() unsubscribes the WS broadcaster from the bus', async () => {
    await server.start();
    // Pre-stop: the broadcaster is wired (proved by F10 test). Confirm
    // the bus has a listener registered.
    const listenersBefore = (bus as unknown as { listeners: Set<unknown> }).listeners.size;
    expect(listenersBefore).toBeGreaterThanOrEqual(1);
    server.stop();
    await new Promise((r) => setTimeout(r, 30));
    // Post-stop: the broadcaster's subscriber was released.
    const listenersAfter = (bus as unknown as { listeners: Set<unknown> }).listeners.size;
    expect(listenersAfter).toBe(listenersBefore - 1);

    // Belt-and-suspenders: clearListeners drops any remaining subscribers
    // — exercised here directly (Orchestrator.stop() calls it in the
    // full-orchestrator path; this mock-orchestrator test calls it
    // explicitly so the same invariant is pinned).
    bus.clearListeners();
    const received: RoutingDecision[] = [];
    bus.subscribe(() => received.push({} as RoutingDecision));
    bus.clearListeners();
    bus.emit({
      timestamp: new Date().toISOString(),
      useCase: { kind: 'tier', tier: 'quick-fix' },
      resolutionPath: [],
      backendName: 'claude-opus',
      backendType: 'anthropic',
      durationMs: 0,
    });
    expect(received).toEqual([]);
  });
});
