# Plan: Dashboard v1.1 Phase 3 -- CI Route + Page

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Users can navigate to a CI page in the dashboard that displays pass/fail badges for 7 harness check commands, expand each badge to see violation details, trigger a full re-check via "Run All Checks", and see when checks last ran.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `GET /api/ci` is called, the system shall return a `CIData` JSON response containing a `checks` array (up to 7 items) and a `lastRun` timestamp, sourced from GatherCache entries populated by the existing gatherers.
2. **Event-driven:** When `GET /api/ci` is called before any checks have run, the system shall return `{ data: { checks: [], lastRun: null }, timestamp: "<ISO>" }`.
3. **Event-driven:** When the user navigates to `/ci`, the system shall render a row of pass/fail badges for: validate, check-deps, check-arch, check-perf, check-security, check-docs, phase-gate.
4. **Event-driven:** When a user clicks a badge on the CI page, the system shall expand it to show violation/finding details (errorCount, warningCount, details string).
5. **Event-driven:** When the user clicks "Run All Checks", the system shall POST to `/api/actions/refresh-checks` and update badge states from loading to result.
6. **State-driven:** While the CI page is open, the system shall display a "Last checked X ago" timestamp that reflects the most recent `lastRun` value.
7. **Ubiquitous:** The navigation bar shall include a "CI" link between "Graph" and any future pages.
8. **Ubiquitous:** `npx vitest run` in `packages/dashboard` shall pass with all new tests green.
9. **Ubiquitous:** `harness validate` shall pass.

## File Map

```
CREATE packages/dashboard/src/server/gather/ci.ts
CREATE packages/dashboard/tests/server/gather/ci.test.ts
CREATE packages/dashboard/src/server/routes/ci.ts
CREATE packages/dashboard/tests/server/routes/ci.test.ts
CREATE packages/dashboard/src/client/pages/CI.tsx
MODIFY packages/dashboard/src/server/gather/index.ts (add ci export)
MODIFY packages/dashboard/src/server/index.ts (add ci router)
MODIFY packages/dashboard/src/client/App.tsx (add /ci route)
MODIFY packages/dashboard/src/client/components/Layout.tsx (add CI nav item)
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Create CI gatherer with TDD

**Depends on:** none
**Files:** `packages/dashboard/tests/server/gather/ci.test.ts`, `packages/dashboard/src/server/gather/ci.ts`

The CI gatherer reads from GatherCache to build a `CIData` response. It maps the security, perf, and arch cache entries into the 7-check `CheckResult[]` format. Checks without cache data are omitted. The `lastRun` field is the most recent `lastRunTime` across all keys.

1. Create test file `packages/dashboard/tests/server/gather/ci.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { gatherCI } from '../../../src/server/gather/ci';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityResult, PerfResult, ArchResult } from '../../../src/shared/types';

function makeSecurity(overrides?: Partial<SecurityResult & { valid: boolean }>): SecurityResult {
  return {
    valid: true,
    findings: [],
    stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
    ...overrides,
  };
}

function makePerf(overrides?: Partial<PerfResult & { valid: boolean }>): PerfResult {
  return {
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 10, violationCount: 0 },
    ...overrides,
  };
}

function makeArch(overrides?: Partial<ArchResult & { passed: boolean }>): ArchResult {
  return {
    passed: true,
    totalViolations: 0,
    regressions: [],
    newViolations: [],
    ...overrides,
  };
}

