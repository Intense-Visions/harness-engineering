import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { OrchestratorServer } from '../../src/server/http';
import { BackendRouter } from '../../src/agent/backend-router';
import { RoutingDecisionBus } from '../../src/routing/decision-bus';
import { AdaptiveRouter } from '../../src/agent/adaptive-router';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingConfig,
  RoutingPolicy,
  RoutingStatus,
  RoutingTelemetry,
} from '@harness-engineering/types';

/**
 * AMR Phase 5 end-to-end: the routing control plane over the real HTTP server.
 * Proves the full round-trip the component tests only cover in pieces:
 *   PUT /routing/policy → ingestion swaps the live AdaptiveRouter → a dispatch
 *   routes UNDER the pushed policy (budget degrades the tier) → GET /telemetry
 *   returns rows in Shuttle's wire shape → GET /status reflects spend/degradation
 *   → PUT {} restores default-off.
 */

const cap = (over: Partial<BackendCapabilities> = {}): BackendCapabilities => ({
  tier: 'fast',
  costPer1kTokens: 0,
  privacyClass: 'on-device',
  contextWindow: 8192,
  ...over,
});
const localDef = (capabilities: BackendCapabilities): BackendDef => ({
  type: 'local',
  endpoint: 'http://localhost:1234/v1',
  model: 'm',
  capabilities,
});
const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});

const backends: Record<string, BackendDef> = {
  fast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
  mid: localDef(cap({ tier: 'standard', costPer1kTokens: 5 })), // estCost 20
  strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })), // estCost 40
};
const routing: RoutingConfig = { default: 'strong' };

function httpReq(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: 'localhost',
        port,
        path,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let chunk = '';
        res.on('data', (c) => (chunk += c));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, body: chunk ? JSON.parse(chunk) : null })
        );
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('AMR routing endpoints — end-to-end over the HTTP server', () => {
  let server: OrchestratorServer;
  let port: number;
  let bus: RoutingDecisionBus;
  let router: BackendRouter;
  // The live router the ingestion swaps — mirrors Orchestrator.adaptiveRouter.
  let adaptiveRouter: AdaptiveRouter | null;

  // Faithful re-creation of Orchestrator.ingestRoutingPolicy's branch logic.
  const ingest = (policy: RoutingPolicy): void => {
    if (Object.keys(policy).length === 0) {
      adaptiveRouter = null;
      return;
    }
    if (adaptiveRouter) adaptiveRouter.setPolicy(policy);
    else
      adaptiveRouter = AdaptiveRouter.fromConfig({
        router,
        backends,
        policy,
        classify: () => verdict('complex'),
        decisionBus: bus,
      });
  };

  beforeEach(() => {
    port = Math.floor(Math.random() * 10000) + 30000;
    bus = new RoutingDecisionBus();
    router = new BackendRouter({ backends, routing, decisionBus: bus });
    adaptiveRouter = null;
    const mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    server = new OrchestratorServer(mockOrchestrator, port, {
      getBackendRouter: () => router,
      getRoutingDecisionBus: () => bus,
      getRoutingConfig: () => routing,
      getBackends: () => backends,
      ingestRoutingPolicy: ingest,
      getRoutingTelemetry: () =>
        adaptiveRouter?.projectTelemetry() ?? { decisions: [], spentUsd: 0 },
      getRoutingStatus: () =>
        adaptiveRouter?.getStatus() ?? {
          active: false,
          budget: null,
          escalation: [],
          allowedProviders: null,
        },
    });
  });

  afterEach(async () => {
    server.stop();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('PUT policy → routes under it (budget degrades tier) → GET telemetry (Shuttle shape) + status → PUT {} off', async () => {
    await server.start();

    // 1. Default-off before any policy.
    let s = await httpReq(port, 'GET', '/api/v1/routing/status');
    expect(s.statusCode).toBe(200);
    expect(s.body).toMatchObject({ active: false });

    // 2. Push a budget policy (degrade at 50% of a $100 cap) → 204, no body.
    const put = await httpReq(port, 'PUT', '/api/v1/routing/policy', {
      budget: { capUsd: 100, degradeAtPct: 50, onBudgetExhausted: 'degrade' },
    });
    expect(put.statusCode).toBe(204);
    expect(adaptiveRouter).not.toBeNull();

    // 3. Drive dispatches through the now-live router. Each `complex` route picks
    //    `strong` (estCost 40); after two, spend is 80 = 80% of cap.
    const d1 = await adaptiveRouter!.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    const d2 = await adaptiveRouter!.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(d1.decision.tierRequired).toBe('strong');
    expect(d2.decision.tierRequired).toBe('strong');
    // The pushed budget now bites: the third dispatch degrades one tier → standard.
    const d3 = await adaptiveRouter!.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(d3.decision.tierRequired).toBe('standard');
    expect(d3.decision.backendName).toBe('mid');

    // 4. GET telemetry → three rows, each EXACTLY Shuttle's wire shape (the C1 fix
    //    proven over the wire), with the summed spend.
    const t = await httpReq(port, 'GET', '/api/v1/routing/telemetry');
    expect(t.statusCode).toBe(200);
    const tel = t.body as RoutingTelemetry;
    expect(tel.decisions).toHaveLength(3);
    for (const dec of tel.decisions) {
      expect(Object.keys(dec).sort()).toEqual([
        'backend',
        'decisionTs',
        'estCostUsd',
        'tierRequired',
      ]);
    }
    expect(tel.spentUsd).toBeCloseTo(100); // 40 + 40 + 20

    // 5. GET status → active, budget spend-vs-cap, degrading.
    s = await httpReq(port, 'GET', '/api/v1/routing/status');
    const st = s.body as RoutingStatus;
    expect(st.active).toBe(true);
    expect(st.budget).toMatchObject({ capUsd: 100, degradeAtPct: 50, degrading: true });
    expect(st.budget!.spentUsd).toBeGreaterThan(0);

    // 6. PUT {} → default-off restored end-to-end.
    const off = await httpReq(port, 'PUT', '/api/v1/routing/policy', {});
    expect(off.statusCode).toBe(204);
    expect(adaptiveRouter).toBeNull();
    s = await httpReq(port, 'GET', '/api/v1/routing/status');
    expect((s.body as RoutingStatus).active).toBe(false);
  });

  it('a schema-invalid policy PUT is rejected (400) and does not change routing', async () => {
    await server.start();
    const bad = await httpReq(port, 'PUT', '/api/v1/routing/policy', { privacyFloor: 'nonsense' });
    expect(bad.statusCode).toBe(400);
    expect(adaptiveRouter).toBeNull(); // unchanged — still off
  });
});
