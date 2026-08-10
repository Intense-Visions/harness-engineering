# Plan: validate-check-abstention — a check that could not run must never report as passed

**Date:** 2026-08-10 · **Spec:** `docs/changes/validate-check-abstention/proposal.md` · **Tasks:** 12 · **Time:** ~70 min · **Integration Tier:** small-medium

## Goal

Give `harness validate` a third outcome. Today it has two — passed and failed — for
three states, so "could not check" is forced into one of the other two and the code
picked "passed": a `docs/roadmap.md` that `parseRoadmap` rejects yields
`v validation passed` and exit `0`, with the parse error discarded and RMH001–RMH005
all silently skipped (`packages/cli/src/commands/validate.ts:299-319`). The same
swallow sits one check above it in the aggregate-drift doctor, which reports
`roadmapAggregateDrift = true` when the shards could not be regenerated
(`validate.ts:270-290` + `packages/core/src/validation/roadmap-aggregate-drift.ts:59-68`).

Add an unfilterable abstention ledger (`unavailableChecks` + derived `complete`),
map it to `ExitCode.ZERO_DENOMINATOR` (3), and render it as a dedicated
"Checks that could not run" section — while leaving the existing non-blocking
RMH002 advisory behavior byte-for-byte unchanged.

## Observable Truths (Acceptance Criteria)

Traceability: AC-n implements spec success criterion SC-n.

1. **AC-1 (SC1)** — `runValidate()` over a project whose `docs/roadmap.md` fails to
   parse returns `complete: false`, exactly one `unavailableChecks` entry with
   `check: 'roadmapHealth'` and `file: 'docs/roadmap.md'`, a `reason` containing the
   parser's own message substring, and `checks.roadmapHealth === undefined`.
   **Gate:** new case in `packages/cli/tests/commands/validate.roadmap-health.test.ts`.
2. **AC-2 (SC2)** — The CLI over that same project exits `3` and prints
   `Validation incomplete`, and does not print `validation passed`.
   **Gate:** CLI-level test asserting exit code + stdout via the built binary
   (`node packages/cli/dist/bin/harness.js validate`) in a temp project.
3. **AC-3 (SC3)** — The existing RMH002-only case still returns `valid: true`,
   `complete: true`, `unavailableChecks: []`, exit `0`.
   **Gate:** the pre-existing test at `validate.roadmap-health.test.ts` passes
   **unmodified**, plus added `complete`/`unavailableChecks` assertions.
4. **AC-4 (SC4)** — The existing RMH003 case still returns `valid: false`,
   `checks.roadmapHealth === false`, `complete: true`, exit `1`.
   **Gate:** pre-existing test passes unmodified + added assertions.
5. **AC-5 (SC5)** — Absent `docs/roadmap.md`: `checks.roadmapHealth === undefined`,
   `unavailableChecks: []`, `complete: true`. **Gate:** pre-existing absent-file test
   passes unmodified + added assertions.
6. **AC-6 (SC6)** — Sharded project whose shards cannot be regenerated produces a
   `roadmapAggregateDrift` entry in `unavailableChecks` and leaves
   `checks.roadmapAggregateDrift === undefined` (was `true`).
   **Gate:** new test file `validate.roadmap-abstention.test.ts`.
7. **AC-7 (SC7)** — A run with both an abstention and an error-severity finding
   exits `3` and still prints every finding. **Gate:** test asserting exit code and
   that the issue text is present in stdout.
8. **AC-8 (SC8)** — `--severity error` leaves `unavailableChecks` non-empty and the
   exit code `3`. **Gate:** test invoking `runValidate({ severity: 'error' })` plus a
   CLI exit-code assertion.
9. **AC-9 (SC9)** — `formatValidation` output is byte-identical for any result with
   no/empty `unavailableChecks`, including QUIET+valid returning exactly `''`.
   **Gate:** existing `packages/cli/tests/output/*` suites (22 tests) pass
   unmodified, plus an explicit omitted-vs-empty equality assertion.
   9b. **AC-9b (SC10, SC11)** — QUIET prints one line per abstention on a `valid: true`
   run; a both-incomplete-and-failing run prints both headlines with every finding.
   **Gate:** new formatter cases.
   9c. **AC-9c (SC12)** — `emitValidateOutput` passes `unavailableChecks` through, so
   the CLI never exits 3 while printing `validation passed`. **Gate:** the CLI-level
   test in Task 7 asserts `not.toContain('validation passed')`.
   9d. **AC-9d** — `agents/skills/claude-code/harness-roadmap/SKILL.md` Phase 4 no
   longer instructs an agent to read `roadmapHealth` as a two-state boolean.
   **Gate:** `grep` for `checks.roadmapHealth === true` in that SKILL.md.
