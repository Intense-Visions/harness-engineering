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

/** Minimal ServerContext stub — only fields read by handleClaim. */
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

describe('handleClaim — Phase 3 file-less stub', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-stub-'));
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
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      body: JSON.stringify({ feature: 'x', assignee: 'alice' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(501);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(
      /file-less roadmap mode is not yet wired in dashboard claim endpoint; see Phase 4\./
    );
  });
});
