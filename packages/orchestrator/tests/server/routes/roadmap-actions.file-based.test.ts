/**
 * File-based S6 /api/roadmap/append: with no harness.config.json the route runs
 * in the default file-based mode and persists the new Backlog row through the
 * roadmap store (resolveRoadmapStoreForFile → applyRoadmapDiff). Uses a REAL
 * monolith roadmap under a temp dir (no core mock), asserting the file is
 * rewritten with the appended row.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { handleRoadmapActionsRoute } from '../../../src/server/routes/roadmap-actions';

function createServer(roadmapPath: string | null): http.Server {
  return http.createServer((req, res) => {
    if (!handleRoadmapActionsRoute(req, res, roadmapPath)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 500, body: data ? JSON.parse(data) : null });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const ROADMAP = `---
project: Test Project
version: 1
last_synced: '2026-01-01T00:00:00.000Z'
last_manual_edit: '2026-01-01T00:00:00.000Z'
---

# Roadmap

## Milestone: MVP

### Existing Feature
- **Status:** planned
- **Summary:** Already here
- **Blocked by:** none
`;

describe('handleRoadmapActionsRoute — file-based append (S6)', () => {
  let projectDir: string;
  let roadmapPath: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-rma-fb-'));
    const docsDir = path.join(projectDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    roadmapPath = path.join(docsDir, 'roadmap.md');
    await fs.writeFile(roadmapPath, ROADMAP, 'utf-8');
    server = createServer(roadmapPath);
    // Bind to port 0 so the OS assigns a free ephemeral port (avoids
    // EADDRINUSE races with sibling route tests under parallel runs).
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    server.close();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('appends a new backlog row through the store and rewrites the aggregate', async () => {
    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: 'Telemetry Pipeline',
      summary: 'Collect metrics',
    });
    expect(res.statusCode).toBe(201);
    expect((res.body as Record<string, unknown>).featureName).toBe('Telemetry Pipeline');

    const written = await fs.readFile(roadmapPath, 'utf-8');
    expect(written).toContain('Telemetry Pipeline');
    // The pre-existing row survives the single-row append.
    expect(written).toContain('Existing Feature');
  });

  it('rejects a title containing markdown headings', async () => {
    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: '### Sneaky',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when the roadmap path is not configured', async () => {
    const nullServer = createServer(null);
    await new Promise<void>((r) => nullServer.listen(0, '127.0.0.1', r));
    const nullPort = (nullServer.address() as AddressInfo).port;
    const res = await request(nullPort, 'POST', '/api/roadmap/append', { title: 'X' });
    nullServer.close();
    expect(res.statusCode).toBe(503);
  });
});
