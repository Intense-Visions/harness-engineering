import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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
