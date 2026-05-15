import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { OrchestratorServer } from './http';
import { InteractionQueue, type PendingInteraction } from '../core/interaction-queue';
import type { MaintenanceRouteDeps } from './routes/maintenance';

class FakeOrchestrator extends EventEmitter {
  getSnapshot(): Record<string, unknown> {
    return { ok: true };
  }
}

let dir: string;
let server: OrchestratorServer;
let port: number;

async function req(
  p: string,
  method = 'GET'
): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    r.on('error', reject);
    r.end();
  });
}

interface RequestWithBody {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

async function reqJSON(p: string, method: string, body?: unknown): Promise<RequestWithBody> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = {};
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += String(chunk);
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: buf })
      );
    });
    r.on('error', reject);
    if (payload !== undefined) r.write(payload);
    r.end();
  });
}

describe('v1 alias coverage + Deprecation header', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-v1-alias-'));
    mkdirSync(dir, { recursive: true });
    process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
    process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
    delete process.env['HARNESS_API_TOKEN'];
    server = new OrchestratorServer(new FakeOrchestrator() as never, 0);
    port = await new Promise((resolve) => {
      (server as unknown as { httpServer: http.Server }).httpServer.listen(
        0,
        '127.0.0.1',
        function (this: http.Server) {
          const addr = this.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        }
      );
    });
  });
  afterEach(() => {
    (server as unknown as { httpServer: http.Server }).httpServer.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env['HARNESS_TOKENS_PATH'];
    delete process.env['HARNESS_AUDIT_PATH'];
  });

  // Each legacy prefix exists today; the v1 alias must return the same status
  // and the legacy response must carry Deprecation, the v1 response must not.
  // Note: many of these paths return non-200 in the test harness because the
  // dependency (recorder, queue, pipeline) is not wired. We only assert
  // legacy.status === v1.status (rewrite parity), not that the status is 200.
  const cases: Array<{ legacy: string; v1: string }> = [
    { legacy: '/api/state', v1: '/api/v1/state' },
    { legacy: '/api/interactions', v1: '/api/v1/interactions' },
    { legacy: '/api/plans', v1: '/api/v1/plans' },
    { legacy: '/api/analyses', v1: '/api/v1/analyses' },
    { legacy: '/api/maintenance/status', v1: '/api/v1/maintenance/status' },
    { legacy: '/api/sessions', v1: '/api/v1/sessions' },
  ];

  for (const c of cases) {
    it(`v1 alias for ${c.legacy} returns same status; legacy has Deprecation header`, async () => {
      const legacy = await req(c.legacy);
      const v1 = await req(c.v1);
      expect(legacy.status).toBe(v1.status);
      expect(legacy.headers['deprecation']).toBe('2027-05-14');
      expect(v1.headers['deprecation']).toBeUndefined();
    });
  }
});

