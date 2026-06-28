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
- **Blockers:** —
- **Plan:** —

### Dashboard
- **Status:** in-progress
- **Spec:** docs/changes/dashboard/proposal.md
- **Summary:** Dashboard UI
- **Blockers:** —
- **Plan:** docs/plans/dashboard-plan.md
- **Assignee:** existing-user
- **Priority:** P0
- **External-ID:** —

### API Gateway
- **Status:** planned
- **Spec:** —
- **Summary:** REST API gateway
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#42
`;

const origEnv = { ...process.env };

/**
 * The claim handler reads + writes roadmap CONTENT through the store
 * (`resolveRoadmapStore`), so these tests use a REAL monolith roadmap under a
 * temp project root rather than `node:fs` mocks — a static mock cannot model the
 * store's load → applyRoadmapDiff round-trip.
 */
async function makeProject(withRoadmap = true): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dash-claim-'));
  if (withRoadmap) {
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'roadmap.md'), CLAIMABLE_ROADMAP, 'utf-8');
  }
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

describe('POST /api/actions/roadmap/claim', () => {
  let app: Hono;
  let ctx: ServerContext;
  let projectRoot: string;

  beforeEach(async () => {
    process.env = { ...origEnv };
    delete process.env['GITHUB_TOKEN'];
    vi.stubGlobal('fetch', vi.fn());
    projectRoot = await makeProject();
    ctx = makeContext(projectRoot);
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
  });

  afterEach(async () => {
    process.env = origEnv;
    vi.unstubAllGlobals();
    await rm(projectRoot, { recursive: true, force: true });
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
    const written = await readFile(path.join(projectRoot, 'docs', 'roadmap.md'), 'utf-8');
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

  it('returns 500 when roadmap source cannot be read', async () => {
    const emptyRoot = await makeProject(false);
    const emptyCtx = makeContext(emptyRoot);
    const emptyApp = new Hono();
    emptyApp.route('/api', buildActionsRouter(emptyCtx));
    const res = await emptyApp.request('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'Auth Module', assignee: 'testuser' }),
    });
    expect(res.status).toBe(500);
    await rm(emptyRoot, { recursive: true, force: true });
  });
});

describe('GET /api/identity', () => {
  let app: Hono;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeProject();
    const ctx = makeContext(projectRoot);
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns 200 with identity when resolution succeeds', async () => {
    const { resolveIdentity } = await import('../../../src/server/identity');
    vi.mocked(resolveIdentity).mockResolvedValueOnce({ username: 'octocat', source: 'github-api' });

    const res = await app.request('/api/identity');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe('octocat');
    expect(body.source).toBe('github-api');
  });

  it('returns 503 when identity resolution fails', async () => {
    const { resolveIdentity } = await import('../../../src/server/identity');
    vi.mocked(resolveIdentity).mockResolvedValueOnce(null);

    const res = await app.request('/api/identity');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
