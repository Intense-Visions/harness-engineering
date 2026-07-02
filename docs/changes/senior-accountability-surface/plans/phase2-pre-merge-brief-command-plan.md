# Plan: Phase 2 — `harness pre-merge-brief` CLI Command

**Date:** 2026-07-02 | **Spec:** `docs/changes/senior-accountability-surface/proposal.md` | **Tasks:** 11 | **Time:** ~44 min | **Integration Tier:** medium

## Scope

Phase 2 of the Senior-Engineer Accountability Surface spec: build the `harness pre-merge-brief`
CLI command — a composer that assembles a senior-facing PR brief from artifacts that already exist
(the `review-ci --json` verdict, graph `execution_outcome` nodes, a fresh `gatherSignals` snapshot,
and `git diff`) and posts it as a single **sticky** PR comment via `gh` (upsert by marker).

**Explicitly out of scope (later phases — do NOT implement here):**

- Phase 1 (`@harness-engineering/signals` extraction) — **DONE** (verified: package exists at
  `packages/signals/`, exports `gatherSignals`/`SignalsResult`/`signalRegistry`).
- Phase 3 — the `harness:pre-merge-brief` skill (SKILL.md / skill.yaml / tier / slash-commands).
- Phase 4 — dogfood wiring in `.github/workflows/required-review.yml`.
- Phase 5 — docs, ADRs (D1, D6), knowledge enrichment, follow-up roadmap rows.

## Goal

`harness pre-merge-brief` composes a senior-facing PR brief (diff summary, review verdict, Signal
status, outcome-eval, and a derived "👀 Worth your eyes" section) from existing artifacts and
upserts it as a single sticky PR comment, with every input degrading independently to an
"unavailable / not configured" line so the command still succeeds (exit 0) when inputs are missing.

## Observable Truths (Acceptance Criteria)

1. `buildBriefBody(inputs)` is a **pure** function (no I/O, no `process.exit`) that renders a
   Markdown brief whose sections appear **in order**: header (with hidden marker
   `<!-- harness:pre-merge-brief -->`), diff summary, review verdict, **Signal status**, outcome-eval,
   and **"👀 Worth your eyes"**. (Success Criterion 1.)
2. When a given input is absent, its section renders an explicit **"unavailable / not configured"**
   line and `buildBriefBody` still returns a full brief (does not throw). One degradation truth per
   input: no `--from` → review section unavailable; empty signals → Signal-status unavailable;
   no `execution_outcome` match → "not yet evaluated"; empty diff → diff-summary unavailable.
   (Success Criterion 2.)
3. The **"👀 Worth your eyes"** section contains **exactly** the union of (a) review blocking
   findings, (b) signals with `status` `warn` or `alert`, and (c) `unmetCriteria` from the
   outcome verdict — no more, no fewer. (Success Criterion 4.)
4. **Sticky upsert:** given a fake `postBrief` seam, a **second** run on the same PR **updates**
   (PATCHes) the comment carrying the marker rather than posting a new one. The real
   `defaultPostBrief` lists comments via `gh api`, `PATCH`es the marked comment if present, else
   posts via `gh pr comment --body-file -`. No real `gh` is invoked in any test. (Success Criterion 3.)
5. CLI: `harness pre-merge-brief --from <fixture.json>` prints a full brief to stdout (no `--comment`)
   and exits 0. `--comment` triggers the upsert. `--diff <range>` overrides the default resolved via
   `resolveDiffRange`. When `--from` is omitted the command still runs and exits 0.
6. `harness pre-merge-brief` is registered in `_registry.ts` (regenerated barrel) and appears in
   `harness --help`.
7. `harness validate` passes; the new command's unit tests pass under **Node 22**.

## Verified Facts (do not re-derive)

