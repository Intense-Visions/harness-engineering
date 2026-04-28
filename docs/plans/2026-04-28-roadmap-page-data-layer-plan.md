# Plan: Roadmap Page Enhancement -- Phase 1: Data Layer

**Date:** 2026-04-28 | **Spec:** docs/changes/roadmap-page-enhancement/proposal.md | **Tasks:** 6 | **Time:** ~25 min | **Integration Tier:** medium

## Goal

Complete the data layer for the roadmap page enhancement: add GitHub API identity resolution to the identity waterfall, add GitHub issue assignment to the claim endpoint, and write comprehensive tests for both the identity module and the claim/identity routes.

## Observable Truths (Acceptance Criteria)

1. When `GITHUB_TOKEN` is set, `resolveIdentity()` calls GitHub API `GET /user` and returns `{ username, source: 'github-api' }` before falling through to `gh-cli` or `git-config`.
2. When `GITHUB_TOKEN` is not set, `resolveIdentity()` falls through to `gh-cli`, then `git-config` (existing behavior preserved).
3. When all three methods fail, `resolveIdentity()` returns `null`.
4. The identity result is cached for the server lifetime -- subsequent calls return the cached value without re-executing the waterfall.
5. When a feature is claimed with `externalId` matching `github:owner/repo#42` and `GITHUB_TOKEN` is set, the claim endpoint issues a `POST` to `https://api.github.com/repos/owner/repo/issues/42/assignees` with `{ assignees: [assignee] }` and returns `githubSynced: true`.
6. When a feature is claimed without `externalId` or without `GITHUB_TOKEN`, the claim endpoint returns `githubSynced: false` (no GitHub API call attempted).
7. `GET /api/identity` returns 200 with `{ username, source }` when identity resolves, and 503 with `{ error }` when it does not.
8. `POST /api/actions/roadmap/claim` with valid body returns 200 with `ClaimResponse` including correct `workflow` detection.
9. `POST /api/actions/roadmap/claim` returns 409 when feature is not claimable (wrong status or already assigned).
10. `POST /api/actions/roadmap/claim` returns 404 when feature is not found.
11. `npx vitest run tests/server/identity.test.ts` passes with all waterfall scenarios covered.
12. `npx vitest run tests/server/routes/actions-claim.test.ts` passes with all claim scenarios covered.
13. `harness validate` passes.

## Uncertainties

- [ASSUMPTION] The GitHub API `GET /user` endpoint returns `{ login: string }` when called with a valid token in the `Authorization` header. This is standard GitHub REST API behavior.
- [ASSUMPTION] The `externalId` format for GitHub issues is `github:owner/repo#number`. This matches the pattern used in the spec and roadmap config.
- [DEFERRABLE] Exact error message wording for GitHub API failures. Non-blocking; will use descriptive defaults.

## File Map

```
MODIFY packages/dashboard/src/server/identity.ts          (add GitHub API resolution step)
MODIFY packages/dashboard/src/server/routes/actions.ts     (add GitHub issue assignment to claim handler)
CREATE packages/dashboard/tests/server/identity.test.ts    (identity waterfall tests)
CREATE packages/dashboard/tests/server/routes/actions-claim.test.ts (claim endpoint tests)
```

## Tasks

### Task 1: Add GitHub API identity resolution to waterfall

**Depends on:** none | **Files:** `packages/dashboard/src/server/identity.ts`

1. Read `packages/dashboard/src/server/identity.ts`.

2. Add a new `resolveFromGithubApi()` function before `resolveFromGhCli()`:

```typescript
async function resolveFromGithubApi(): Promise<IdentityResponse | null> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) return null;
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'harness-dashboard',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: string };
    if (data.login) return { username: data.login, source: 'github-api' };
  } catch {
    // Network error or token invalid
  }
  return null;
}
```

3. Update `resolveIdentity()` to call `resolveFromGithubApi()` first in the waterfall:

```typescript
export async function resolveIdentity(): Promise<IdentityResponse | null> {
  if (cached) return cached;

  const result =
    (await resolveFromGithubApi()) ?? (await resolveFromGhCli()) ?? (await resolveFromGitConfig());
  if (result) cached = result;
  return result;
}
```

4. Run: `cd packages/dashboard && npx tsc --noEmit`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add GitHub API step to identity resolution waterfall`

---

### Task 2: Write tests for identity resolution module

**Depends on:** Task 1 | **Files:** `packages/dashboard/tests/server/identity.test.ts`

1. Create `packages/dashboard/tests/server/identity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveIdentity, clearIdentityCache } from '../../src/server/identity';
import { execFile } from 'node:child_process';

vi.mock('node:child_process');

// Store original env
const origEnv = { ...process.env };

