# Plan: Phase 3 — Git-Derived Signal Providers

**Date:** 2026-06-22 | **Spec:** docs/changes/five-signal-dashboard-panel/proposal.md (Implementation Order item 3) | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium | **Rigor:** standard | **Validate policy:** no-regression (baseline 290; zero new findings)

## Goal

Ship the two git/gh-derived signal providers — `baseline-auto-update-count` (`baseline-updates.ts`) and `pr-merged-without-multi-persona-review` (`pr-review.ts`) — with a shared injectable command-runner and full unit tests, matching the established Phase-1/2 signal patterns. No gatherer/route/client (Phases 5-6).

## Observable Truths (Acceptance Criteria)

1. The system shall expose `baselineUpdatesProvider` with `id: 'baseline-auto-update-count'`, `betterDirection: 'down'`, `threshold: { warn: 1, alert: 5 }`, `unit: 'count'`.
2. When given a 30-day git log of `*-baselines.json` commits, the provider shall count only commits authored by `github-actions[bot]` whose message begins `chore: refresh baselines` (excluding human baseline commits), bucket them by `YYYY-MM-DD`, and report the 30-day total as `value`.
3. The system shall expose `prReviewProvider` with `id: 'pr-merged-without-multi-persona-review'`, `betterDirection: 'down'`, `threshold: { warn: 1, alert: 3 }`, `unit: 'count'`.
4. When given a list of PRs merged in the last 30 days, the provider shall count those whose merged PR carries no review whose body contains the multi-persona-review assessment marker (`## Assessment:`), and report that count as `value`.
5. If `gh` (or the injected runner) is unavailable or errors, then `prReviewProvider` shall return `status: 'error'` with `value: null` and shall not throw.
6. Both providers shall mirror the current day's count into `SignalTimelineStore` via `appendPoint`, and shall backfill the derived 30-day daily buckets via `backfill` exactly once (idempotent on re-run).
7. Both providers shall apply status thresholds: `value >= alert -> 'alert'`, `value >= warn -> 'warn'`, else `'ok'`.
8. The system shall provide a reusable `CommandRunner` type and default `execFile`-based implementation under `signals/`, injectable through `SignalContext.runCommand` (optional; defaulted per-provider so existing `SignalContext` callers are unaffected).
9. `harness validate` shall report no more than 290 issues (no new findings) after the change.

## Discovery (verified against the live repo)

- **[VERIFIED] Baseline auto-update commits** (`git log --since=90.days -- '*-baselines.json'`): authored by `github-actions[bot]` (`github-actions[bot]@users.noreply.github.com` / `41898282+github-actions[bot]@users.noreply.github.com`), message exactly `chore: refresh baselines after merge [skip ci]` (optional ` (#NNN)` PR suffix). Produced by `.github/workflows/ci.yml` "Commit refreshed baselines" step (lines ~146-167), staging `.harness/arch/baselines.json`, `packages/cli/.harness/arch/baselines.json`, `coverage-baselines.json`, `benchmark-baselines.json`. Detection key = author `github-actions[bot]` AND message prefix `chore: refresh baselines`. Older human "chore: refresh/update baselines" commits by `Chad Warner` exist and MUST be excluded by the author+message conjunction.
- **[VERIFIED] Multi-persona review recording**: "multi-persona" appears only in the spec/types/roadmap. The mechanism is the review pipeline in `packages/core/src/review/` (fans out to reviewer personas/domains via `fan-out.ts` + `agents/`), invoked by `harness agent review` (`packages/cli/src/commands/agent/review.ts`). It posts to GitHub as a PR review whose summary body (`formatGitHubSummary`, `packages/core/src/review/output/format-github.ts`) contains `## Assessment: Approve|Comment|Request Changes` plus `## Strengths` / `## Issues`. **There is no commit trailer, no `.harness/` review-record artifact, and no CI step** recording review firing. Therefore the only reliable signal is the gh PR-reviews API; git-local has no signal. This is exactly why the spec mandates `status: 'error'` when gh is unavailable.
- **[VERIFIED] Shell-out convention**: `packages/dashboard/src/server/identity.ts` already wraps `execFile` (node:child_process) in a promisified `execAsync(cmd, args)` with a timeout, and `routes/actions.ts` uses `spawn`. The new `CommandRunner` mirrors `identity.ts` (`execFile`, args array, timeout) — the established dashboard pattern.
- **[VERIFIED] Test layout**: tests live in `packages/dashboard/tests/server/signals/providers/`, colocated-by-mirror, vitest, fs-tmpdir per test (see `complexity-trend.test.ts`). Runner: `vitest run` (`packages/dashboard/package.json`).
- **[VERIFIED] Baseline**: `harness validate` = 290 issues pre-change (all pre-existing design-token/spacing findings unrelated to signals).

