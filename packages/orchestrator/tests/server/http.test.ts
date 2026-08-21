import { describe, it, expect, vi, beforeEach, afterEach, type TestOptions } from 'vitest';

const RETRY: TestOptions = { retry: 2 };
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { OrchestratorServer } from '../../src/server/http';
import type { ModelPoolOps } from '../../src/proposals/model-handlers';
import type { PoolEntry, PoolState } from '@harness-engineering/local-models';
import type { TickResult } from '@harness-engineering/local-models';
import type { Proposal } from '@harness-engineering/types';

describe('OrchestratorServer', () => {
  let server: OrchestratorServer;
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    server = new OrchestratorServer(mockOrchestrator, 0);
  });

  afterEach(async () => {
    server.stop();
    // Small delay for cleanup
    await new Promise((r) => setTimeout(r, 50));
  });

  it('exposes GET /api/v1/state', async () => {
    await server.start();

    const response = await new Promise((resolve) => {
      http.get(`http://localhost:${server.boundPort}/api/v1/state`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        });
      });
    });

    expect((response as any).statusCode).toBe(200);
    expect((response as any).body).toEqual({ running: [], retryAttempts: [], claimed: [] });
    expect(mockOrchestrator.getSnapshot).toHaveBeenCalled();
  });

  it('returns 404 for unknown routes', async () => {
    await server.start();

    const response = await new Promise((resolve) => {
      http.get(`http://localhost:${server.boundPort}/unknown`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode });
        });
      });
    });

    expect((response as any).statusCode).toBe(404);
  });

  it('broadcasts state_change events to WebSocket clients', RETRY, async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${server.boundPort}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    mockOrchestrator.emit('state_change', { running: ['issue-1'] });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({
      type: 'state_change',
      data: { running: ['issue-1'] },
    });

    ws.close();
  });

  it('broadcasts agent_event events to WebSocket clients', RETRY, async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${server.boundPort}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    mockOrchestrator.emit('agent_event', { issueId: 'x', event: { type: 'thought' } });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe('agent_event');
    expect(parsed.data.issueId).toBe('x');

    ws.close();
  });

  it('broadcasts interaction_new via broadcastInteraction', RETRY, async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${server.boundPort}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    server.broadcastInteraction({
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test Issue',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe('interaction_new');
    expect(parsed.data.id).toBe('int-1');

    ws.close();
  });
});

// ── LMLM Phase 6: getModelPool retires the 501 + refresh route registration ──

const POOLED: PoolEntry = {
  ollamaName: 'qwen2.5:32b',
  hfRepoId: 'Qwen/Qwen2.5-32B-GGUF',
  sizeOnDiskGb: 20,
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 71,
};

function fakePool(): ModelPoolOps {
  const state: PoolState = {
    diskBudgetGb: 100,
    diskUsedGb: 20,
    entries: [POOLED],
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
  return {
    install: () => Promise.resolve({ status: 'success', entry: POOLED, evicted: [] }),
    evict: (r) => Promise.resolve({ status: 'success', name: r.ollamaName, removed: POOLED }),
    snapshot: () => state,
  };
}

function writeModelProposal(projectPath: string, id: string): void {
  const record = {
    kind: 'model',
    id,
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
        summary: 'A newer model beats the current pool member by a wide margin.',
        benchmarkBasis: ['mmlu'],
        hardwareFit: '27GB',
        evidence: 'direct',
        freshness: '2026-05-21',
      },
      diskImpactGb: 3.2,
    },
  };
  const pdir = path.join(projectPath, '.harness', 'proposals');
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, `${id}.json`), JSON.stringify(record, null, 2));
}