- **Mirror target** `packages/cli/src/commands/review-ci.ts` provides reusable seams:
  - `buildDiffInfo(rawDiff): DiffInfo` (review-ci.ts:120), `resolveDiffRange({range,cwd,runGit})`
    (review-ci.ts:67), `RunGit` type + `defaultRunGit` (review-ci.ts:53-56). Reuse verbatim — do NOT
    reimplement git diff parsing. Import them from `./review-ci`.
  - `buildReviewBody(verdict): string` (review-ci.ts:210) and `findingLine` show the finding-render
    idiom; `PostReview` + `defaultPostReview` (review-ci.ts:234-252, uses `gh pr comment --body-file -`)
    is the seam model for `postBrief`.
- **Review verdict type:** `CiReviewResult` is exported from `@harness-engineering/core`
  (`packages/core/src/review/ci/orchestrator.ts:63`, re-exported via `.../ci/index.ts:40`). Shape:
  `{ verdict: CiReviewVerdict; exitCode; terminalOutput; ranLlmTier; llmSkipReason? }`. The verdict
  carries `assessment`, `runner`, `findings[]`, `blockingFindings[]`, `skipped`, `skipReason?`.
  A finding has `severity`, `file`, `lineRange?`, `title`, `id`. Import
  `import type { CiReviewResult } from '@harness-engineering/core'` (same source review-ci.ts:8 uses).
- **Signals:** `import { gatherSignals } from '@harness-engineering/signals'` where
  `gatherSignals(projectPath: string): Promise<SignalsResult>` and
  `SignalsResult = { signals: SignalResult[]; generatedAt: string }`. `SignalResult` has
  `id, label, value: number|null, unit, status: 'ok'|'warn'|'alert'|'pending'|'error',
threshold: {warn, alert}, detail`. (`packages/signals/src/{gather,types}.ts`.) The "worth your
  eyes" filter selects `status === 'warn' || status === 'alert'`.
- **Outcome-eval:** `execution_outcome` nodes live in the graph. Query with
  `GraphStore.findNodes({ type: 'execution_outcome' })` (`packages/graph/src/store/GraphStore.ts:90`;
  `NodeType` includes `'execution_outcome'`, types.ts:28). The verdict shape to render is
  `OutcomeVerdict` from `@harness-engineering/intelligence`
  (`packages/intelligence/src/outcome-eval/types.ts:29`): `{ verdict: 'SATISFIED'|'NOT_SATISFIED'|
'INCONCLUSIVE'; confidence; rationale; judgedAgainst; unmetCriteria: string[]; authority }`.
  Pre-merge the node is commonly **ABSENT** → render "not yet evaluated" (degrade, never error).
- **CLI deps:** `packages/cli/package.json` already lists `@harness-engineering/core`,
  `@harness-engineering/graph`, and (peer) `@harness-engineering/intelligence`, but **NOT**
  `@harness-engineering/signals` — this must be added. The CLI must **not** import
  `@harness-engineering/dashboard` for signals (D6 rule).

## Uncertainties

- [ASSUMPTION] `execution_outcome` nodes carry no guaranteed `commit`/`headSha` field
  (`ExecutionOutcome` has `identifier`, not a sha). Outcome matching "by head commit" is therefore a
  **best-effort** lookup: filter `findNodes({type:'execution_outcome'})` on a `metadata.commit` /
  `metadata.headSha` field when present, else treat as no-match. Pre-merge no-match is the common
  case → "not yet evaluated". No blocking impact: the degradation path is the default. Task 6 encodes
  this as `findOutcomeVerdict(store, headSha): OutcomeVerdict | null`.
- [ASSUMPTION] `@harness-engineering/signals` and `@harness-engineering/intelligence` must be
  runtime deps of the CLI. Task 1 adds signals to `dependencies`; intelligence is already present.
- [DEFERRABLE] Exact wording of each "unavailable" line — finalized in Task 2 (tests assert the
  substring "unavailable" / "not yet evaluated", not exact prose).

## File Map

```
MODIFY packages/cli/package.json                                  (add @harness-engineering/signals dep)
CREATE packages/cli/src/commands/pre-merge-brief.ts               (command: types, buildBriefBody, seams, createCommand)
CREATE packages/cli/tests/commands/pre-merge-brief.test.ts        (pure render + degradation + union + upsert tests)
MODIFY packages/cli/src/commands/_registry.ts                     (regenerated barrel — add creator)
```

