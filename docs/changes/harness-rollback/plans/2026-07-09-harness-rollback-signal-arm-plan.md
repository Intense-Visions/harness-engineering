# Plan: harness:rollback — Phase 3 (Signal arm live)

**Date:** 2026-07-09 | **Spec:** docs/changes/harness-rollback/proposal.md (Implementation Order #3) | **Tasks:** 11 | **Time:** ~42 min | **Integration Tier:** medium

## Goal

A scheduled sweep reads `.harness/signals/timeline.json`, detects each configured `rollback.signals` threshold crossing within its window, resolves the PR(s) merged in that window, and invokes the existing `runRollbackEvaluate` path with `--trigger signal` — all driven by `harness rollback sweep` and wired to a propose-only `.github/workflows/rollback-propose.yml` (post-merge eval trigger present but self-gated dark).

## Scope

This plan covers **only** Implementation Order #3 from the spec: `rollback.signals` sweep logic, `window` format validation (carried Phase-1 finding #5), and the `rollback-propose.yml` workflow.

Phases 1 and 2 are DONE and committed: `packages/core/src/rollback/*`, `packages/cli/src/commands/rollback.ts` (`runRollbackEvaluate`, `createRollbackCommand`, `createGhSeam`), `packages/cli/src/rollback/{io.ts,compose.ts,breadcrumb.ts}`, and the `rollback` config block (`RollbackSignalRuleSchema`, `RollbackConfigSchema`) in `packages/cli/src/config/schema.ts`. This plan builds the `sweep` subcommand on top of `runRollbackEvaluate` without changing its signature.

**Out of scope (Phase 4, do NOT plan):** the `harness:rollback` skill + 4 platform copies, the trust-model ADR, AGENTS.md / reference-doc regen, the SDLC-coverage `gap → partial` doc update, and actually enabling the eval arm (`rollback.evalTrigger.enabled` stays `false`).

**Optional Phase-2-review polish** (spec says include only if cheap): folded into Task 10 as a single small commit, with each item individually droppable — (a) collapse the two `gh` lookups in `compose.ts`/`rollback.ts` into one, (b) validate `--pr` numeric at parse time, (c) thread a single `ts` through breadcrumb + graph-link. If any is not cheap at execution time, note it deferred in the commit body and move on.

## Observable Truths (Acceptance Criteria)

1. **[SC1/G1]** Given a timeline where signal `S` (config `{ threshold, direction, window }`) crosses its threshold within the window, `harness rollback sweep` calls `runRollbackEvaluate({ pr, trigger: 'signal' })` once per PR resolved as merged in that window. Proven by a unit test with a fake timeline reader, a fake PR resolver, and a spy `evaluate` fn — no real git/gh.
2. **[Crossing — above]** With `direction: 'above'`, a crossing is detected only when the latest in-window point is `>= threshold` and the immediately prior point was `< threshold` (a true crossing, not a sustained-above plateau). A window that is entirely above (no crossing edge) does NOT fire.
3. **[Crossing — below]** With `direction: 'below'`, a crossing is detected only when the latest in-window point is `<= threshold` and the immediately prior point was `> threshold`.
4. **[Window resolution]** Only points whose `date` falls within `[now - window, now]` are considered; points older than the window are ignored for crossing detection, and only PRs merged in that same date range are passed to `evaluate`.
5. **[Finding #5 — window validation]** `RollbackSignalRuleSchema` rejects a `window` that does not match `/^\d+[hdw]$/` (e.g. `"7"`, `"7x"`, `"d7"`, `""`) with a fail-fast parse error; it accepts `"24h"`, `"7d"`, `"2w"`. Proven by schema unit tests.
6. **[Window parser]** `parseWindow("7d")` returns a duration of 7 days in ms (and `"24h"` → 24h, `"2w"` → 14d); it is the single source of truth the sweep uses to compute the window start date.
7. **[No crossing → no eval]** A signal whose in-window points never cross fires zero `evaluate` calls. A signal absent from the timeline fires zero calls (soft-skip, no throw).
8. **[Idempotency deferral]** The sweep does not re-implement PR idempotency — it relies on the existing `composeRevertPr` `harness:rollback`-label skip. The sweep test asserts it simply forwards to `evaluate`; duplicate-PR suppression stays the composer's job (already covered in Phase 2).
9. **[Eval arm dark]** `harness rollback sweep` runs the signal arm only. The post-merge eval path is self-gated: with `rollback.evalTrigger.enabled=false` (default), the CLI eval entry no-ops (opens no PR, exits 0) — proven by a unit test — so the workflow's `pull_request:[closed]` trigger stays dark until Phase 4 without a YAML change.
10. **[Workflow syntax + logic trace]** `.github/workflows/rollback-propose.yml` parses as valid YAML (asserted by a `yaml`-module parse test) and, by manual trace documented in the plan, has: `pull_request:[closed]` + `schedule.cron` triggers, `permissions: contents: read` + `pull-requests: write` (NO `contents: write`, NO self-approving PAT), a `concurrency` group with `cancel-in-progress: false`, and a job step that runs `harness rollback sweep`. The workflow's runtime behavior is NOT claimed "tested" beyond syntax + trace.
11. All new tests pass (`pnpm --filter @harness-engineering/cli test`) and `harness validate` passes (modulo the pre-existing dashboard design-token warnings + roadmap planned-item warning present on the branch before this phase).

## Uncertainties

- **[ASSUMPTION]** "Threshold crossing" means an _edge_ crossing (prior point on one side, latest in-window point on the other), not merely "latest value is past threshold." This avoids re-firing every sweep while a signal sits past the threshold. Encoded in AC2/AC3. If the spec intends "any in-window point past threshold," only the `detectCrossing` predicate in Task 2 changes (test-first, so it is a cheap pivot).
- **[ASSUMPTION]** The sweep resolves "PR(s) merged in the window" via `gh pr list --state merged --json number,mergedAt --search "merged:>=<windowStart>"` (or client-side filter of `mergedAt`), injected behind a `PrResolver` seam so tests never touch `gh`. The real resolver is untested-by-design (thin process shim), mirroring `createGhSeam` in `rollback.ts`.
- **[ASSUMPTION]** The timeline reader reuses `SignalTimelineStore` from `@harness-engineering/signals` (`read(id)` returns `SignalPoint[]`, empty for unknown ids, soft-fails on missing/corrupt file). Config signal names are arbitrary strings; `read` keys straight into the record, so a narrow cast at the seam boundary is acceptable. Behind a `TimelineReader` seam for tests.
- **[ASSUMPTION]** `now` is injected into the sweep (a `() => Date` clock) so window math is deterministic in tests. The CLI action passes the real clock.
- **[ASSUMPTION]** The eval-arm dark gate lives in the CLI (spec's preferred "CLI-gates-itself" approach): a `sweep`-sibling or a guarded branch that reads `rollback.evalTrigger.enabled` and no-ops when false. The workflow always calls the CLI; the CLI decides. This makes AC9 unit-testable. The workflow YAML carries NO `if:` gate on the eval step beyond `merged == true`.
- **[DEFERRABLE]** Exact cron cadence (proposed `0 * * * *` hourly). Sweep re-runs are safe (composer idempotency), so cadence is a tuning knob, not a correctness gate. Finalized in Task 8; note the choice in the commit body.
- **[DEFERRABLE]** Whether the eval-arm gate ships as its own tiny function this phase or is only asserted via the sweep no-op. Task 6 adds a minimal, tested gate function so AC9 is real without wiring #31.

## File Map

- CREATE `packages/cli/src/rollback/sweep.ts` — `runRollbackSweep()` (pure orchestrator: for each config signal, read timeline → `detectCrossing` → `resolveMergedPrs` in window → call injected `evaluate` per PR), plus `parseWindow()` and `detectCrossing()` helpers and the `TimelineReader` / `PrResolver` / clock seams. Also the real seam factories (thin `SignalTimelineStore` + `gh` shims, untested-by-design).
- CREATE `packages/cli/tests/rollback/sweep.test.ts` — unit tests for `parseWindow`, `detectCrossing` (above/below, edge vs plateau, empty/missing signal), window-scoped PR resolution, and the end-to-end sweep-over-fakes forwarding to a spy `evaluate` (AC1–AC4, AC7, AC8).
- CREATE `packages/cli/src/rollback/eval-gate.ts` — small `isEvalArmEnabled(config)` + `runEvalTriggerIfEnabled(...)` that no-ops when `rollback.evalTrigger.enabled` is false (AC9). (May instead live in `rollback.ts`; kept separate for a focused test. Execution may inline it — note if so.)
- CREATE `packages/cli/tests/rollback/eval-gate.test.ts` — AC9: disabled → no `evaluate` call / no PR; enabled → routes to `evaluate`.
- CREATE `.github/workflows/rollback-propose.yml` — sibling of `roadmap-auto-done.yml`; triggers `pull_request:[closed]` + `schedule.cron`; permissions `contents: read` + `pull-requests: write`; concurrency-serialized; job runs `harness rollback sweep` (signal arm) and calls the self-gated eval entry on merge.
- CREATE `packages/cli/tests/rollback/workflow-yaml.test.ts` — AC10: parse `.github/workflows/rollback-propose.yml` with the `yaml` module and assert triggers / permissions (no `contents: write`, no PAT secret) / concurrency / the `rollback sweep` step string.
- MODIFY `packages/cli/src/config/schema.ts` — add `.regex(/^\d+[hdw]$/, ...)` to `RollbackSignalRuleSchema.window` (finding #5).
- MODIFY `packages/cli/tests/config/rollback-schema.test.ts` — add accept/reject cases for the `window` format (AC5).
- MODIFY `packages/cli/src/commands/rollback.ts` — register the `sweep` subcommand on the `rollback` command; wire the real seams + config load; optional Task-10 polish (collapse dual `gh` lookup, `--pr` numeric parse guard, shared `ts`).
- MODIFY `packages/cli/src/rollback/compose.ts` — (Task 10, optional) single `gh` lookup returning `{ number, url } | null` instead of two calls.
- MODIFY `packages/cli/src/rollback/breadcrumb.ts` — (Task 10, optional) accept/thread a single `ts` shared by append + graph link.
- MODIFY `packages/cli/src/commands/_registry.ts` — regenerated (do NOT hand-edit) if the command surface changes; `sweep` is a subcommand of the already-registered `rollback`, so likely no change — confirm in Task 9.

_(Core barrel: no new `@harness-engineering/core` export is required — the sweep lives entirely in `packages/cli` and imports only `runRollbackEvaluate` (same package) and `SignalTimelineStore`/`SignalPoint` from the already-published `@harness-engineering/signals` barrel. Confirm `pnpm --filter @harness-engineering/cli build` resolves the `signals` import; if `signals` is not yet a CLI dependency, Task 1 adds it to `packages/cli/package.json` — see Task 1.)_

## Skills

_From `docs/changes/harness-rollback/SKILLS.md` (Reference tier only, no Apply tier):_ `ts-zod-integration` (window regex + fail-fast schema — Tasks 3, apply), `ts-testing-types` / `ts-type-guards` (fake-seam unit tests — Tasks 2, 5, 6), `gof-chain-of-responsibility` / `gof-factory-method` (seam-factory shape for `TimelineReader` / `PrResolver` — Task 1). Repo conventions applied inline: `execFileSync` no-shell `gh` seam (`createGhSeam` in `rollback.ts`), injected-clock deterministic tests (`breadcrumb.ts` `now`), `create*Command` + `_registry.ts` regen, degrade-safe soft-fail reads (`SignalTimelineStore.load`).

## Skeleton

1. Foundation: `signals` dep wiring + seam interfaces (~1 task, ~4 min)
2. Pure sweep helpers with TDD: `parseWindow`, `detectCrossing`, window PR-resolution (~2 tasks, ~10 min)
3. Sweep orchestrator + `sweep` subcommand wiring with TDD (~2 tasks, ~9 min)
4. Config `window` regex validation (finding #5) with TDD (~1 task, ~4 min)
5. Eval-arm dark self-gate with TDD (~1 task, ~4 min)
6. Workflow YAML + syntax/logic-trace test (~2 tasks, ~7 min)
7. Optional Phase-2 polish + registry/validate finalize (~2 tasks, ~4 min)

**Estimated total:** 11 tasks, ~42 minutes.
_Skeleton approved: pending (standard rigor, 11 tasks ≥ 8 → skeleton required)._

## Tasks

### Task 1: Wire `@harness-engineering/signals` into the CLI and declare sweep seams

**Depends on:** none | **Files:** `packages/cli/package.json`, `packages/cli/src/rollback/sweep.ts`

1. Confirm whether `@harness-engineering/signals` is already a dependency: `grep '@harness-engineering/signals' packages/cli/package.json`. If absent, add it under `dependencies` as `"@harness-engineering/signals": "workspace:*"` (match the version-spec style of the sibling `@harness-engineering/core` entry).
2. Create `packages/cli/src/rollback/sweep.ts` with ONLY the seam interfaces + types (no logic yet):

   ```ts
   import type { SignalPoint } from '@harness-engineering/signals';
   import type { RollbackDecision } from '@harness-engineering/core';

   /** Reads stored daily points for a signal name (empty for unknown/absent). */
   export type TimelineReader = (signalName: string) => SignalPoint[];

   /** Resolves PR numbers merged within [startIso, nowIso] (inclusive). */
   export type PrResolver = (startIso: string, nowIso: string) => Promise<number[]>;

   /** Injected clock for deterministic window math. */
   export type Clock = () => Date;

   /** Config rule shape the sweep consumes (mirrors RollbackSignalRuleSchema). */
   export interface SweepSignalRule {
     threshold: number;
     direction: 'above' | 'below';
     window: string;
   }

   export interface RollbackSweepDeps {
     readTimeline: TimelineReader;
     resolveMergedPrs: PrResolver;
     evaluate: (pr: number) => Promise<RollbackDecision>;
     now?: Clock;
   }
   ```

3. Run: `pnpm --filter @harness-engineering/cli build` — confirm the `signals` import resolves (if it fails, the dep add in step 1 was needed / the version spec is wrong; fix and rebuild).
4. If `package.json` changed, run `pnpm install --frozen-lockfile=false` at repo root to update the lockfile (workspace link only; no external fetch expected).
5. Run: `node packages/cli/dist/bin/harness.js validate` (expect the pre-existing dashboard/roadmap warnings only; exit code unchanged from pre-phase baseline).
6. Commit: `feat(rollback): scaffold signal-sweep seams and signals dep`

### Task 2 (TDD): `parseWindow` and `detectCrossing` pure helpers

**Depends on:** Task 1 | **Files:** `packages/cli/tests/rollback/sweep.test.ts`, `packages/cli/src/rollback/sweep.ts`

1. In `packages/cli/tests/rollback/sweep.test.ts`, write tests for the two pure helpers (import from `../../src/rollback/sweep`):
   - `parseWindow`: `parseWindow('24h')` → `86_400_000`; `parseWindow('7d')` → `604_800_000`; `parseWindow('2w')` → `1_209_600_000`. `parseWindow('bad')` throws.
   - `detectCrossing(points, { threshold, direction })` where `points` is oldest→newest `SignalPoint[]`:
     - above: prior `< threshold`, latest `>= threshold` → `true`.
     - above plateau: all points `>= threshold` (no edge) → `false`.
     - below: prior `> threshold`, latest `<= threshold` → `true`.
     - empty points → `false`; single point → `false` (no prior to cross from).
2. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe failure (helpers not implemented).
3. Implement `parseWindow(window: string): number` in `sweep.ts` — regex `/^(\d+)([hdw])$/`, multiply by `{ h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit]`; throw `Error(\`invalid window: ${window}\`)` on no-match.
4. Implement `detectCrossing(points, rule): boolean` — sort/assume oldest→newest; if `< 2` points return `false`; take `prev = points.at(-2)`, `curr = points.at(-1)`; for `above` return `prev.value < threshold && curr.value >= threshold`; for `below` return `prev.value > threshold && curr.value <= threshold`.
5. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`.
7. Commit: `feat(rollback): add parseWindow + detectCrossing sweep helpers`

**Skills:** `ts-testing-types` (reference), `ts-type-guards` (reference).

### Task 3 (TDD): Window-scoped point filtering + `windowStart` helper

**Depends on:** Task 2 | **Files:** `packages/cli/tests/rollback/sweep.test.ts`, `packages/cli/src/rollback/sweep.ts`

1. Add tests to `sweep.test.ts`:
   - `windowStart(now, '7d')` returns the ISO date `now - 7d` (use a fixed `now = new Date('2026-07-09T00:00:00Z')`, assert start `=== '2026-07-02T00:00:00.000Z'`).
   - `pointsInWindow(points, now, '7d')` keeps only points whose `date` (a `YYYY-MM-DD` string) is `>= windowStartDate` and `<= now`; a point 8 days old is excluded, a point 3 days old is kept.
2. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe failure.
3. Implement `windowStart(now: Date, window: string): string` (subtract `parseWindow(window)` ms, `.toISOString()`) and `pointsInWindow(points, now, window)` (compare `point.date` against the `YYYY-MM-DD` slice of `windowStart` and of `now`; string compare is safe for ISO dates). Export both.
4. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(rollback): add window-scoped point filtering to sweep`

**Skills:** `ts-testing-types` (reference).

### Task 4 (TDD): `runRollbackSweep` orchestrator over fake seams

**Depends on:** Task 3 | **Files:** `packages/cli/tests/rollback/sweep.test.ts`, `packages/cli/src/rollback/sweep.ts`

1. Add sweep-orchestrator tests to `sweep.test.ts`. Build:
   - a fake `readTimeline` returning a scripted `SignalPoint[]` per signal name (and `[]` for an absent signal),
   - a fake `resolveMergedPrs` returning `[201, 202]`,
   - a spy `evaluate` (records calls, returns a stub `RollbackDecision`),
   - fixed `now`.
     Signals config: `{ errorRate: { threshold: 5, direction: 'above', window: '7d' } }`.
     Assert:
   - **AC1**: a crossing timeline (prev `4`, latest `6`) → `evaluate` called with `201` and `202` (once each; `trigger` is fixed to `'signal'` by the CLI wiring, so the spy signature is `(pr) => ...`).
   - **AC7**: a non-crossing timeline (all `>= 5`, plateau) → `evaluate` never called.
   - **AC7**: a signal absent from the timeline → `evaluate` never called, no throw.
   - **AC8**: the sweep does not dedupe PRs itself — with `resolveMergedPrs` returning `[201, 201]` it forwards both (idempotency is the composer's job); assert two calls. _(If execution prefers de-duping identical PR numbers at the sweep boundary, flip this assertion and note it — either is defensible; document the choice.)_
2. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe failure.
3. Implement `runRollbackSweep(signals: Record<string, SweepSignalRule>, deps: RollbackSweepDeps): Promise<void>`:
   - `const now = (deps.now ?? (() => new Date()))();`
   - for each `[name, rule]` of `Object.entries(signals)`:
     - `const pts = pointsInWindow(deps.readTimeline(name), now, rule.window);`
     - `if (!detectCrossing(pts, rule)) continue;`
     - `const prs = await deps.resolveMergedPrs(windowStart(now, rule.window), now.toISOString());`
     - `for (const pr of prs) await deps.evaluate(pr);`
4. Run: `pnpm --filter @harness-engineering/cli test rollback/sweep` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(rollback): implement runRollbackSweep orchestrator`

**Skills:** `ts-testing-types` (reference), `gof-factory-method` (reference).

### Task 5: Wire the `sweep` subcommand + real seams

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/rollback.ts`, `packages/cli/src/rollback/sweep.ts`

1. In `sweep.ts`, add real seam factories (untested-by-design, thin shims — mirror `createGhSeam`):
   - `createTimelineReader(root: string): TimelineReader` — instantiate `new SignalTimelineStore(root)` and return `(name) => store.read(name as never)` (narrow cast at the boundary; `read` keys straight into the record and returns `[]` for unknown names).
   - `createPrResolver(): PrResolver` — `async (startIso) => { const raw = execFileSync('gh', ['pr','list','--state','merged','--search',\`merged:>=${startIso.slice(0,10)}\`,'--json','number','--limit','100'], { encoding:'utf-8' }); return (JSON.parse(raw) as {number:number}[]).map(p => p.number); }`. Wrap in try/catch returning `[]` on gh failure (degrade-safe).
2. In `packages/cli/src/commands/rollback.ts`, register the subcommand on the existing `rollback` command inside `createRollbackCommand()`:
   ```ts
   rollback
     .command('sweep')
     .description(
       'Read the signal timeline and propose reverts for threshold crossings (signal arm)'
     )
     .action(async () => {
       const cfg = resolveConfig(); // Result<HarnessConfig, CLIError>
       const signals = cfg.ok ? (cfg.value.rollback?.signals ?? {}) : {};
       const root = process.cwd();
       await runRollbackSweep(signals, {
         readTimeline: createTimelineReader(root),
         resolveMergedPrs: createPrResolver(),
         evaluate: (pr) =>
           runRollbackEvaluate(
             { pr, trigger: 'signal' },
             { io: createNodeRollbackIO(), gh: createGhSeam() }
           ),
       });
     });
   ```
   (Import `resolveConfig` from `../config/loader`, `runRollbackSweep` + factories from `../rollback/sweep`.)
3. Run: `pnpm --filter @harness-engineering/cli build`.
4. Run: `node packages/cli/dist/bin/harness.js rollback sweep --help` — confirm the subcommand and its description list.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(rollback): add rollback sweep subcommand wired to real seams`

**Skills:** `gof-factory-method` (reference).

### Task 6 (TDD): Eval-arm dark self-gate

**Depends on:** Task 1 | **Files:** `packages/cli/tests/rollback/eval-gate.test.ts`, `packages/cli/src/rollback/eval-gate.ts`

1. In `packages/cli/tests/rollback/eval-gate.test.ts`, write tests for `runEvalTriggerIfEnabled(config, pr, deps)`:
   - **AC9 disabled**: `config.rollback.evalTrigger.enabled === false` (and `undefined` rollback) → the injected `evaluate` spy is NOT called; the function resolves to `{ skipped: true }`.
   - **AC9 enabled**: `enabled === true` → `evaluate` IS called once with the pr and `trigger: 'eval'`; resolves to the decision.
2. Run: `pnpm --filter @harness-engineering/cli test rollback/eval-gate` — observe failure.
3. Implement `eval-gate.ts`:

   ```ts
   import type { HarnessConfig } from '../config/schema';
   import type { RollbackDecision } from '@harness-engineering/core';

   export function isEvalArmEnabled(config: HarnessConfig): boolean {
     return config.rollback?.evalTrigger?.enabled === true;
   }

   export async function runEvalTriggerIfEnabled(
     config: HarnessConfig,
     pr: number,
     deps: { evaluate: (pr: number) => Promise<RollbackDecision> }
   ): Promise<RollbackDecision | { skipped: true }> {
     if (!isEvalArmEnabled(config)) return { skipped: true };
     return deps.evaluate(pr);
   }
   ```

   (Verify the exact `HarnessConfig` type export name in `schema.ts`; the `evaluate` seam is expected to bind `trigger: 'eval'` at the call site.)

4. Run: `pnpm --filter @harness-engineering/cli test rollback/eval-gate` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(rollback): add flag-gated dark eval-arm entry (unfired in v1)`

**Skills:** `ts-type-guards` (reference), `ts-testing-types` (reference).

### Task 7 (TDD): `window` format validation in the config schema (finding #5)

**Depends on:** none | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/rollback-schema.test.ts`

1. In `packages/cli/tests/config/rollback-schema.test.ts`, add cases:
   - accepts `window: '24h'`, `'7d'`, `'2w'` (extend the existing populated-config test or add new `it`s).
   - rejects `window: '7'`, `'7x'`, `'d7'`, `''` → `safeParse(...).success === false`.
2. Run: `pnpm --filter @harness-engineering/cli test config/rollback-schema` — observe failure (current schema accepts any string).
3. In `packages/cli/src/config/schema.ts`, change `RollbackSignalRuleSchema.window` from `z.string()` to:
   ```ts
   window: z
     .string()
     .regex(/^\d+[hdw]$/, 'window must be <number><h|d|w>, e.g. "24h", "7d", "2w"'),
   ```
4. Run: `pnpm --filter @harness-engineering/cli test config/rollback-schema` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `fix(rollback): validate signal window format (finding #5)`

**Skills:** `ts-zod-integration` (reference).

### Task 8: Author `.github/workflows/rollback-propose.yml`

**Depends on:** Task 5 | **Files:** `.github/workflows/rollback-propose.yml`

1. Create `.github/workflows/rollback-propose.yml` modeled on `roadmap-auto-done.yml` but **propose-only** (NO `contents: write`, NO PAT). Exact content:

   ```yaml
   name: Rollback Propose

   # Post-ship circuit breaker (propose-only). Two arms:
   #   - schedule: signal sweep reads .harness/signals/timeline.json and, on a
   #     configured threshold crossing, opens a full-context revert PR labeled
   #     harness:rollback for a HUMAN to merge (no self-approving PAT).
   #   - pull_request:[closed]: the eval arm entry. DARK in v1 — the CLI self-gates
   #     on rollback.evalTrigger.enabled (default false), so this trigger no-ops
   #     until Phase 4 (#31) flips the flag. No YAML change needed to activate.
   # Permissions are minimal: it READS the repo and WRITES pull requests only.

   on:
     schedule:
       - cron: '0 * * * *' # hourly signal sweep (cadence is a tuning knob)
     pull_request:
       types: [closed]

   permissions:
     contents: read
     pull-requests: write

   # Serialize proposals so two runs never open duplicate revert PRs while the
   # composer idempotency check races. Never cancel an in-flight proposal.
   concurrency:
     group: rollback-propose-${{ github.ref }}
     cancel-in-progress: false

   jobs:
     sweep:
       # Signal sweep runs on schedule; on pull_request it only runs for a MERGE
       # (the eval arm), and the CLI itself no-ops while evalTrigger is disabled.
       if: github.event_name == 'schedule' || github.event.pull_request.merged == true
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v6
           with:
             fetch-depth: 0
         - uses: actions/setup-node@v6
           with:
             node-version: '22'
         - uses: pnpm/action-setup@v5
         - run: pnpm install --frozen-lockfile
         - run: pnpm build
         - name: Signal sweep — propose reverts for threshold crossings
           if: github.event_name == 'schedule'
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           run: node packages/cli/dist/bin/harness.js rollback sweep
   ```

   _(Note: the `pull_request:[closed]` eval arm has no explicit run step yet — it stays dark until Phase 4 wires the eval entry; the trigger + gated job exist so activation is a Phase-4 code change, not a workflow rewrite. Documented, not claimed functional.)_

2. Run: `node -e "const yaml=require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/rollback-propose.yml','utf8')); console.log('yaml ok')"` — confirm it parses.
3. Commit: `feat(rollback): add propose-only rollback-propose workflow`

### Task 9 (TDD): Workflow YAML syntax + permission/trigger assertions

**Depends on:** Task 8 | **Files:** `packages/cli/tests/rollback/workflow-yaml.test.ts`

1. Create `packages/cli/tests/rollback/workflow-yaml.test.ts`. Read `.github/workflows/rollback-propose.yml` (resolve the repo-root path relative to the test file), parse with the `yaml` module, and assert (AC10):
   - parses without throwing (valid YAML).
   - `on.schedule` exists with a `cron` entry AND `on.pull_request.types` includes `'closed'`.
   - `permissions.contents === 'read'` and `permissions['pull-requests'] === 'write'`.
   - `permissions` does NOT contain a `write` value for `contents` (assert `permissions.contents !== 'write'`).
   - the raw file text contains neither `AUTOAPPROVE_PAT` nor `pr review --approve` (propose-only guard: no self-approving PAT).
   - `concurrency['cancel-in-progress'] === false`.
   - the raw text contains `rollback sweep` (the sweep step is present).
2. Run: `pnpm --filter @harness-engineering/cli test rollback/workflow-yaml` — observe pass (workflow already exists from Task 8; if the test file must fail-first, temporarily assert a wrong value, watch it fail, then correct — keep TDD honest).
3. Add a top-of-file comment in the test documenting the **manual logic trace** (this is the "not tested beyond syntax" boundary): schedule→sweep→signal arm; pull_request[closed]+merged→dark eval entry (CLI self-gates); permissions minimal; human merges the revert PR.
4. Run: `node packages/cli/dist/bin/harness.js validate`.
5. Commit: `test(rollback): assert rollback-propose workflow syntax + permissions`

**Skills:** `ts-testing-types` (reference).

### Task 10: Optional Phase-2 polish (each item individually droppable)

**Depends on:** Task 5 | **Files:** `packages/cli/src/rollback/compose.ts`, `packages/cli/src/commands/rollback.ts`, `packages/cli/src/rollback/breadcrumb.ts`

[checkpoint:decision] The spec marks these OPTIONAL — "include ONLY if cheap, else note as deferred." At execution, assess each; implement the cheap ones, note deferrals in the commit body.

1. **Collapse dual `gh` lookup**: in `compose.ts`, change `ComposeGhSeam` to a single `findOpenRevertPr(targetPr, label): Promise<{ number: number; url: string } | null>` and update `composeRevertPr` to one call; update `createGhSeam` in `rollback.ts` to return the combined node (it already computes both from `findOpenRevertPrNode`). Update `packages/cli/tests/rollback/compose.test.ts` fakes accordingly.
2. **`--pr` numeric parse guard**: in `createRollbackCommand`, on the `evaluate` `--pr` option, reject `NaN` at parse time (`(v) => { const n = Number.parseInt(v,10); if (Number.isNaN(n)) throw new InvalidArgumentError('--pr must be a number'); return n; }`).
3. **Shared `ts`**: thread one `ts` through `appendRollbackEvent` + `linkRollbackEventToGraph` (add a `ts?` to `AppendOptions`, default once, pass the same value to both from `rollback.ts`) so the breadcrumb and graph node share a timestamp.
4. For each item NOT done, write a one-line `deferred:` note in the commit body.
5. Run: `pnpm --filter @harness-engineering/cli test rollback` — observe all rollback tests pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`.
7. Commit: `refactor(rollback): fold in cheap Phase-2 review polish` (list done vs deferred in the body).

### Task 11: Finalize — registry check, full test + validate sweep

**Depends on:** Task 5, Task 7, Task 9 | **Files:** `packages/cli/src/commands/_registry.ts` (verify only)

1. Regenerate command artifacts (do NOT hand-edit `_registry.ts`): run the repo's barrel/registry generator (e.g. `pnpm run generate-barrel-exports` or the documented command; confirm via `grep -n generate packages/cli/package.json` if unsure). `sweep` is a subcommand of the already-registered `rollback`, so expect NO diff — but run the generator so any drift is caught, not assumed.
2. If a pre-push reference-docs step applies to new CLI subcommands, run `pnpm run generate-docs` and stage any updated `docs/reference/*` (pre-push gates on freshness — see repo memory). If nothing changes, skip.
3. Run the full CLI suite: `pnpm --filter @harness-engineering/cli test`.
4. Run: `node packages/cli/dist/bin/harness.js validate` — confirm exit status matches the pre-phase baseline (pre-existing dashboard design-token + roadmap planned-item warnings only; no NEW failures attributable to this phase).
5. Run: `node packages/cli/dist/bin/harness.js check-deps` — confirm exit 0.
6. Commit: `chore(rollback): finalize signal-arm registry + docs` (empty/no-op commit acceptable if generators produced no diff — otherwise stage the generated files).

**Category:** integration

## Sequencing Notes

- **Parallelizable:** Task 6 (eval-gate) and Task 7 (schema window) depend only on Task 1 / nothing and touch disjoint files — independent of the Task 2→3→4→5 sweep chain.
- **Critical path:** Task 1 → 2 → 3 → 4 → 5 → 8 → 9 → 11.
- Task 10 is optional and off the critical path (depends on Task 5 only).
- Task 11 gates on the three arms landing: sweep (5), schema (7), workflow test (9).

## Traceability

| Observable truth                       | Delivered by |
| -------------------------------------- | ------------ |
| AC1 (crossing → evaluate per PR)       | Task 4       |
| AC2 (above edge, not plateau)          | Task 2       |
| AC3 (below edge)                       | Task 2       |
| AC4 (window resolution)                | Task 3       |
| AC5 (window regex validation, #5)      | Task 7       |
| AC6 (parseWindow)                      | Task 2       |
| AC7 (no crossing / absent → no eval)   | Task 4       |
| AC8 (idempotency stays composer's job) | Task 4       |
| AC9 (eval arm dark self-gate)          | Task 6       |
| AC10 (workflow syntax + trace)         | Tasks 8, 9   |
| AC11 (suite + validate green)          | Task 11      |