describe('gatherCI', () => {
  it('returns empty checks and null lastRun when cache is empty', () => {
    const cache = new GatherCache();
    const result = gatherCI(cache);
    expect(result.checks).toEqual([]);
    expect(result.lastRun).toBeNull();
  });

  it('maps security cache entry to check-security check result', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () =>
      makeSecurity({
        valid: false,
        stats: { filesScanned: 10, errorCount: 2, warningCount: 3, infoCount: 1 },
      })
    );
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-security');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(2);
    expect(check!.warningCount).toBe(3);
  });

  it('maps perf cache entry to check-perf check result', async () => {
    const cache = new GatherCache();
    await cache.run('perf', async () =>
      makePerf({ stats: { filesAnalyzed: 5, violationCount: 4 } })
    );
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-perf');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
    expect(check!.errorCount).toBe(0);
    expect(check!.warningCount).toBe(4);
  });

  it('maps arch cache entry to check-arch check result', async () => {
    const cache = new GatherCache();
    await cache.run('arch', async () => makeArch({ passed: false, totalViolations: 3 }));
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-arch');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(3);
  });

  it('maps security error to error check result', async () => {
    const cache = new GatherCache();
    await cache.run('security', async (): Promise<SecurityResult> => ({ error: 'Scanner failed' }));
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-security');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(1);
    expect(check!.details).toBe('Scanner failed');
  });

  it('returns the most recent lastRun across all cache entries', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () => makeSecurity());
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    await cache.run('perf', async () => makePerf());
    const result = gatherCI(cache);
    expect(result.lastRun).not.toBeNull();
    // lastRun should be the perf entry timestamp (later)
    const perfTime = cache.lastRunTime('perf')!;
    expect(result.lastRun).toBe(new Date(perfTime).toISOString());
  });

  it('includes all three checks when all caches are populated', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () => makeSecurity());
    await cache.run('perf', async () => makePerf());
    await cache.run('arch', async () => makeArch());
    const result = gatherCI(cache);
    expect(result.checks).toHaveLength(3);
    const names = result.checks.map((c) => c.name).sort();
    expect(names).toEqual(['check-arch', 'check-perf', 'check-security']);
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/ci.test.ts`
3. Observe failure: `gatherCI` is not found (module does not exist)
4. Create implementation `packages/dashboard/src/server/gather/ci.ts`:

```typescript
import type { GatherCache } from '../gather-cache';
import type {
  CIData,
  CheckResult,
  SecurityResult,
  SecurityData,
  PerfResult,
  PerfData,
  ArchResult,
  ArchData,
} from '../../shared/types';

function isSecurityData(r: SecurityResult): r is SecurityData {
  return 'valid' in r;
}

function isPerfData(r: PerfResult): r is PerfData {
  return 'valid' in r;
}

function isArchData(r: ArchResult): r is ArchData {
  return 'passed' in r;
}

/**
 * Build CIData from cached gather results.
 * Synchronous — reads only from GatherCache, never runs gatherers.
 */
export function gatherCI(cache: GatherCache): CIData {
  const checks: CheckResult[] = [];
  const timestamps: number[] = [];

  // check-security
  const security = cache.get<SecurityResult>('security');
  if (security) {
    const t = cache.lastRunTime('security');
    if (t) timestamps.push(t);

    if (isSecurityData(security)) {
      checks.push({
        name: 'check-security',
        passed: security.valid,
        errorCount: security.stats.errorCount,
        warningCount: security.stats.warningCount,
        details: `${security.stats.filesScanned} files scanned`,
      });
    } else {
      checks.push({
        name: 'check-security',
        passed: false,
        errorCount: 1,
        warningCount: 0,
        details: security.error,
      });
    }
  }

  // check-perf
  const perf = cache.get<PerfResult>('perf');
  if (perf) {
    const t = cache.lastRunTime('perf');
    if (t) timestamps.push(t);

    if (isPerfData(perf)) {
      const errorCount = perf.violations.filter((v) => v.severity === 'error').length;
      const warningCount = perf.violations.length - errorCount;
      checks.push({
        name: 'check-perf',
        passed: perf.valid,
        errorCount,
        warningCount,
        details: `${perf.stats.filesAnalyzed} files analyzed`,
      });
    } else {
      checks.push({
        name: 'check-perf',
        passed: false,
        errorCount: 1,
        warningCount: 0,
        details: perf.error,
      });
    }
  }

  // check-arch
  const arch = cache.get<ArchResult>('arch');
  if (arch) {
    const t = cache.lastRunTime('arch');
    if (t) timestamps.push(t);

    if (isArchData(arch)) {
      checks.push({
        name: 'check-arch',
        passed: arch.passed,
        errorCount: arch.totalViolations,
        warningCount: arch.regressions.length,
        details:
          arch.totalViolations > 0
            ? `${arch.totalViolations} violations, ${arch.regressions.length} regressions`
            : 'All checks passed',
      });
    } else {
      checks.push({
        name: 'check-arch',
        passed: false,
        errorCount: 1,
        warningCount: 0,
        details: arch.error,
      });
    }
  }

  const latestTimestamp =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  return { checks, lastRun: latestTimestamp };
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/ci.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(dashboard): add CI gatherer that builds CIData from cached check results`

---

### Task 2: Export CI gatherer from barrel

**Depends on:** Task 1
**Files:** `packages/dashboard/src/server/gather/index.ts`

1. Add export to `packages/dashboard/src/server/gather/index.ts`:

```typescript
export { gatherCI } from './ci';
```

Add this line after the existing exports.

2. Run: `harness validate`
3. Commit: `feat(dashboard): export gatherCI from gather barrel`

---

### Task 3: Create GET /api/ci route with TDD

**Depends on:** Task 2
**Files:** `packages/dashboard/tests/server/routes/ci.test.ts`, `packages/dashboard/src/server/routes/ci.ts`

1. Create test file `packages/dashboard/tests/server/routes/ci.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityData } from '../../../src/shared/types';