## Skeleton

1. Dependency wiring + command skeleton with input types (~2 tasks, ~7 min)
2. Pure `buildBriefBody` render, section by section, TDD (~4 tasks, ~18 min)
3. Input readers (signals, outcome) + `postBrief` upsert seam, TDD (~3 tasks, ~13 min)
4. CLI action wiring + registration (~2 tasks, ~6 min)

**Estimated total:** 11 tasks, ~44 minutes.
_Skeleton approved: pending (see sign-off request)._

## Skill annotations

Only Reference-tier skills were recommended (no Apply tier). Relevant references:
`ts-type-guards` and `ts-testing-types` (Tasks 3-8 — union derivation and fake-seam tests),
`gof-builder-pattern` (Tasks 2-5 — the section-by-section body builder). Load as context; no
mandatory application.

## Tasks

### Task 1: Add `@harness-engineering/signals` to CLI dependencies

**Depends on:** none | **Files:** `packages/cli/package.json` | **Category:** integration

1. In `packages/cli/package.json`, under `"dependencies"`, add (alphabetically, after
   `@harness-engineering/orchestrator`):
   ```json
   "@harness-engineering/signals": "workspace:*",
   ```
   Confirm `@harness-engineering/graph` and (peer) `@harness-engineering/intelligence` are present;
   do NOT add `@harness-engineering/dashboard` (D6 forbids CLI→dashboard for signals).
2. Run: `nvm use 22 && pnpm install` (Node 22 — Node 26 breaks better-sqlite3 native ABI).
3. Run: `harness check-deps` — verify no new violation for the added import direction.
4. Run: `harness validate`.
5. Commit: `chore(cli): add @harness-engineering/signals dependency for pre-merge-brief`

### Task 2: Define brief input types + section-marker constant (skeleton file)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/pre-merge-brief.ts`
**Skills:** `ts-type-guards` (reference)

1. Create `packages/cli/src/commands/pre-merge-brief.ts` with imports and input contract only
   (no `buildBriefBody` body yet — a stub returning `''`):

   ```ts
   import { execFileSync } from 'node:child_process';
   import { Command } from 'commander';
   import type { CiReviewResult } from '@harness-engineering/core';
   import type { SignalResult } from '@harness-engineering/signals';
   import type { OutcomeVerdict } from '@harness-engineering/intelligence';
   import type { DiffInfo } from '@harness-engineering/core';
   import { buildDiffInfo, resolveDiffRange, type RunGit } from './review-ci';

   /** Hidden HTML marker used to find + upsert the sticky comment. */
   export const BRIEF_MARKER = '<!-- harness:pre-merge-brief -->';

   /** All inputs are OPTIONAL; a missing input degrades to an "unavailable" line. */
   export interface BriefInputs {
     /** Diff summary; undefined when the range produced no diff / could not resolve. */
     diff?: DiffInfo | undefined;
     /** review-ci JSON verdict, from `--from`; undefined when absent. */
     review?: CiReviewResult['verdict'] | undefined;
     /** Fresh signal snapshot; empty/undefined when signals could not be gathered. */
     signals?: SignalResult[] | undefined;
     /** Outcome-eval verdict for the head commit; undefined = "not yet evaluated". */
     outcome?: OutcomeVerdict | undefined;
   }

   /** Pure Markdown render (no I/O, no process.exit). Filled in Tasks 3-7. */
   export function buildBriefBody(_inputs: BriefInputs): string {
     return '';
   }
   ```

2. Run: `nvm use 22 && pnpm --filter @harness-engineering/cli typecheck`.
3. Run: `harness validate`.
4. Commit: `feat(cli): scaffold pre-merge-brief input types and marker`

### Task 3 (TDD): `buildBriefBody` header + diff-summary section

