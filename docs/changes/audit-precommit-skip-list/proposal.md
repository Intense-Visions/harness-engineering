# Spec: Audit and cap the pre-commit `--skip` list

**Status:** approved (autonomous — single-phase, low-complexity)
**Roadmap:** #529 (`Audit and cap the pre-commit --skip list`)
**Keywords:** pre-commit, ci-check, skip-list, allowlist, rationale, cap

## Problem

`.husky/pre-commit` runs `harness ci check --skip "$SKIP"` where
`SKIP="entropy,docs,perf,security,deps,phase-gate"` — six check categories deferred out of
the commit-time gate. A prior change (#964) already emits one stderr warning per skipped
category, but each warning was **generic** ("check SKIPPED (deferred to CI) — see roadmap
#529"); it did not say _why_ a category is deferred or _where_ it runs instead. And the list
itself had no cap: a seventh token appended to `SKIP` would sail through unless a reviewer
happened to notice, which is exactly the failure the roadmap item names — "every gap was once
a known issue, then background noise, then invisible."

### Boundary

- **In scope:** (1) make each skip's rationale visible at commit time; (2) cap the list with a
  checked-in, documented allowlist + a test that fails on divergence; (3) document each
  rationale (why deferred, where it runs).
- **Out of scope:** re-enabling any skipped check, moving checks between pre-commit / pre-push
  / CI, or changing _which_ categories are skipped. Visibility + cap only — behavior of the
  checks is unchanged.

## Where the skipped checks actually run

CI runs `harness ci check --json --skip arch` (`.github/workflows/harness.yml`) — the mirror
image of the local gate. The local gate runs `arch`, `validate`, `traceability` and defers the
other six; CI runs those six and defers `arch` (whose baseline is a local concern). Between the
two, every category runs exactly once. This symmetry is what makes each deferral safe and gives
every rationale a concrete "runs instead in CI" answer.

## Approaches considered

|            | A) Enrich warnings + checked-in allowlist doc + divergence test                                   | B) Rely on the existing STRENGTH-003 heuristic auditor | C) Move the six checks into pre-commit (no skip)         |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| **How**    | `case` arm per category + `.husky/pre-commit-skip-allowlist.md` + a test asserting hook⇄doc agree | Lean on STRENGTH-003 flagging >2 skips w/o inline `#`  | Delete `--skip`, add the six to the commit gate          |
| **Pros**   | Hard failure on silent growth; each gap named with rationale                                      | No new files                                           | Actually closes the gaps                                 |
| **Cons**   | One reference doc to maintain (test keeps it honest)                                              | Warning-level only, no rationale, not a commit/CI gate | Large behavior change; slows every commit — out of scope |
| **Risk**   | Low                                                                                               | Low but insufficient                                   | High                                                     |
| **Effort** | Low                                                                                               | None                                                   | Medium                                                   |

**Chosen: A.** The roadmap item asks for _visibility + a cap_, not re-architecting the gate.
STRENGTH-003 (B) is a useful review-time heuristic and is retained, but it is advisory
(warning severity, not a blocking gate) and carries no per-category rationale — so it does not
by itself satisfy "documented allowlist that can't silently grow." C is a real but separate
decision that YAGNI cuts from this scope.

## User story

As a developer committing to this repo, I want each deferred pre-commit check named _with its
rationale_ at commit time, and the set of deferrals capped by a reviewed allowlist, so the
disabled guardrails never silently grow invisible.

## Success criteria (EARS)

1. WHEN the pre-commit hook runs, the system SHALL emit exactly one stderr line per category in
   `$SKIP`, each naming the category AND a short rationale (why deferred + where it runs).
2. The system SHALL keep a checked-in reference (`.husky/pre-commit-skip-allowlist.md`) that
   enumerates every skipped category with its rationale and where it runs instead.
3. The system SHALL fail a test WHEN the hook's `SKIP` set, its per-category rationale arms, and
   the allowlist doc diverge — so adding/removing a skip is a visible, reviewed change.
4. The system SHALL NOT change the `--skip` set, the `ci check` invocation, or the hook's
   pass/block exit behavior.
5. The skip warnings and the audited list SHALL derive from one source (`$SKIP`), not a
   hand-copied duplicate that can drift.

## Implementation Order

### Phase 1: Rationale + allowlist cap <!-- complexity: low -->

1. Replace the generic warning loop in `.husky/pre-commit` with a POSIX `case "$cat"` block
   mapping each category to a one-line rationale; keep the single-source `$SKIP` loop and the
   `*` fallback arm that loudly names an undocumented category.
2. Add `.husky/pre-commit-skip-allowlist.md` — the reviewed reference table (category / where it
   runs / why deferred) plus a "changing the list" checklist.
3. Add `packages/cli/tests/hooks/pre-commit-skip-allowlist.test.ts` asserting three-way
   agreement (SKIP ⇄ case arms ⇄ allowlist table), non-empty rationale per row, and that the
   hook still passes `--skip "$SKIP"`.

## Notes for the executor

- The hook is POSIX `sh` (may be dash under husky) — `case`/`esac` is portable; no arrays or
  `set -o pipefail`.
- Keep the load-bearing comments (the #726 tee-exit-code note, the #910 node-pin note, the #965
  STRENGTH-003 note) — do not delete them as collateral.
- Do not alter the hook's file mode (must stay executable, `100755`).
- `docs/reference/` is auto-generated by `generate-docs.mjs`; the allowlist lives in `.husky/`
  (next to the hook it governs) so a docs regen cannot overwrite it.
