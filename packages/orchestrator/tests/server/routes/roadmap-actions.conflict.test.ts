/**
 * Phase 7 D-P7-A: S6 orchestrator /api/roadmap/append now emits HTTP 409
 * TRACKER_CONFLICT (same shape as S3/S5) when client.create() returns
 * ConflictError. Without this, the dashboard's Analyze.tsx caller had no
 * way to distinguish a conflict from a generic 502.
 *
 * This test mocks @harness-engineering/core to inject a fake tracker client
 * whose create() returns Err(new ConflictError(...)), then asserts the
 * response body matches the canonical TRACKER_CONFLICT shape.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Hoist the conflict error fixture so the mock factory can reference it.
const { fakeConflictError, fakeCreate } = vi.hoisted(() => {
  // Mirror the real ConflictError shape exactly. We construct a *plain* class
  // inside the mock factory below so `instanceof` checks against the mocked
  // ConflictError export pass.
  return {
    fakeConflictError: null as unknown,
    fakeCreate: vi.fn(),
  };
});

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );

  // Re-use the real ConflictError so `instanceof ConflictError` in the route
  // matches what we throw. Build a fake client whose create() returns an
  // Err result wrapping that error.
  const conflictErr = new actual.ConflictError(
    'github:o/r#99',
    { name: { ours: 'A', theirs: 'B' } },
    null,
    'someone got there first'
  );

  fakeCreate.mockResolvedValue({ ok: false, error: conflictErr });

  const fakeClient = { create: fakeCreate };

  return {
    ...actual,
    // Force file-less mode regardless of harness.config.json contents.
    loadProjectRoadmapMode: () => 'file-less',
    // Stub the tracker config loader so we don't need GITHUB_TOKEN.
    loadTrackerClientConfigFromProject: () => ({
      ok: true,
      value: { kind: 'github', owner: 'o', repo: 'r', token: 't', statusMap: {} },
    }),
    createTrackerClient: () => ({ ok: true, value: fakeClient }),
  };
});

// Import the route AFTER the mock so it picks up the mocked core symbols.
const { handleRoadmapActionsRoute } = await import('../../../src/server/routes/roadmap-actions');

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
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('handleRoadmapActionsRoute — Phase 7 D-P7-A conflict path (S6)', () => {
  let projectDir: string;
  let roadmapPath: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-rma-conflict-'));
    const docsDir = path.join(projectDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    roadmapPath = path.join(docsDir, 'roadmap.md');
    await fs.writeFile(
      roadmapPath,
      '---\nlastManualEdit: 2026-01-01T00:00:00.000Z\n---\n\n# Roadmap\n\n## Milestone 1\n',
      'utf-8'
    );
    port = Math.floor(Math.random() * 10000) + 41000;
    server = createServer(roadmapPath);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('returns 409 TRACKER_CONFLICT when client.create() yields ConflictError', async () => {
    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: 'Auth System',
    });
    expect(res.statusCode).toBe(409);
    const body = res.body as Record<string, unknown>;
    expect(body.code).toBe('TRACKER_CONFLICT');
    expect(body.externalId).toBe('github:o/r#99');
    expect(body.refreshHint).toBe('reload-roadmap');
    expect(body.conflictedWith).toEqual({ name: { ours: 'A', theirs: 'B' } });
    expect(typeof body.error).toBe('string');
  });
});

// Silence unused-warning on the hoisted fixture (kept for future expansion).
void fakeConflictError;