**Depends on:** Task 2 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`
**Skills:** `ts-testing-types` (reference), `gof-builder-pattern` (reference)

1. Create `packages/cli/tests/commands/pre-merge-brief.test.ts` with a `describe('buildBriefBody')`
   containing:
   - test "starts with the hidden marker and a header" — assert the body's first non-empty content
     includes `BRIEF_MARKER` and a `# ` title.
   - test "renders diff summary when diff present" — pass a `DiffInfo` with
     `changedFiles:['a.ts','b.ts'], newFiles:['b.ts'], deletedFiles:[], totalDiffLines:12,
fileDiffs:new Map()`; assert the body contains a "Diff summary" heading and the file/line counts.
   - test "diff summary unavailable when diff omitted" — pass `{}`; assert the body contains a
     "Diff summary" heading followed by an "unavailable" line.
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/commands/pre-merge-brief.test.ts` — observe
   failures (stub returns `''`).
3. In `pre-merge-brief.ts`, implement the marker/header + `renderDiffSummary(diff?): string[]`
   (returns "unavailable" line when `diff` is undefined) and wire them into `buildBriefBody` as the
   first two sections. Keep the function pure (build a `string[]`, `.join('\n')`).
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): render pre-merge-brief header and diff summary`

### Task 4 (TDD): `buildBriefBody` review-verdict section

**Depends on:** Task 3 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`

1. Add tests:
   - "renders review verdict with assessment + finding counts" — pass a verdict with
     `assessment:'request-changes', runner:'claude', findings:[f1,f2], blockingFindings:[f1]`
     (findings shaped `{id,severity,file,lineRange,title}`); assert the body contains a review
     heading, the assessment, and blocking/other findings rendered as bullets.
   - "review section unavailable when review omitted" — pass `{}`; assert the review heading is
     followed by an "unavailable / not configured" line.
2. Run vitest — observe failures.
3. Implement `renderReviewVerdict(verdict?): string[]`. Reuse the finding-bullet idiom from
   `buildReviewBody`/`findingLine` (severity, `file:line`, title). Wire as the third section.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): render pre-merge-brief review verdict section`

### Task 5 (TDD): `buildBriefBody` **Signal status** section

**Depends on:** Task 4 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`

1. Add tests:
   - "renders Signal status with each signal's current value + status" — pass 5 `SignalResult`s of
     mixed status; assert the section heading is **exactly** `Signal status` (NOT "deltas"), and
     each label + value + status appears.
   - "Signal status unavailable when signals empty/omitted" — pass `signals: []`; assert the
     heading is followed by an "unavailable" line.
2. Run vitest — observe failures.
3. Implement `renderSignalStatus(signals?): string[]`. The heading literal must be `Signal status`.
   Render `label`, `value` (+ `unit`), and `status`. "unavailable" when the array is
   empty/undefined. Wire as the fourth section.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): render pre-merge-brief Signal status section`

### Task 6 (TDD): `buildBriefBody` outcome-eval section

**Depends on:** Task 5 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`

1. Add tests:
   - "renders outcome verdict when present" — pass `outcome:{verdict:'NOT_SATISFIED', confidence:'high',
rationale:'...', judgedAgainst:'success-criteria', unmetCriteria:['crit A'], authority:'blocking'}`;
     assert the section shows the verdict + rationale.
   - "outcome section says 'not yet evaluated' when omitted" — pass `{}`; assert the section
     contains "not yet evaluated" (NOT an error).
2. Run vitest — observe failures.
3. Implement `renderOutcomeEval(outcome?): string[]`. Undefined → "not yet evaluated" line. Wire as
   the fifth section.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): render pre-merge-brief outcome-eval section`

### Task 7 (TDD): derived **"👀 Worth your eyes"** section (exact union)

