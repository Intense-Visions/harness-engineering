# Plan: Phase 2 — Ready Signal `complexity-trend-up-30d`

**Date:** 2026-06-22 | **Spec:** docs/changes/five-signal-dashboard-panel/proposal.md | **Tasks:** 4 | **Time:** ~16 min | **Integration Tier:** small | **Rigor:** standard

## Goal

Ship a `SignalProvider` for `complexity-trend-up-30d` that derives the current complexity value, 30-day trend, and threshold status directly from `.harness/arch/timeline.json`, returning a `SignalResult` with history points and degrading gracefully (status `error`) when the source is missing, empty, or corrupt.

## Scope

Implementation Order item **2 ONLY** ("Ready signal: complexity-trend"). This phase builds the **provider + its unit tests only**. It does NOT build the gatherer (`gather/signals.ts`), the route (`routes/signals.ts`), the registry array, or the client page — those are Phases 5–6. The "prove provider→gatherer→route end-to-end" goal in the spec is satisfied _conceptually_ here by making the provider conform exactly to the `SignalProvider` contract so a later gatherer can call it unchanged.

## Source-of-truth finding (verified)

`.harness/arch/timeline.json` is **NOT** a flat per-day series. Its real shape (verified at `.harness/arch/timeline.json:1-40`) is:

```jsonc
{
  "version": 1,
  "snapshots": [
    {
      "capturedAt": "2026-04-06T14:20:52.339Z", // ISO timestamp -> derive YYYY-MM-DD
      "commitHash": "0669068",
      "stabilityScore": 57,
      "metrics": {
        "complexity": { "value": 288, "violationCount": 288 }, // <-- the metric we read
        "circular-deps": { "value": 0, "violationCount": 0 },
        "module-size": { "value": 56668, "violationCount": 4 },
        // ... other metrics
      },
    },
  ],
}
```

Consequences baked into this plan:

- `value` is read from `snapshot.metrics.complexity.value` (a count, unit `'count'`), **not** a top-level number.
- `date` for each `SignalPoint` is `capturedAt` truncated to `YYYY-MM-DD`.
- The file may contain **only one snapshot** today, so the single-snapshot path (trend `flat`, status `ok`) must be handled.
- The 30-day window filters snapshots by `capturedAt >= now - 30d`.

## Decisions for this phase

1. **Provider reads `arch/timeline.json` directly as the authoritative source** for `value`, `trend`, and `history`. The `SignalTimelineStore` is used only to _mirror_ the current day's derived value (`appendPoint`) for steady-state continuity per the spec's hybrid approach — it does not drive the computed result. _Rationale:_ arch/timeline.json is already a time-series, so re-deriving from it is correct and cheap; mirroring keeps the store consistent with the other signals without making the result depend on cache warmth.
2. **Percent-change baseline = earliest in-window snapshot.** Trend % = `(latest - earliest) / earliest * 100` over the windowed snapshots. _Rationale:_ matches "+5% / +15% over 30d" threshold semantics in the spec table.
3. **`betterDirection: 'down'`, `threshold: { warn: 5, alert: 15 }`, `unit: 'count'`.** Status maps on the _percent rise_: `pct >= 15` → `alert`; `pct >= 5` → `warn`; else `ok`. Lower/flat complexity is healthy.
4. **Graceful degradation = `status: 'error'`** with `value: null`, `history: []`, `trend: 'flat'`, and a `detail` explaining the missing source. _Rationale:_ mirrors `gatherHealth`/`gatherArch` error style (`gather/health.ts:53-56`); a missing/corrupt source must never crash the panel (Success Criterion 7 analog).
5. **Earliest-snapshot value of `0`** is treated as undefined trend → `flat`/`ok` (avoid divide-by-zero).

## Observable Truths (Acceptance Criteria)

Using EARS where behavioral:

