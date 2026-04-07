# Plan: Dashboard v1.1 Phase 4 -- Health Page Expansion

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 7
**Estimated time:** 28 minutes

## Goal

Extend the Health page endpoint and UI with security, performance, and architecture data from GatherCache, and add corresponding KPI summary cards to the Overview page.

## Observable Truths (Acceptance Criteria)

1. When GatherCache has security/perf/arch data cached, `GET /api/health` returns a JSON response where `data.security` is a `SecurityResult`, `data.perf` is a `PerfResult`, and `data.arch` is an `ArchResult` alongside the existing `HealthResult` fields.
2. When GatherCache has not yet run security/perf/arch gatherers, `GET /api/health` returns `null` for `security`, `perf`, and `arch` fields while still returning the existing entropy-based `HealthResult`.
3. The Health page renders a collapsible "Security" section displaying `stats.errorCount`, `stats.warningCount`, `stats.infoCount` as KPI cards and a findings list when expanded.
4. The Health page renders a collapsible "Performance" section displaying `stats.violationCount` as a KPI card and a violations list when expanded.
5. The Health page renders a collapsible "Architecture" section displaying a passed/failed badge, regression count, and new violations list when expanded.
6. When any of security/perf/arch returns an error result (has `error` property), that section shows the error message instead of data.
7. While security/perf/arch data is `null` (not yet gathered), the Health page shows "Awaiting first scan..." for those sections.
8. The Overview page shows three additional KPI cards: Security (error count or "OK"), Performance (violation count or "OK"), Architecture (passed/failed).
9. `npx vitest run packages/dashboard/tests/server/routes/health-extended.test.ts` passes with all tests green.
10. `npx vitest run packages/dashboard/tests/server/routes/health.test.ts` continues to pass (backward compat).
11. `harness validate` passes.

## File Map

- MODIFY `packages/dashboard/src/shared/types.ts` (add `ExtendedHealthData` type, update `OverviewData`)
- MODIFY `packages/dashboard/src/server/routes/health.ts` (read GatherCache, return extended response)
- CREATE `packages/dashboard/tests/server/routes/health-extended.test.ts` (test extended health endpoint)
- MODIFY `packages/dashboard/src/client/utils/typeGuards.ts` (add `isSecurityData`, `isPerfData`, `isArchData` guards)
- MODIFY `packages/dashboard/src/client/pages/Health.tsx` (add 3 collapsible sections consuming checks SSE data)
- MODIFY `packages/dashboard/src/client/pages/Overview.tsx` (add security/perf/arch KPI cards consuming checks SSE data)
- MODIFY `packages/dashboard/tests/server/routes/health.test.ts` (verify existing test still passes, no changes needed)

## Tasks

### Task 1: Add ExtendedHealthData type and update OverviewData

**Depends on:** none
**Files:** `packages/dashboard/src/shared/types.ts`

1. Read `packages/dashboard/src/shared/types.ts`.
2. After the `HealthResult` type alias (line 98), add the `ExtendedHealthData` interface:

```typescript
/** Extended health response including security, perf, and arch from GatherCache */
export interface ExtendedHealthData {
  health: HealthResult;
  security: SecurityResult | null;
  perf: PerfResult | null;
  arch: ArchResult | null;
}
```

3. Update the `OverviewData` interface to include optional security/perf/arch summaries. Modify the existing `OverviewData` (line 140-144):

```typescript
/** KPI overview combining all data sources */
export interface OverviewData {
  roadmap: RoadmapResult;
  health: HealthResult;
  graph: GraphResult;
  securityStatus?: { valid: boolean; errorCount: number; warningCount: number } | null;
  perfStatus?: { valid: boolean; violationCount: number } | null;
  archStatus?: { passed: boolean; totalViolations: number } | null;
}
```

4. Run: `npx vitest run packages/dashboard/tests/server/routes/overview.test.ts` -- verify existing tests still pass (no runtime change yet).
5. Run: `harness validate`
6. Commit: `feat(dashboard): add ExtendedHealthData type and overview status summaries`

---

### Task 2: Extend GET /api/health route to include GatherCache data

**Depends on:** Task 1
**Files:** `packages/dashboard/src/server/routes/health.ts`

1. Read `packages/dashboard/src/server/routes/health.ts`.
2. Replace the entire file with:

