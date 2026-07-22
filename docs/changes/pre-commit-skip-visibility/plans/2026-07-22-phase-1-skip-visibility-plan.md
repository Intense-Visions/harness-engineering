# Plan: Make pre-commit skipped checks visible

**Date:** 2026-07-22 | **Spec:** `docs/changes/pre-commit-skip-visibility/proposal.md` | **Tasks:** 5 | **Time:** ~18 min | **Integration Tier:** small

## Goal

When the `.husky/pre-commit` hook runs, each of the six `--skip` categories is named on its own `stderr` line, derived from a single source-of-truth list, with the actual `ci check` command, skip set, exit behavior, and file mode all unchanged.

## Observable Truths (Acceptance Criteria)

1. WHEN the hook's gate block runs, the system SHALL emit exactly one `stderr` line per category in the `--skip` list (six lines: `entropy`, `docs`, `perf`, `security`, `deps`, `phase-gate`), each line naming that category. (Spec criterion 1)
2. The warning lines SHALL be written to `stderr` (`>&2`) only — `stdout` of the hook SHALL NOT contain them, so piped/captured stdout is unaffected. (Spec criterion 2)
3. The effective `ci check` invocation SHALL remain byte-identical in behavior: `--skip entropy,docs,perf,security,deps,phase-gate`, same command, same fail-closed `exit 1` on nonzero. A passing commit still passes; a blocked commit still blocks. (Spec criterion 3)
4. The warned categories and the `--skip` argument SHALL be the same shell value (one `SKIP` variable), so they cannot drift. (Spec criterion 4)
5. The file SHALL retain mode `100755` (`git ls-files -s .husky/pre-commit` reports `100755`).
6. All existing comments in the file — especially the `#726` tee-exit-code note (lines 6–12) and the node-pin note (lines 14–22) — SHALL be preserved verbatim.
7. Regression guards stay green: `pre-commit-cicheck-gate.e2e.test.ts` and `strength-003-skip-list.test.ts` pass.

## File Map

- MODIFY `.husky/pre-commit` — insert a `SKIP` assignment + per-category `stderr` warning loop immediately before the `ci check` invocation (current line 27), and change that invocation to consume `"$SKIP"`. No other files.

_Confirmed via grep: the literal `entropy,docs,perf,security,deps,phase-gate` also appears in `docs/roadmap*`, `docs/changes/*/proposal.md`, and three harness-strength **test fixtures** (`strength-003-skip-list.test.ts:23`, `auditor.test.ts:72`, and planning docs). Those fixtures are self-contained strings, NOT reads of the real hook, so editing `.husky/pre-commit` does not touch them. Do not edit them (spec: edit ONLY `.husky/pre-commit`)._

## Current-state evidence (verified 2026-07-22)

- `.husky/pre-commit` is mode `100755` (`git ls-files -s .husky/pre-commit` → `100755`).
- Lines 1–12: comment header incl. the load-bearing `#726` tee note. Lines 14–25: node-pin note + `if [ -f .husky/ensure-node-pin.sh ]; then . …; fi`. Line 26: blank. **Line 27:** `if ! node packages/cli/dist/bin/harness.js ci check --skip entropy,docs,perf,security,deps,phase-gate >/tmp/harness-pre-commit.log 2>&1; then`. Lines 28–38: fail-closed body + `exit 1`. Line 39: `cat /tmp/harness-pre-commit.log`. Line 40: `npx lint-staged`. Lines 42–77: plugin-artifact + roadmap-regen blocks.
- Precise insertion point: **between line 26 (blank) and line 27 (the `if ! node … ci check …` line)** — the warnings must print before the gate runs.

## Uncertainties

- **[DECISION — see Task 3 checkpoint] STRENGTH-003 runtime silencing.** `harness-strength` rule STRENGTH-003 detects oversized skip lists via `/--skip[= ]+([\w,-]+)/`, which only matches a **literal** comma-list. Moving the invocation to `--skip "$SKIP"` means the rule no longer matches the real hook at audit time, so its warning-severity finding goes silent. This breaks **no test** (its unit test uses a self-contained fixture) and blocks nothing (severity `warning`, not in the pre-commit skip set). The new per-commit runtime warnings are strictly louder than the static audit finding, so the visibility goal is over-satisfied — but this is a conscious side effect the executor must accept. Fallback documented in Task 3.
- **[ASSUMPTION] e2e producer-rewrite stays valid.** `pre-commit-cicheck-gate.e2e.test.ts` rewrites the producer with `/node packages\/cli\/dist\/bin\/harness\.js ci check[^>|]*/`. `--skip "$SKIP"` introduces no `>` or `|`, so the match still spans to the `>` redirect. Verified by reading the test; re-verified by running it in Task 4.
- **[ASSUMPTION] Loop variable `cat` is safe.** `cat` is used later as a command (`cat /tmp/…`). In POSIX sh, a shell **variable** named `cat` and the **command** `cat` occupy separate namespaces; `$cat` (the loop var) never shadows the `cat` command. The user-specified idiom `for cat in …` is retained.