1. **Ubiquitous** — The provider shall expose `id === 'complexity-trend-up-30d'`, `label` (non-empty), `betterDirection === 'down'`, `unit === 'count'`, and `threshold === { warn: 5, alert: 15 }` on every result.
2. **Event-driven** — When `compute()` runs against a fixture timeline with multiple snapshots, the system shall set `value` to the latest in-window snapshot's `metrics.complexity.value` and `history` to one `SignalPoint` per in-window snapshot (`date` = `capturedAt` as `YYYY-MM-DD`, `value` = complexity), oldest→newest, capped at 30.
3. **Event-driven** — When the latest in-window complexity exceeds the earliest by `>= 15%`, the system shall set `status: 'alert'` and `trend: 'up'`; when by `>= 5%` and `< 15%`, `status: 'warn'`/`trend: 'up'`; when within `±5%`... `status: 'ok'` with `trend` up/down/flat per sign of change.
4. **State-driven** — While only one in-window snapshot exists, the system shall return `trend: 'flat'`, `status: 'ok'`, and `value` = that snapshot's complexity.
5. **Unwanted** — If `.harness/arch/timeline.json` is missing, empty (`snapshots: []`), or corrupt JSON, then the system shall not throw — it shall return `status: 'error'`, `value: null`, `history: []`, `trend: 'flat'`, with a `detail` naming the source.
6. **Ubiquitous** — `source` shall be `'arch/timeline.json'`.
7. `pnpm --filter @harness-engineering/dashboard test` passes; `harness validate` stays at **290** findings (no-regression).

## File Map

- CREATE `packages/dashboard/src/server/signals/providers/complexity-trend.ts`
- CREATE `packages/dashboard/tests/server/signals/providers/complexity-trend.test.ts`

No modifications to existing files in this phase. No barrel export (registry array is Phase 5; spec confirms no export outside the dashboard package).

## Uncertainties

- [ASSUMPTION] 30-day window is computed against `ctx.now`; snapshots older than `now - 30d` are excluded. If the team later wants "last 30 snapshots" instead of "last 30 days", Task 2's filter changes only.
- [ASSUMPTION] Percent-change baseline is the earliest in-window snapshot (not a fixed 30-days-ago anchor). Documented in Decision #2.
- [DEFERRABLE] Exact `label`/`detail` wording — finalized inline, asserted loosely (non-empty / contains key substring) in tests.

## Skeleton

_Not produced — task count (4) is below the standard-mode threshold (8)._

## Tasks

### Task 1: Write the failing unit tests (TDD red)

**Depends on:** none | **Files:** `packages/dashboard/tests/server/signals/providers/complexity-trend.test.ts`

**Skills:** none specific (no SKILLS.md found).