// Phase 2 review-fix cycle 1 (IMP-2): HTTP-level integration tests for the
// three v1 bridge primitives. Existing unit tests invoke handlers directly
// and so bypass the URL-rewrite shim — they cannot detect CRIT-1-class bugs
// where the shim mutates req.url before the handler regex runs. These tests
// boot a real OrchestratorServer + real fetch through dispatchAuthedRequest.
describe('v1 bridge primitives — HTTP integration through dispatchAuthedRequest', () => {
  let bridgeDir: string;
  let bridgeServer: OrchestratorServer;
  let bridgePort: number;
  let queue: InteractionQueue;
  let orchestrator: FakeOrchestrator;

  beforeEach(async () => {
    bridgeDir = mkdtempSync(join(tmpdir(), 'harness-v1-bridge-'));
    mkdirSync(bridgeDir, { recursive: true });
    process.env['HARNESS_TOKENS_PATH'] = join(bridgeDir, 'tokens.json');
    process.env['HARNESS_AUDIT_PATH'] = join(bridgeDir, 'audit.log');
    delete process.env['HARNESS_API_TOKEN'];

    orchestrator = new FakeOrchestrator();
    const queueDir = join(bridgeDir, 'interactions');
    mkdirSync(queueDir, { recursive: true });
    queue = new InteractionQueue(queueDir, orchestrator);

    const maintenanceDeps: MaintenanceRouteDeps = {
      scheduler: { getStatus: () => ({ schedule: {} as never }) } as never,
      reporter: { getHistory: () => [] } as never,
      triggerFn: async (_taskId: string): Promise<void> => {
        // No-op success — the integration test only needs to observe that
        // the handler invokes triggerFn and returns 200 + runId.
      },
    };

    bridgeServer = new OrchestratorServer(orchestrator as never, 0, {
      interactionQueue: queue,
      maintenanceDeps,
    });
    bridgePort = await new Promise((resolve) => {
      (bridgeServer as unknown as { httpServer: http.Server }).httpServer.listen(
        0,
        '127.0.0.1',
        function (this: http.Server) {
          const addr = this.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        }
      );
    });
    port = bridgePort;
  });

  afterEach(() => {
    (bridgeServer as unknown as { httpServer: http.Server }).httpServer.close();
    rmSync(bridgeDir, { recursive: true, force: true });
    delete process.env['HARNESS_TOKENS_PATH'];
    delete process.env['HARNESS_AUDIT_PATH'];
  });

  it('POST /api/v1/jobs/maintenance — 200 + runId end-to-end', async () => {
    const res = await reqJSON('/api/v1/jobs/maintenance', 'POST', {
      taskId: 'cleanup-sessions',
    });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body) as { ok: boolean; taskId: string; runId: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.taskId).toBe('cleanup-sessions');
    expect(parsed.runId).toMatch(/^run_[a-f0-9]+$/);
    expect(res.headers['deprecation']).toBeUndefined();
  });

  // CRIT-1 regression guard. BEFORE the http.ts shim-ordering fix, this
  // test returns 404 (because the URL-rewrite shim mutates
  // /api/v1/interactions/{id}/resolve → /api/interactions/{id}/resolve
  // and the v1 handler regex never matches). AFTER the fix it returns 200,
  // then 409 on the second call.
  it('POST /api/v1/interactions/{id}/resolve — 200 then 409 end-to-end (CRIT-1)', async () => {
    const seeded: PendingInteraction = {
      id: 'int_http_test',
      issueId: 'iss_http_test',
      type: 'needs-human',
      reasons: ['HTTP integration test seed'],
      context: {
        issueTitle: 'T',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await queue.push(seeded);

    const first = await reqJSON('/api/v1/interactions/int_http_test/resolve', 'POST', {});
    expect(first.status).toBe(200);
    const parsedFirst = JSON.parse(first.body) as { resolved: boolean };
    expect(parsedFirst.resolved).toBe(true);
    expect(first.headers['deprecation']).toBeUndefined();

    // Second resolve must surface 409 (already-resolved) — proves the
    // handler actually ran and the queue persists across calls.
    const second = await reqJSON('/api/v1/interactions/int_http_test/resolve', 'POST', {});
    expect(second.status).toBe(409);
  });

  it('POST /api/v1/interactions/{id}/resolve — 404 when interaction not found', async () => {
    const res = await reqJSON('/api/v1/interactions/int_missing/resolve', 'POST', {});
    expect(res.status).toBe(404);
  });

  // GET /api/v1/events SSE end-to-end: connect, dispatch a bus event,
  // observe the frame on the wire. We use a raw HTTP request and read
  // the initial connection comment + one event frame, then close.
  it('GET /api/v1/events — streams event frames end-to-end', async () => {
    await new Promise<void>((resolve, reject) => {
      const r = http.request(
        { host: '127.0.0.1', port: bridgePort, path: '/api/v1/events', method: 'GET' },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toBe('text/event-stream');
          let buf = '';
          let dispatched = false;
          res.on('data', (chunk) => {
            buf += String(chunk);
            // First chunk is the connect comment. Dispatch a bus event so
            // the handler frames it into the SSE stream.
            if (!dispatched && buf.includes('connected at')) {
              dispatched = true;
              orchestrator.emit('state_change', { ping: 'integration-test' });
            }
            // Once we've seen at least one framed event, we're done.
            if (buf.includes('event: state_change')) {
              expect(buf).toContain('"ping":"integration-test"');
              expect(buf).toMatch(/id: evt_[a-f0-9]+/);
              r.destroy(); // close the SSE stream
              resolve();
            }
          });
          res.on('error', reject);
        }
      );
      r.on('error', (err) => {
        // socket destroy → ECONNRESET is the expected close path.
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ECONNRESET') return;
        reject(err);
      });
      r.end();
    });
  });
});
