# Plan: Phase 5 — Signal Gatherer + Route + Registry

**Date:** 2026-06-22 | **Spec:** docs/changes/five-signal-dashboard-panel/proposal.md (Implementation Order item 5; "Gatherer + route" section) | **Tasks:** 7 | **Time:** ~30 min | **Integration Tier:** medium | **Rigor:** standard | **Validate policy:** no-regression (baseline 290; zero new findings)

## Goal

Wire the five existing `SignalProvider`s into a registry, a `gatherSignals(projectPath)` gatherer that runs them with `Promise.allSettled` (one bad provider degrades to a single `error` card without sinking the panel), and a read-only `GET /api/signals` route registered in `index.ts`'s `buildApp`. No client page (Phase 6), no docs (Phase 7).

## Observable Truths (Acceptance Criteria)

1. The system shall expose `signalRegistry: SignalProvider[]` containing exactly the five providers in canonical display order: `prReviewProvider`, `coverageTrendProvider`, `complexityTrendProvider`, `baselineUpdatesProvider`, `evalFailRateProvider` (matching the spec's signal table order: pr-merged, coverage, complexity, baseline, eval).
2. The system shall expose `gatherSignals(projectPath: string): Promise<SignalsResult>` returning `{ signals: SignalResult[]; generatedAt: string }`, where `signals.length === 5` and `generatedAt` is an ISO-8601 string.
3. When all five providers resolve, the system shall return their five `SignalResult`s in registry order.
4. When the graph loads successfully, `gatherSignals` shall pass a `GraphStore` to `SignalContext.graphStore`; when the graph is absent/unloadable, it shall set `graphStore: undefined` (best-effort, mirroring `gatherGraph`) and never throw.
5. If any single provider's `compute` rejects (throws), then `gatherSignals` shall map that rejection to a `SignalResult` with `status: 'error'`, `value: null`, the provider's own `id`/`label`, an empty `history`, and a `detail` carrying the rejection message — while the other four providers' results are returned unchanged (`Promise.allSettled` isolation).
6. The `SignalContext` built by `gatherSignals` shall set `projectPath`, a fresh `now: new Date()`, a `SignalTimelineStore` rooted at `projectPath`, and `runCommand: defaultCommandRunner`.
7. The system shall expose `buildSignalsRouter(ctx: ServerContext): Hono` mounting `GET /signals`, which returns HTTP 200 with body `{ data: SignalsResult; timestamp: string }` (the `ApiResponse<SignalsResult>` shape).
8. `buildSignalsRouter` shall be registered in `buildApp` via `app.route('/api', buildSignalsRouter(ctx))`, alongside the other gather routes.
9. `gatherSignals` and the route shall be `@internal`-annotated (resolved paths, not HTTP input) where the existing `gatherHealth`/`gatherGraph` convention applies.
10. `harness validate` shall report no more than 290 issues (no new findings) after the change.

## Discovery (verified against the worktree)

### Route mounting pattern — VERIFIED

- **Routes are NOT mounted in `serve.ts`.** `serve.ts` (`packages/dashboard/src/server/serve.ts:1-57`) only boots the HTTP server (`serve({ fetch: app.fetch, ... })`) and imports the already-built `app` from `./index`. The task brief's "register in serve.ts" resolves, in this codebase, to **`buildApp` in `packages/dashboard/src/server/index.ts`**.
- **[VERIFIED] Mounting pattern** (`packages/dashboard/src/server/index.ts:22-56`): each route module exports a `buildXRouter(ctx: ServerContext): Hono` factory; `buildApp` calls `app.route('/api', buildXRouter(ctx))` for each. The new line goes in the "API routes" block (lines 45-56), e.g. after `buildTraceabilityRouter`:
  ```ts
  app.route('/api', buildSignalsRouter(ctx));
  ```
  with a matching top-of-file import:
  ```ts
  import { buildSignalsRouter } from './routes/signals';
  ```
- **[VERIFIED] Route factory shape** (`packages/dashboard/src/server/routes/health.ts:39-61`): `export function buildXRouter(ctx: ServerContext): Hono { const router = new Hono(); router.get('/path', async (c) => { ... return c.json({ data, timestamp: new Date().toISOString() } satisfies ApiResponse<T>); }); return router; }`. The route path is RELATIVE to the `/api` mount, so `GET /api/signals` ⇒ `router.get('/signals', ...)`.

### Gatherer conventions — VERIFIED

- **[VERIFIED] `@internal` + soft-fail** (`packages/dashboard/src/server/gather/health.ts:9-13`, `gather/graph.ts:6-9`): gatherers are JSDoc-tagged `@internal Called with project-resolved paths, not from HTTP input.` and return an error-bearing object instead of throwing.
- **[VERIFIED] Best-effort GraphStore load** (`packages/dashboard/src/server/gather/graph.ts:10-44`): `new GraphStore()`, `await store.load(join(projectPath, GRAPH_DIR))` where `GRAPH_DIR = '.harness/graph'` (`shared/constants.ts:28`); `load` returns falsy when graph data is absent; wrapped in try/catch. Phase 5 reuses this exact pattern but yields `GraphStore | undefined` for `SignalContext.graphStore`.
- **[VERIFIED] Export style** (`packages/dashboard/src/server/gather/index.ts:1-10`): one `export { gatherX } from './x';` line per gatherer. Add `export { gatherSignals } from './signals';`.

### Provider/context contracts — VERIFIED

- **[VERIFIED] Provider exports** (`signals/providers/*.ts`): `complexityTrendProvider`, `prReviewProvider`, `baselineUpdatesProvider`, `coverageTrendProvider`, `evalFailRateProvider` — each `: SignalProvider` with `{ id, label, async compute(ctx) }`.
- **[VERIFIED] `SignalContext`** (`signals/types.ts:39-46`): `{ projectPath; now: Date; timeline: SignalTimelineStore; graphStore?: GraphStore; runCommand?: CommandRunner }`.
- **[VERIFIED] Providers self-default `runCommand`** (`baseline-updates.ts:102`, `pr-review.ts:163`, `coverage-trend.ts:187`): each does `ctx.runCommand ?? defaultCommandRunner`. The gatherer setting `runCommand: defaultCommandRunner` is therefore explicit-for-testability, not strictly required — but is the documented context the gatherer builds (truth #6).
- **[VERIFIED] `SignalTimelineStore`** (`signals/timeline-store.ts:38-43`): `new SignalTimelineStore(rootDir)`; soft-fails on missing/corrupt cache.
- **[VERIFIED] `defaultCommandRunner`** exported from `signals/command-runner.ts:12`.
- **[VERIFIED] `ApiResponse<T>`** declared at `packages/dashboard/src/shared/types.ts:11`. No `SignalsResult` type exists in `shared/types.ts` yet — Phase 5 defines `SignalsResult` in `gather/signals.ts` and exports it (the gatherer's return shape; route imports it from there).

### Test conventions — VERIFIED

- **[VERIFIED] Gatherer tests** live in `packages/dashboard/tests/server/gather/*.test.ts`; mock heavy deps via `vi.mock` and import the gatherer (`gather/health.test.ts:1-18`).
- **[VERIFIED] Route tests** live in `packages/dashboard/tests/server/routes/*.test.ts`; build a `ServerContext` via a local `makeCtx()` factory, mount with `new Hono(); app.route('/api', buildXRouter(ctx))`, and assert via `app.request('/api/...')` (`routes/ci.test.ts:1-58`).

## Uncertainties

- [RESOLVED] "Register in serve.ts" → register in `buildApp` (`index.ts`); serve.ts only boots the server. (See Discovery.)
- [ASSUMPTION] Registry display order follows the spec's signal table (pr-review first, eval last). If a different canonical order is intended, only `registry.ts` changes. (If wrong, Task 1 + Task 5/6 ordering assertions need revision.)
- [DEFERRABLE] Whether `/api/signals` should be cached via `ctx.cache`/`gatherCache`. Phase 5 keeps it uncached (compute-on-request, matching the simplest gather routes); caching is a later optimization, out of scope.

## Change Specifications

- [ADDED] `signals/registry.ts` — ordered five-provider array.
- [ADDED] `gather/signals.ts` — `gatherSignals` + `SignalsResult` type + `allSettled` rejection mapping.
- [ADDED] `routes/signals.ts` — `buildSignalsRouter`, `GET /api/signals`.
- [MODIFIED] `gather/index.ts` — add `gatherSignals` export.
- [MODIFIED] `server/index.ts` (`buildApp`) — import + mount `buildSignalsRouter`.

## File Map

- CREATE packages/dashboard/src/server/signals/registry.ts
- CREATE packages/dashboard/src/server/gather/signals.ts
- CREATE packages/dashboard/src/server/routes/signals.ts
- MODIFY packages/dashboard/src/server/gather/index.ts (add `gatherSignals` export)
- MODIFY packages/dashboard/src/server/index.ts (import + `app.route('/api', buildSignalsRouter(ctx))`)
- CREATE packages/dashboard/tests/server/gather/signals.test.ts
- CREATE packages/dashboard/tests/server/routes/signals.test.ts

## Skeleton

1. Registry + gatherer (`registry.ts`, `gather/signals.ts` with `allSettled` mapping + tests) (~3 tasks, ~14 min)
2. Route (`routes/signals.ts` + tests) (~2 tasks, ~9 min)
3. Wiring (gather/index export, buildApp mount) + validate (~2 tasks, ~7 min)

_Skeleton approved: pending (standard rigor, 7 tasks < 8 threshold — full tasks below; skeleton retained for orientation)._

## Tasks

### Task 1: Create the provider registry

**Depends on:** none | **Files:** `packages/dashboard/src/server/signals/registry.ts`

1. Create `packages/dashboard/src/server/signals/registry.ts`:

   ```ts
   import type { SignalProvider } from './types';
   import { prReviewProvider } from './providers/pr-review';
   import { coverageTrendProvider } from './providers/coverage-trend';
   import { complexityTrendProvider } from './providers/complexity-trend';
   import { baselineUpdatesProvider } from './providers/baseline-updates';
   import { evalFailRateProvider } from './providers/eval-fail-rate';

   /**
    * The five curated signals in canonical display order (spec signal table:
    * pr-review, coverage, complexity, baseline, eval). The gatherer iterates this
    * array with `Promise.allSettled` so the panel renders them in this order.
    *
    * @internal Consumed by `gatherSignals`, not by HTTP input.
    */
   export const signalRegistry: SignalProvider[] = [
     prReviewProvider,
     coverageTrendProvider,
     complexityTrendProvider,
     baselineUpdatesProvider,
     evalFailRateProvider,
   ];
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
3. Run: `harness validate`
4. Commit: `feat(dashboard): add signal provider registry`

### Task 2 (TDD): Write the gatherSignals test

**Depends on:** Task 1 | **Files:** `packages/dashboard/tests/server/gather/signals.test.ts`

1. Create `packages/dashboard/tests/server/gather/signals.test.ts`. Mock the registry with controllable fake providers so the test does not touch git/gh/graph/filesystem, and stub `GraphStore` so the best-effort load resolves cleanly:

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import type { SignalProvider, SignalResult } from '../../../src/server/signals/types';

   function fakeResult(
     id: SignalResult['id'],
     status: SignalResult['status'] = 'ok'
   ): SignalResult {
     return {
       id,
       label: id,
       value: status === 'ok' ? 1 : null,
       unit: 'count',
       trend: 'flat',
       betterDirection: 'down',
       status,
       threshold: { warn: 1, alert: 3 },
       history: [],
       detail: `fake ${id}`,
       source: 'test',
     };
   }

   const okProvider = (id: SignalResult['id']): SignalProvider => ({
     id,
     label: id,
     compute: vi.fn(async () => fakeResult(id)),
   });

   const throwingProvider = (id: SignalResult['id']): SignalProvider => ({
     id,
     label: id,
     compute: vi.fn(async () => {
       throw new Error('boom');
     }),
   });

   // Default registry: all five OK. Individual tests override via vi.doMock + dynamic import.
   vi.mock('../../../src/server/signals/registry', () => ({
     signalRegistry: [
       okProvider('pr-merged-without-multi-persona-review'),
       okProvider('coverage-trend-down-30d'),
       okProvider('complexity-trend-up-30d'),
       okProvider('baseline-auto-update-count'),
       okProvider('eval-fail-rate'),
     ],
   }));

   // GraphStore best-effort load: resolve as "loaded" so graphStore is passed.
   vi.mock('@harness-engineering/graph', async () => {
     const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
       '@harness-engineering/graph'
     );
     return {
       ...actual,
       GraphStore: class {
         load = vi.fn(async () => true);
         findNodes = vi.fn(() => []);
       },
     };
   });

   describe('gatherSignals', () => {
     beforeEach(() => vi.clearAllMocks());

     it('returns all five signals in registry order', async () => {
       const { gatherSignals } = await import('../../../src/server/gather/signals');
       const result = await gatherSignals('/fake');
       expect(result.signals).toHaveLength(5);
       expect(result.signals.map((s) => s.id)).toEqual([
         'pr-merged-without-multi-persona-review',
         'coverage-trend-down-30d',
         'complexity-trend-up-30d',
         'baseline-auto-update-count',
         'eval-fail-rate',
       ]);
       expect(typeof result.generatedAt).toBe('string');
       expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
     });

     it('isolates a throwing provider as a single error card; the other four still return', async () => {
       vi.resetModules();
       vi.doMock('../../../src/server/signals/registry', () => ({
         signalRegistry: [
           okProvider('pr-merged-without-multi-persona-review'),
           throwingProvider('coverage-trend-down-30d'),
           okProvider('complexity-trend-up-30d'),
           okProvider('baseline-auto-update-count'),
           okProvider('eval-fail-rate'),
         ],
       }));
       const { gatherSignals } = await import('../../../src/server/gather/signals');
       const result = await gatherSignals('/fake');
       expect(result.signals).toHaveLength(5);
       const coverage = result.signals.find((s) => s.id === 'coverage-trend-down-30d')!;
       expect(coverage.status).toBe('error');
       expect(coverage.value).toBeNull();
       expect(coverage.history).toEqual([]);
       expect(coverage.detail).toContain('boom');
       // Other four unaffected
       expect(result.signals.filter((s) => s.status === 'ok')).toHaveLength(4);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- signals` — observe FAILURE (module `gather/signals` does not exist).
3. Do NOT commit yet (red state).

### Task 3 (TDD): Implement gatherSignals

**Depends on:** Task 2 | **Files:** `packages/dashboard/src/server/gather/signals.ts`

1. Create `packages/dashboard/src/server/gather/signals.ts`. Keep cyclomatic complexity under 15 by extracting two helpers (`loadGraphStore`, `toErrorResult`) so `gatherSignals` stays a flat map:

   ```ts
   import { join } from 'node:path';
   import { GraphStore } from '@harness-engineering/graph';
   import { GRAPH_DIR } from '../../shared/constants';
   import { signalRegistry } from '../signals/registry';
   import { SignalTimelineStore } from '../signals/timeline-store';
   import { defaultCommandRunner } from '../signals/command-runner';
   import type { SignalContext, SignalProvider, SignalResult } from '../signals/types';

   /** Result of one signal-gather pass: the five (or fewer, on partial) cards + a stamp. */
   export interface SignalsResult {
     signals: SignalResult[];
     /** ISO-8601 timestamp of this gather pass. */
     generatedAt: string;
   }

   /**
    * Best-effort graph load for `eval-fail-rate`'s context. Returns `undefined`
    * (never throws) when the graph is absent or unloadable — mirrors `gatherGraph`.
    */
   async function loadGraphStore(projectPath: string): Promise<GraphStore | undefined> {
     try {
       const store = new GraphStore();
       const loaded = await store.load(join(projectPath, GRAPH_DIR));
       return loaded ? store : undefined;
     } catch {
       return undefined;
     }
   }

   /** Map a rejected provider to a self-contained `error` card (truth #5). */
   function toErrorResult(provider: SignalProvider, reason: unknown): SignalResult {
     const message = reason instanceof Error ? reason.message : String(reason);
     return {
       id: provider.id,
       label: provider.label,
       value: null,
       unit: '',
       trend: 'flat',
       betterDirection: 'down',
       status: 'error',
       threshold: { warn: 0, alert: 0 },
       history: [],
       detail: `Signal failed: ${message}`,
       source: 'gatherSignals',
     };
   }

   /**
    * Run every registered `SignalProvider` against a freshly-built `SignalContext`
    * and return their results in registry order. Uses `Promise.allSettled` so one
    * provider that throws degrades to a single `error` card without sinking the
    * other four. The graph is loaded best-effort (eval-fail-rate consumes it).
    *
    * @internal Called with project-resolved paths, not from HTTP input.
    */
   export async function gatherSignals(projectPath: string): Promise<SignalsResult> {
     const ctx: SignalContext = {
       projectPath,
       now: new Date(),
       timeline: new SignalTimelineStore(projectPath),
       graphStore: await loadGraphStore(projectPath),
       runCommand: defaultCommandRunner,
     };

     const settled = await Promise.allSettled(signalRegistry.map((p) => p.compute(ctx)));

     const signals = settled.map((outcome, i) =>
       outcome.status === 'fulfilled'
         ? outcome.value
         : toErrorResult(signalRegistry[i]!, outcome.reason)
     );

     return { signals, generatedAt: new Date().toISOString() };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- signals` — observe PASS (both gather tests green).
3. Run: `harness validate`
4. Commit: `feat(dashboard): add gatherSignals with allSettled provider isolation`

### Task 4 (TDD): Write the /api/signals route test

**Depends on:** Task 3 | **Files:** `packages/dashboard/tests/server/routes/signals.test.ts`

1. Create `packages/dashboard/tests/server/routes/signals.test.ts`. Mock `gatherSignals` so the route test asserts shape/wiring, not provider behavior:

   ```ts
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import { Hono } from 'hono';
   import type { ServerContext } from '../../../src/server/context';
   import { DataCache } from '../../../src/server/cache';
   import { GatherCache } from '../../../src/server/gather-cache';
   import type { SignalsResult } from '../../../src/server/gather/signals';

   const fakeSignals: SignalsResult = {
     signals: [
       {
         id: 'complexity-trend-up-30d',
         label: 'Complexity trend (30d)',
         value: 12,
         unit: 'count',
         trend: 'up',
         betterDirection: 'down',
         status: 'warn',
         threshold: { warn: 5, alert: 15 },
         history: [{ date: '2026-06-22', value: 12 }],
         detail: 'fake',
         source: 'arch/timeline.json',
       },
     ],
     generatedAt: '2026-06-22T00:00:00.000Z',
   };

   vi.mock('../../../src/server/gather/signals', () => ({
     gatherSignals: vi.fn(async () => fakeSignals),
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

   describe('GET /api/signals', () => {
     let app: Hono;

     beforeEach(async () => {
       const { buildSignalsRouter } = await import('../../../src/server/routes/signals');
       app = new Hono();
       app.route('/api', buildSignalsRouter(makeCtx()));
     });

     it('returns 200 with the gathered signals shape', async () => {
       const res = await app.request('/api/signals');
       expect(res.status).toBe(200);
       const body = (await res.json()) as { data: SignalsResult; timestamp: string };
       expect(body.data.signals).toHaveLength(1);
       expect(body.data.signals[0].id).toBe('complexity-trend-up-30d');
       expect(body.data.generatedAt).toBe('2026-06-22T00:00:00.000Z');
       expect(body.timestamp).toBeTypeOf('string');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- routes/signals` — observe FAILURE (`routes/signals` does not exist).
3. Do NOT commit yet (red state).

### Task 5 (TDD): Implement the /api/signals route

**Depends on:** Task 4 | **Files:** `packages/dashboard/src/server/routes/signals.ts`

1. Create `packages/dashboard/src/server/routes/signals.ts`:

   ```ts
   import { Hono } from 'hono';
   import { gatherSignals, type SignalsResult } from '../gather/signals';
   import type { ApiResponse } from '../../shared/types';
   import type { ServerContext } from '../context';

   /**
    * Read-only signals API. `GET /api/signals` computes the five curated signals
    * for `ctx.projectPath` and returns them in canonical display order.
    *
    * @internal Reads only resolved server-context paths; takes no HTTP input.
    */
   export function buildSignalsRouter(ctx: ServerContext): Hono {
     const router = new Hono();

     router.get('/signals', async (c) => {
       const data = await gatherSignals(ctx.projectPath);
       return c.json({
         data,
         timestamp: new Date().toISOString(),
       } satisfies ApiResponse<SignalsResult>);
     });

     return router;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- routes/signals` — observe PASS.
3. Run: `harness validate`
4. Commit: `feat(dashboard): add GET /api/signals route`

### Task 6: Export gatherSignals from the gather barrel

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/server/gather/index.ts` | **Category:** integration

1. Add to `packages/dashboard/src/server/gather/index.ts` (after the existing `gatherCI` export):

   ```ts
   export { gatherSignals } from './signals';
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
3. Run: `harness validate`
4. Commit: `feat(dashboard): export gatherSignals from gather barrel`

### Task 7: Register the signals route in buildApp

**Depends on:** Task 5 | **Files:** `packages/dashboard/src/server/index.ts` | **Category:** integration

1. In `packages/dashboard/src/server/index.ts`, add the import after the `buildTraceabilityRouter` import (line ~16):

   ```ts
   import { buildSignalsRouter } from './routes/signals';
   ```

2. In `buildApp`'s "API routes" block, add after `app.route('/api', buildTraceabilityRouter(ctx));` (line ~56):

   ```ts
   app.route('/api', buildSignalsRouter(ctx));
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
4. Run: `pnpm --filter @harness-engineering/dashboard test` — observe full dashboard suite green.
5. Run: `harness validate` — confirm no more than 290 issues.
6. Commit: `feat(dashboard): register /api/signals route in buildApp`

## Integration Tier Rationale

**medium** — new feature within an existing package (dashboard): new server modules + one new export + one route registration; 3-15 files; no new public API surface outside the package. Wiring + project-internal updates only; no ADR/knowledge materialization in this phase (those are Phase 7 per the spec's Integration Points).

## Notes for Execution

- Provider order in `registry.ts` IS the panel display order (Phase 6 renders `signals` as-is). Do not reorder.
- Providers self-default `runCommand`; the gatherer still sets `runCommand: defaultCommandRunner` explicitly (truth #6) for an unambiguous context.
- The route is intentionally uncached — keep it compute-on-request to match the simplest gather routes. Caching is out of scope.
- Keep `gatherSignals` flat (the two extracted helpers keep it under the cyclomatic-15 hard cap). Do not inline `loadGraphStore`/`toErrorResult` back into it.
- "Register in serve.ts" from the task brief = register in `buildApp` (`index.ts`); `serve.ts` only boots the server.