1. Create the test directory if needed: `packages/dashboard/tests/server/signals/providers/`.
2. Create the test file. Mirror the existing convention in `tests/server/signals/timeline-store.test.ts` (relative `../../../../src` import depth from the `providers/` subdir, `__test-tmp-*__` dir under `__dirname`, real fs writes, `beforeEach`/`afterEach` cleanup). Use exact content:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { complexityTrendProvider } from '../../../../src/server/signals/providers/complexity-trend';
   import { SignalTimelineStore } from '../../../../src/server/signals/timeline-store';
   import type { SignalContext } from '../../../../src/server/signals/types';

   function tmpDir(): string {
     return path.join(__dirname, '__test-tmp-complexity-trend__');
   }
   function archTimelinePath(root: string): string {
     return path.join(root, '.harness', 'arch', 'timeline.json');
   }
   function writeArchTimeline(root: string, snapshots: unknown[]): void {
     const p = archTimelinePath(root);
     fs.mkdirSync(path.dirname(p), { recursive: true });
     fs.writeFileSync(p, JSON.stringify({ version: 1, snapshots }, null, 2));
   }
   function snapshot(capturedAt: string, complexity: number) {
     return {
       capturedAt,
       commitHash: 'abc1234',
       stabilityScore: 50,
       metrics: { complexity: { value: complexity, violationCount: complexity } },
     };
   }
   function ctx(root: string, now: Date): SignalContext {
     return { projectPath: root, now, timeline: new SignalTimelineStore(root) };
   }

   describe('complexityTrendProvider', () => {
     let root: string;
     beforeEach(() => {
       root = tmpDir();
       fs.mkdirSync(root, { recursive: true });
     });
     afterEach(() => {
       fs.rmSync(root, { recursive: true, force: true });
     });

     it('exposes the correct static contract', () => {
       expect(complexityTrendProvider.id).toBe('complexity-trend-up-30d');
       expect(complexityTrendProvider.label.length).toBeGreaterThan(0);
     });

     it('computes value, history, and an alert trend (>=15% rise)', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [
         snapshot('2026-06-01T10:00:00.000Z', 100),
         snapshot('2026-06-22T10:00:00.000Z', 120), // +20% -> alert
       ]);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.id).toBe('complexity-trend-up-30d');
       expect(r.value).toBe(120);
       expect(r.unit).toBe('count');
       expect(r.betterDirection).toBe('down');
       expect(r.threshold).toEqual({ warn: 5, alert: 15 });
       expect(r.source).toBe('arch/timeline.json');
       expect(r.trend).toBe('up');
       expect(r.status).toBe('alert');
       expect(r.history).toEqual([
         { date: '2026-06-01', value: 100 },
         { date: '2026-06-22', value: 120 },
       ]);
     });

     it('returns warn for a 5–15% rise', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [
         snapshot('2026-06-05T10:00:00.000Z', 100),
         snapshot('2026-06-22T10:00:00.000Z', 108), // +8% -> warn
       ]);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.status).toBe('warn');
       expect(r.trend).toBe('up');
     });

     it('returns ok/down when complexity falls', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [
         snapshot('2026-06-05T10:00:00.000Z', 100),
         snapshot('2026-06-22T10:00:00.000Z', 90),
       ]);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.status).toBe('ok');
       expect(r.trend).toBe('down');
       expect(r.value).toBe(90);
     });

     it('excludes snapshots older than 30 days from the window', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [
         snapshot('2026-04-01T10:00:00.000Z', 50), // outside 30d window
         snapshot('2026-06-10T10:00:00.000Z', 100),
         snapshot('2026-06-22T10:00:00.000Z', 100), // flat in-window
       ]);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.history).toEqual([
         { date: '2026-06-10', value: 100 },
         { date: '2026-06-22', value: 100 },
       ]);
       expect(r.trend).toBe('flat');
       expect(r.status).toBe('ok');
     });

     it('handles a single in-window snapshot as flat/ok', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [snapshot('2026-06-22T10:00:00.000Z', 288)]);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.value).toBe(288);
       expect(r.trend).toBe('flat');
       expect(r.status).toBe('ok');
       expect(r.history).toEqual([{ date: '2026-06-22', value: 288 }]);
     });

     it('mirrors the current day point into the timeline store', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, [snapshot('2026-06-22T10:00:00.000Z', 288)]);
       const store = new SignalTimelineStore(root);
       await complexityTrendProvider.compute({ projectPath: root, now, timeline: store });
       expect(store.has('complexity-trend-up-30d', '2026-06-22')).toBe(true);
     });

     it('degrades to error when arch/timeline.json is missing', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
       expect(r.history).toEqual([]);
       expect(r.trend).toBe('flat');
       expect(r.detail).toContain('arch/timeline.json');
     });

     it('degrades to error on empty snapshots', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       writeArchTimeline(root, []);
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
     });

     it('degrades to error on corrupt JSON', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const p = archTimelinePath(root);
       fs.mkdirSync(path.dirname(p), { recursive: true });
       fs.writeFileSync(p, '{ not json ');
       const r = await complexityTrendProvider.compute(ctx(root, now));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard test complexity-trend` — observe failure (module not found / provider undefined). This is the expected red state.
4. Commit: `test(dashboard): add failing tests for complexity-trend signal provider`

---

### Task 2: Implement the provider (TDD green)

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/server/signals/providers/complexity-trend.ts`

**Skills:** none specific.

1. Create `packages/dashboard/src/server/signals/providers/complexity-trend.ts`. Match dashboard conventions: `@internal` doc, soft-fail (try/catch returning an error result, mirroring `gather/health.ts:53-56`), zod-validated parse of the source file (mirroring `timeline-store.ts` load pattern). Exact content:

   ```ts
   import { readFileSync, existsSync } from 'node:fs';
   import { join } from 'node:path';
   import { z } from 'zod';
   import type { SignalContext, SignalProvider, SignalPoint, SignalResult } from '../types';

   const SIGNAL_ID = 'complexity-trend-up-30d' as const;
   const LABEL = 'Complexity trend (30d)';
   const SOURCE = 'arch/timeline.json';
   const UNIT = 'count';
   const THRESHOLD = { warn: 5, alert: 15 } as const;
   const WINDOW_DAYS = 30;

   /** Shape of `.harness/arch/timeline.json` (only the fields this signal reads). */
   const ArchSnapshotSchema = z.object({
     capturedAt: z.string(),
     metrics: z.object({
       complexity: z.object({ value: z.number() }),
     }),
   });
   const ArchTimelineSchema = z.object({
     snapshots: z.array(ArchSnapshotSchema),
   });

   /** Truncate an ISO timestamp to a `YYYY-MM-DD` date string (UTC). */
   function toDate(iso: string): string {
     return iso.slice(0, 10);
   }

   /** Build a degraded `error` result that never crashes the panel. */
   function errorResult(detail: string): SignalResult {
     return {
       id: SIGNAL_ID,
       label: LABEL,
       value: null,
       unit: UNIT,
       trend: 'flat',
       betterDirection: 'down',
       status: 'error',
       threshold: { ...THRESHOLD },
       history: [],
       detail,
       source: SOURCE,
     };
   }

   /**
    * `complexity-trend-up-30d` — reads the architecture time-series at
    * `.harness/arch/timeline.json`, extracts the complexity metric per snapshot over the
    * last 30 days, and reports the current value with an up/down/flat trend and a
    * threshold status (warn +5%, alert +15% rise; healthier is `down`).
    *
    * The arch timeline is the authoritative source; the shared `SignalTimelineStore` is
    * mirrored (current day appended) for steady-state continuity but does not drive the
    * computed result. Missing/empty/corrupt source degrades to `status: 'error'` — never throws.
    *
    * @internal Called with project-resolved paths, not from HTTP input.
    */
   export const complexityTrendProvider: SignalProvider = {
     id: SIGNAL_ID,
     label: LABEL,
     async compute(ctx: SignalContext): Promise<SignalResult> {
       try {
         const filePath = join(ctx.projectPath, '.harness', 'arch', 'timeline.json');
         if (!existsSync(filePath)) {
           return errorResult(`No ${SOURCE}; run an architecture snapshot to populate it.`);
         }

         const parsed = ArchTimelineSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
         if (!parsed.success) {
           return errorResult(`Could not parse ${SOURCE}; re-run an architecture snapshot.`);
         }

         const cutoffMs = ctx.now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
         const windowed = parsed.data.snapshots
           .filter((s) => Date.parse(s.capturedAt) >= cutoffMs)
           .sort((a, b) =>
             a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0
           );

         if (windowed.length === 0) {
           return errorResult(
             `No complexity snapshots in the last ${WINDOW_DAYS} days in ${SOURCE}.`
           );
         }

         const history: SignalPoint[] = windowed.map((s) => ({
           date: toDate(s.capturedAt),
           value: s.metrics.complexity.value,
         }));

         const latest = history[history.length - 1]!.value;
         const earliest = history[0]!.value;

         let pct = 0;
         if (history.length > 1 && earliest !== 0) {
           pct = ((latest - earliest) / earliest) * 100;
         }

         const trend: SignalResult['trend'] =
           history.length < 2 || latest === earliest ? 'flat' : latest > earliest ? 'up' : 'down';

         const status: SignalResult['status'] =
           pct >= THRESHOLD.alert ? 'alert' : pct >= THRESHOLD.warn ? 'warn' : 'ok';

         // Mirror the current day's value into the shared store (steady-state continuity).
         ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), latest);

         const detail =
           history.length < 2
             ? `Complexity is ${latest}; no prior 30-day snapshot to trend against.`
             : `Complexity ${latest} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% over ${WINDOW_DAYS}d).`;

         return {
           id: SIGNAL_ID,
           label: LABEL,
           value: latest,
           unit: UNIT,
           trend,
           betterDirection: 'down',
           status,
           threshold: { ...THRESHOLD },
           history,
           detail,
           source: SOURCE,
         };
       } catch (err) {
         const message = err instanceof Error ? err.message : String(err);
         return errorResult(`Failed to read ${SOURCE}: ${message}`);
       }
     },
   };
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test complexity-trend` — observe all tests pass (green).
3. Commit: `feat(dashboard): add complexity-trend signal provider`