**Depends on:** Task 6 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`
**Skills:** `ts-type-guards` (reference)

1. Add tests under `describe('worth your eyes derivation')`:
   - "contains exactly the union of blocking findings, warn/alert signals, and unmet criteria" —
     pass a verdict with 1 blocking finding, signals `[ok, warn, alert, pending, error]`, and an
     outcome with `unmetCriteria:['crit A','crit B']`; assert the section lists exactly:
     the 1 blocking finding + the `warn` + the `alert` signal + `crit A` + `crit B` — and does NOT
     include the `ok`/`pending`/`error` signals or non-blocking findings.
   - "empty when nothing qualifies" — no blocking findings, all-`ok` signals, `SATISFIED` outcome
     (empty `unmetCriteria`); assert the section renders a "nothing flagged" line.
   - "section appears last" — assert its heading index is greater than the Signal-status and
     outcome headings.
2. Run vitest — observe failures.
3. Implement `deriveWorthYourEyes(inputs): string[]` = concat of
   `(inputs.review?.blockingFindings ?? [])`, `signals.filter(s => s.status==='warn'||s.status==='alert')`,
   and `(inputs.outcome?.unmetCriteria ?? [])`, rendered as bullets. Wire as the **last** section
   with heading `## 👀 Worth your eyes`.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): derive pre-merge-brief "worth your eyes" union section`

### Task 8 (TDD): `postBrief` sticky-upsert seam

**Depends on:** Task 7 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`
**Skills:** `ts-testing-types` (reference)

1. Add tests under `describe('postBrief upsert')` using a **fake** `postBrief` seam (no real `gh`):
   - "first run posts a new comment; second run on same PR updates it (not appends)" — model a fake
     store: an in-memory array of comment bodies. First `postBrief(body1)` with no marked comment
     posts (array length 1). Second `postBrief(body2)` finds the marked comment and PATCHes it
     (array length still 1, body updated). Assert the marked comment count stays 1 across both runs.
   - "posts new when no marked comment exists" — empty store → one post.
2. Run vitest — observe failures.
3. Implement:
   ```ts
   /** Seam for delivering the brief to a PR — real impl shells out to `gh`. */
   export type PostBrief = (body: string) => void;
   ```
   and `defaultPostBrief`: list PR comments via `gh api` (parse JSON), find the one whose body
   contains `BRIEF_MARKER`; if found `PATCH` it via `gh api ... -X PATCH`, else post via
   `gh pr comment --body-file -` (mirror `defaultPostReview`'s stdin piping). The core logic
   (find-marked → patch-or-post) is a pure helper `upsertComment(comments, body, patch, post)` that
   the fake test drives; the `gh` calls live only in `defaultPostBrief`. No `process.exit`.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): add pre-merge-brief sticky-upsert postBrief seam`

### Task 9 (TDD): input readers — `readReview`, `gatherSignalsSafe`, `findOutcomeVerdict`

**Depends on:** Task 8 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`

1. Add tests (each reader degrades, never throws):
   - `readReview(path, readFile)` — reads + `JSON.parse`s a `CiReviewResult`, returns
     `result.verdict`; returns `undefined` (does not throw) when `path` is undefined or the file
     read/parse fails. Test with a fake `readFile` returning a fixture and one throwing.
   - `gatherSignalsSafe(projectPath, gather)` — wraps injected `gather` (defaults to
     `gatherSignals`), returns `result.signals`; returns `[]` when `gather` rejects.
   - `findOutcomeVerdict(store, headSha)` — `store.findNodes({type:'execution_outcome'})`, pick a
     node whose `metadata.commit`/`metadata.headSha` matches `headSha`, map its metadata to an
     `OutcomeVerdict`; returns `undefined` when no store, no match, or `headSha` undefined
     (the common pre-merge case). Test: no store → undefined; a store with a matching node → verdict.
2. Run vitest — observe failures.
3. Implement the three readers with injected seams (`readFile`, `gather`, `store`). Each catches its
   own failure and returns the degrade value. No `process.exit`.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): add degrading input readers for pre-merge-brief`

### Task 10: CLI action wiring — `runPreMergeBrief` + `createPreMergeBriefCommand`

**Depends on:** Task 9 | **Files:** `packages/cli/tests/commands/pre-merge-brief.test.ts`,
`packages/cli/src/commands/pre-merge-brief.ts`

1. Add tests for a pure `runPreMergeBrief(opts)` orchestrator (all seams injected — `runGit`,
   `resolveRaw`, `readFile`, `gather`, `store`, `postBrief`, `log`):
   - "prints the brief to log when `--comment` absent; does not call postBrief; returns exit 0" —
     assert `log` received a body containing `BRIEF_MARKER` and `postBrief` was not called.
   - "calls postBrief once when `--comment` present" — assert `postBrief` called with the body.
   - "honors `--diff <range>` via resolveDiffRange; falls back to default range otherwise" — assert
     the injected `runGit`/`resolveRaw` receive the resolved range.
   - "succeeds (exit 0) with no `--from` and empty signals/outcome" — assert the returned brief
     still has all six section headings and no throw.