describe('resolveIdentity', () => {
  beforeEach(() => {
    clearIdentityCache();
    vi.resetAllMocks();
    process.env = { ...origEnv };
    delete process.env['GITHUB_TOKEN'];
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = origEnv;
    vi.unstubAllGlobals();
  });

  it('returns github-api source when GITHUB_TOKEN is set and API succeeds', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_test123';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: 'octocat' }),
    } as Response);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'octocat', source: 'github-api' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test123' }),
      })
    );
  });

  it('falls through to gh-cli when GITHUB_TOKEN is not set', async () => {
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'gh') {
        cb(null, 'gh-user\n');
      } else {
        cb(new Error('not called'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'gh-user', source: 'gh-cli' });
  });

  it('falls through to gh-cli when GitHub API returns non-ok', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_bad';
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'gh') {
        cb(null, 'gh-fallback\n');
      } else {
        cb(new Error('skip'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'gh-fallback', source: 'gh-cli' });
  });

  it('falls through to git-config when gh-cli fails', async () => {
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'git') {
        cb(null, 'Git User\n');
      } else {
        cb(new Error('gh not found'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'Git User', source: 'git-config' });
  });

  it('returns null when all methods fail', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      cb(new Error('fail'), '');
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toBeNull();
  });

  it('caches the result across calls', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_cache';
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'cached-user' }),
    } as Response);

    const first = await resolveIdentity();
    const second = await resolveIdentity();
    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clearIdentityCache allows re-resolution', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_clear';
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'user1' }),
    } as Response);

    await resolveIdentity();
    clearIdentityCache();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'user2' }),
    } as Response);

    const result = await resolveIdentity();
    expect(result!.username).toBe('user2');
  });
});
```

2. Run: `cd packages/dashboard && npx vitest run tests/server/identity.test.ts`
3. Observe all tests pass.
4. Run: `harness validate`
5. Commit: `test(dashboard): add identity resolution waterfall tests`

---

### Task 3: Add GitHub issue assignment to claim handler

**Depends on:** none | **Files:** `packages/dashboard/src/server/routes/actions.ts`

1. Read `packages/dashboard/src/server/routes/actions.ts`.

2. Add a helper function `assignGithubIssue` after `detectWorkflow`:

```typescript
/**
 * Parse a github externalId like "github:owner/repo#42" and assign the issue.
 * Returns true if assignment succeeded, false otherwise.
 */
async function assignGithubIssue(externalId: string, assignee: string): Promise<boolean> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) return false;

  const match = externalId.match(/^github:(.+?)#(\d+)$/);
  if (!match) return false;

  const [, repo, issueNum] = match;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNum}/assignees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'harness-dashboard',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignees: [assignee] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

3. In `handleClaim`, after `serializeRoadmap` write succeeds and caches are invalidated, add GitHub sync logic before building the response:

Replace the block:

```typescript
const response: ClaimResponse = {
  ok: true,
  feature,
  status: 'in-progress',
  assignee,
  workflow,
  githubSynced: false,
};

result = c.json(response);
```

With:

```typescript
// Attempt GitHub issue assignment if applicable
let githubSynced = false;
if (targetFeature.externalId) {
  githubSynced = await assignGithubIssue(targetFeature.externalId, assignee);
}

const response: ClaimResponse = {
  ok: true,
  feature,
  status: 'in-progress',
  assignee,
  workflow,
  githubSynced,
};

result = c.json(response);
```

Note: `targetFeature.externalId` here reads the value before mutation. Since `externalId` is not mutated during the claim, this is safe. However, we need to capture `externalId` before the mutation block to be safe. Actually, we only mutate `status`, `assignee`, and `updatedAt` on the feature, so `externalId` is unchanged and safe to read after mutation.

4. Run: `cd packages/dashboard && npx tsc --noEmit`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add GitHub issue assignment to claim endpoint`

---

### Task 4: Write tests for claim endpoint

**Depends on:** Task 3 | **Files:** `packages/dashboard/tests/server/routes/actions-claim.test.ts`

1. Create `packages/dashboard/tests/server/routes/actions-claim.test.ts`:

```typescript
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
  gatherSecurity: vi
    .fn()
    .mockResolvedValue({
      valid: true,
      findings: [],
      stats: { filesScanned: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
    }),
}));
vi.mock('../../../src/server/gather/perf', () => ({
  gatherPerf: vi
    .fn()
    .mockResolvedValue({
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
```

2. Run: `cd packages/dashboard && npx vitest run tests/server/routes/actions-claim.test.ts`
3. Observe all tests pass.
4. Run: `harness validate`
5. Commit: `test(dashboard): add claim endpoint tests with GitHub sync scenarios`

---

### Task 5: Add identity endpoint test to claim test file

**Depends on:** Task 2, Task 4 | **Files:** `packages/dashboard/tests/server/routes/actions-claim.test.ts`

1. Append a new describe block to `packages/dashboard/tests/server/routes/actions-claim.test.ts` for the identity endpoint:

```typescript
describe('GET /api/identity', () => {
  let app: Hono;

  beforeEach(() => {
    vi.resetAllMocks();
    const ctx = makeContext();
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
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
```

2. Run: `cd packages/dashboard && npx vitest run tests/server/routes/actions-claim.test.ts`
3. Observe all tests pass (including the new identity endpoint tests).
4. Run: `harness validate`
5. Commit: `test(dashboard): add identity endpoint route tests`

---

### Task 6: Verify existing gatherer tests pass with spec/plan passthrough

**Depends on:** none | **Files:** none (verification only)

1. Run: `cd packages/dashboard && npx vitest run tests/server/gather/roadmap.test.ts`
2. Verify the existing test at line 102 (`auth.spec` equals `'docs/auth.md'`) passes, confirming spec/plan passthrough is already working.
3. Run: `cd packages/dashboard && npx vitest run tests/server/routes/roadmap.test.ts`
4. Verify existing roadmap route tests pass with `spec` and `plans` fields in fixture data.
5. Run: `cd packages/dashboard && npx vitest run`
6. Verify all dashboard tests pass.
7. Run: `harness validate`
8. No commit needed -- this is a verification-only task.
