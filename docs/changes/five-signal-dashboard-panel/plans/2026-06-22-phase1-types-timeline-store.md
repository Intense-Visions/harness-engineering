# Plan: Five-Signal Dashboard Panel — Phase 1 (Types + Timeline Store)

**Date:** 2026-06-22 | **Spec:** `docs/changes/five-signal-dashboard-panel/proposal.md` (Implementation Order item 1) | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** small

## Scope

This plan covers **Implementation Order item 1 only**: the type definitions and the
`SignalTimelineStore` service plus its unit tests. No providers, gatherer, route, or client
code — those are Phases 2–7 and are explicitly out of scope here.

## Goal

Establish the shared `signals/` type contract and a soft-failing, atomic-write timeline cache
(`SignalTimelineStore`) that later signal providers will derive into and read from.

## Observable Truths (Acceptance Criteria)

1. `packages/dashboard/src/server/signals/types.ts` exports exactly: `SignalId` (the five ids),
   `SignalStatus`, `SignalPoint`, `SignalResult`, `SignalContext`, `SignalProvider` — matching
   the spec's "Core types" section.
2. The system shall persist signal points to `.harness/signals/timeline.json` with shape
   `{ "version": 1, "signals": { "<id>": [{ "date": "YYYY-MM-DD", "value": n }] } }`.
3. When `appendPoint(id, date, value)` is called and a point for that `(id, date)` already exists,
   the system shall not modify the existing point (idempotent no-op).
4. When `backfill(id, points)` is called, the system shall merge points into existing history and
   shall not overwrite a point whose `(id, date)` already exists (never overwrite newer/existing).
5. `read(id)` returns the stored points for a signal (most-recent window), and an empty array for
   an unknown signal.
6. `has(id, date)` returns `true` iff a point for that `(id, date)` exists.
7. If `.harness/signals/timeline.json` is missing or corrupt, the system shall treat it as empty
   (soft-fail) — `read`/`has` return empty/false and no error propagates.
8. The system shall write atomically via temp file + `rename`, creating `.harness/signals/` if absent.
9. `npx vitest run` (server project) passes the new `timeline-store.test.ts` with the three
   required cases (append idempotency, backfill merge, corrupt-file soft-fail) plus supporting cases.
10. `harness validate` passes after the change.

## File Map

```
CREATE packages/dashboard/src/server/signals/types.ts
CREATE packages/dashboard/src/server/signals/timeline-store.ts
CREATE packages/dashboard/tests/server/signals/timeline-store.test.ts
```