## File Map

- CREATE `packages/dashboard/src/server/signals/command-runner.ts`
- MODIFY `packages/dashboard/src/server/signals/types.ts` (add optional `runCommand` to `SignalContext`, export `CommandRunner` type re-export)
- CREATE `packages/dashboard/src/server/signals/providers/baseline-updates.ts`
- CREATE `packages/dashboard/src/server/signals/providers/pr-review.ts`
- CREATE `packages/dashboard/tests/server/signals/command-runner.test.ts`
- CREATE `packages/dashboard/tests/server/signals/providers/baseline-updates.test.ts`
- CREATE `packages/dashboard/tests/server/signals/providers/pr-review.test.ts`

## Skeleton

1. Command-runner abstraction + `SignalContext` wiring (~3 tasks, ~12 min)
2. `baseline-updates` provider with TDD (~2 tasks, ~9 min)
3. `pr-review` provider with TDD + degradation (~3 tasks, ~14 min)
4. Final validation + handoff (~1 task, ~3 min)

**Estimated total:** 9 tasks, ~38 minutes. _Skeleton approved: pending sign-off._

## Uncertainties

- [ASSUMPTION] Multi-persona "fired" is detected by a merged PR having at least one review whose body contains the `## Assessment:` marker emitted by `formatGitHubSummary`. If the pipeline later changes its comment header, `MARKER` (a single const) is the one place to update. Documented in `pr-review.ts`.
- [ASSUMPTION] PR enumeration uses `gh pr list --state merged --search "merged:>=<cutoff>" --json number,mergedAt,reviews` (single call returns reviews inline), avoiding N+1 gh calls. If a runtime gh version lacks `reviews` in `pr list`, the provider degrades to `error` (truth #5) — no crash.
- [DEFERRABLE] gh-response caching via `gather-cache.ts` is a Phase-5 gatherer concern; Phase 3 keeps the provider pure over an injected runner. Daily-count caching is via `SignalTimelineStore` here.
- [DEFERRABLE] Exact `detail` wording.

## Tasks

### Task 1: Define the `CommandRunner` abstraction and default impl

**Depends on:** none | **Files:** `packages/dashboard/src/server/signals/command-runner.ts`, `packages/dashboard/tests/server/signals/command-runner.test.ts`

1. Create `command-runner.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     defaultCommandRunner,
     type CommandRunner,
   } from '../../../../src/server/signals/command-runner';

   describe('defaultCommandRunner', () => {
     it('runs a command and returns trimmed stdout', async () => {
       const out = await defaultCommandRunner('node', ['-e', 'process.stdout.write("hi\\n")']);
       expect(out).toBe('hi');
     });
     it('rejects when the command exits non-zero', async () => {
       await expect(defaultCommandRunner('node', ['-e', 'process.exit(3)'])).rejects.toBeInstanceOf(
         Error
       );
     });
     it('satisfies the CommandRunner type', () => {
       const r: CommandRunner = defaultCommandRunner;
       expect(typeof r).toBe('function');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals/command-runner.test.ts` — observe failure (module missing).
3. Create `command-runner.ts` (mirror `identity.ts` execAsync):

   ```ts
   import { execFile } from 'node:child_process';

   /**
    * Injectable runner for shelling out to git/gh. Returns trimmed stdout; rejects
    * on non-zero exit or spawn error. Mirrors the execFile pattern in
    * `server/identity.ts`. Providers depend on this type so tests can pass a mock
    * runner instead of touching the real git/gh binaries or the network.
    */
   export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

   /** Default `execFile`-based runner with a 5s timeout. */
   export const defaultCommandRunner: CommandRunner = (cmd, args) =>
     new Promise<string>((resolve, reject) => {
       execFile(cmd, args, { timeout: 5_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
         if (err) {
           reject(err as Error);
           return;
         }
         resolve(stdout.trim());
       });
     });
   ```

4. Run the test — observe pass.
5. Run: `harness validate` (expect <= 290).
6. Commit: `feat(dashboard): add injectable CommandRunner for signal providers`

### Task 2: Wire optional `runCommand` into `SignalContext`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/server/signals/types.ts`

1. In `types.ts`, add an import-type and an optional field on `SignalContext` (keep existing fields unchanged):
   ```ts
   import type { CommandRunner } from './command-runner';
   // ...
   export interface SignalContext {
     projectPath: string;
     now: Date;
     timeline: import('./timeline-store').SignalTimelineStore;
     graphStore?: GraphStore;
     /** Injectable git/gh runner. Defaults to `defaultCommandRunner` per-provider when absent. */
     runCommand?: CommandRunner;
   }
   ```
   Also re-export the type for downstream consumers: `export type { CommandRunner } from './command-runner';`
2. Confirm no existing consumer breaks: the field is optional, so `complexity-trend.ts` and its tests (which build `SignalContext` without `runCommand`) compile unchanged.
3. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals` — observe existing Phase-1/2 tests still pass.
4. Run: `harness validate` (expect <= 290).
5. Commit: `feat(dashboard): add optional runCommand to SignalContext`

### Task 3: Write failing tests for `baseline-updates` provider

**Depends on:** Task 2 | **Files:** `packages/dashboard/tests/server/signals/providers/baseline-updates.test.ts`

1. Create the test using a mock `CommandRunner` that returns a canned `git log` payload. Use a NUL-delimited record format the provider will request (`--pretty=format:%H%x1f%an%x1f%s%x1e`), so commits parse unambiguously.

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { baselineUpdatesProvider } from '../../../../src/server/signals/providers/baseline-updates';
   import { SignalTimelineStore } from '../../../../src/server/signals/timeline-store';
   import type { SignalContext, CommandRunner } from '../../../../src/server/signals/types';

   const RS = ''; // record separator
   const US = ''; // unit separator
   function logRecord(hash: string, author: string, subject: string, date: string) {
     // provider asks git for hash, author, subject, and committer date (YYYY-MM-DD)
     return [hash, author, subject, date].join(US);
   }
   function gitLog(records: string[]): string {
     return records.join(RS) + (records.length ? RS : '');
   }
   function tmpDir() {
     return path.join(__dirname, '__test-tmp-baseline-updates__');
   }
   function ctx(root: string, now: Date, runCommand: CommandRunner): SignalContext {
     return { projectPath: root, now, timeline: new SignalTimelineStore(root), runCommand };
   }

   describe('baselineUpdatesProvider', () => {
     let root: string;
     beforeEach(() => {
       root = tmpDir();
       fs.mkdirSync(root, { recursive: true });
     });
     afterEach(() => {
       fs.rmSync(root, { recursive: true, force: true });
     });

     it('exposes the correct static contract', () => {
       expect(baselineUpdatesProvider.id).toBe('baseline-auto-update-count');
       expect(baselineUpdatesProvider.label.length).toBeGreaterThan(0);
     });

     it('counts only github-actions[bot] refresh-baselines commits in the 30d window', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const runner: CommandRunner = async () =>
         gitLog([
           logRecord(
             'a1',
             'github-actions[bot]',
             'chore: refresh baselines after merge [skip ci] (#578)',
             '2026-06-20'
           ),
           logRecord(
             'a2',
             'github-actions[bot]',
             'chore: refresh baselines after merge [skip ci]',
             '2026-06-18'
           ),
           logRecord('h1', 'Chad Warner', 'chore: refresh baselines for copy-craft', '2026-06-17'), // human -> excluded
           logRecord('m1', 'github-actions[bot]', 'chore: bump deps', '2026-06-16'), // wrong msg -> excluded
         ]);
       const r = await baselineUpdatesProvider.compute(ctx(root, now, runner));
       expect(r.id).toBe('baseline-auto-update-count');
       expect(r.value).toBe(2);
       expect(r.unit).toBe('count');
       expect(r.betterDirection).toBe('down');
       expect(r.threshold).toEqual({ warn: 1, alert: 5 });
       expect(r.status).toBe('warn'); // 2 >= warn(1), < alert(5)
     });

     it('returns ok at zero and alert at >=5', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const none: CommandRunner = async () => gitLog([]);
       expect((await baselineUpdatesProvider.compute(ctx(root, now, none))).status).toBe('ok');
       const many: CommandRunner = async () =>
         gitLog(
           Array.from({ length: 5 }, (_, i) =>
             logRecord(
               `b${i}`,
               'github-actions[bot]',
               'chore: refresh baselines after merge [skip ci]',
               `2026-06-1${i}`
             )
           )
         );
       const r = await baselineUpdatesProvider.compute(ctx(root, now, many));
       expect(r.value).toBe(5);
       expect(r.status).toBe('alert');
     });

     it('backfills daily buckets and mirrors the current day into the timeline store', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const store = new SignalTimelineStore(root);
       const runner: CommandRunner = async () =>
         gitLog([
           logRecord(
             'a1',
             'github-actions[bot]',
             'chore: refresh baselines after merge [skip ci]',
             '2026-06-20'
           ),
         ]);
       await baselineUpdatesProvider.compute({
         projectPath: root,
         now,
         timeline: store,
         runCommand: runner,
       });
       expect(store.has('baseline-auto-update-count', '2026-06-20')).toBe(true); // backfilled bucket
       expect(store.has('baseline-auto-update-count', '2026-06-22')).toBe(true); // current-day mirror
     });

     it('degrades to error (no throw) when git is unavailable', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const boom: CommandRunner = async () => {
         throw new Error('git not found');
       };
       const r = await baselineUpdatesProvider.compute(ctx(root, now, boom));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
       expect(r.history).toEqual([]);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals/providers/baseline-updates.test.ts` — observe failure (module missing).
3. Do not implement yet.

### Task 4: Implement `baseline-updates` provider

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/server/signals/providers/baseline-updates.ts`

1. Create `baseline-updates.ts`. Follow the `complexity-trend.ts` structure (module consts, `errorResult` helper, try/catch wrapping, mirror via `appendPoint`). Derive via the injected runner; default to `defaultCommandRunner`.
   - Const block: `SIGNAL_ID='baseline-auto-update-count'`, `LABEL='Baseline auto-updates (30d)'`, `SOURCE="git log -- '*-baselines.json'"`, `UNIT='count'`, `THRESHOLD={ warn: 1, alert: 5 }`, `WINDOW_DAYS=30`, `BOT_AUTHOR='github-actions[bot]'`, `MSG_PREFIX='chore: refresh baselines'`, `RS=''`, `US=''`.
   - Command: `runCommand('git', ['log', `--since=${WINDOW_DAYS}.days`, '--no-merges', `--pretty=format:%H${US}%an${US}%s${US}%cd`, '--date=short', '--', '*-baselines.json'])`.
   - Parse: split on `RS`, drop empties, split each on `US` into `[hash, author, subject, date]`.
   - Filter: `author === BOT_AUTHOR && subject.startsWith(MSG_PREFIX)`.
   - Bucket: `Map<date, count>` over filtered commits; build `history: SignalPoint[]` sorted ascending; `value = sum of counts`.
   - `backfill(SIGNAL_ID, history)` then `appendPoint(SIGNAL_ID, toDate(now), value)` (current-day mirror; idempotent).
   - Status: `value >= alert ? 'alert' : value >= warn ? 'warn' : 'ok'`. `trend`: compare last bucket vs first (`flat` when <2 buckets). `betterDirection: 'down'`.
   - Wrap everything in try/catch returning `errorResult(...)` (value `null`, history `[]`, status `'error'`) on any throw — including runner rejection.
   - JSDoc `@internal` note matching `complexity-trend.ts`; document the verified author/message detection key and that `*-baselines.json` covers arch + coverage + benchmark baselines.
2. Run the Task-3 test — observe all pass.
3. Run: `harness validate` (expect <= 290).
4. Run: `harness check-deps` — confirm no new circular dep involving `signals/`.
5. Commit: `feat(dashboard): add baseline-auto-update-count signal provider`

### Task 5: Write failing tests for `pr-review` provider

**Depends on:** Task 2 | **Files:** `packages/dashboard/tests/server/signals/providers/pr-review.test.ts`

1. Create the test with a mock runner returning a canned `gh pr list ... --json` payload. The provider calls a single gh command; the mock asserts the count of merged PRs lacking a review whose body contains the `## Assessment:` marker.

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { prReviewProvider } from '../../../../src/server/signals/providers/pr-review';
   import { SignalTimelineStore } from '../../../../src/server/signals/timeline-store';
   import type { SignalContext, CommandRunner } from '../../../../src/server/signals/types';

   function tmpDir() {
     return path.join(__dirname, '__test-tmp-pr-review__');
   }
   function ctx(root: string, now: Date, runCommand: CommandRunner): SignalContext {
     return { projectPath: root, now, timeline: new SignalTimelineStore(root), runCommand };
   }
   function ghPayload(
     prs: Array<{ number: number; mergedAt: string; reviews: Array<{ body: string }> }>
   ) {
     return JSON.stringify(prs);
   }
   const REVIEWED = { body: '## Strengths\nlooks good\n## Assessment: Approve' };
   const PLAIN = { body: 'lgtm' };

   describe('prReviewProvider', () => {
     let root: string;
     beforeEach(() => {
       root = tmpDir();
       fs.mkdirSync(root, { recursive: true });
     });
     afterEach(() => {
       fs.rmSync(root, { recursive: true, force: true });
     });

     it('exposes the correct static contract', () => {
       expect(prReviewProvider.id).toBe('pr-merged-without-multi-persona-review');
       expect(prReviewProvider.label.length).toBeGreaterThan(0);
     });

     it('counts merged PRs lacking a multi-persona review assessment marker', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const runner: CommandRunner = async () =>
         ghPayload([
           { number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [REVIEWED] }, // reviewed -> not counted
           { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] }, // no marker -> counted
           { number: 3, mergedAt: '2026-06-18T10:00:00Z', reviews: [] }, // no reviews -> counted
         ]);
       const r = await prReviewProvider.compute(ctx(root, now, runner));
       expect(r.id).toBe('pr-merged-without-multi-persona-review');
       expect(r.value).toBe(2);
       expect(r.betterDirection).toBe('down');
       expect(r.threshold).toEqual({ warn: 1, alert: 3 });
       expect(r.status).toBe('warn'); // 2 >= warn(1), < alert(3)
     });

     it('returns ok at zero and alert at >=3', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const allReviewed: CommandRunner = async () =>
         ghPayload([{ number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [REVIEWED] }]);
       expect((await prReviewProvider.compute(ctx(root, now, allReviewed))).status).toBe('ok');
       const threeBad: CommandRunner = async () =>
         ghPayload([
           { number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [] },
           { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] },
           { number: 3, mergedAt: '2026-06-18T10:00:00Z', reviews: [] },
         ]);
       const r = await prReviewProvider.compute(ctx(root, now, threeBad));
       expect(r.value).toBe(3);
       expect(r.status).toBe('alert');
     });

     it('mirrors and backfills daily buckets into the timeline store', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const store = new SignalTimelineStore(root);
       const runner: CommandRunner = async () =>
         ghPayload([{ number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] }]);
       await prReviewProvider.compute({
         projectPath: root,
         now,
         timeline: store,
         runCommand: runner,
       });
       expect(store.has('pr-merged-without-multi-persona-review', '2026-06-19')).toBe(true);
       expect(store.has('pr-merged-without-multi-persona-review', '2026-06-22')).toBe(true);
     });

     it('degrades to error (no throw) when gh is unavailable', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const boom: CommandRunner = async () => {
         throw new Error('gh: command not found');
       };
       const r = await prReviewProvider.compute(ctx(root, now, boom));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
       expect(r.history).toEqual([]);
       expect(r.detail.toLowerCase()).toContain('gh');
     });

     it('degrades to error on unparseable gh output', async () => {
       const now = new Date('2026-06-22T00:00:00.000Z');
       const garbage: CommandRunner = async () => 'not json';
       const r = await prReviewProvider.compute(ctx(root, now, garbage));
       expect(r.status).toBe('error');
       expect(r.value).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals/providers/pr-review.test.ts` — observe failure (module missing).
3. Do not implement yet.

### Task 6: Implement `pr-review` provider

**Depends on:** Task 5 | **Files:** `packages/dashboard/src/server/signals/providers/pr-review.ts`

1. Create `pr-review.ts`, mirroring `complexity-trend.ts` structure with the injected runner (default `defaultCommandRunner`).
   - Const block: `SIGNAL_ID='pr-merged-without-multi-persona-review'`, `LABEL='PRs merged without multi-persona review (30d)'`, `SOURCE='gh pr list (merged, 30d)'`, `UNIT='count'`, `THRESHOLD={ warn: 1, alert: 3 }`, `WINDOW_DAYS=30`, `ASSESSMENT_MARKER='## Assessment:'`.
   - Compute `cutoffDate = toDate(new Date(now - 30d))`.
   - Command: `runCommand('gh', ['pr', 'list', '--state', 'merged', '--limit', '200', '--search', `merged:>=${cutoffDate}`, '--json', 'number,mergedAt,reviews'])`.
   - Parse with a zod schema: array of `{ number, mergedAt, reviews: { body }[] }`. On parse failure or non-array, return `errorResult('Could not parse gh PR list output; ensure gh is authenticated.')`.
   - Filter to PRs with `mergedAt` within the window. For each, "reviewed" iff some `review.body.includes(ASSESSMENT_MARKER)`. Count the NOT-reviewed ones.
   - Bucket the not-reviewed PRs by `toDate(mergedAt)` into `history: SignalPoint[]`; `value = total`.
   - `backfill(SIGNAL_ID, history)` then `appendPoint(SIGNAL_ID, toDate(now), value)`.
   - Status/trend/betterDirection as in baseline provider (`betterDirection: 'down'`).
   - try/catch wrapping returns `errorResult('gh unavailable or not authenticated: <msg>')` on any throw (runner rejection included) — truth #5.
   - JSDoc: document the verified detection contract — multi-persona review is recorded only as a gh PR review whose body carries the `## Assessment:` marker from `core/src/review/output/format-github.ts`; there is no git-local signal, hence gh is the sole source and unavailability degrades to `error`. Single gh call (reviews inline) to avoid N+1.
2. Run the Task-5 test — observe all pass.
3. Run: `harness validate` (expect <= 290).
4. Run: `harness check-deps` — confirm no new circular dep.
5. Commit: `feat(dashboard): add pr-merged-without-multi-persona-review signal provider`

### Task 7: Cross-check 30-day window edge in both providers

**Depends on:** Task 4, Task 6 | **Files:** `packages/dashboard/tests/server/signals/providers/baseline-updates.test.ts`, `packages/dashboard/tests/server/signals/providers/pr-review.test.ts`

1. Add one window-boundary test to each file: a PR/commit dated just outside 30 days is excluded from the count and history. For `baseline-updates`, rely on the provider passing `--since=30.days` to git (mock returns only in-window records — assert the provider does not double-count). For `pr-review`, include a PR with `mergedAt` older than the cutoff and assert it is filtered out of both `value` and `history`.
   ```ts
   // pr-review.test.ts addition
   it('excludes PRs merged outside the 30-day window', async () => {
     const now = new Date('2026-06-22T00:00:00.000Z');
     const runner: CommandRunner = async () =>
       JSON.stringify([
         { number: 9, mergedAt: '2026-04-01T10:00:00Z', reviews: [] }, // outside window
         { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [{ body: 'lgtm' }] },
       ]);
     const r = await prReviewProvider.compute(ctx(root, now, runner));
     expect(r.value).toBe(1);
     expect(r.history.some((p) => p.date === '2026-04-01')).toBe(false);
   });
   ```
   ```ts
   // baseline-updates.test.ts addition: assert provider requests --since=30.days
   it('requests git log scoped to a 30-day window over *-baselines.json', async () => {
     const now = new Date('2026-06-22T00:00:00.000Z');
     let capturedArgs: string[] = [];
     const runner: CommandRunner = async (_cmd, args) => {
       capturedArgs = args;
       return '';
     };
     await baselineUpdatesProvider.compute(ctx(root, now, runner));
     expect(capturedArgs).toContain('--since=30.days');
     expect(capturedArgs).toContain('*-baselines.json');
   });
   ```
2. Run both provider test files — observe pass.
3. Run: `harness validate` (expect <= 290).
4. Commit: `test(dashboard): cover 30-day window edges for git-derived signals`

### Task 8: Full dashboard test sweep + no-regression validate

**Depends on:** Task 7 | **Files:** none (verification)

1. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals` — all Phase 1/2/3 signal tests pass.
2. Run: `pnpm --filter @harness-engineering/dashboard build` — typecheck clean (confirms `SignalContext` change and providers compile under the package's tsconfig).
3. Run: `harness validate` and confirm the issue count is **<= 290** (no-regression). If it rose, fix the new finding before proceeding — do not touch pre-existing 290.
4. Run: `harness check-deps` — confirm no new circular dependency introduced by `signals/`.
5. No commit (verification only); if build surfaced a fix, commit it as `fix(dashboard): <description>`.

### Task 9: Update knowledge graph with the CommandRunner pattern

**Depends on:** Task 8 | **Files:** knowledge graph (via tooling) | **Category:** integration

1. [checkpoint:human-verify] The spec's Knowledge Impact calls out the `SignalProvider` pattern entering the graph. The Phase-3-specific addition is the **injectable `CommandRunner`** — the dashboard convention for shelling out to git/gh under test isolation. Surface it for human confirmation that it belongs in the graph now vs. deferred to the Phase 5-7 integration pass.
2. If confirmed, enrich the graph with a concept node for "injectable CommandRunner for signal providers" referencing `packages/dashboard/src/server/signals/command-runner.ts` and the `identity.ts` precedent. If deferred, note it in the handoff `pending` for the integration phase.
3. Run: `harness validate` (expect <= 290).
4. Commit (only if the graph changed): `chore(graph): record CommandRunner signal pattern`

## Sequencing & Parallelism

- Task 1 -> Task 2 are strictly ordered (runner before context wiring).
- After Task 2: the `baseline-updates` track (Tasks 3-4) and the `pr-review` track (Tasks 5-6) touch disjoint files and are parallelizable.
- Task 7 joins both tracks; Task 8 verifies; Task 9 is the integration checkpoint.

## Notes

- **No-regression discipline:** every task runs `harness validate` and must keep the count at <= 290. The new files are TS providers + tests in `packages/dashboard` — none touch the design-token/spacing rule surfaces that produce the 290 pre-existing findings.
- **No network in tests:** all git/gh interaction is behind the injected `CommandRunner`; every test supplies a mock. The default `execFile` runner is exercised only against `node -e` in `command-runner.test.ts`.
- **Out of scope (Phases 5-6):** `gather/signals.ts`, `routes/signals.ts`, `serve.ts` registration, `gather-cache.ts` gh caching, client panel. The gatherer will pass `runCommand` (or omit it to use the default) when constructing `SignalContext`.
