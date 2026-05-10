/**
 * Phase 4 / Task 13: assert that `handleClaim` dispatches to the file-less
 * helper when `roadmap.mode === 'file-less'` instead of returning the
 * Phase 3 stub 501.
 *
 * Without GITHUB_TOKEN set, the helper's `createTrackerClient` returns an
 * Err whose message is observable. Seeing that error proves we reached the
 * file-less branch (not the old 501 stub).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Hono } from 'hono';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';

function makeCtx(projectPath: string): ServerContext {
  return {
    projectPath,
    roadmapPath: path.join(projectPath, 'docs', 'roadmap.md'),
    chartsPath: path.join(projectPath, 'docs', 'charts.md'),
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: new SSEManager(),
    gatherCache: new GatherCache(),
  };
}

describe('handleClaim — Phase 4 file-less dispatch (S3)', () => {
  let dir: string;
  let prevToken: string | undefined;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-disp-'));
    prevToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prevToken !== undefined) process.env.GITHUB_TOKEN = prevToken;
  });

  it('dispatches to file-less helper (no 501) when mode is file-less', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: {
          mode: 'file-less',
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      })
    );
    const app = new Hono();
    app.route('/api', buildActionsRouter(makeCtx(dir)));
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', assignee: 'alice' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).not.toBe(501);
    const json = (await res.json()) as { error?: string };
    expect(json.error ?? '').not.toMatch(/not yet wired/);
    // createTrackerClient without GITHUB_TOKEN -> missing token error.
    expect(json.error ?? '').toMatch(
      /(GITHUB_TOKEN|missing GitHub token|github-issues|file-less tracker)/i
    );
  });

  it('file-backed regression: file-backed claim path runs (no stub error) when mode is absent', async () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    const app = new Hono();
    app.route('/api', buildActionsRouter(makeCtx(dir)));
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', assignee: 'alice' }),
      headers: { 'Content-Type': 'application/json' },
    });
    // file-backed path will fail to read docs/roadmap.md -> 500. The point:
    // we are NOT on the file-less branch and NOT producing the stub message.
    const json = (await res.json()) as { error?: string };
    expect(json.error ?? '').not.toMatch(/not yet wired/);
  });
});
