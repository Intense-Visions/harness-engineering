# Plan: Faster pre-push gates & CI — Phase 1

**Date:** 2026-07-17 | **Spec:** `docs/changes/faster-gates/proposal.md` | **Tasks:** 7 | **Time:** ~28 min | **Integration Tier:** medium

## Goal

Scope `pre-push` format/typecheck/test to the affected package set (with a full-run fallback when `origin/main` is unresolvable), tolerate missing coverage locally via a `coverage-ratchet` `--allow-missing` flag, and cache `.turbo` across CI runs — without weakening what CI validates.

## Scope Note

**Phase 1 ONLY.** Phase 2 (test-isolation hardening + `--concurrency` ratchet) is explicitly deferred and out of scope. The `--concurrency=2` cap stays exactly as-is in this phase.

## Observable Truths (Acceptance Criteria)

1. `.husky/pre-push` runs prettier `--check` over only the changed-file union (`git diff --name-only origin/main...HEAD` ∪ working-tree changes, filtered to `{ts,tsx,md,json}`), not `pnpm run format:check`.
2. **[Unwanted]** If `origin/main` is unresolvable (fresh clone / detached HEAD), then `.husky/pre-push` falls back to whole-tree `pnpm run format:check` and full-suite `typecheck` / `test:coverage` — never a silently narrower gate.
3. `.husky/pre-push` runs `pnpm exec turbo run typecheck --affected` and `pnpm exec turbo run test:coverage --affected --concurrency=2` (concurrency cap preserved).
4. `.husky/pre-push` invokes `node scripts/coverage-ratchet.mjs --allow-missing`; `check:changesets` and `generate-docs --check` are unchanged.
5. **[Event-driven]** When run with `--allow-missing` and a baselined package has no fresh coverage data, `coverage-ratchet.mjs` logs a skip and continues (no failure).
6. **[Unwanted]** If run WITHOUT `--allow-missing` and a baselined package has no coverage data, then `coverage-ratchet.mjs` still fails with exit 1 (regression guard; CI invocation unchanged and authoritative).
7. A test under `tests/scripts/` proves both #5 and #6, passing via `node --test`.
8. `.github/workflows/ci.yml` has an `actions/cache@v4` step for `.turbo` immediately before `pnpm build` in BOTH `build-and-test` and `refresh-baselines`, with key `turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}` and restore-keys prefix `turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-`.
9. An ADR at `docs/knowledge/decisions/0075-affected-scoped-pre-push.md` documents the local-vs-CI trust boundary.
10. `AGENTS.md` documents that `pre-push` is now affected-scoped and CI is the authoritative full net.
11. `harness ci check` arch gate stays green; no changeset is required (verified below).

## Verified Facts (evidence)