---

### Task 3: Typecheck and no-regression validate gate

**Depends on:** Task 2 | **Files:** none (verification only)

**Skills:** none specific.

1. Run: `pnpm --filter @harness-engineering/dashboard build` (or `typecheck` if defined) — confirm no TypeScript errors from the new files.
2. Run: `pnpm --filter @harness-engineering/dashboard test` — confirm the full dashboard test suite (incl. the new provider + existing `timeline-store.test.ts`) passes.
3. Run: `harness validate 2>&1 | grep -iE "issues|failed|passed"` — confirm finding count is **still 290** (baseline). VALIDATE POLICY = no-regression: zero new findings introduced. The new provider uses no hardcoded color strings and no design tokens, so it must not add design-token findings; the numeric thresholds `5`/`15` are plain numbers, not hex colors.
4. If the count rose above 290, identify and remove the new finding before proceeding. Do not accept any increase.
5. No commit (verification gate only).

---

### Task 4: Update session handoff and verify provider conforms to SignalProvider

**Depends on:** Task 3 | **Files:** `.harness/sessions/changes-five-signal-dashboard-panel-proposal/handoff.json` | **Category:** integration

**Skills:** none specific.

1. Confirm `complexityTrendProvider` satisfies the `SignalProvider` interface structurally (id is a `SignalId`, `compute` returns `Promise<SignalResult>`) — this is the conceptual "provider→gatherer→route" proof for this phase: a Phase-5 gatherer can push this object into the registry array and call `.compute(ctx)` with no changes. No new code; verified by the passing typecheck in Task 3.
2. Update `.harness/sessions/changes-five-signal-dashboard-panel-proposal/handoff.json` with `fromSkill: "harness-execution"`, phase `phase2-complete`, the produced file list, pending Phase-3 items, and the no-regression validate result (290).
3. Commit: `chore(signals): record phase-2 complexity-trend handoff`

