# Stop the pre-commit arch auto-baseline-update

**Keywords:** pre-commit, arch-baseline, regression, check-arch, load-bearing, fail-closed, husky, drift

## Overview and Goals

`.husky/pre-commit` (lines 4-13) runs `harness ci check`; on a module-size or
dependency-depth `REGRESSION` (but not complexity) it silently runs
`harness check-arch --update-baseline` twice, re-stages both `baselines.json`
files, and lets the commit proceed. This hides real architectural regressions
behind an auto-relaxed threshold — the article's failure pattern #5 and a direct
violation of the v5.0 "Load-Bearing Harness" milestone: _"a harness that warns
but doesn't stop is not a harness. It's a notification."_

### Goals

1. Make pre-commit **fail-closed** on _all_ arch regressions — remove the
   auto-update-and-restage branch entirely.
2. On block, emit an **actionable guidance message** so re-baselining becomes a
   conscious, visible act (an explicit `git add` of `baselines.json`) rather than
   an invisible side effect.

### Non-goals (YAGNI)

- The structurally-similar **plugin-artifact regen block** (lines 16-27) is left
  intact. It regenerates deterministic derived artifacts from source and hides no
  quality signal — distinct in kind from the arch block. If it warrants change,
  that is a separate roadmap item.
- **CLI-level remediation messaging** (emitting the hint from `harness ci check`
  itself) — recorded as a future consideration, not built here.
- The `doctor.ts:387` `--update` flag typo (correct flag is `--update-baseline`)
  — pre-existing and separate.

## Decisions made

1. **Fail-closed over auto-fix.** All arch regressions block the commit.
   _Rationale:_ the v5.0 Load-Bearing Harness milestone requires checks that stop,
   not warn; a relaxed baseline must be a deliberate human action.
   `[evidence]` `STRATEGY.md` (Load-Bearing Harness / marketing line);
   `.husky/pre-commit:4-13`.
2. **Scope = arch block only.** The plugin-regen block (lines 16-27) is untouched.
   _Rationale:_ regenerating deterministic derived artifacts is not the same as
   silently relaxing a quality threshold; conflating them would couple an
   unscoped change into this one. `[evidence]` `.husky/pre-commit:16-27`.
3. **Inline shell guidance, not grep/CLI.** The block prints a static guidance
   message and exits. _Rationale:_ smallest, least-brittle diff; avoids
   re-coupling the hook to the `"REGRESSION"` log string that the original inner
   `grep` depended on. `[evidence]` original inner `grep` at `.husky/pre-commit:5`.

## Technical design

Single file: `.husky/pre-commit`. Two edits.

**1. Rewrite the header comment** (lines 1-3) to describe fail-closed behavior:

```sh
# Run harness checks (validate + arch + traceability).
# Fail-closed: any check failure (including arch regressions) blocks the commit.
# To accept an intentional arch baseline change, run `harness check-arch
# --update-baseline` explicitly and stage the baselines.json change as a visible edit.
```

**2. Replace the inner auto-update branch** (current lines 5-12) with guidance +
`exit 1`:

```sh
if ! node packages/cli/dist/bin/harness.js ci check --skip entropy,docs,perf,security,deps,phase-gate 2>&1 | tee /tmp/harness-pre-commit.log; then
  echo ""
  echo "✗ Commit blocked: harness ci check failed (see output above)."
  echo ""
  echo "  If this is an intentional architecture baseline change, accept it explicitly:"
  echo "    harness check-arch --update-baseline"
  echo "    harness check-arch --update-baseline --module packages/cli"
  echo "  then review the diff, 'git add' the changed baselines.json file(s), and re-commit."
  echo ""
  exit 1
fi
```

The `harness ci check` invocation, `--skip` flags, `tee` log, `lint-staged`
call, and the plugin-regen block (lines 16-27) are unchanged. Net: the inner
`grep`, the two `check-arch --update-baseline` calls, and the
`git add ...baselines.json` line are deleted; the failure path becomes a guided
`exit 1`.

## Integration points

- **Entry Points:** `.husky/pre-commit` (modified git hook). No new entry points.
- **Registrations Required:** None — the husky hook is already wired; no
  regeneration needed.
- **Documentation Updates:** None — the behavior is internal to the dev workflow
  and no user-facing doc describes the old auto-update.
- **Architectural Decisions:** None — small change; no decision rises to an ADR.
- **Knowledge Impact:** None new; reinforces the existing fail-closed /
  load-bearing principle already captured by the v5.0 milestone.

## Success criteria

1. `.husky/pre-commit` contains **no** `check-arch --update-baseline` invocation
   and **no** `git add` of any `baselines.json`.
2. When `harness ci check` exits non-zero, the hook exits non-zero (commit
   blocked) for **all** failure types — including module-size/dependency-depth
   regressions that previously auto-passed.
3. On block, the hook prints guidance naming **both** `--update-baseline`
   commands (root + `--module packages/cli`) and the re-stage step.
4. The plugin-artifact regen block remains functionally unchanged (still
   auto-regenerates and re-stages on staged generator inputs).
5. The header comment describes fail-closed behavior (no "auto-update baselines"
   language).
6. `harness validate` passes; the hook is syntactically valid shell.

## Implementation order

1. **Edit the hook** — rewrite the header comment; replace the inner auto-update
   branch with the guidance message + `exit 1`.
2. **Verify behavior** — confirm a failing `ci check` blocks with guidance, and a
   passing check still proceeds to `lint-staged` and the plugin block. Shell hook
   → manual/observational verification; there is no unit-test harness for
   `.husky/`.
3. **Run `harness validate`.**