10. **AC-10** — Whole-repo gates green: `pnpm -w typecheck`, `pnpm -w lint`,
    `pnpm --filter @harness-engineering/cli test`, `pnpm format:check`.
    **Gate:** the four commands exit 0.
11. **AC-11** — A patch changeset exists and `pnpm changeset status` is satisfied;
    `docs/reference/cli.md` documents the three exit codes.
    **Gate:** file exists; `grep` for the exit-code table.
12. **AC-12** — Manual reproduction from the bug report inverts: the `Status: cancelled`
    fixture that printed `v validation passed` / exit `0` now prints
    `Validation incomplete` / exit `3`, while the `Status: in-progress` fixture still
    prints `Validation failed` / exit `1`. **Gate:** run both fixtures against the
    rebuilt CLI.

## Uncertainties

- [ASSUMPTION] Exit `3` (`ExitCode.ZERO_DENOMINATOR`) is safe for `harness validate`.
  Verified: no `.github/workflows` job, `scripts/`, or `.husky/` hook gates on
  `harness validate`'s exit code; the only references are documentation strings
  (`scripts/generate-agent-setup-prompt.mjs:124`, `scripts/generate-docs.mjs:208`).
  Any consumer testing `!= 0` is unaffected.
- [ASSUMPTION] Abstention outranks failure in exit-code precedence (spec D2). Both
  codes are non-zero, so no gate flips red→green either way; the choice only picks
  which non-green signal surfaces.
- [ASSUMPTION] `unavailableChecks` is always present (empty array on a complete run)
  rather than optional-on-`ValidateResult`, so JSON consumers can read it
  unconditionally. On the formatter's `ValidationResult` it stays **optional**, so
  every other caller of `formatValidation` is untouched.
- [ASSUMPTION] The three design audits (`componentAnatomy`, `driftDetection`,
  `brandCompliance`) keep their existing warning-on-catch behavior — they catch a
  checker crash, not unusable input, and migrating them is a wider behavior change
  (spec Non-goals).
- [ASSUMPTION] The `validate_project` MCP tool is out of scope — it never calls
  `runValidate` and performs no roadmap check at all, so `assess_project` keeps
  reporting green over an unparseable roadmap. Named as residual risk in the spec
  Non-goals and in the PR's assumptions.
- [ACCEPTED RISK] A transient shard read error (149 shards in this repo) would move
  `harness validate` from `0` to `3` via the aggregate-drift abstention. Correct but
  noisy; non-zero rather than green; a re-run clears it.
- [ASSUMPTION] No roadmap-row promotion for this change (spec D6) — the item is
  tracked by an existing GitHub issue and `manage_roadmap add` would mint a duplicate.
- [DEFERRABLE] Exact wording of the incomplete headline and the closing
  "A check that could not run is not a check that passed" line.

## File Map

- MODIFY `packages/cli/src/commands/validate.ts` — `UnavailableCheck` type,
  `unavailableChecks` + `complete` on `ValidateResult`, the two abstention branches,
  `complete` derivation after the `--severity` block, exit-code mapping in
  `runValidateAction`, and `unavailableChecks` pass-through in `emitValidateOutput`.
- MODIFY `packages/cli/src/output/formatter.ts` — optional `unavailableChecks` on
  `ValidationResult`, incomplete headline + "Checks that could not run" section in
  TEXT/VERBOSE, one-line-per-abstention in QUIET.
- MODIFY `packages/cli/tests/commands/validate.roadmap-health.test.ts` — additive
  assertions on the three existing cases; new parse-failure cases.
- CREATE `packages/cli/tests/commands/validate.roadmap-abstention.test.ts` —
  aggregate-drift abstention, `--severity` unfilterability, exit-code precedence,
  CLI-level exit-code + stdout cases.
- MODIFY `packages/cli/tests/output/formatter.test.ts` (or nearest existing file) —
  incomplete rendering + byte-identical-when-empty cases.
- MODIFY `docs/reference/cli.md` — repair the global `## Exit Codes` table (adds `3`,
  which four commands already use and it already omitted) + a per-command note under
  `### harness validate`. NOT `docs/reference/cli-commands.md` — auto-generated, and
  `.husky/pre-push` runs `pnpm run generate-docs --check`.
- MODIFY `agents/skills/claude-code/harness-roadmap/SKILL.md` — Phase 4 VALIDATE step
  must read `checks.roadmapHealth === true`, not "not failing", and must react to the
  incomplete outcome. No internal issue/PR numbers (shipped skill body).
