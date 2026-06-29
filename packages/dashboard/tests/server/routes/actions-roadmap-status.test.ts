import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';
import { parseRoadmap } from '@harness-engineering/core';

vi.mock('../../../src/server/gather/security', () => ({ gatherSecurity: vi.fn() }));
vi.mock('../../../src/server/gather/perf', () => ({ gatherPerf: vi.fn() }));
vi.mock('../../../src/server/gather/arch', () => ({ gatherArch: vi.fn() }));
vi.mock('../../../src/server/gather/anomalies', () => ({ gatherAnomalies: vi.fn() }));

const ROADMAP = `---
project: test
version: 1
last_synced: "2026-01-01T00:00:00Z"
last_manual_edit: "2026-01-01T00:00:00Z"
---

# Roadmap

## Milestone: MVP

### Auth Module
- **Status:** planned
- **Spec:** docs/changes/auth/proposal.md
- **Summary:** Authentication
- **Blockers:** —
- **Plan:** —

### Billing Module
- **Status:** in-progress
- **Spec:** docs/changes/billing/proposal.md
- **Summary:** Billing
- **Blockers:** —
- **Plan:** —
- **Assignee:** @alice
`;

/**
 * File-based roadmap-status writes go through the store (`resolveRoadmapStore` →
 * `applyRoadmapDiff`), so these use a real monolith roadmap under a temp project
 * root rather than `node:fs` mocks.
 */
async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dash-status-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'roadmap.md'), ROADMAP, 'utf-8');
  return root;
}

function makeContext(projectPath: string): ServerContext {
  const sseManager = new SSEManager();
  vi.spyOn(sseManager, 'broadcast').mockResolvedValue(undefined);
  return {
    projectPath,
    roadmapPath: path.join(projectPath, 'docs', 'roadmap.md'),
    chartsPath: path.join(projectPath, 'docs', 'roadmap-charts.md'),
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager,
    gatherCache: new GatherCache(),
  };
}

describe('POST /api/actions/roadmap-status (file-based)', () => {
  let app: Hono;
  let ctx: ServerContext;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeProject();
    ctx = makeContext(projectRoot);
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns 400 when feature or status is missing', async () => {
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', status: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('sets a feature status and rewrites the roadmap', async () => {
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', status: 'in-progress' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const written = await readFile(path.join(projectRoot, 'docs', 'roadmap.md'), 'utf-8');
    expect(written).toContain('**Status:** in-progress');
  });

  // F1 (assignee-lifecycle parity): moving an in-progress + assigned row to a
  // non-in-progress status must clear the assignee (invariant
  // assignee !== null <=> in-progress / RMH005). The route must go through the
  // `setStatus` authority, not a bare `feat.status = status`.
  it('clears the assignee when an in-progress assigned row is set to done', async () => {
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Billing Module', status: 'done' }),
    });
    expect(res.status).toBe(200);

    const written = await readFile(path.join(projectRoot, 'docs', 'roadmap.md'), 'utf-8');
    const parsed = parseRoadmap(written);
    if (!parsed.ok) throw parsed.error;
    const billing = parsed.value.milestones
      .flatMap((m) => m.features)
      .find((f) => f.name === 'Billing Module');
    expect(billing?.status).toBe('done');
    expect(billing?.assignee).toBeNull();
  });

  it('returns 404 for an unknown feature', async () => {
    const res = await app.request('/api/actions/roadmap-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Nonexistent', status: 'done' }),
    });
    expect(res.status).toBe(404);
  });
});
