import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';

// Same gatherer mocks the sibling claim tests use — the actions router imports
// them at module load regardless of which route is exercised.
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
  resolveRole: vi.fn().mockReturnValue('dev'),
}));

const origEnv = { ...process.env };

/**
 * Claiming a roadmap row syncs the assignment to GitHub, and the row's
 * `External-ID` is interpolated into that authenticated request's path. These
 * rows carry External-IDs crafted to break out of
 * `/repos/<owner>/<repo>/issues/<n>/assignees`.
 *
 * Each attack string relies on a different primitive:
 *  - a trailing `?` truncates the intended path suffix into a query string;
 *  - `/../` segments collapse under WHATWG URL normalization;
 *  - bare dot segments survive `encodeURIComponent` (which does not encode `.`)
 *    and still collapse, so a character-class constraint alone is not enough.
 */
function roadmapWithExternalId(externalId: string): string {
  return `---
project: test
version: 1
last_synced: "2026-01-01T00:00:00Z"
last_manual_edit: "2026-01-01T00:00:00Z"
---

# Roadmap

## Milestone: MVP

### API Gateway
- **Status:** planned
- **Spec:** —
- **Summary:** REST API gateway
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** ${externalId}
`;
}

async function makeProject(externalId: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dash-claim-extid-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'roadmap.md'),
    roadmapWithExternalId(externalId),
    'utf-8'
  );
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

/**
 * Resolve every URL the claim actually requested the way a real HTTP client
 * would — through `new URL()` — and report `origin + pathname`. Asserting on the
 * raw template string would pass even when `..` and `?` rewrite the path the
 * server ultimately receives, which is the whole defect.
 */
function normalizedRequestPaths(): string[] {
  return vi.mocked(fetch).mock.calls.map((call) => {
    const url = new URL(String(call[0]));
    return `${url.origin}${url.pathname}`;
  });
}

async function claimWithExternalId(externalId: string): Promise<{
  githubSynced: boolean;
  requested: string[];
  cleanup: () => Promise<void>;
}> {
  const projectRoot = await makeProject(externalId);
  const app = new Hono();
  app.route('/api', buildActionsRouter(makeContext(projectRoot)));
  const res = await app.request('/api/actions/roadmap/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: 'API Gateway', assignee: 'testuser' }),
  });
  const body = (await res.json()) as { githubSynced: boolean };
  return {
    githubSynced: body.githubSynced,
    requested: normalizedRequestPaths(),
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
  };
}

describe('POST /api/actions/roadmap/claim — External-ID is validated before it reaches the GitHub API path', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env['GITHUB_TOKEN'] = 'ghp_test';
    // A permissive mock: every request "succeeds", so nothing but the fix itself
    // can stop a crafted External-ID from reaching api.github.com.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  afterEach(async () => {
    process.env = origEnv;
    vi.unstubAllGlobals();
    await Promise.all(cleanups.splice(0).map((fn) => fn()));
  });

  it.each([
    // [External-ID, the endpoint it reaches today if left unvalidated]
    ['github:x/../../../user/emails?#1', 'https://api.github.com/user/emails'],
    ['github:a/../../user/repos?#1', 'https://api.github.com/user/repos'],
    ['github:../..#1', 'https://api.github.com/issues/1/assignees'],
    ['github:./.#1', 'https://api.github.com/repos/issues/1/assignees'],
  ])(
    'sends no authenticated request at all for the malformed External-ID %j (would otherwise reach %s)',
    async (externalId, escapedEndpoint) => {
      const { githubSynced, requested, cleanup } = await claimWithExternalId(externalId);
      cleanups.push(cleanup);

      expect(requested).not.toContain(escapedEndpoint);
      // Stronger: a malformed External-ID must not produce a credentialed
      // request at all, not merely one aimed somewhere else.
      expect(requested).toEqual([]);
      expect(githubSynced).toBe(false);
    }
  );

  it('still assigns the issue for a well-formed External-ID', async () => {
    const { githubSynced, requested, cleanup } = await claimWithExternalId(
      'github:Intense-Visions/harness-engineering#1525'
    );
    cleanups.push(cleanup);

    expect(requested).toEqual([
      'https://api.github.com/repos/Intense-Visions/harness-engineering/issues/1525/assignees',
    ]);
    expect(githubSynced).toBe(true);
  });

  it('keeps an unpaired-surrogate External-ID inside /repos/ instead of failing the request', async () => {
    // A lone surrogate is the one input the character class admits that
    // encodeURIComponent throws on. It cannot survive the roadmap's UTF-8 file
    // round-trip — it decodes to U+FFFD before the route ever sees it — so the
    // throw is unreachable from here. What this pins is the part that matters:
    // the resulting segment is still encoded and still under /repos/.
    const { requested, cleanup } = await claimWithExternalId(
      `github:o${String.fromCharCode(0xd800)}/r#1`
    );
    cleanups.push(cleanup);

    expect(requested).toEqual(['https://api.github.com/repos/o%EF%BF%BD/r/issues/1/assignees']);
  });

  it('percent-encodes an owner/repo that is well-formed but not URL-safe', async () => {
    const { requested, cleanup } = await claimWithExternalId('github:o%2e/r&x#7');
    cleanups.push(cleanup);

    expect(requested).toEqual(['https://api.github.com/repos/o%252e/r%26x/issues/7/assignees']);
  });
});