- **No changeset needed.** `scripts/check-changesets.mjs:31` — `PUBLISHABLE_FILE = /^packages\/([^/]+)\/(src\/.+|package\.json)$/`. Every Phase-1 file is root-level (`.husky/`, `.github/`, `scripts/`, `tests/`, `docs/`, `AGENTS.md`) and matches none of it. `node scripts/check-changesets.mjs` currently prints "No publishable package changes detected." (exit 0).
- **Turbo `--affected` supported.** `node_modules/turbo` resolves to **2.10.4**; supports `--affected` with default SCM base `origin/main`.
- **Prettier glob matches the spec filter.** `package.json` `format:check` = `prettier --check "**/*.{ts,tsx,md,json}"`. Use `pnpm exec prettier --check <files>` for the scoped variant.
- **Arch gate green.** `node packages/cli/dist/bin/harness.js ci check` → `arch: pass`, `All checks passed`. All `!` items are non-blocking baseline-relative warnings; none are in files this plan touches.
- **`harness validate` / `check-deps` fail with a pre-existing, unrelated error** (`agent.backends.local.type` discriminator — the global CLI is a stale build vs. repo's `ollama` backend type; see MEMORY "harness CLI on PATH is global"). This is NOT introduced by this plan and does not block committing non-source files. Use `node packages/cli/dist/bin/harness.js ci check` for the local arch gate instead.
- **Existing test harness pattern.** `tests/scripts/baseline-gating.test.mjs` imports the pure `mergeCoverageBaselines` export from `scripts/coverage-ratchet.mjs` and asserts with `node:assert/strict` under `node --test`. New tests follow the same pattern by importing a new pure `evaluateCoverage` export.

## File Map

- MODIFY `scripts/coverage-ratchet.mjs` — extract pure `evaluateCoverage()`, add `--allow-missing` CLI flag
- MODIFY `tests/scripts/baseline-gating.test.mjs` — add partial-mode tests (2 cases)
- MODIFY `.husky/pre-push` — affected-scoping + `origin/main` fallback
- MODIFY `.github/workflows/ci.yml` — `actions/cache@v4` `.turbo` step in `build-and-test` and `refresh-baselines`
- CREATE `docs/knowledge/decisions/0075-affected-scoped-pre-push.md` — ADR
- MODIFY `AGENTS.md` — contributor note

## Skeleton

1. Coverage-ratchet partial mode + TDD (~2 tasks, ~9 min)
2. pre-push affected-scoping (~1 task, ~5 min)
3. CI turbo cache (~1 task, ~4 min)
4. Integration: ADR + AGENTS note (~2 tasks, ~9 min)

**Estimated total:** 7 tasks, ~28 min. _Below 8-task skeleton-approval threshold (standard rigor); proceeding to full tasks without an approval gate._

---

## Tasks

### Task 1: Extract pure `evaluateCoverage()` + add `--allow-missing`, with failing tests first (TDD)

**Depends on:** none | **Files:** `tests/scripts/baseline-gating.test.mjs`, `scripts/coverage-ratchet.mjs`

**Skills:** `ts-testing-types` (reference) — assertion typing patterns, applied loosely to `.mjs`.

TDD order — write the test first, watch it fail, then implement.

1. **Add tests** to `tests/scripts/baseline-gating.test.mjs`. Add a new import alongside the existing `mergeCoverageBaselines` import:

   ```js
   import { mergeCoverageBaselines, evaluateCoverage } from '../../scripts/coverage-ratchet.mjs';
   ```

   Append these test blocks:

   ```js
   test('evaluateCoverage: without allowMissing, a baselined package with no coverage fails (regression guard)', () => {
     const baselines = {
       'packages/core': { lines: 90, branches: 80, functions: 90, statements: 90 },
     };
     const coverageByPkg = { 'packages/core': null }; // no fresh coverage-summary.json
     const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, {
       allowMissing: false,
     });
     assert.equal(failures, 1);
     assert.equal(skipped.length, 0);
   });

   test('evaluateCoverage: with allowMissing, a missing package is skipped, present ones still checked', () => {
     const baselines = {
       'packages/core': { lines: 90, branches: 80, functions: 90, statements: 90 },
       'packages/cli': { lines: 85, branches: 75, functions: 85, statements: 85 },
     };
     const coverageByPkg = {
       'packages/core': null, // skipped under allowMissing
       'packages/cli': { lines: 86, branches: 76, functions: 86, statements: 86 }, // meets baseline
     };
     const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, {
       allowMissing: true,
     });
     assert.equal(failures, 0);
     assert.deepEqual(skipped, ['packages/core']);
   });

   test('evaluateCoverage: with allowMissing, a present package below baseline still fails', () => {
     const baselines = {
       'packages/cli': { lines: 85, branches: 75, functions: 85, statements: 85 },
     };
     const coverageByPkg = {
       'packages/cli': { lines: 80, branches: 75, functions: 85, statements: 85 },
     };
     const { failures } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: true });
     assert.equal(failures, 1); // -5% lines beyond 0.5% tolerance
   });
   ```

2. **Run — observe failure** (`evaluateCoverage` is not yet exported):

   ```
   node --test tests/scripts/baseline-gating.test.mjs
   ```

3. **Implement in `scripts/coverage-ratchet.mjs`.** Add an exported pure function that contains the per-package comparison logic, parameterized on a coverage map (so tests never touch disk) and on `allowMissing`. Place it just above the existing `check()` function:

   ```js
   /**
    * Pure coverage evaluation. Compares a map of already-read coverage results
    * against baselines and reports failures. When `allowMissing` is set, a
    * baselined package with no coverage data (null) is SKIPPED instead of failed
    * — this is the pre-push partial mode, where `turbo --affected` deliberately
    * skips unchanged packages. CI never sets `allowMissing`, so its ratchet stays
    * whole-repo authoritative.
    *
    * @param {Record<string, object>} baselines
    * @param {Record<string, object|null>} coverageByPkg  pkgKey -> coverage result or null
    * @param {{ allowMissing?: boolean }} opts
    * @returns {{ failures: number, skipped: string[] }}
    */
   export function evaluateCoverage(baselines, coverageByPkg, { allowMissing = false } = {}) {
     let failures = 0;
     const skipped = [];

     for (const pkgKey of Object.keys(coverageByPkg)) {
       const baseline = baselines[pkgKey];
       if (!baseline) {
         console.warn(`  Warning: no baseline for ${pkgKey} -- skipping`);
         continue;
       }

       const actual = coverageByPkg[pkgKey];
       if (!actual) {
         if (allowMissing) {
           console.log(`  Skipping ${pkgKey}: no fresh coverage this run (--allow-missing).`);
           skipped.push(pkgKey);
           continue;
         }
         console.error(
           `  FAIL: ${pkgKey} has baseline but no coverage data (missing or unreadable coverage-summary.json)`
         );
         failures++;
         continue;
       }

       for (const metric of METRICS) {
         const baselineVal = baseline[metric];
         const actualVal = actual[metric];
         if (actualVal < baselineVal - V8_VARIANCE_TOLERANCE) {
           console.error(
             `  FAIL: ${pkgKey} ${metric} dropped from ${baselineVal}% to ${actualVal}% (tolerance: ${V8_VARIANCE_TOLERANCE}%)`
           );
           failures++;
         }
       }
     }

     return { failures, skipped };
   }
   ```

   Then rewrite `check()` to build the coverage map and delegate to `evaluateCoverage`, threading the flag:

   ```js
   function check({ allowMissing = false } = {}) {
     const baselines = loadBaselines();
     const coverageByPkg = {};
     for (const pkgKey of Object.keys(PACKAGES)) {
       coverageByPkg[pkgKey] = readCoverage(pkgKey);
     }

     const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, { allowMissing });

     if (failures > 0) {
       console.error(`\n${failures} coverage regression(s) detected.`);
       console.error(
         'If coverage intentionally decreased, run: node scripts/coverage-ratchet.mjs --update'
       );
       process.exit(1);
     }

     const note = skipped.length
       ? ` (${skipped.length} package(s) skipped: no fresh coverage)`
       : '';
     console.log(`Coverage ratchet: all packages meet or exceed baselines.${note}`);
   }
   ```

   Wire the flag in the `invokedDirectly` block — update the `else` branch:

   ```js
   } else {
     const allowMissing = args.includes('--allow-missing');
     console.log(`Checking coverage against baselines${allowMissing ? ' (partial mode)' : ''}...\n`);
     check({ allowMissing });
   }
   ```

   Update the usage comment block at the top of the file to document the new flag:

   ```js
    *   node scripts/coverage-ratchet.mjs                  # check mode (CI, full/authoritative)
    *   node scripts/coverage-ratchet.mjs --allow-missing  # check mode, skip packages with no fresh coverage (pre-push)
    *   node scripts/coverage-ratchet.mjs --update          # update baselines
   ```

4. **Run — observe pass:**

   ```
   node --test tests/scripts/baseline-gating.test.mjs
   ```

5. **Sanity-check the full-mode path still exits non-zero on real missing data** (guards Truth #6 end-to-end; run from repo root where no fresh coverage exists):

   ```
   node scripts/coverage-ratchet.mjs; echo "exit=$?"    # expect FAIL + exit=1
   node scripts/coverage-ratchet.mjs --allow-missing; echo "exit=$?"    # expect skips + exit=0
   ```

6. **Arch gate:** `node packages/cli/dist/bin/harness.js ci check` → expect `arch: pass`.

7. **Commit:** `test(coverage-ratchet): add partial-tolerance evaluateCoverage + --allow-missing`

---

### Task 2: Scope `pre-push` format/typecheck/test to affected, with `origin/main` fallback

**Depends on:** Task 1 (`--allow-missing` must exist) | **Files:** `.husky/pre-push`

Replace the heavy unscoped steps; leave `check:changesets` and `generate-docs --check` untouched. Rewrite `.husky/pre-push` to:

```sh
export PATH="$PATH:/opt/homebrew/bin"

# Mirror CI's changeset-check job so missing changesets fail locally
# (cheap diff-only script — runs in ~1s before the heavier steps).
pnpm run check:changesets

# Resolve an affected-base against origin/main. If it is unresolvable
# (fresh clone, detached HEAD, no remote), fall back to the FULL unscoped
# gate — erring toward MORE coverage, never a silently narrower one.
BASE="origin/main"
if git rev-parse --verify --quiet "$BASE" >/dev/null; then
  AFFECTED_OK=1
else
  AFFECTED_OK=0
  echo "pre-push: origin/main unresolvable — running full unscoped gate."
fi

if [ "$AFFECTED_OK" = "1" ]; then
  # Format check over only changed files (union of branch diff vs origin/main
  # and working-tree changes), filtered to prettier-relevant extensions. Catches
  # merge-missed files without scanning the whole repo.
  CHANGED=$(
    { git diff --name-only "$BASE"...HEAD; git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard; } \
      | grep -E '\.(ts|tsx|md|json)$' | sort -u
  )
  if [ -n "$CHANGED" ]; then
    echo "$CHANGED" | xargs pnpm exec prettier --check
  else
    echo "pre-push: no changed {ts,tsx,md,json} files to format-check."
  fi

  # Affected-scoped typecheck and coverage (base = origin/main, dependents included).
  pnpm exec turbo run typecheck --affected
  # Cap turbo concurrency to 2 packages-at-a-time. Without this, filesystem/sqlite/HTTP-heavy
  # tests flake under compound parallel load (Phase 2 raises this cap after test isolation).
  pnpm exec turbo run test:coverage --affected --concurrency=2
  # Partial mode: --affected skips unchanged packages, so tolerate their missing coverage.
  # CI's ratchet runs flagless (full/authoritative) and is unaffected.
  node scripts/coverage-ratchet.mjs --allow-missing
else
  # Full fallback: whole-tree prettier + all-package typecheck/test.
  pnpm run format:check
  pnpm run typecheck
  pnpm exec turbo run test:coverage --concurrency=2
  node scripts/coverage-ratchet.mjs
fi

pnpm run generate-docs --check
```

**Verification:**

1. **Shell parses cleanly:** `sh -n .husky/pre-push; echo "parse-exit=$?"` → expect `0`.
2. **Changed-file format-check dry-run** (proves the union command produces files without erroring):
   ```
   { git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard; } | grep -E '\.(ts|tsx|md|json)$' | sort -u
   ```
   Expect the plan `.md`, ADR (once created), and ratchet/test files to appear; no error.
3. **Affected commands are valid turbo syntax:** `pnpm exec turbo run typecheck --affected --dry-run=json > /dev/null; echo "turbo-exit=$?"` → expect `0` (dry-run resolves the affected graph without executing).
4. **Fallback branch is reachable:** confirm `git rev-parse --verify --quiet origin/main` returns 0 here (so the affected branch runs); the `else` is exercised only when it fails — do not delete it.
5. **Commit:** `perf(pre-push): scope format/typecheck/test to affected packages with origin/main fallback`

> Note: Do NOT run the full `pre-push` hook end-to-end here (it runs the affected test suite, minutes). The dry-runs above validate syntax and command shape; real behavior is validated when the branch is actually pushed.

---

### Task 3: Add `actions/cache@v4` `.turbo` step to both CI jobs

**Depends on:** none | **Files:** `.github/workflows/ci.yml`

Add the cache step immediately BEFORE `pnpm build` in each job.

1. In **`build-and-test`**, between `- run: pnpm install --frozen-lockfile` (line ~49) and `- run: pnpm build` (line ~51), insert:

   ```yaml
   - name: Restore Turbo cache
     uses: actions/cache@v4
     with:
       path: .turbo
       key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
       restore-keys: |
         turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
   ```

2. In **`refresh-baselines`**, between `- run: pnpm install --frozen-lockfile` (line ~134) and `- run: pnpm build` (line ~135), insert the identical block (same key/restore-keys — `runner.os` is `Linux` for both since `refresh-baselines` is `ubuntu-latest`, and the shared prefix lets it hit `build-and-test`'s Linux cache).

**Verification:**

1. **YAML parses:** `pnpm exec prettier --check .github/workflows/ci.yml` → expect "All matched files use Prettier code style!" (or run `node -e "require('yaml')" ` fallback: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` → no error).
2. **Both jobs have the step:** `grep -c "Restore Turbo cache" .github/workflows/ci.yml` → expect `2`.
3. **Step ordering — cache precedes build in both:** `grep -nE "Restore Turbo cache|pnpm build" .github/workflows/ci.yml` and confirm each "Restore Turbo cache" line number is less than the following "pnpm build".
4. **Commit:** `perf(ci): cache .turbo across runs in build-and-test and refresh-baselines`

---

### Task 4: Write ADR for the affected-scoped pre-push trust boundary

**Depends on:** none | **Files:** `docs/knowledge/decisions/0075-affected-scoped-pre-push.md` | **Category:** integration

Create the ADR. Next number confirmed 0075 (highest existing is 0074). Follow the repo's existing ADR shape (title, status, context, decision, consequences).

```markdown
# 0075. Affected-scoped pre-push; CI is the authoritative full net

- Status: accepted
- Date: 2026-07-17
- Related: docs/changes/faster-gates/proposal.md

## Context

`.husky/pre-push` ran an effectively-complete local CI pass on every push:
whole-tree `format:check`, all-package `typecheck`, and the full coverage suite
(1,254 test files across 10 packages, capped at `--concurrency=2`). This made the
common-case push slow (minutes) even for a one-line change to a leaf package.

The heavy suite was deliberately local because slow CI made push→fail→fix
round-trips expensive. We want the common case fast without moving any gate to
CI-only.

## Decision

`pre-push` scopes format/typecheck/test to the **affected package set**:

- format-check runs prettier over only changed `{ts,tsx,md,json}` files (union of
  the `origin/main...HEAD` branch diff and working-tree changes);
- typecheck and test run via `turbo run … --affected` (base `origin/main`,
  dependents included);
- `coverage-ratchet` runs with `--allow-missing`, tolerating packages that
  `--affected` skipped.

**CI remains the authoritative full net:** the 3-OS matrix runs the whole suite
and the flagless (full) coverage ratchet on every PR. No gate moved to CI-only.

**Fail-safe:** when `origin/main` is unresolvable (fresh clone, detached HEAD),
`pre-push` falls back to the full unscoped gate. The fallback errs toward _more_
coverage, never a silently narrower one.

## Consequences

- Common-case pushes drop from minutes to seconds; the trust boundary shifts:
  a scoped `pre-push` pass no longer implies a whole-repo pass — CI is the net.
- A stale `origin/main` only ever runs a _superset_ of the true affected set
  (slower, never less safe).
- `core` edits still fan out to dependents (`cli`, `dashboard`, `orchestrator`);
  Phase 2 makes that fan-out fast via test isolation + a raised concurrency cap.
```

**Verification:**

1. **File exists and formats:** `pnpm exec prettier --check docs/knowledge/decisions/0075-affected-scoped-pre-push.md` → passes.
2. **No number collision:** `ls docs/knowledge/decisions/ | grep -c '^0075'` → expect `1`.
3. **Commit:** `docs(faster-gates): ADR 0075 affected-scoped pre-push trust boundary`

---

### Task 5: Add contributor note to AGENTS.md

**Depends on:** Task 4 (link the ADR) | **Files:** `AGENTS.md` | **Category:** integration

Add a short note near the existing `format:check` / pre-push documentation (AGENTS.md references `format:check` around lines ~362 and ~1144). Locate the pre-push / local-gates section and add:

```markdown
> **Pre-push is affected-scoped.** `.husky/pre-push` scopes format-check,
> typecheck, and coverage tests to the packages affected by your branch
> (`turbo --affected`, base `origin/main`), and runs the coverage ratchet in
> `--allow-missing` mode. Whole-repo format-check, all-package typecheck, the
> full 3-OS test matrix, and the full (flagless) coverage ratchet are
> **authoritative in CI**. So CI can legitimately catch something your scoped
> pre-push did not — this is expected. If `origin/main` is unresolvable
> (fresh clone / detached HEAD) pre-push falls back to the full unscoped gate.
> See ADR `docs/knowledge/decisions/0075-affected-scoped-pre-push.md`.
```

**Verification:**

1. **Formats:** `pnpm exec prettier --check AGENTS.md` → passes.
2. **Note present:** `grep -c "affected-scoped" AGENTS.md` → expect `>= 1`.
3. **Docs-fresh gate still passes** (AGENTS.md may be checked by generate-docs): `pnpm run generate-docs --check` → expect no drift error attributable to this edit (if it regenerates AGENTS-derived content, run `pnpm run generate-docs` and re-add).
4. **Commit:** `docs(faster-gates): note affected-scoped pre-push in AGENTS.md`

---

### Task 6: Final integration verification

**Depends on:** Tasks 1–5 | **Files:** none (verification only) | **Category:** integration

Run the full local gate stack against the accumulated changes to confirm the PR is push-ready.

1. **No changeset required (re-verify):** `node scripts/check-changesets.mjs` → expect "No publishable package changes detected." (exit 0). If it flags anything, STOP — an unexpected `packages/*/src` edit crept in.
2. **Arch gate green:** `node packages/cli/dist/bin/harness.js ci check` → `arch: pass`, `All checks passed`.
3. **Script tests pass:** `node --test tests/scripts/*.test.mjs` → all pass.
4. **Changed-file format-check clean:** run the Task-2 union command piped to `pnpm exec prettier --check` → passes.
5. **Turbo affected graph resolves:** `pnpm exec turbo run typecheck --affected --dry-run=json > /dev/null; echo $?` → `0`.
6. **Diff scope sanity:** `git diff --name-only origin/main...HEAD` lists ONLY: `.husky/pre-push`, `.github/workflows/ci.yml`, `scripts/coverage-ratchet.mjs`, `tests/scripts/baseline-gating.test.mjs`, `docs/knowledge/decisions/0075-affected-scoped-pre-push.md`, `AGENTS.md`, and the plan file. No `packages/*/src` files.

> No commit — this task is a gate. If any check fails, return to the owning task.

---

### Task 7: `[checkpoint:human-verify]` — Push and observe real pre-push + CI behavior

**Depends on:** Task 6 | **Files:** none | **Category:** integration

The end-to-end behavior (real affected test run, CI cache hit) can only be observed on a real push. Pause and hand to the human.

1. Present the branch state and the Task-6 verification results.
2. **[checkpoint:human-verify]** Human pushes `perf/faster-gates` and confirms:
   - `pre-push` runs the affected suite (not the full 1,254-file suite) and completes fast for this branch's affected set;
   - the format-check step only lists this branch's changed files;
   - CI `build-and-test` shows the "Restore Turbo cache" step; on a second run, Turbo reports cache hits (`cache hit, replaying logs` / `FULL TURBO`) and lower build+test wall-clock (Success Criterion #2);
   - the full 3-OS matrix + flagless coverage ratchet still run in CI (Success Criterion #4).
3. If CI is red for reasons attributable to this change, capture the failure and revise the owning task. Known non-blockers: `required-review` floor-tier noise, doc-drift `!` warnings, main-branch CI flakiness (see MEMORY).

---

## Dependency Graph

```
Task 1 (ratchet TDD) ──▶ Task 2 (pre-push, needs --allow-missing)
Task 3 (CI cache) ─────── independent
Task 4 (ADR) ──▶ Task 5 (AGENTS note, links ADR)
Tasks 1–5 ──▶ Task 6 (integration verify) ──▶ Task 7 (human-verify push)
```

Parallelizable: {Task 1, Task 3, Task 4} touch disjoint files and may proceed in any order. Task 2 waits on Task 1; Task 5 waits on Task 4.

## Checkpoints

- **Task 7** — `[checkpoint:human-verify]`: push and observe real pre-push + CI cache behavior.

(1 checkpoint total.)

## Integration Tier: medium

Wiring + project updates. Per the spec's Integration Points: Registrations = None (no task). Documentation Updates → Task 5. Architectural Decisions → Task 4 (ADR). Knowledge Impact (affected-graph convention, concurrency/isolation link) is folded into the ADR narrative rather than a separate knowledge-graph task, since no `business_fact` node schema applies to a tooling change.