---

## Sequence

1. Task 1 (tests, red) → 2. Task 2 (impl, green) → 3. Task 3 (typecheck + no-regression validate gate) → 4. Task 4 (handoff + conformance confirmation).

No parallelism (single provider, strict TDD chain). **Estimated total:** 4 tasks, ~16 minutes.

## Checkpoints

None. This phase is fully automatable: it produces one provider file and its tests, with a deterministic validate gate. No human-verify/decision/action points are required (no UI, no destructive ops, no external API calls). **Checkpoint count: 0.**

## Integration Tier Assessment

**Tier: small.**

- 2 files created, 0 modified.
- No new public exports, no barrel changes (registry wiring is Phase 5).
- No route, no client page, no `serve.ts`/`main.tsx` edits.
- No new ADR or knowledge-graph enrichment in this phase (those attach to Decision #2 / the gatherer+route work in later phases).

Per the tier heuristics, "new feature within existing package with no new exports and < 3 files" sits at the boundary of small/medium; because this phase adds **no exported surface and no registrations**, it is **small** — wiring checks only (defaults). The medium/large integration obligations (docs/standard/signals.md, the eval-fail-rate ADR, knowledge-graph concepts) are explicitly deferred to Phases 4–7 where the exports and routes land.

## Validation Notes (no-regression policy)

- Baseline captured pre-plan: `harness validate` reports **290 issues** (pre-existing design-token false-positives in `packages/graph/tests`, `packages/orchestrator`, `packages/cli/tests/drift`, and `packages/dashboard/src/client/components/chat/FindingsView.tsx`). These are baseline and out of scope.
- Phase 2 must keep this at exactly 290. Task 3 enforces the gate.

## Concerns

1. **Single-snapshot reality.** The live `.harness/arch/timeline.json` currently holds **one** snapshot, so on real data the provider returns `trend: 'flat'`, `status: 'ok'`, `value: 288` until more snapshots accrue. This is correct and tested (Task 1, single-snapshot case), but the "30-day trend" is cosmetic until the arch timeline accumulates history. Flag for the spec author: complexity trend only becomes meaningful once architecture snapshots run on a schedule.
2. **Spec wording vs. real shape.** The spec describes arch/timeline.json as "already a time-series of arch metrics" and implies a simple per-day extraction; the real shape nests complexity under `metrics.complexity.value` and is keyed by `capturedAt`/`commitHash`, not by day. Multiple snapshots could share a `YYYY-MM-DD` — the current implementation keeps each as a distinct history point (does not dedupe by day). If the panel sparkline expects at most one point per day, a Phase-5/6 follow-up should collapse same-day snapshots (last-wins). Noted; not handled here to keep the provider faithful to the source.
3. **Store mirroring is best-effort.** `appendPoint` writes to `.harness/signals/timeline.json`; if that write fails it would throw inside `compute`, but it is inside the outer try/catch, so a store failure degrades to `error` rather than crashing — acceptable, though it means a transient store-write failure masks an otherwise-valid arch reading. Acceptable for this phase; revisit if it proves noisy.