```typescript
import { Hono } from 'hono';
import { gatherHealth } from '../gather/health';
import type {
  ApiResponse,
  HealthResult,
  ExtendedHealthData,
  SecurityResult,
  PerfResult,
  ArchResult,
} from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'health';

export function buildHealthRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/health', async (c) => {
    // Get entropy-based health data (TTL-cached)
    let healthResult: HealthResult;
    const cached = ctx.cache.get<HealthResult>(CACHE_KEY);
    if (cached) {
      healthResult = cached.data;
    } else {
      healthResult = await gatherHealth(ctx.projectPath);
      ctx.cache.set(CACHE_KEY, healthResult);
    }

    // Get expensive gather data from GatherCache (null if not yet run)
    const security = ctx.gatherCache.get<SecurityResult>('security');
    const perf = ctx.gatherCache.get<PerfResult>('perf');
    const arch = ctx.gatherCache.get<ArchResult>('arch');

    const data: ExtendedHealthData = {
      health: healthResult,
      security,
      perf,
      arch,
    };

    const response: ApiResponse<ExtendedHealthData> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
```

3. Run: `npx vitest run packages/dashboard/tests/server/routes/health.test.ts` -- the existing test checks `body.data.totalIssues` which will now be at `body.data.health.totalIssues`. The test WILL fail. This is expected -- the response shape changed.
4. Run: `harness validate`
5. Commit: `feat(dashboard): extend health route with security/perf/arch from GatherCache`

---

### Task 3: Update existing health route test and add extended health tests

**Depends on:** Task 2
**Files:** `packages/dashboard/tests/server/routes/health.test.ts`, `packages/dashboard/tests/server/routes/health-extended.test.ts`

1. Update `packages/dashboard/tests/server/routes/health.test.ts` to match the new response shape. Replace the test assertion:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';

vi.mock('../../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({
    totalIssues: 5,
    errors: 1,
    warnings: 4,
    fixableCount: 2,
    suggestionCount: 0,
    durationMs: 200,
    analysisErrors: [],
  }),
}));

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

describe('GET /api/health', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    app = new Hono();
    app.route('/api', buildHealthRouter(makeCtx()));
  });

  it('returns 200 with ExtendedHealthData', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { health: { totalIssues: number }; security: null; perf: null; arch: null };
      timestamp: string;
    };
    expect(body.data.health.totalIssues).toBe(5);
    expect(body.data.security).toBeNull();
    expect(body.data.perf).toBeNull();
    expect(body.data.arch).toBeNull();
    expect(body.timestamp).toBeTypeOf('string');
  });
});
```

2. Create `packages/dashboard/tests/server/routes/health-extended.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityData, PerfData, ArchData } from '../../../src/shared/types';

vi.mock('../../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({
    totalIssues: 3,
    errors: 0,
    warnings: 3,
    fixableCount: 1,
    suggestionCount: 0,
    durationMs: 150,
    analysisErrors: [],
  }),
}));

const mockSecurity: SecurityData = {
  valid: true,
  findings: [
    {
      ruleId: 'no-hardcoded-secrets',
      category: 'secrets',
      severity: 'warning',
      file: 'src/config.ts',
      line: 10,
      message: 'Possible hardcoded secret',
    },
  ],
  stats: { filesScanned: 50, errorCount: 0, warningCount: 1, infoCount: 0 },
};

const mockPerf: PerfData = {
  valid: false,
  violations: [
    {
      metric: 'complexity',
      file: 'src/engine.ts',
      value: 25,
      threshold: 15,
      severity: 'error',
    },
  ],
  stats: { filesAnalyzed: 30, violationCount: 1 },
};

const mockArch: ArchData = {
  passed: false,
  totalViolations: 2,
  regressions: [{ category: 'coupling', delta: 1 }],
  newViolations: [
    { file: 'src/api.ts', detail: 'Direct import of internal module', severity: 'error' },
  ],
};

function makeCtxWithCache(): ServerContext {
  const gc = new GatherCache();
  // Pre-populate the gather cache
  gc.refresh('security', async () => mockSecurity);
  gc.refresh('perf', async () => mockPerf);
  gc.refresh('arch', async () => mockArch);
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: gc,
  };
}