## TDD note (shell hook)

This change edits a single POSIX-sh git hook and the spec constrains edits to **only** `.husky/pre-commit` — no new test file may be added. The pre-existing `pre-commit-cicheck-gate.e2e.test.ts` is the regression guard for the gate's structure; the per-category stderr output is verified by an executable runtime check in Task 3 (write-the-check-first, observe-it-fail-then-pass), which substitutes for a unit test here.

## Tasks

### Task 1: Capture the current stderr baseline (proves the "before" state)

**Depends on:** none | **Files:** none (read-only verification)

1. From the repo root, run the isolated gate-preamble to confirm that **today** the skip categories produce **zero** stderr lines. Run:
   ```sh
   sh -c 'set -e
   if [ -f .husky/ensure-node-pin.sh ]; then . .husky/ensure-node-pin.sh; fi
   true' 2>/tmp/skipwarn-before.err 1>/dev/null || true
   grep -c "SKIPPED" /tmp/skipwarn-before.err || echo "0 (expected: 0 before change)"
   ```
2. Confirm output is `0` — no per-category warnings exist yet. This is the failing pre-state the change must flip.
3. Record file mode for later comparison: `git ls-files -s .husky/pre-commit` → confirm prefix `100755`.
4. No commit (read-only).

### Task 2: Insert the `SKIP` variable + per-category stderr warning loop, and point the invocation at `"$SKIP"`

**Depends on:** Task 1 | **Files:** `.husky/pre-commit`

1. Open `.husky/pre-commit`. Locate line 27 (the `if ! node packages/cli/dist/bin/harness.js ci check --skip entropy,docs,perf,security,deps,phase-gate >/tmp/harness-pre-commit.log 2>&1; then` line). **Do not touch lines 1–25** (all comments and the node-pin block stay verbatim).
2. Immediately **before** that `if ! …` line (i.e. after the blank line 26), insert:
   ```sh
   # Single source of truth for the skipped check categories: the SAME value is
   # both looped over below (one stderr warning per category, so each disabled
   # guardrail stays visibly named — roadmap #529) AND passed to `ci check` via
   # "$SKIP". Editing this list updates the warnings and the actual skip together;
   # they cannot drift.
   SKIP="entropy,docs,perf,security,deps,phase-gate"
   for cat in $(echo "$SKIP" | tr ',' ' '); do
     echo "⚠ pre-commit: '$cat' check SKIPPED (deferred to CI/pre-push) — see roadmap #529" >&2
   done
   ```
3. Change ONLY the `--skip` argument on the invocation line from the literal to the variable, leaving everything else byte-identical:
   ```sh
   if ! node packages/cli/dist/bin/harness.js ci check --skip "$SKIP" >/tmp/harness-pre-commit.log 2>&1; then
   ```
   (The redirect `>/tmp/harness-pre-commit.log 2>&1`, the `if ! …; then`, the body, and the fail-closed `exit 1` are unchanged.)
4. Constraints to honor while editing: POSIX sh only — no bashisms (no arrays, no `set -o pipefail`, no `${PIPESTATUS[…]}`); the `for cat in $(echo "$SKIP" | tr ',' ' ')` idiom is dash-portable. Warnings go to `stderr` (`>&2`) only. Keep the `#726` tee note and node-pin note intact. Do not alter the shebang/mode.
5. Run: `node packages/cli/dist/bin/harness.js validate` — confirm it still exits 0.
6. Do NOT commit yet (verification first — Task 3).

### Task 3: Verify runtime stderr output, stdout cleanliness, and unchanged pass/block behavior `[checkpoint:human-verify]` `[checkpoint:decision]`

**Depends on:** Task 2 | **Files:** none (verification of `.husky/pre-commit`)

1. **Six named warnings on stderr, in order.** Run the warning preamble in isolation and inspect stderr:
   ```sh
   SKIP="entropy,docs,perf,security,deps,phase-gate"
   for cat in $(echo "$SKIP" | tr ',' ' '); do
     echo "⚠ pre-commit: '$cat' check SKIPPED (deferred to CI/pre-push) — see roadmap #529" >&2
   done 2>/tmp/skipwarn-after.err 1>/tmp/skipwarn-after.out
   grep -c "SKIPPED" /tmp/skipwarn-after.err   # expect: 6
   grep -oE "'(entropy|docs|perf|security|deps|phase-gate)'" /tmp/skipwarn-after.err  # expect all six, once each
   wc -c /tmp/skipwarn-after.out               # expect: 0  (nothing on stdout)
   ```
   Confirm: exactly 6 stderr lines, each naming a distinct category, and stdout is empty (criteria 1 + 2).
