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

/** Minimal ServerContext stub — only fields read by handleRoadmapStatus. */
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

describe('handleRoadmapStatus — Phase 3 file-less stub (S5)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-rms-stub-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns 501 with stub message when roadmap.mode is file-less', async () => {
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
    expect(res.status).toBe(501);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(
      /file-less roadmap mode is not yet wired in dashboard roadmap-status endpoint; see Phase 4\./
    );
  });

  it('falls through to existing behavior when roadmap.mode is file-backed (no config file)', async () => {
    // No harness.config.json → loadProjectConfig returns null → getRoadmapMode → 'file-backed'.
    // With no roadmap.md, the existing behavior is to return a 500 from the file-not-found path —
    // but only after the file-less guard short-circuits. We assert NOT-501 to confirm fall-through.
    const app = new Hono();
    app.route('/api', buildActionsRouter(makeCtx(dir)));
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', status: 'in-progress' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).not.toBe(501);
  });
});