function makeCtxWithoutCache(): ServerContext {
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

describe('GET /api/health (extended)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes security/perf/arch data when GatherCache is populated', async () => {
    const ctx = makeCtxWithCache();
    // Wait for async cache population
    await new Promise((r) => setTimeout(r, 10));

    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (
      body as { data: { health: unknown; security: unknown; perf: unknown; arch: unknown } }
    ).data;

    expect(data.health).toBeDefined();
    expect(data.security).toEqual(mockSecurity);
    expect(data.perf).toEqual(mockPerf);
    expect(data.arch).toEqual(mockArch);
  });

  it('returns null for security/perf/arch when GatherCache is empty', async () => {
    const ctx = makeCtxWithoutCache();
    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (body as { data: { security: null; perf: null; arch: null } }).data;

    expect(data.security).toBeNull();
    expect(data.perf).toBeNull();
    expect(data.arch).toBeNull();
  });

  it('returns security error when security gatherer failed', async () => {
    const gc = new GatherCache();
    await gc.refresh('security', async () => ({ error: 'Scanner unavailable' }));
    const ctx: ServerContext = {
      projectPath: '/fake',
      roadmapPath: '/fake/docs/roadmap.md',
      chartsPath: '/fake/docs/roadmap-charts.md',
      cache: new DataCache(60_000),
      pollIntervalMs: 30_000,
      sseManager: undefined!,
      gatherCache: gc,
    };

    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    const body = await res.json();
    const data = (body as { data: { security: { error: string } } }).data;

    expect(data.security).toEqual({ error: 'Scanner unavailable' });
  });
});
```

3. Run: `npx vitest run packages/dashboard/tests/server/routes/health.test.ts packages/dashboard/tests/server/routes/health-extended.test.ts`
4. Observe: all tests pass.
5. Run: `harness validate`
6. Commit: `test(dashboard): update health route tests for extended response shape`

---

### Task 4: Add type guards for SecurityData, PerfData, ArchData

**Depends on:** Task 1
**Files:** `packages/dashboard/src/client/utils/typeGuards.ts`

1. Read `packages/dashboard/src/client/utils/typeGuards.ts`.
2. Add imports and new type guard functions. Replace the file with:

```typescript
import type {
  RoadmapData,
  HealthData,
  GraphData,
  SecurityData,
  PerfData,
  ArchData,
} from '@shared/types';

export function isRoadmapData(r: unknown): r is RoadmapData {
  return typeof r === 'object' && r !== null && 'totalFeatures' in r;
}

export function isHealthData(h: unknown): h is HealthData {
  return typeof h === 'object' && h !== null && 'totalIssues' in h;
}

export function isGraphData(g: unknown): g is GraphData {
  return (
    typeof g === 'object' && g !== null && 'available' in g && (g as GraphData).available === true
  );
}

export function isSecurityData(s: unknown): s is SecurityData {
  return typeof s === 'object' && s !== null && 'findings' in s && 'stats' in s;
}

export function isPerfData(p: unknown): p is PerfData {
  return typeof p === 'object' && p !== null && 'violations' in p && 'stats' in p;
}

export function isArchData(a: unknown): a is ArchData {
  return typeof a === 'object' && a !== null && 'passed' in a && 'totalViolations' in a;
}
```

3. Run: `harness validate`
4. Commit: `feat(dashboard): add type guards for SecurityData, PerfData, ArchData`

---

### Task 5: Add collapsible Security section to Health page

**Depends on:** Task 4
**Files:** `packages/dashboard/src/client/pages/Health.tsx`

1. Read `packages/dashboard/src/client/pages/Health.tsx`.
2. Replace the entire file with the following, which adds SSE subscription to `checks` events and a collapsible Security section:

```tsx
import { useState } from 'react';
import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { SSE_ENDPOINT } from '@shared/constants';
import { isHealthData, isSecurityData, isPerfData, isArchData } from '../utils/typeGuards';
import type { ChecksData, SecurityData, PerfData, ArchData } from '@shared/types';

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs text-gray-500">{open ? '\u25BC' : '\u25B6'}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
      </button>
      {open && children}
    </section>
  );
}