function post(port: number, url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: url, method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function get(port: number, url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: url, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('OrchestratorServer LMLM Phase 6 wiring', () => {
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };
  let servers: OrchestratorServer[];
  let tmpDir: string;

  beforeEach(() => {
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    servers = [];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmlm-http-'));
  });

  afterEach(async () => {
    for (const s of servers) s.stop();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeServer(port: number, deps: ConstructorParameters<typeof OrchestratorServer>[2]) {
    const s = new OrchestratorServer(mockOrchestrator, port, deps);
    servers.push(s);
    return s;
  }

  it('getModelPool wired → model approve reaches the live pool (no 501)', async () => {
    writeModelProposal(tmpDir, 'proposal_model_live');
    const server = makeServer(0, { projectPath: tmpDir, getModelPool: () => fakePool() });
    await server.start();

    const res = await post(server.boundPort, '/api/v1/proposals/proposal_model_live/approve');
    // The 501 stub is retired: the request reaches the pool handler. A swap/add
    // approval installs the target asynchronously (the pull would otherwise block
    // past the proxy headersTimeout), so it returns 202 { disposition:'installing' }
    // and streams the outcome over the local-models:install WS topic.
    expect(res.statusCode).not.toBe(501);
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).disposition).toBe('installing');
  });

  it('getModelPool absent → model approve still returns 501 (LMLM disabled)', async () => {
    writeModelProposal(tmpDir, 'proposal_model_off');
    const server = makeServer(0, { projectPath: tmpDir, getModelPool: () => null });
    await server.start();

    const res = await post(server.boundPort, '/api/v1/proposals/proposal_model_off/approve');
    expect(res.statusCode).toBe(501);
  });

  it('registers POST /api/v1/local-models/refresh → 200 with emitted count', async () => {
    const tick: TickResult = {
      candidatesEvaluated: 4,
      proposalsEmitted: 2,
      reconciledRemoved: [],
      snapshotLoaded: true,
      hfReachable: true,
      warnings: [],
      errors: [],
    };
    const server = makeServer(0, {
      projectPath: tmpDir,
      getRefreshScheduler: () => ({ forceRefresh: async () => tick }),
    });
    await server.start();

    const res = await post(server.boundPort, '/api/v1/local-models/refresh');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).emitted).toBe(2);
  });

  it('refresh route returns 503 when the scheduler is absent (LMLM disabled)', async () => {
    const server = makeServer(0, { projectPath: tmpDir });
    await server.start();

    const res = await post(server.boundPort, '/api/v1/local-models/refresh');
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toContain('LMLM disabled');
  });
});

// ── LMLM Phase 7: the four GET read routes must route through V1_BRIDGE_ROUTES
// to `handleV1LocalModelsRoute` and NOT fall through the /api/v1 rewrite shim to
// the legacy /api/local-models status handler (which is in V1_WRAPPABLE). Each
// case hits the real server and asserts a response only the new handler could
// produce (PoolState shape, a 400 on bad params, the 503 'LMLM disabled' body). ──

const HW_PROFILE = {
  platform: 'macos',
  vramGb: 24,
  ramGb: 64,
  bandwidthGbps: 400,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-07-07T00:00:00.000Z',
} as const;