No barrel/index changes in this phase (the spec notes "no barrel export outside the dashboard
package"; the internal `src/server/index.ts` is not touched until later phases wire the gatherer).

## Skeleton

_Not produced — task count (5) is below the standard-rigor threshold (8)._

## Conventions Anchored (evidence)

- Result-style soft-fail + atomic write + zod-validated load mirror
  `packages/core/src/security/security-timeline-manager.ts:42` (`load()` soft-fail) and
  `:76` (`save()` temp-file + `rename`).
- `@internal` "called with resolved paths, not from HTTP input" doc convention from
  `packages/dashboard/src/server/gather/health.ts:9-13`.
- Tests live in a mirrored tree under `packages/dashboard/tests/server/` (not co-located), per
  `vitest.config.mts` `server` project `include: ['tests/server/**/*.test.ts', ...]`.
- Test tmp-dir pattern (`__test-tmp-*__` under `__dirname`, `mkdirSync`/`rmSync`) from
  `packages/core/tests/security/security-timeline-manager.test.ts:9-56`.
- `zod` is already a dashboard dependency (`packages/dashboard/package.json`), used for schema
  validation of the persisted file.

## Design Notes / Resolved Uncertainties

- **[RESOLVED — circular import]** The spec's `SignalContext` references `SignalTimelineStore`, and
  `timeline-store.ts` will import its point/id types from `types.ts`. To avoid a cycle, `types.ts`
  references the store via an inline **type-only** import: `timeline: import('./timeline-store').SignalTimelineStore`
  (same technique the spec already uses for `GraphStore`). `timeline-store.ts` imports
  `SignalId` / `SignalPoint` as `import type` from `types.ts`. Type-only edges do not create a
  runtime cycle.
- **[RESOLVED — window length]** Spec says `read` returns "last 30 days." Phase 1 stores points and
  returns them; the store caps stored history at 30 points per id on write (trim oldest) so the
  file stays bounded. Providers compute windows; the store does not date-filter on read beyond the
  stored cap. Documented in the store's `@internal` doc.
- **[ASSUMPTION]** `date` strings are caller-supplied `YYYY-MM-DD`; the store treats `date` as an
  opaque key for idempotency and sorts lexicographically (valid for zero-padded ISO dates). No
  date parsing/validation beyond schema-level string check. If providers later need tz-aware
  bucketing, that is a provider concern, not the store's.
- **[DEFERRABLE]** Exact `label`/`unit`/`threshold` values per signal live in providers (Phases 2–4)
  and `signals.md` (Phase 7), not here.

## Tasks

### Task 1: Define signal types

**Depends on:** none | **Files:** `packages/dashboard/src/server/signals/types.ts`

1. Create `packages/dashboard/src/server/signals/types.ts` with exactly:

   ```ts
   import type { GraphStore } from '@harness-engineering/graph';

   export type SignalId =
     | 'pr-merged-without-multi-persona-review'
     | 'coverage-trend-down-30d'
     | 'complexity-trend-up-30d'
     | 'baseline-auto-update-count'
     | 'eval-fail-rate';

   export type SignalStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

   /** A single daily data point. `date` is `YYYY-MM-DD`. */
   export interface SignalPoint {
     date: string;
     value: number;
   }

   export interface SignalResult {
     id: SignalId;
     label: string;
     /** Current value; `null` when pending/error. */
     value: number | null;
     /** Unit suffix, e.g. '%', 'count'. */
     unit: string;
     trend: 'up' | 'down' | 'flat';
     /** Which direction is healthy; drives status color. */
     betterDirection: 'up' | 'down';
     status: SignalStatus;
     threshold: { warn: number; alert: number };
     /** Up to 30 daily points. */
     history: SignalPoint[];
     /** Human-readable one-liner. */
     detail: string;
     /** Provenance, e.g. 'arch/timeline.json'. */
     source: string;
   }

   export interface SignalContext {
     projectPath: string;
     now: Date;
     timeline: import('./timeline-store').SignalTimelineStore;
     graphStore?: GraphStore;
   }

   export interface SignalProvider {
     id: SignalId;
     label: string;
     compute(ctx: SignalContext): Promise<SignalResult>;
   }
   ```

   Note: `GraphStore` is imported as a named type from `@harness-engineering/graph`
   (exported at `packages/graph/src/index.ts:27`); `SignalTimelineStore` is referenced via an
   inline type-only import to avoid a runtime cycle with `timeline-store.ts`.

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run: `harness validate`
4. Commit: `feat(dashboard): add signals type contract`

---

### Task 2 (TDD): Write failing tests for SignalTimelineStore

**Depends on:** Task 1 | **Files:** `packages/dashboard/tests/server/signals/timeline-store.test.ts`

1. Create `packages/dashboard/tests/server/signals/timeline-store.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { SignalTimelineStore } from '../../../src/server/signals/timeline-store';

   function tmpDir(): string {
     return path.join(__dirname, '__test-tmp-signals-timeline__');
   }
   function timelinePath(root: string): string {
     return path.join(root, '.harness', 'signals', 'timeline.json');
   }

   describe('SignalTimelineStore', () => {
     let root: string;
     let store: SignalTimelineStore;

     beforeEach(() => {
       root = tmpDir();
       fs.mkdirSync(root, { recursive: true });
       store = new SignalTimelineStore(root);
     });
     afterEach(() => {
       fs.rmSync(root, { recursive: true, force: true });
     });

     describe('appendPoint() idempotency', () => {
       it('appends a new point and persists it', () => {
         store.appendPoint('complexity-trend-up-30d', '2026-06-20', 1.5);
         expect(store.read('complexity-trend-up-30d')).toEqual([
           { date: '2026-06-20', value: 1.5 },
         ]);
         expect(fs.existsSync(timelinePath(root))).toBe(true);
       });

       it('is a no-op when a point for the same (id, date) already exists', () => {
         store.appendPoint('complexity-trend-up-30d', '2026-06-20', 1.5);
         store.appendPoint('complexity-trend-up-30d', '2026-06-20', 9.9);
         expect(store.read('complexity-trend-up-30d')).toEqual([
           { date: '2026-06-20', value: 1.5 },
         ]);
       });

       it('has() reflects appended points', () => {
         store.appendPoint('baseline-auto-update-count', '2026-06-21', 2);
         expect(store.has('baseline-auto-update-count', '2026-06-21')).toBe(true);
         expect(store.has('baseline-auto-update-count', '2026-06-22')).toBe(false);
       });
     });

     describe('backfill() merge', () => {
       it('merges historical points without overwriting an existing (id, date)', () => {
         store.appendPoint('coverage-trend-down-30d', '2026-06-20', 80);
         store.backfill('coverage-trend-down-30d', [
           { date: '2026-06-18', value: 70 },
           { date: '2026-06-19', value: 75 },
           { date: '2026-06-20', value: 999 }, // existing — must NOT overwrite
         ]);
         expect(store.read('coverage-trend-down-30d')).toEqual([
           { date: '2026-06-18', value: 70 },
           { date: '2026-06-19', value: 75 },
           { date: '2026-06-20', value: 80 },
         ]);
       });
     });

     describe('soft-fail', () => {
       it('treats a missing file as empty', () => {
         expect(store.read('eval-fail-rate')).toEqual([]);
         expect(store.has('eval-fail-rate', '2026-06-20')).toBe(false);
       });

       it('treats a corrupt file as empty (no throw)', () => {
         fs.mkdirSync(path.dirname(timelinePath(root)), { recursive: true });
         fs.writeFileSync(timelinePath(root), '{ not valid json ');
         expect(() => store.read('eval-fail-rate')).not.toThrow();
         expect(store.read('eval-fail-rate')).toEqual([]);
         // A subsequent append recovers by re-deriving from empty.
         store.appendPoint('eval-fail-rate', '2026-06-20', 0.05);
         expect(store.read('eval-fail-rate')).toEqual([{ date: '2026-06-20', value: 0.05 }]);
       });
     });
   });
   ```

2. Run: `npx vitest run tests/server/signals/timeline-store.test.ts` (from `packages/dashboard`)
   — observe failure (module `timeline-store` does not exist yet).
3. Do not commit yet (red state); proceed to Task 3.

---

### Task 3 (TDD): Implement SignalTimelineStore

**Depends on:** Task 2 | **Files:** `packages/dashboard/src/server/signals/timeline-store.ts`

1. Create `packages/dashboard/src/server/signals/timeline-store.ts`:

   ```ts
   import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
   import { randomBytes } from 'node:crypto';
   import { join, dirname } from 'node:path';
   import { z } from 'zod';
   import type { SignalId, SignalPoint } from './types';

   const MAX_POINTS_PER_SIGNAL = 30;

   const SignalPointSchema = z.object({
     date: z.string(),
     value: z.number(),
   });

   const TimelineFileSchema = z.object({
     version: z.literal(1),
     signals: z.record(z.string(), z.array(SignalPointSchema)),
   });

   type TimelineFile = z.infer<typeof TimelineFileSchema>;

   function emptyFile(): TimelineFile {
     return { version: 1, signals: {} };
   }

   /**
    * Daily-point cache for time-series signals, persisted to
    * `.harness/signals/timeline.json`.
    *
    * Tolerates a missing/corrupt file by treating it as empty (soft-fail) so a bad
    * cache never blocks the panel — providers simply re-derive. Writes atomically via
    * temp file + rename. Caps each signal's history at 30 points (oldest trimmed).
    *
    * @internal Called with project-resolved paths, not from HTTP input.
    */
   export class SignalTimelineStore {
     private readonly timelinePath: string;

     constructor(rootDir: string) {
       this.timelinePath = join(rootDir, '.harness', 'signals', 'timeline.json');
     }

     /** Stored points for a signal (up to 30, oldest→newest). Empty for unknown ids. */
     read(id: SignalId): SignalPoint[] {
       const file = this.load();
       return file.signals[id] ?? [];
     }

     /** True iff a point for `(id, date)` exists. */
     has(id: SignalId, date: string): boolean {
       return this.read(id).some((p) => p.date === date);
     }

     /** Append a daily point. Idempotent: no-op if `(id, date)` already exists. */
     appendPoint(id: SignalId, date: string, value: number): void {
       const file = this.load();
       const points = file.signals[id] ?? [];
       if (points.some((p) => p.date === date)) return;
       points.push({ date, value });
       file.signals[id] = this.normalize(points);
       this.save(file);
     }

     /** One-time seed of historical points. Merge — never overwrite an existing `(id, date)`. */
     backfill(id: SignalId, points: SignalPoint[]): void {
       const file = this.load();
       const existing = file.signals[id] ?? [];
       const seen = new Set(existing.map((p) => p.date));
       for (const p of points) {
         if (!seen.has(p.date)) {
           existing.push({ date: p.date, value: p.value });
           seen.add(p.date);
         }
       }
       file.signals[id] = this.normalize(existing);
       this.save(file);
     }

     /** Sort by date ascending and cap to the most recent MAX_POINTS_PER_SIGNAL. */
     private normalize(points: SignalPoint[]): SignalPoint[] {
       const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
       return sorted.length > MAX_POINTS_PER_SIGNAL
         ? sorted.slice(sorted.length - MAX_POINTS_PER_SIGNAL)
         : sorted;
     }

     /** Load from disk; empty on missing/corrupt/invalid (soft-fail). */
     private load(): TimelineFile {
       if (!existsSync(this.timelinePath)) return emptyFile();
       try {
         const parsed = TimelineFileSchema.safeParse(JSON.parse(readFileSync(this.timelinePath, 'utf-8')));
         return parsed.success ? parsed.data : emptyFile();
       } catch {
         return emptyFile();
       }
     }

     /** Atomic write: temp file + rename, creating the directory if absent. */
     private save(file: TimelineFile): void {
       const dir = dirname(this.timelinePath);
       if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
       const tmp = `${this.timelinePath}.${randomBytes(4).toString('hex')}.tmp`;
       writeFileSync(tmp, JSON.stringify(file, null, 2));
       renameSync(tmp, this.timelinePath);
     }
   }
   ```

2. Run: `npx vitest run tests/server/signals/timeline-store.test.ts` (from `packages/dashboard`)
   — observe all tests pass.
3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Run: `harness validate`
5. Commit: `feat(dashboard): add SignalTimelineStore with soft-fail cache`

---

### Task 4: Full server test-suite gate

**Depends on:** Task 3 | **Files:** none (verification only)

1. Run the dashboard server project to confirm no regressions from the new module:
   `npx vitest run --project server` (from `packages/dashboard`).
2. If any failure traces to the new files, fix and re-run before proceeding.
3. No commit (verification task). If a fix was required, fold it into the relevant prior commit
   via `git commit --amend` only if not yet pushed; otherwise a new `fix(dashboard): ...` commit.

---

### Task 5: Lint + final validate

**Depends on:** Task 4 | **Files:** none (verification only)

1. Run: `pnpm --filter @harness-engineering/dashboard lint`
2. Run: `harness validate`
3. Run: `harness check-deps` (the new files add imports: `zod`, `@harness-engineering/graph`
   type, node builtins — confirm no new disallowed cross-package edges).
4. No code changes expected. If lint reports fixable issues in the new files, apply and amend the
   relevant commit; commit message scope `style(dashboard): ...` only if a standalone commit is needed.

## Sequencing

1. Task 1 (types) — no deps; the contract everything references.
2. Task 2 (failing tests) — depends on Task 1 (imports types indirectly via the store module path).
3. Task 3 (implementation) — depends on Task 2; turns red → green.
4. Task 4 (suite gate) — depends on Task 3.
5. Task 5 (lint + validate) — depends on Task 4.

No parallelism within Phase 1 (linear TDD chain). Estimated total: ~22 minutes.

## Checkpoints

None. Phase 1 is mechanical, fully specified, and verifiable by automated tests; no human-verify,
decision, or human-action gates are required.

## Integration Tier Assessment

**small.** Phase 1 creates 3 files (one type module, one service, one test) within an existing
package, adds **no** new exports outside the package, registers nothing, and changes no routing or
docs. Per the tier heuristics (< 3 production files, no new public surface, no registrations), this
is wiring-checks-only. The larger feature's medium/large integration work (route registration,
`SYSTEM_PAGE_COMPONENTS`, `/` redirect, `signals.md`, the `execution_outcome` ADR, graph
enrichment) all lands in Phases 5–7 and is out of scope here.

## Traceability (truth → task)

| Observable truth | Delivered by |
|---|---|
| 1 (types exported) | Task 1 |
| 2 (file shape) | Task 3 (`TimelineFileSchema`, `save`) |
| 3 (append idempotency) | Task 2 test + Task 3 `appendPoint` |
| 4 (backfill merge, no overwrite) | Task 2 test + Task 3 `backfill` |
| 5 (read / unknown empty) | Task 2 test + Task 3 `read` |
| 6 (has) | Task 2 test + Task 3 `has` |
| 7 (corrupt/missing soft-fail) | Task 2 test + Task 3 `load` |
| 8 (atomic write + mkdir) | Task 3 `save` |
| 9 (vitest passes) | Tasks 3, 4 |
| 10 (harness validate) | Tasks 1, 3, 5 |