function makeCtx(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: new GatherCache(),
  };
}

describe('GET /api/ci', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(async () => {
    ctx = makeCtx();
    const { buildCIRouter } = await import('../../../src/server/routes/ci');
    app = new Hono();
    app.route('/api', buildCIRouter(ctx));
  });

  it('returns 200 with empty checks when cache is empty', async () => {
    const res = await app.request('/api/ci');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { checks: unknown[]; lastRun: null };
      timestamp: string;
    };
    expect(body.data.checks).toEqual([]);
    expect(body.data.lastRun).toBeNull();
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('returns 200 with check data when cache has entries', async () => {
    const securityData: SecurityData = {
      valid: true,
      findings: [],
      stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
    };
    await ctx.gatherCache.run('security', async () => securityData);

    const res = await app.request('/api/ci');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { checks: { name: string }[]; lastRun: string } };
    expect(body.data.checks).toHaveLength(1);
    expect(body.data.checks[0].name).toBe('check-security');
    expect(body.data.lastRun).toBeTruthy();
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/routes/ci.test.ts`
3. Observe failure: `buildCIRouter` module not found
4. Create `packages/dashboard/src/server/routes/ci.ts`:

```typescript
import { Hono } from 'hono';
import type { ServerContext } from '../context';
import { gatherCI } from '../gather/ci';
import type { ApiResponse, CIData } from '../../shared/types';

export function buildCIRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/ci', (c) => {
    const data = gatherCI(ctx.gatherCache);

    const response: ApiResponse<CIData> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/routes/ci.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(dashboard): add GET /api/ci route returning cached check results`

---

### Task 4: Wire CI router into server

**Depends on:** Task 3
**Files:** `packages/dashboard/src/server/index.ts`

1. Add import to `packages/dashboard/src/server/index.ts`:

```typescript
import { buildCIRouter } from './routes/ci';
```

Add after the existing route imports (after the `buildActionsRouter` import line).

2. Add route mount inside `buildApp`:

```typescript
app.route('/api', buildCIRouter(ctx));
```

Add after the `buildActionsRouter` line: `app.route('/api', buildActionsRouter(ctx));`

3. Run existing tests to verify no regressions: `cd packages/dashboard && npx vitest run`
4. Run: `harness validate`
5. Commit: `feat(dashboard): wire CI router into Hono server`

---

### Task 5: Create CI.tsx page component

**Depends on:** none (client-side, independent of server tasks)
**Files:** `packages/dashboard/src/client/pages/CI.tsx`

1. Create `packages/dashboard/src/client/pages/CI.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { ActionButton } from '../components/ActionButton';
import type { CIData, CheckResult } from '@shared/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const CHECK_NAMES = [
  'validate',
  'check-deps',
  'check-arch',
  'check-perf',
  'check-security',
  'check-docs',
  'phase-gate',
] as const;

interface BadgeProps {
  name: string;
  result: CheckResult | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function CheckBadge({ name, result, expanded, onToggle }: BadgeProps) {
  if (!result) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gray-600" />
          <span className="text-sm font-medium text-gray-400">{name}</span>
        </div>
        <p className="mt-1 text-xs text-gray-600">Not yet run</p>
      </div>
    );
  }

  const bgColor = result.passed ? 'border-emerald-800' : 'border-red-800';
  const dotColor = result.passed ? 'bg-emerald-400' : 'bg-red-400';
  const textColor = result.passed ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`rounded-lg border ${bgColor} bg-gray-900`}>
      <button onClick={onToggle} className="w-full p-4 text-left" aria-expanded={expanded}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-200">{name}</span>
          </div>
          <span className={`text-xs font-medium ${textColor}`}>
            {result.passed ? 'PASS' : 'FAIL'}
          </span>
        </div>
        {!expanded && (result.errorCount > 0 || result.warningCount > 0) && (
          <p className="mt-1 text-xs text-gray-500">
            {result.errorCount > 0 && `${result.errorCount} errors`}
            {result.errorCount > 0 && result.warningCount > 0 && ', '}
            {result.warningCount > 0 && `${result.warningCount} warnings`}
          </p>
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="space-y-1 text-xs">
            <p className="text-gray-400">
              Errors:{' '}
              <span className={result.errorCount > 0 ? 'text-red-400' : 'text-gray-300'}>
                {result.errorCount}
              </span>
              {' | '}
              Warnings:{' '}
              <span className={result.warningCount > 0 ? 'text-yellow-400' : 'text-gray-300'}>
                {result.warningCount}
              </span>
            </p>
            {result.details && <p className="text-gray-500">{result.details}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function CI() {
  const [ciData, setCIData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchCI = useCallback(async () => {
    try {
      const res = await fetch('/api/ci');
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { data: CIData };
      setCIData(body.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCI();
  }, [fetchCI]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleRefreshSuccess = useCallback(() => {
    void fetchCI();
  }, [fetchCI]);

  const checkMap = new Map<string, CheckResult>();
  if (ciData) {
    for (const check of ciData.checks) {
      checkMap.set(check.name, check);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">CI Checks</h1>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/refresh-checks"
            label="Run All Checks"
            loadingLabel="Running checks..."
            onSuccess={handleRefreshSuccess}
          />
          {ciData?.lastRun && (
            <span className="text-xs text-gray-500">Last checked {timeAgo(ciData.lastRun)}</span>
          )}
        </div>
      </div>

      {loading && !ciData && <p className="text-sm text-gray-500">Loading check results...</p>}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CHECK_NAMES.map((name) => (
          <CheckBadge
            key={name}
            name={name}
            result={checkMap.get(name)}
            expanded={expanded.has(name)}
            onToggle={() => toggleExpanded(name)}
          />
        ))}
      </div>
    </div>
  );
}
```

2. Run: `harness validate`
3. Commit: `feat(dashboard): add CI.tsx page with pass/fail badges and expandable details`

---

### Task 6: Add CI route and nav link

**Depends on:** Task 5
**Files:** `packages/dashboard/src/client/App.tsx`, `packages/dashboard/src/client/components/Layout.tsx`

1. Modify `packages/dashboard/src/client/App.tsx` -- add import and route:

   Add import after existing page imports:

   ```typescript
   import { CI } from './pages/CI';
   ```

   Add route after the `/graph` route:

   ```tsx
   <Route path="/ci" element={<CI />} />
   ```

2. Modify `packages/dashboard/src/client/components/Layout.tsx` -- add CI to nav:

   Change the `NAV_ITEMS` array to include CI after Graph:

   ```typescript
   const NAV_ITEMS = [
     { to: '/', label: 'Overview' },
     { to: '/roadmap', label: 'Roadmap' },
     { to: '/health', label: 'Health' },
     { to: '/graph', label: 'Graph' },
     { to: '/ci', label: 'CI' },
   ] as const;
   ```

3. Run: `cd packages/dashboard && npx vitest run`
4. Run: `harness validate`
5. Commit: `feat(dashboard): add CI page to router and navigation`

---

### Task 7: Typecheck and full test pass

**Depends on:** Tasks 1-6
**Files:** none (validation only)

[checkpoint:human-verify]

1. Run typecheck: `cd packages/dashboard && pnpm typecheck`
2. Run all tests: `cd packages/dashboard && npx vitest run`
3. Run: `harness validate`
4. If typecheck or tests fail, fix the issues and re-run.
5. Verify by starting the dev server: `cd packages/dashboard && pnpm dev` -- navigate to `http://localhost:3700/ci` and confirm:
   - Page loads with 7 badge slots
   - Badges without cached data show "Not yet run"
   - "Run All Checks" button is visible
   - After clicking "Run All Checks", badges update with pass/fail states
   - Clicking a badge expands to show error/warning counts and details
   - "Last checked X ago" timestamp appears after checks run
   - Navigation bar shows "CI" link after "Graph"
6. Commit (if fixes were needed): `fix(dashboard): address CI page typecheck/test issues`
