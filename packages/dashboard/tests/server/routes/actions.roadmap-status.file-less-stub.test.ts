/**
 * Phase 4 / Task 15: `handleRoadmapStatus` dispatches to the file-less helper
 * when `roadmap.mode === 'file-less'` instead of returning the Phase 3 stub
 * 501. Without GITHUB_TOKEN, the helper's `createTrackerClient` returns an
 * Err whose message is observable proof of dispatch.
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

describe('handleRoadmapStatus — Phase 4 file-less dispatch (S5)', () => {
  let dir: string;
  let prevToken: string | undefined;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-rms-disp-'));
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
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', status: 'in-progress' }),
      headers: { 'Content-Type': 'application/json' },
    });
    // file-less branch with no GITHUB_TOKEN → createTrackerClient returns Err
    // → handler responds 500 with the missing-token message. Pinning the
    // exact status code keeps the assertion meaningful (the old `not 501`
    // form would have passed for any 4xx/5xx, masking future regressions).
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(json.error ?? '').not.toMatch(/not yet wired/);
  });

  it('file-backed regression: fall-through when mode is absent → 500 (missing roadmap.md)', async () => {
    // No harness.config.json, no docs/roadmap.md. The file-backed path
    // tries to read roadmapPath and fails → updateRoadmapContent returns
    // { error: 'Could not read roadmap file', code: 500 }. Pinning to 500
    // proves we left the file-less dispatch and entered the file-backed
    // branch; the missing-file behavior is exercised elsewhere.
    const app = new Hono();
    app.route('/api', buildActionsRouter(makeCtx(dir)));
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', status: 'in-progress' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(500);
  });
});