- CREATE `.changeset/validate-check-abstention.md` — patch, `@harness-engineering/cli`.

## Skeleton

1. **Contract** — types + ledger + `complete` derivation (Task 1). No behavior change yet.
2. **Red** — write the failing tests for both swallows (Tasks 2, 5).
3. **Green** — close the two swallows (Tasks 3, 6).
4. **Exit code** — precedence mapping + CLI-level tests (Tasks 4, 7).
5. **Renderer** — formatter section + formatter tests (Tasks 8, 9).
6. **Docs/changeset** (Task 10).
7. **Verification sweep** — typecheck, lint, tests, format, manual repro (Tasks 11, 12).

## Tasks

### Task 1 — Add the abstention ledger to `ValidateResult`

**Files:** `packages/cli/src/commands/validate.ts`
**Do:** Add the `UnavailableCheck` interface (`check`, `file?`, `reason`,
`suggestion?`). Add `complete: boolean` and `unavailableChecks: UnavailableCheck[]`
to `ValidateResult`. Initialize `unavailableChecks: []` and `complete: true` in the
`result` literal. After the `--severity` filter block and before `return Ok(result)`,
set `result.complete = result.unavailableChecks.length === 0` — after the filter so
the filter provably cannot influence it.
**Verify:** `pnpm --filter @harness-engineering/cli typecheck` passes; existing
validate tests still pass (no behavior change yet).
**Outputs:** the ledger contract other tasks write into.

### Task 2 — [RED] Failing test: roadmap parse failure must abstain

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/validate.roadmap-health.test.ts`
**Do:** Add a case building a project whose `docs/roadmap.md` has
`- **Status:** cancelled` (the bug report's fixture). Assert AC-1: `complete === false`,
one `unavailableChecks` entry for `roadmapHealth` with `file: 'docs/roadmap.md'`,
`reason` containing `'cancelled'`, and `checks.roadmapHealth === undefined`. Also add
the additive `complete`/`unavailableChecks` assertions to the three existing cases
(AC-3, AC-4, AC-5) **without altering their existing expectations**.
**Verify:** the new case FAILS; the three existing cases PASS.

### Task 3 — [GREEN] Close the `roadmapHealth` swallow

**Depends on:** Task 2
**Files:** `packages/cli/src/commands/validate.ts`
**Do:** Add the `else` branch to the `if (parsed.ok)` guard, pushing the
`roadmapHealth` abstention with the parser error embedded verbatim in `reason` and a
`suggestion` naming `docs/roadmap.md` / its shard. Do **not** assign
`checks.roadmapHealth` (spec D4). Update the block comment above the check so it no
longer claims a parse failure is a silent skip.
**Verify:** Task 2's case passes; all pre-existing cases still pass. (AC-1)

### Task 4 — Exit-code mapping with abstention precedence

**Depends on:** Task 3
**Files:** `packages/cli/src/commands/validate.ts`
**Do:** In `runValidateAction`, replace the two-way `process.exit` with the three-way
mapping: `!complete → ExitCode.ZERO_DENOMINATOR`, else `valid → SUCCESS`, else
`VALIDATION_FAILED`. Add a comment citing the `ZERO_DENOMINATOR` doc contract and the
precedence rationale.
**Verify:** `typecheck` passes; build the CLI and confirm the bug-report fixture now
exits 3. (AC-2 partially; completed in Task 7)

### Task 5 — [RED] Failing test: unregenerable shards must abstain

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/validate.roadmap-abstention.test.ts` (new)
**Do:** Build a sharded project (`docs/roadmap.d/` present) whose shards make
`regenerate()` return `Err`. Assert AC-6: a `roadmapAggregateDrift` entry exists and
`checks.roadmapAggregateDrift === undefined`. Assert the current (buggy) behavior is
gone — it must no longer be `true`.
**Verify:** the case FAILS against current code.

### Task 6 — [GREEN] Close the aggregate-drift swallow

**Depends on:** Task 5
**Files:** `packages/cli/src/commands/validate.ts`
**Do:** Split the drift block: when `!regenerated.ok`, push the
`roadmapAggregateDrift` abstention (reason carries `regenerated.error.message`,
suggestion names `harness roadmap regen`) and leave the check unassigned; otherwise
keep today's stale/fresh branches unchanged.
**Verify:** Task 5's case passes; `validate.merge-driver.test.ts` and any sharded
roadmap tests still pass. (AC-6)

### Task 7 — CLI-level exit-code, precedence, and unfilterability tests