function SecuritySection({ data }: { data: SecurityData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Errors"
          value={data.stats.errorCount}
          accent={data.stats.errorCount > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="Warnings"
          value={data.stats.warningCount}
          accent={data.stats.warningCount > 0 ? 'yellow' : 'default'}
        />
        <KpiCard label="Info" value={data.stats.infoCount} />
        <KpiCard label="Files Scanned" value={data.stats.filesScanned} />
      </div>
      {data.findings.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Top Findings
          </p>
          {data.findings.slice(0, 10).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span
                className={
                  f.severity === 'error'
                    ? 'text-red-400'
                    : f.severity === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                }
              >
                [{f.severity}]
              </span>
              <span className="text-gray-300">
                {f.file}:{f.line}
              </span>
              <span className="text-gray-500">{f.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerfSection({ data }: { data: PerfData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Violations"
          value={data.stats.violationCount}
          accent={data.stats.violationCount > 0 ? 'red' : 'green'}
        />
        <KpiCard label="Files Analyzed" value={data.stats.filesAnalyzed} />
        <KpiCard
          label="Status"
          value={data.valid ? 'OK' : 'Failing'}
          accent={data.valid ? 'green' : 'red'}
        />
      </div>
      {data.violations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Violations
          </p>
          {data.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={v.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                [{v.severity}]
              </span>
              <span className="text-gray-300">{v.file}</span>
              <span className="text-gray-500">
                {v.metric}: {v.value} (threshold: {v.threshold})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchSection({ data }: { data: ArchData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Status"
          value={data.passed ? 'Passed' : 'Failed'}
          accent={data.passed ? 'green' : 'red'}
        />
        <KpiCard
          label="Violations"
          value={data.totalViolations}
          accent={data.totalViolations > 0 ? 'red' : 'default'}
        />
        <KpiCard
          label="Regressions"
          value={data.regressions.length}
          accent={data.regressions.length > 0 ? 'yellow' : 'default'}
        />
      </div>
      {data.newViolations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            New Violations
          </p>
          {data.newViolations.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={v.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                [{v.severity}]
              </span>
              <span className="text-gray-300">{v.file}</span>
              <span className="text-gray-500">{v.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckSection<T>({
  title,
  raw,
  guard,
  Section,
}: {
  title: string;
  raw: unknown;
  guard: (v: unknown) => v is T;
  Section: React.ComponentType<{ data: T }>;
}) {
  if (raw === undefined || raw === null) {
    return (
      <CollapsibleSection title={title}>
        <p className="text-sm text-gray-500">Awaiting first scan...</p>
      </CollapsibleSection>
    );
  }
  if (!guard(raw)) {
    return (
      <CollapsibleSection title={title}>
        <p className="text-sm text-red-400">
          {'error' in (raw as Record<string, unknown>)
            ? String((raw as Record<string, string>).error)
            : 'Unavailable'}
        </p>
      </CollapsibleSection>
    );
  }
  return (
    <CollapsibleSection title={title}>
      <Section data={raw} />
    </CollapsibleSection>
  );
}

export function Health() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');

  const health = data ? data.health : null;
  const healthData = health && isHealthData(health) ? health : null;

  const security = checksData ? checksData.security : null;
  const perf = checksData ? checksData.perf : null;
  const arch = checksData ? checksData.arch : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Health</h1>
        <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream...</p>}

      {health && !healthData && (
        <p className="text-sm text-red-400">{'error' in health ? health.error : 'Unavailable'}</p>
      )}

      {healthData && (
        <div className="space-y-8">
          {/* Entropy Analysis (existing) */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Entropy Analysis
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Total Issues"
                value={healthData.totalIssues}
                accent={healthData.totalIssues > 0 ? 'yellow' : 'green'}
              />
              <KpiCard
                label="Errors"
                value={healthData.errors}
                accent={healthData.errors > 0 ? 'red' : 'default'}
              />
              <KpiCard
                label="Warnings"
                value={healthData.warnings}
                accent={healthData.warnings > 0 ? 'yellow' : 'default'}
              />
              <KpiCard label="Auto-fixable" value={healthData.fixableCount} accent="default" />
            </div>
          </section>

          {/* Scan metadata */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Scan Details
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KpiCard label="Suggestions" value={healthData.suggestionCount} />
              <KpiCard label="Scan Duration" value={`${healthData.durationMs} ms`} />
              <KpiCard
                label="Analysis Errors"
                value={healthData.analysisErrors.length}
                accent={healthData.analysisErrors.length > 0 ? 'red' : 'default'}
              />
            </div>
          </section>

          {/* Analysis errors */}
          {healthData.analysisErrors.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Analysis Errors
              </h2>
              <div className="space-y-2 rounded-lg border border-red-900 bg-gray-900 p-4">
                {healthData.analysisErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400">
                    {e}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Security section (new) */}
          <CheckSection
            title="Security"
            raw={security}
            guard={isSecurityData}
            Section={SecuritySection}
          />

          {/* Performance section (new) */}
          <CheckSection title="Performance" raw={perf} guard={isPerfData} Section={PerfSection} />

          {/* Architecture section (new) */}
          <CheckSection title="Architecture" raw={arch} guard={isArchData} Section={ArchSection} />
        </div>
      )}
    </div>
  );
}
```

3. Run: `harness validate`
4. Commit: `feat(dashboard): add security/perf/arch collapsible sections to Health page`

---

### Task 6: Update Overview page with security/perf/arch KPI cards

**Depends on:** Task 4
**Files:** `packages/dashboard/src/client/pages/Overview.tsx`

1. Read `packages/dashboard/src/client/pages/Overview.tsx`.
2. Replace the entire file with the following, which adds a `checks` SSE subscription and three new KPI sections:

```tsx
import { useSSE } from '../hooks/useSSE';
import { KpiCard } from '../components/KpiCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import type { OverviewData } from '@shared/types';
import { SSE_ENDPOINT } from '@shared/constants';
import {
  isRoadmapData,
  isHealthData,
  isGraphData,
  isSecurityData,
  isPerfData,
  isArchData,
} from '../utils/typeGuards';

export function Overview() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');

  const roadmap = data ? data.roadmap : null;
  const health = data ? data.health : null;
  const graph = data ? data.graph : null;

  const security = checksData ? checksData.security : null;
  const perf = checksData ? checksData.perf : null;
  const arch = checksData ? checksData.arch : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/validate"
            label="Run Validate"
            loadingLabel="Validating..."
          />
          <ActionButton
            url="/api/actions/regen-charts"
            label="Regen Charts"
            loadingLabel="Regenerating..."
          />
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
        </div>
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream...</p>}

      {data && (
        <div className="space-y-8">
          {/* Roadmap KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Roadmap
            </h2>
            {roadmap && isRoadmapData(roadmap) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <KpiCard label="Total" value={roadmap.totalFeatures} />
                <KpiCard label="Done" value={roadmap.totalDone} accent="green" />
                <KpiCard label="In Progress" value={roadmap.totalInProgress} accent="yellow" />
                <KpiCard label="Planned" value={roadmap.totalPlanned} />
                <KpiCard
                  label="Blocked"
                  value={roadmap.totalBlocked}
                  accent={roadmap.totalBlocked > 0 ? 'red' : 'default'}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {roadmap && 'error' in roadmap ? roadmap.error : 'Unavailable'}
              </p>
            )}
          </section>

          {/* Health KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Codebase Health
            </h2>
            {health && isHealthData(health) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard
                  label="Total Issues"
                  value={health.totalIssues}
                  accent={health.totalIssues > 0 ? 'yellow' : 'green'}
                />
                <KpiCard
                  label="Errors"
                  value={health.errors}
                  accent={health.errors > 0 ? 'red' : 'default'}
                />
                <KpiCard
                  label="Warnings"
                  value={health.warnings}
                  accent={health.warnings > 0 ? 'yellow' : 'default'}
                />
                <KpiCard
                  label="Auto-fixable"
                  value={health.fixableCount}
                  sub={`${health.durationMs} ms scan`}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {health && 'error' in health ? health.error : 'Unavailable'}
              </p>
            )}
          </section>

          {/* Security Status KPI */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Security
            </h2>
            {security && isSecurityData(security) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard
                  label="Status"
                  value={security.valid ? 'OK' : 'Issues Found'}
                  accent={security.valid ? 'green' : 'red'}
                />
                <KpiCard
                  label="Errors"
                  value={security.stats.errorCount}
                  accent={security.stats.errorCount > 0 ? 'red' : 'default'}
                />
                <KpiCard
                  label="Warnings"
                  value={security.stats.warningCount}
                  accent={security.stats.warningCount > 0 ? 'yellow' : 'default'}
                />
                <KpiCard label="Files Scanned" value={security.stats.filesScanned} />
              </div>
            ) : security && 'error' in security ? (
              <p className="text-sm text-red-400">{(security as { error: string }).error}</p>
            ) : (
              <p className="text-sm text-gray-500">Awaiting first scan...</p>
            )}
          </section>

          {/* Performance Status KPI */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Performance
            </h2>
            {perf && isPerfData(perf) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Status"
                  value={perf.valid ? 'OK' : 'Violations'}
                  accent={perf.valid ? 'green' : 'red'}
                />
                <KpiCard
                  label="Violations"
                  value={perf.stats.violationCount}
                  accent={perf.stats.violationCount > 0 ? 'red' : 'default'}
                />
                <KpiCard label="Files Analyzed" value={perf.stats.filesAnalyzed} />
              </div>
            ) : perf && 'error' in perf ? (
              <p className="text-sm text-red-400">{(perf as { error: string }).error}</p>
            ) : (
              <p className="text-sm text-gray-500">Awaiting first scan...</p>
            )}
          </section>

          {/* Architecture Status KPI */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Architecture
            </h2>
            {arch && isArchData(arch) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Status"
                  value={arch.passed ? 'Passed' : 'Failed'}
                  accent={arch.passed ? 'green' : 'red'}
                />
                <KpiCard
                  label="Violations"
                  value={arch.totalViolations}
                  accent={arch.totalViolations > 0 ? 'red' : 'default'}
                />
                <KpiCard
                  label="Regressions"
                  value={arch.regressions.length}
                  accent={arch.regressions.length > 0 ? 'yellow' : 'default'}
                />
              </div>
            ) : arch && 'error' in arch ? (
              <p className="text-sm text-red-400">{(arch as { error: string }).error}</p>
            ) : (
              <p className="text-sm text-gray-500">Awaiting first scan...</p>
            )}
          </section>

          {/* Graph KPIs */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Knowledge Graph
            </h2>
            {graph && isGraphData(graph) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KpiCard label="Nodes" value={graph.nodeCount} />
                <KpiCard label="Edges" value={graph.edgeCount} />
                <KpiCard
                  label="Node Types"
                  value={graph.nodesByType.length}
                  sub={graph.nodesByType.map((n) => `${n.type}: ${n.count}`).join(', ')}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
                <p className="text-sm text-gray-400">Graph not connected</p>
                {graph && !graph.available && (
                  <p className="mt-1 text-xs text-gray-600">{graph.reason}</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
```

3. Run: `npx vitest run packages/dashboard/tests/server/routes/overview.test.ts` -- verify existing overview route tests still pass (they test the API route, not the client component).
4. Run: `harness validate`
5. Commit: `feat(dashboard): add security/perf/arch KPI cards to Overview page`

---

### Task 7: Verify all tests pass and validate

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** none (verification only)

1. Run: `cd packages/dashboard && npx vitest run`
2. Observe: all tests pass (server and client projects).
3. Run: `harness validate`
4. Observe: validation passes.
5. Run: `harness check-deps`
6. Observe: dependency check passes.
7. Manual verification: Start the dashboard (`pnpm --filter dashboard dev`) and confirm:
   - Health page shows entropy section (existing) plus 3 collapsible sections
   - Before first SSE `checks` event, sections show "Awaiting first scan..."
   - After `checks` event, sections populate with data
   - Collapsible sections toggle open/closed
   - Overview page shows Security, Performance, Architecture KPI cards
   - Error states display correctly when a gatherer fails
8. Commit: no commit (verification only)

## Evidence

- `packages/dashboard/src/shared/types.ts:77-98` -- HealthData and HealthResult types currently exist; ExtendedHealthData will be added after line 98.
- `packages/dashboard/src/server/routes/health.ts:1-33` -- Current health route returns `ApiResponse<HealthResult>`, will be changed to `ApiResponse<ExtendedHealthData>`.
- `packages/dashboard/src/server/gather-cache.ts:21-24` -- `GatherCache.get<T>()` returns `T | null`, used to fetch security/perf/arch.
- `packages/dashboard/src/server/sse.ts:126-154` -- SSE manager already broadcasts `checks` events with security/perf/arch data on first tick.
- `packages/dashboard/src/client/hooks/useSSE.ts:21-24` -- `useSSE` hook accepts event type parameter, will use `'checks'` for new data.
- `packages/dashboard/src/client/pages/CI.tsx:51,69` -- CI page has existing collapsible pattern with `aria-expanded` and toggle state.
- `packages/dashboard/src/client/utils/typeGuards.ts:1-15` -- Existing type guards pattern to follow for new guards.
- `packages/dashboard/tests/server/routes/health.test.ts:1-46` -- Existing test uses `gatherCache: undefined!` which needs updating to `new GatherCache()`.