describe('OrchestratorServer LMLM Phase 7 GET route bridging', () => {
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };
  let servers: OrchestratorServer[];
  let tmpDir: string;

  beforeEach(() => {
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    servers = [];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmlm-http7-'));
  });

  afterEach(async () => {
    for (const s of servers) s.stop();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeServer(port: number, deps: ConstructorParameters<typeof OrchestratorServer>[2]) {
    const s = new OrchestratorServer(mockOrchestrator, port, deps);
    servers.push(s);
    return s;
  }

  it('GET /hardware routes to the new handler (200 HardwareProfile, not the status route)', async () => {
    const server = makeServer(0, {
      projectPath: tmpDir,
      getHardwareProfile: () => Promise.resolve(HW_PROFILE),
    });
    await server.start();

    const res = await get(server.boundPort, '/api/v1/local-models/hardware');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ vramGb: 24, platform: 'macos' });
  });

  it('GET /pool routes to the new handler (200 PoolState, not the status route)', async () => {
    const server = makeServer(0, { projectPath: tmpDir, getModelPool: () => fakePool() });
    await server.start();

    const res = await get(server.boundPort, '/api/v1/local-models/pool');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // PoolState shape — the legacy status handler returns a statuses array, not this.
    expect(body).toMatchObject({ diskBudgetGb: 100, entries: expect.any(Array) });
  });

  it('GET /recommendations validates params → 400 (only the new handler does this)', async () => {
    const server = makeServer(0, {
      projectPath: tmpDir,
      getRecommendations: async () => [],
    });
    await server.start();

    const bad = await get(server.boundPort, '/api/v1/local-models/recommendations?top=-1');
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).error).toContain('invalid top');

    const ok = await get(
      server.boundPort,
      '/api/v1/local-models/recommendations?top=5&profile=coding'
    );
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toEqual([]);
  });

  it('GET /proposals routes to the new handler (200 list)', async () => {
    const server = makeServer(0, {
      projectPath: tmpDir,
      listModelProposals: async () =>
        [{ id: 'p1', kind: 'model', status: 'open' }] as unknown as Proposal[],
    });
    await server.start();

    const res = await get(server.boundPort, '/api/v1/local-models/proposals');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });

  it('all four GETs return 503 LMLM-disabled when accessors are absent (reached the new handler, not the status route)', async () => {
    const server = makeServer(0, { projectPath: tmpDir });
    await server.start();

    for (const name of ['hardware', 'pool', 'recommendations', 'proposals']) {
      const res = await get(server.boundPort, `/api/v1/local-models/${name}`);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).error).toContain('LMLM disabled');
    }
  });

  it('fans out local-models:pool bus events to connected /ws clients', RETRY, async () => {
    const server = makeServer(0, { projectPath: tmpDir });
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${server.boundPort}/ws`);
    await new Promise<void>((r) => ws.on('open', r));
    const messages: string[] = [];
    ws.on('message', (d) => messages.push(d.toString()));

    // The model handlers + scheduler emit these on the orchestrator bus.
    mockOrchestrator.emit('local-models:pool', { phase: 'evict_completed', name: 'qwen2.5:32b' });
    mockOrchestrator.emit('local-models:proposal', { id: 'p1', status: 'created' });

    await new Promise((r) => setTimeout(r, 100));

    const frames = messages.map((m) => JSON.parse(m));
    expect(frames).toContainEqual({
      type: 'local-models:pool',
      data: { phase: 'evict_completed', name: 'qwen2.5:32b' },
    });
    expect(frames).toContainEqual({
      type: 'local-models:proposal',
      data: { id: 'p1', status: 'created' },
    });

    ws.close();
  });

  it('detaches the bus→WS model listeners on stop()', async () => {
    const server = makeServer(0, { projectPath: tmpDir });
    await server.start();
    // Two topics were subscribed in wireEvents().
    expect(mockOrchestrator.listenerCount('local-models:pool')).toBe(1);
    expect(mockOrchestrator.listenerCount('local-models:proposal')).toBe(1);

    server.stop();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockOrchestrator.listenerCount('local-models:pool')).toBe(0);
    expect(mockOrchestrator.listenerCount('local-models:proposal')).toBe(0);
  });
});

describe('OrchestratorServer — bind failures and ephemeral ports', () => {
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
  });

  it('binds an OS-assigned port when constructed with 0 and exposes it as boundPort', async () => {
    const server = new OrchestratorServer(mockOrchestrator, 0);
    try {
      await server.start();
      expect(server.boundPort).toBeGreaterThan(0);

      // The adopted port must be the one actually serving traffic.
      const status = await new Promise<number | undefined>((resolve) => {
        http.get(`http://localhost:${server.boundPort}/api/v1/state`, (res) =>
          resolve(res.statusCode)
        );
      });
      expect(status).toBe(200);
    } finally {
      server.stop();
    }
  });

  it('returns an actionable 429 body with a machine code and retry budget when rate limited', async () => {
    // Enable localhost rate limiting for this test (normally exempt). RATE_LIMIT
    // defaults to 100 req/window, so request 101 from this IP trips the limiter.
    vi.stubEnv('HARNESS_RATE_LIMIT_LOCALHOST', '1');
    const server = new OrchestratorServer(mockOrchestrator, 0);
    await server.start();

    type RlResponse = {
      statusCode: number | undefined;
      retryAfter: string | undefined;
      body: unknown;
    };
    const getOnce = (): Promise<RlResponse> =>
      new Promise((resolve) => {
        // A non-state route: the state endpoints are exempt from rate limiting.
        http.get(`http://127.0.0.1:${server.boundPort}/unknown`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({
              statusCode: res.statusCode,
              retryAfter: res.headers['retry-after'],
              body: data ? JSON.parse(data) : undefined,
            })
          );
        });
      });

    let limited: RlResponse | undefined;
    for (let i = 0; i < 130 && !limited; i++) {
      const r = await getOnce();
      if (r.statusCode === 429) limited = r;
    }

    try {
      expect(limited).toBeDefined();
      const r = limited as RlResponse;
      expect(r.statusCode).toBe(429);
      // Retry-After header must still be present (not removed by the body change).
      expect(r.retryAfter).toBeDefined();
      expect(Number(r.retryAfter)).toBeGreaterThan(0);
      // Body must be an actionable envelope a consumer can branch on.
      const body = r.body as {
        error?: { code?: string; message?: string; retryAfterSeconds?: unknown };
      };
      expect(body.error?.code).toBe('rate_limited');
      expect(typeof body.error?.message).toBe('string');
      expect(typeof body.error?.retryAfterSeconds).toBe('number');
      expect(body.error?.retryAfterSeconds as number).toBeGreaterThan(0);
    } finally {
      server.stop();
      vi.unstubAllEnvs();
    }
  });

  it('rejects instead of hanging when the port is already in use', async () => {
    const first = new OrchestratorServer(mockOrchestrator, 0);
    await first.start();
    const taken = first.boundPort;

    const second = new OrchestratorServer(mockOrchestrator, taken);
    try {
      // Before the 'error' listener existed this neither resolved nor rejected:
      // the bind error went unhandled and the caller stalled until its timeout.
      await expect(second.start()).rejects.toThrow(/failed to bind/i);
    } finally {
      second.stop();
      first.stop();
    }
  });
});
