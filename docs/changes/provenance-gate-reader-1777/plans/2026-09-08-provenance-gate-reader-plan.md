# Plan: provenance shape gate + `harness provenance` reader CLI

**Date:** 2026-09-08 · **Spec:** `docs/changes/provenance-gate-reader-1777/proposal.md` · **Issue:** #1777 (Refs, not Closes) · **Tasks:** 12 · **Integration Tier:** medium · **Base SHA:** `738b296c0a50cb9890474124d466f38903e468e2`

## Goal

Give the `Harness-*` commit trailer shipped in #1776 its first two readers: a
`harness provenance` CLI that answers "who authored this commit, under which
run" for one commit, and a shape gate that mechanically rejects a trailer the
emitter could never have produced. Ship **only** the half of the CI check that is
unambiguous — well-formedness — and park the presence policy.

## Observable Truths (Acceptance Criteria)

1. `harness provenance <sha>` on a commit carrying a well-formed trailer prints
   every populated key/value and exits 0. **Gate:** unit test + built-binary run.
2. `harness provenance <sha>` on a commit with **no** `Harness-Run` trailer prints
   `no provenance trailer on <sha>` and exits **3**, never 0. **Gate:** unit test
   asserting both the message and the exit code.
3. `harness provenance <bad-ref>` prints an actionable message naming the ref and
   exits 2; no raw git stderr/stack trace reaches the user. **Gate:** unit test.
4. `harness provenance <sha> --json` and `harness --json provenance <sha>` both
   emit one JSON document and no human lines. **Gate:** `node
packages/cli/dist/bin/harness.js provenance <sha> --json | node -e 'JSON.parse(...)'`
   against the **built** binary — the #2069 shadowing defect makes a unit-level
   assertion insufficient.
5. `harness provenance --check --range <range>` exits 1 and names the offending
   commit + issue codes when any commit in range carries a malformed trailer.
   **Gate:** unit test over an injected git seam.
6. The same invocation exits **0** when every commit in range is unclaimed, and
   prints the examined / carried / unclaimed counts. **Gate:** unit test asserting
   exit 0 **and** the counts line (so "nothing to validate" can never read as
   "validated everything").
7. `--check` over a range that resolves to zero commits exits 3. **Gate:** unit test.
8. `validateProvenanceTrailer` reports `duplicate-key` for a repeated `Harness-*`
   key — something `parseProvenanceTrailer` alone cannot see. **Gate:** core test.
9. `validateProvenanceTrailer` reports `missing-version` / `invalid-version` /
   `unknown-version` / `empty-skill` / `missing-skill-version`, and returns
   `status: 'absent'` (not `malformed`) for a trailer-less message. **Gate:** core tests.
10. Existing `commit-trailer` tests pass **unmodified** after the scanner
    extraction. **Gate:** `pnpm --filter @harness-engineering/core test`.
11. `packages/cli/src/commands/_registry.ts` lists `createProvenanceCommand`, and
    `pnpm run generate-barrel-exports --check` is clean. **Gate:** generator check.
12. `pnpm run generate-docs` leaves no diff on a second run and
    `docs/reference/cli-commands.md` documents `provenance`. **Gate:** pre-push
    reference-docs freshness.

## Uncertainties

- **[PARKED — human decision, NOT answered here]** _what counts as an
  "agent-authored" commit for the PRESENCE half, and should presence be enforced
  (block) or advisory (warn) during adoption?_ No default is assumed; the
  presence half is simply not built. `--check` skips unclaimed commits by design.
- [ASSUMPTION] A schema version **newer** than `PROVENANCE_TRAILER_VERSION` is
  reported as `unknown-version` (malformed). An older gate must not vouch for a
  schema it cannot check. Tolerable because the CI job is advisory.
- [ASSUMPTION] Exit 3 (`ZERO_DENOMINATOR`) is the right code for "commit carries
  no trailer" — the command examined the commit and found zero provenance
  records to report; the repo's own definition is "ran but examined NOTHING …
  abstained, not passed, and must never read as green".