2. Run vitest — observe failures.
3. Implement:
   - `runPreMergeBrief(opts)`: resolve range via `resolveDiffRange`, get raw diff via injected
     `resolveRaw`+`runGit`, `buildDiffInfo` (undefined on empty), `readReview(opts.from)`,
     `gatherSignalsSafe(cwd)`, `findOutcomeVerdict(store, headSha)`; assemble `BriefInputs`; call
     `buildBriefBody`; if `opts.comment` call `postBrief(body)` else `log(body)`. Return `{ body }`.
     Contains **no** `process.exit`.
   - `createPreMergeBriefCommand(): Command` — `new Command('pre-merge-brief')` with
     `.option('--from <path>', 'review-ci --json verdict artifact')`,
     `.option('--comment', "upsert the brief as a sticky comment on the current branch's PR")`,
     `.option('--diff <range>', 'git range (default: origin/<base>...HEAD)')`. The `.action` calls
     `runPreMergeBrief` with default seams and `process.exit(0)` (exit lives ONLY in the action).
4. Run the test — observe pass.
5. Run: `nvm use 22 && npx vitest run packages/cli/tests/commands/pre-merge-brief.test.ts` — full file green.
6. Run: `harness validate`.
7. Commit: `feat(cli): wire pre-merge-brief command action and flags`

### Task 11: Register command in `_registry.ts` (regenerated barrel)

**Depends on:** Task 10 | **Files:** `packages/cli/src/commands/_registry.ts` | **Category:** integration

1. Run the barrel generator (do NOT hand-edit the AUTO-GENERATED file):
   `nvm use 22 && pnpm run generate-barrel-exports`
2. Verify `_registry.ts` now imports `createPreMergeBriefCommand` from `./pre-merge-brief` and lists
   it in `commandCreators` (alphabetical — after `createPredictCommand`, before `createProposalsCommand`).
3. [checkpoint:human-verify] Run `harness pre-merge-brief --help` and confirm the command,
   `--from`, `--comment`, `--diff` flags appear. Then run
   `harness pre-merge-brief --from <a review-ci --json fixture> ` and confirm a full six-section
   brief prints to stdout and the process exits 0. Show the output and wait for confirmation.
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/commands/pre-merge-brief.test.ts`.
5. Run: `harness validate`.
6. Commit: `feat(cli): register pre-merge-brief command`

## Sequencing Notes

- Task 1 (deps) is the sole prerequisite for imports. Tasks 3-7 build `buildBriefBody` one pure
  section per task (each atomic, TDD). Tasks 8-9 add the seams/readers. Task 10 composes them; Task
  11 registers. Strictly linear — no parallelizable branches given the single-file target.
- All build/test commands run under **Node 22** (`nvm use 22`); Node 26 breaks better-sqlite3's
  native ABI (pulled transitively via `@harness-engineering/graph`).

## Traceability

| Observable Truth             | Delivered by        |
| ---------------------------- | ------------------- |
| 1 (pure, ordered sections)   | Tasks 3-7           |
| 2 (per-input degradation)    | Tasks 3, 4, 5, 6, 9 |
| 3 (exact union)              | Task 7              |
| 4 (sticky upsert, fake seam) | Task 8              |
| 5 (CLI flags, exit 0)        | Task 10             |
| 6 (registration)             | Task 11             |
| 7 (validate, Node 22)        | every task          |

## Integration Tier

**medium** — new command + new export surface within an existing package (`packages/cli`), new
runtime dependency edge (CLI → signals). Wiring checks (barrel regeneration, `check-deps`) plus the
dependency addition are the integration requirements. Skill, dogfood workflow, docs/ADRs, and
roadmap follow-up rows are Phases 3-5 and are explicitly excluded.