2. **Effective invocation unchanged.** Confirm the variable expands to the original literal:
   ```sh
   SKIP="entropy,docs,perf,security,deps,phase-gate"; printf '%s\n' "--skip $SKIP"
   # expect: --skip entropy,docs,perf,security,deps,phase-gate
   ```
3. **Pass/block behavior unchanged (real hook).** In a scratch state with a trivial staged change, run a real commit and observe: on a clean tree the commit proceeds (gate passes) and the six warnings appear on stderr; if `harness ci check` would fail, the `Commit blocked` path and `exit 1` still fire. (The dedicated fail-closed proof is the e2e test run in Task 4 — no need to force a real arch regression here.)
4. **File mode preserved.** Run `git ls-files -s .husky/pre-commit` → confirm `100755` (criterion 5).
5. **Comments preserved.** `git diff .husky/pre-commit` — confirm the diff is purely additive around line 27 (new `SKIP=`/loop block + the `--skip "$SKIP"` swap) and that lines 1–25 and the `#726` note are untouched (criterion 6).
6. `[checkpoint:decision]` **STRENGTH-003 side effect.** Confirm the accepted approach: moving to `--skip "$SKIP"` silences the STRENGTH-003 static audit finding on the real hook (no test breaks; runtime warnings compensate). Present the fallback and stop for confirmation:
   - **A) (recommended, matches spec)** Keep `--skip "$SKIP"` — true single source of truth (criterion 4), STRENGTH-003 goes silent, no test breaks.
   - **B) (fallback)** Keep the literal `--skip entropy,…` on the invocation line unchanged and let the loop read the separate `SKIP` literal — preserves STRENGTH-003 but introduces two copies that CAN drift (violates criterion 4).
     Recommend **A** (the spec's criterion 4 and the executor notes explicitly call for a single derived list).
7. `[checkpoint:human-verify]` Show the six-line stderr output and the `git diff` to the human; wait for confirmation before committing.
8. Run: `node packages/cli/dist/bin/harness.js validate`.

### Task 4: Run the affected regression tests

**Depends on:** Task 3 | **Files:** none (test execution)

1. Run the pre-commit gate e2e (proves the `[^>|]*` producer-rewrite still matches `--skip "$SKIP"` and the fail-closed gate still blocks):
   ```sh
   npx vitest run packages/cli/tests/hooks/pre-commit-cicheck-gate.e2e.test.ts
   ```
   Expect all cases pass (BLOCKS on nonzero, ALLOWS on zero).
2. Run the STRENGTH-003 unit test (proves the rule's self-contained fixtures are unaffected by the real-hook edit):
   ```sh
   npx vitest run packages/core/src/harness-strength/rules/strength-003-skip-list.test.ts
   ```
   Expect pass.
3. If either fails, return to Task 2 — do not proceed.
4. No commit (test run only).

### Task 5: Commit the change

**Depends on:** Task 4 | **Files:** `.husky/pre-commit`

1. Stage only the hook: `git add .husky/pre-commit`.
2. Confirm no unintended files staged: `git status --porcelain` shows only `.husky/pre-commit`.
3. Run: `node packages/cli/dist/bin/harness.js validate`.
4. Commit:

   ```
   feat(pre-commit): name each skipped ci-check category on stderr (#529)

   Derive the six skipped categories from a single SKIP variable that feeds
   both a per-category stderr warning loop and the ci-check --skip argument,
   so the disabled guardrails stay visibly named at commit time and cannot
   drift from the actual skip set. Effective invocation, exit behavior, and
   file mode unchanged. POSIX-sh (dash-safe); #726 tee note preserved.
   ```

5. If a pre-commit hook reformats or blocks, resolve, re-`git add .husky/pre-commit`, and re-commit.

## Sequencing / parallelism

Strictly sequential: Task 1 (baseline) → Task 2 (edit) → Task 3 (verify + decision) → Task 4 (regression tests) → Task 5 (commit). All tasks touch or gate on the same single file; no parallel waves.

## Traceability

| Observable truth              | Delivered by                                   |
| ----------------------------- | ---------------------------------------------- |
| 1 (six named stderr lines)    | Task 2 (loop), Task 3 step 1                   |
| 2 (stderr only, stdout clean) | Task 2 (`>&2`), Task 3 step 1                  |
| 3 (invocation/exit unchanged) | Task 2 step 3, Task 3 steps 2–3, Task 4 step 1 |
| 4 (single source of truth)    | Task 2 (`SKIP` feeds both), Task 3 step 6      |
| 5 (mode 100755)               | Task 1 step 3, Task 3 step 4                   |
| 6 (comments preserved)        | Task 2 step 1/4, Task 3 step 5                 |
| 7 (regression guards green)   | Task 4                                         |

## Notes

- Per the operating rule "commit only when the user asks," Task 5's commit runs only on the user's go-ahead; this planning pass writes the plan document but does not commit it.