- [ASSUMPTION] `harness provenance` (top level) and `harness rules provenance`
  (subcommand of `rules`) do not collide in Commander — different levels of the
  tree. Disambiguated in help text only.
- [DEFERRABLE] Exact human-output column alignment.

## File Map

- MODIFY `packages/core/src/provenance/commit-trailer.ts` — extract + export
  `collectProvenanceTrailerEntries`; `parseProvenanceTrailer` consumes it.
- CREATE `packages/core/src/provenance/validate-trailer.ts`
- MODIFY `packages/core/src/provenance/index.ts` — two re-exports
- CREATE `packages/core/src/provenance/validate-trailer.test.ts`
- CREATE `packages/cli/src/commands/provenance.ts`
- CREATE `packages/cli/tests/commands/provenance.test.ts`
- MODIFY `packages/cli/src/commands/_registry.ts` (generated)
- MODIFY `.github/workflows/pr-advisory-checks.yml` — advisory `provenance-shape` job
- MODIFY `docs/reference/cli-commands.md`, `docs/reference/cli.md` (generated)
- CREATE `.changeset/provenance-shape-gate-and-reader.md`
- CREATE `docs/changes/provenance-gate-reader-1777/provenance.json`
- NOT TOUCHED: `scripts/generate-core-barrel.mjs` (`provenance` is auto-discovered),
  `packages/orchestrator/src/workspace/manager.ts` (emit path unchanged),
  `packages/cli/src/commands/rules/provenance.ts` (unrelated ADR-0100 reporter),
  issue #2069's root cause (worked around with the established idiom, not fixed).

## Tasks

| #   | Task                                                                      | Verify                                                                           |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Extract `collectProvenanceTrailerEntries` from `parseProvenanceTrailer`   | existing core tests pass unmodified (AC 10)                                      |
| 2   | Write `validate-trailer.ts` (three-state `status`, issue + warning codes) | tsc clean                                                                        |
| 3   | Re-export both from `provenance/index.ts`                                 | `import { validateProvenanceTrailer } from '@harness-engineering/core'` resolves |
| 4   | Core tests: absent / valid / each issue code / duplicate / warnings       | AC 8, 9                                                                          |
| 5   | CLI `provenance.ts`: `runGit` seam, ref resolution, reader mode           | AC 1, 2, 3                                                                       |
| 6   | CLI `--check` single-commit + `--range` modes, counts line                | AC 5, 6, 7                                                                       |
| 7   | `--json` via `optsWithGlobals()` (both flag positions)                    | AC 4                                                                             |
| 8   | Regenerate `_registry.ts`                                                 | AC 11                                                                            |
| 9   | CLI tests (injected git seam + real temp repo)                            | AC 1–7                                                                           |
| 10  | Advisory `provenance-shape` job in `pr-advisory-checks.yml`               | yaml parses; mirrors sibling jobs                                                |
| 11  | `pnpm run generate-docs`; prettier the touched files                      | AC 12; `pnpm format:check`                                                       |
| 12  | Changeset + `provenance.json` artifact                                    | present, `Refs #1777`                                                            |

## Execution log

- **T1–T4 (core)** — done. `collectProvenanceTrailerEntries` extracted; `parseProvenanceTrailer`
  now builds its `Map` from it (behaviour identical, existing tests untouched).
  `validate-trailer.ts` added with the three-state `status` discriminant.
- **T5–T9 (cli)** — done. `harness provenance` registered via the regenerated registry.
  `--json` verified against the **built** binary in both flag positions (AC 4) —
  the local flag is declared for parse acceptance and read through
  `optsWithGlobals()`, per the #2069 idiom.
- **T10 (ci)** — done. Advisory `provenance-shape` job added to
  `pr-advisory-checks.yml`, `continue-on-error: true`, writes counts to
  `$GITHUB_STEP_SUMMARY`.
- **T11–T12** — docs regenerated, changeset + provenance artifact written.
- **Parked, unanswered, carried into the PR body verbatim:** the presence-policy fork.
