import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { OrchestratorServer } from './http';

class FakeOrchestrator {
  getSnapshot() {
    return { ok: true };
  }
  on() {}
  removeListener() {}
}

let dir: string;
let server: OrchestratorServer;
let port: number;

async function req(p: string, method = 'GET', body?: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        host: '127.0.0.1',
        port,
        path: p,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : {},
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

describe('dispatchAuthedRequest audit captures wire-final status', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-audit-status-'));
    // Ensure audit-log parent directory exists (AuditLogger best-effort writes
    // require parent; eliminates ENOENT log noise from the dispatch path).
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

  // Async route handlers (e.g. handleAuthRoute → void handlePost(...)) return
  // `true` synchronously to the route-table loop while the response is still
  // being produced asynchronously. The carry-forward bug ("audit-status-
  // staleness") was that inline `this.audit(...)` after `route(req, res)`
  // returned read res.statusCode BEFORE the async handler called writeHead,
  // so audit recorded the default 200 instead of the wire-final code.
  //
  // Switching to res.on('finish', ...) waits for the response to flush before
  // sampling res.statusCode — guaranteed to be the wire-final value.
  it('records the wire-final status for async route handlers', async () => {
    // POST with invalid JSON body to /api/v1/auth/token. Admin scope is implicit
    // via unauth-dev (empty tokens.json). The auth handler is async and ends
    // with a 400, so inline audit (pre-fix) would record 200.
    const res = await req('/api/v1/auth/token', 'POST', 'not-json');
    expect(res.status).toBe(400);
    // Allow res.on('finish') to flush + the AuditLogger append to land.
    await new Promise((r) => setTimeout(r, 50));
    const log = readFileSync(join(dir, 'audit.log'), 'utf-8').trim().split('\n');
    const last = JSON.parse(log[log.length - 1]) as { status: number; route: string };
    expect(last.status).toBe(400);
    expect(last.route).toBe('/api/v1/auth/token');
  });

  it('records 404 for unmatched routes inside an allowed scope prefix', async () => {
    // /api/streams/* is mapped to read-status (admin holds). With no recorder
    // available, handleStreamsRoute is skipped (`!!this.recorder && ...`); no
    // other handler matches. The dispatch loop emits a wire-final 404 inline.
    const res = await req('/api/streams/does-not-exist');
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 50));
    const log = readFileSync(join(dir, 'audit.log'), 'utf-8').trim().split('\n');
    const last = JSON.parse(log[log.length - 1]) as { status: number; route: string };
    expect(last.status).toBe(404);
    expect(last.route).toBe('/api/streams/does-not-exist');
  });
});