**Depends on:** Tasks 4, 6
**Files:** `packages/cli/tests/commands/validate.roadmap-abstention.test.ts`
**Do:** Add: (a) a CLI-level case spawning the built binary against the parse-failure
fixture asserting exit `3`, stdout contains `Validation incomplete`, stdout does not
contain `validation passed` (AC-2); (b) a case with both an abstention and an
RMH003 error asserting exit `3` and that the RMH003 message is still printed (AC-7);
(c) `runValidate({ severity: 'error' })` over the parse-failure fixture asserting
`unavailableChecks.length === 1` and `complete === false` (AC-8).
**Verify:** all three pass.

### Task 8 — Renderer: the "Checks that could not run" section

**Depends on:** Task 1
**Files:** `packages/cli/src/output/formatter.ts`, `packages/cli/src/commands/validate.ts`
**Do:** Add optional `unavailableChecks?: Array<{ check; file?; reason; suggestion? }>`
to the formatter's `ValidationResult` (the interface is not exported — add it in
place). In `formatValidation`: when the array is absent or empty, return exactly
today's output (early-path unchanged). When non-empty, emit the
`! Validation incomplete (N check(s) could not run)` headline, then a
`Checks that could not run:` block (one entry per abstention: `check (file)` then the
reason, with `suggestion` shown only in VERBOSE, matching `appendIssueLines`), then the
closing "A check that could not run is not a check that passed" line, then — if any
issues exist — the existing `x Validation failed (N issues)` heading and issue list
(both headlines, incomplete first).

QUIET mode: the existing `if (result.valid) return ''` early return must be gated on
the ledger being EMPTY as well — the dominant abstention case is `valid: true`, so an
ungated early return would print nothing while exiting 3. When non-empty, print
`<file>: <reason>` per abstention ahead of the issue lines.

**Critical wiring:** `emitValidateOutput` builds the formatter payload as a closed
object literal, so it must be changed to pass `unavailableChecks: value.unavailableChecks`.
Without this the formatter always sees `undefined`, always takes the byte-identical
path, and the CLI exits `3` while printing `validation passed` — strictly worse than
the original bug.
**Verify:** `typecheck` passes; the manual fixture prints the incomplete section.

### Task 9 — Formatter tests

**Depends on:** Task 8
**Files:** `packages/cli/tests/output/` (nearest existing formatter test file)
**Do:** Add cases: incomplete rendering in TEXT; QUIET printing abstentions on a
`valid: true` run; both headlines when incomplete AND failing; suggestion shown only
in VERBOSE; and an explicit byte-identical assertion for a result with
`unavailableChecks: []` versus one with the field omitted, in both TEXT and QUIET
(AC-9, AC-9b).
**Verify:** new cases pass; all 22 pre-existing output tests pass unmodified.

### Task 10 — Docs + changeset

**Depends on:** Task 4
**Files:** `docs/reference/cli.md`, `agents/skills/claude-code/harness-roadmap/SKILL.md`,
`.changeset/validate-check-abstention.md`
**Do:** Repair the global `## Exit Codes` table in `docs/reference/cli.md` (add `3`
with its meaning) and add a per-command exit-code note under `### harness validate`
(0 = all applicable checks ran and passed; 1 = a check ran and failed; 3 = a check
could not run) plus a line on `complete` / `unavailableChecks` in `--json`. Correct
the roadmap SKILL.md Phase 4 VALIDATE step to require `checks.roadmapHealth === true`
and to react to the incomplete outcome — no internal issue/PR numbers in the shipped
skill body. Write a patch changeset for `@harness-engineering/cli`. Keep the issue
reference in the changeset and PR only.
**Verify:** `grep` finds the tables and the SKILL.md wording; `pnpm changeset status`
satisfied. (AC-11, AC-9d)

### Task 11 — Verification sweep

**Depends on:** Tasks 7, 9, 10
**Do:** `pnpm -w typecheck`, `pnpm -w lint`, `pnpm --filter @harness-engineering/cli test`,
`pnpm format:check`, `pnpm build`. Re-run any flaky suite once before treating a
failure as real.
**Verify:** all exit 0. (AC-10)

### Task 12 — Manual reproduction inversion

**Depends on:** Task 11
**Do:** Rebuild the CLI and run both bug-report fixtures (`Status: cancelled` and
`Status: in-progress`) against `node packages/cli/dist/bin/harness.js validate`.
**Verify:** case A now prints `Validation incomplete` with exit `3`; case B still
prints `Validation failed` with exit `1`. (AC-12)

## Checkpoints

- `[checkpoint:verify]` after Task 3 — the headline bug is fixed at the API level.
- `[checkpoint:verify]` after Task 7 — the full three-state contract holds end-to-end.
- `[checkpoint:review]` after Task 11 — code review before PR.
