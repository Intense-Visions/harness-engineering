import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';
import * as fs from 'node:fs/promises';

// Mock all gatherers used by actions router
vi.mock('../../../src/server/gather/security', () => ({
  gatherSecurity: vi.fn().mockResolvedValue({
    valid: true,
    findings: [],
    stats: { filesScanned: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/perf', () => ({
  gatherPerf: vi.fn().mockResolvedValue({
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 0, violationCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/arch', () => ({
  gatherArch: vi
    .fn()
    .mockResolvedValue({ passed: true, totalViolations: 0, regressions: [], newViolations: [] }),
}));
vi.mock('../../../src/server/gather/anomalies', () => ({
  gatherAnomalies: vi
    .fn()
    .mockResolvedValue({ outliers: [], articulationPoints: [], overlapCount: 0 }),
}));
vi.mock('../../../src/server/identity', () => ({
  resolveIdentity: vi.fn().mockResolvedValue({ username: 'testuser', source: 'git-config' }),
}));
vi.mock('node:fs/promises');

const CLAIMABLE_ROADMAP = `---
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
- **Blockers:** \u2014
- **Plan:** \u2014

### Dashboard
- **Status:** in-progress
- **Spec:** docs/changes/dashboard/proposal.md
- **Summary:** Dashboard UI
- **Blockers:** \u2014
- **Plan:** docs/plans/dashboard-plan.md
- **Assignee:** existing-user
- **Priority:** P0
- **External-ID:** \u2014

### API Gateway
- **Status:** planned
- **Spec:** \u2014
- **Summary:** REST API gateway
- **Blockers:** \u2014
- **Plan:** \u2014
- **Assignee:** \u2014
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#42
`;

const origEnv = { ...process.env };

function makeContext(): ServerContext {
  const sseManager = new SSEManager();
  vi.spyOn(sseManager, 'broadcast').mockResolvedValue(undefined);
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager,
    gatherCache: new GatherCache(),
  };
}

describe('POST /api/actions/roadmap/claim', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...origEnv };
    delete process.env['GITHUB_TOKEN'];
    vi.stubGlobal('fetch', vi.fn());
    ctx = makeContext();
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
    vi.mocked(fs.readFile).mockResolvedValue(CLAIMABLE_ROADMAP);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = origEnv;
    vi.unstubAllGlobals();
  });

  it('returns 400 when feature or assignee is missing', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module' }),
    });
    expect(res.status).toBe(400);
  });

  it('claims a planned feature and returns brainstorming workflow (no spec)', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'API Gateway', assignee: 'testuser' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.workflow).toBe('brainstorming');
    expect(body.assignee).toBe('testuser');
    expect(body.status).toBe('in-progress');
  });

  it('claims a feature with spec but no plan and returns planning workflow', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workflow).toBe('planning');
  });

  it('returns 404 for nonexistent feature', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Nonexistent', assignee: 'testuser' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 for non-claimable feature (in-progress)', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Dashboard', assignee: 'testuser' }),
    });
    expect(res.status).toBe(409);
  });

  it('writes updated roadmap with in-progress status and assignee', async () => {
    await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(written).toContain('in-progress');
    expect(written).toContain('testuser');
  });

  it('invalidates roadmap and overview caches', async () => {
    const invalidateSpy = vi.spyOn(ctx.cache, 'invalidate');
    await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith('roadmap');
    expect(invalidateSpy).toHaveBeenCalledWith('overview');
  });

  it('returns githubSynced: false when no externalId', async () => {
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    const body = await res.json();
    expect(body.githubSynced).toBe(false);
  });

  it('assigns GitHub issue and returns githubSynced: true when externalId and token present', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_test';
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'API Gateway', assignee: 'testuser' }),
    });
    const body = await res.json();
    expect(body.githubSynced).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/Intense-Visions/harness-engineering/issues/42/assignees',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assignees: ['testuser'] }),
      })
    );
  });

  it('returns githubSynced: false when GitHub API call fails', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_test';
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'API Gateway', assignee: 'testuser' }),
    });
    const body = await res.json();
    expect(body.githubSynced).toBe(false);
  });

  it('returns 500 when roadmap file cannot be read', async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));
    const res = await app.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    expect(res.status).toBe(500);
  });
});
