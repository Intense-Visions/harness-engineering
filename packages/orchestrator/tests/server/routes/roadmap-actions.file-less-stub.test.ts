import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
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

describe('handleRoadmapActionsRoute — Phase 4 file-less dispatch (S6)', () => {
  let projectDir: string;
  let docsDir: string;
  let roadmapPath: string;
  let server: http.Server;
  let port: number;

  let prevToken: string | undefined;

  beforeEach(async () => {
    prevToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-rma-stub-'));
    docsDir = path.join(projectDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    roadmapPath = path.join(docsDir, 'roadmap.md');
    // Seed a minimal valid roadmap so the file-backed fall-through test can succeed.
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
    if (prevToken !== undefined) process.env.GITHUB_TOKEN = prevToken;
  });

  it('dispatches to file-less helper (no 501) when roadmap.mode is file-less', async () => {
    await fs.writeFile(
      path.join(projectDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: {
          mode: 'file-less',
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      }),
      'utf-8'
    );

    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: 'New work item',
    });

    // No GITHUB_TOKEN -> createTrackerClient returns Err -> 500 with
    // missing-token message. The point: status is NOT 501 and the body
    // does NOT contain the old stub phrase.
    expect(res.statusCode).not.toBe(501);
    const body = res.body as { error?: string };
    expect(body.error ?? '').not.toMatch(/not yet wired/);
  });

  it('falls through to existing behavior when no harness.config.json present (file-backed default)', async () => {
    // No harness.config.json → getRoadmapMode → 'file-backed' → existing logic runs.
    // The seeded roadmap.md may not be a perfectly valid Roadmap (parseRoadmap is strict),
    // but for fall-through it's enough to assert the response is NOT-501 — i.e. the file-less
    // guard short-circuit did not engage.
    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: 'Backlog item under file-backed mode',
    });

    expect(res.statusCode).not.toBe(501);
  });

  it('falls through to existing behavior when roadmap.mode is explicitly file-backed', async () => {
    await fs.writeFile(
      path.join(projectDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: { mode: 'file-backed' },
      }),
      'utf-8'
    );

    const res = await request(port, 'POST', '/api/roadmap/append', {
      title: 'Backlog item under explicit file-backed mode',
    });

    // Same NOT-501 assertion: the guard must not engage when mode is file-backed.
    expect(res.statusCode).not.toBe(501);
  });
});
