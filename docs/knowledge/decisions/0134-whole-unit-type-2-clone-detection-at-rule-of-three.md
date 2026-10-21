---
number: 0134
title: 'Duplication is whole-unit Type-2 clone detection, reported at the Rule of Three, advisory only'
date: 2026-10-20
status: accepted
tier: large
source: docs/changes/duplication-detection/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D2, D3 and D4** of
> `docs/changes/duplication-detection/proposal.md`. It lands in Phase 2 because Phase 2 is where
> those three decisions stop being prose and start governing a detector in the entropy pipeline.
> Every figure below was either taken from the spec's own probe or re-measured in this worktree
> during Phase 2; citations are in **References**.

DRY was the only major quality axis in this project with no mechanical enforcement. It was
documented in `harness-refactoring` (a procedure with no detector upstream of it) and named in
`code-craft` rubric CODE-R004 (`packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts`),
whose DRY clause cites the Rule of Three but whose per-unit prompt carries exactly one unit's
source span — making its own question unanswerable. Nothing measured duplication anywhere.

Building a detector forces three questions that have no default answer, because the conventional
answers in this space are each wrong for this codebase in a different way:

1. **At what granularity is a "duplicate" counted?** The industry-standard tools (CPD, jscpd,
   Simian) slide a token window across the source, which finds strictly more than whole-unit
   matching does.
2. **How many instances make duplication?** Two copies is the literal meaning of the word; it is
   also the threshold at which a detector reports things nobody will act on.
3. **What happens when the detector finds something?** Every other gate in this repo's stack has
   had to answer this, and one of them answered it badly enough to become a standing precedent.

The third question is not hypothetical here. The fail-closed pre-commit architecture gate (#855)
blocks **all** commits once its baseline is red, until someone runs `--update-baseline`. That
behavior was reached by increments, each individually defensible, and a duplication detector is a
natural candidate for the same path: clone classes are cheap to count, so a ratchet is easy to
add, and a ratchet with no tolerance is one bad merge away from blocking the repo.

## Decision

1. **Duplication means Type-2 clones of whole units — functions, methods and classes — and not
   sub-unit windows.** The probe decided this rather than taste. Over the same sources, whole-unit
   matching at >= 3 instances yields **60 clone classes**; a 50-token sliding window yields
   **6,173**. The ratio is the argument: at 103x the volume, the suppression list rather than the
   algorithm becomes the product, and the thing being maintained is a configuration of what to
   ignore. Whole units also have a property windows do not — a unit is a thing a human can
   extract. A 50-token window straddling the tail of one function and the head of the next is a
   true textual match and an unactionable finding.

   Sub-unit / CPD detection is therefore a **deferred follow-up, to be justified by what this
   ships fails to catch**, not a rejected idea. The number to beat is on record.

2. **A clone class is reported at >= 3 instances (the Rule of Three), above a minimum token
   floor.** This is the bar CODE-R004 already states, cited to Fowler, so the detector and the
   rubric it exists to repair agree by construction rather than by coincidence. It is also the
   false-positive control: prior mechanical sweeps in this repo have run at roughly **95% false
   positives**, which is why a threshold is a recorded decision and not a default someone can
   relax without reading this.

   The two bars compose and both are necessary. `minInstances: 3` without a token floor reports
   three-line getters; a token floor without `minInstances` reports every pair. The shipped
   defaults are `minInstances: 3` and `minTokens: 40`
   (`packages/core/src/duplication/index.ts`, `DEFAULT_DUPLICATION_CONFIG`). The floor is applied
   **before** grouping, so a sub-threshold unit is never fingerprinted and can never form or join
   a class — which is why `stats.unitsBelowMinTokens` and `stats.classesSuppressed` are separate
   counters and not two views of one number.

3. **Severity is advisory first. A baseline ratchet is a later decision. The detector never fails
   closed.** Concretely, and this is the part that matters more than the posture:

   `DuplicationReport.stats` carries **no `errorCount` and no `warningCount`**
   (`packages/core/src/entropy/types/duplication.ts`). Every sibling entropy report carries those
   two fields, and `EntropyAnalyzer` sums them into `EntropyReport.summary.errors` and
   `.warnings`. That omission is the enforcement mechanism, and it enforces in **two layers**,
   neither of which is sufficient alone:
   - **The type blocks the realistic accident.** The way severity would creep in is by copying a
     sibling detector's line — `summary.errors += duplicationReport.stats.errorCount` — and that
     does not compile, because the field does not exist. Raising severity therefore requires
     adding a field to a public type: visible, reviewable, and impossible to do by pattern-match.
   - **A test catches a hand-written sum.** The type does NOT make it impossible, and an earlier
     draft of this ADR overstated it by saying "there is no field for a future edit to add into
     either sum ... it fails at the type level rather than in review". `stats.violationCount` and
     `stats.classesReported` are both numbers on that same object and compile into either sum
     perfectly well — two mutants during Phase 2's review did exactly that, compiled clean, and
     died at RUNTIME against `counts clone classes in totalIssues and in neither errors nor
warnings` in `packages/core/tests/entropy/analyzer.duplication.test.ts`, which runs the
     analyzer with duplication on and off and asserts `summary.errors` and `summary.warnings` are
     unchanged while `totalIssues` moves by exactly `classesReported`.

   The two-layer version is the stronger claim, and the honest one: the type rules out the
   plausible copy-paste, the test rules out the deliberate hand-written sum.

   Clone classes **do** count in `summary.totalIssues`. Advisory does not mean invisible: a
   summary reporting zero issues beside a scan that found 98 clone classes would be the
   report-a-pass-over-something-unclean failure this repo refuses elsewhere.

   The detector does, however, refuse two specific things, and refusing is not the same as
   failing closed. Zero eligible files returns `Err` (`zero-files-discovered`) and a run in which
   **every** eligible file was skipped returns `Err` (`all-files-skipped`), because at a 100% skip
   rate the output is byte-indistinguishable from a clean scan. Those are refusals to report a
   pass over a scan that did not happen. A _partial_ skip returns `Ok` with per-file evidence —
   a scan that happened with gaps, with the gaps named.

## Consequences

- **Two tracked roadmap items inherit this definition.** `idiom-contagion-epidemiology` (#1612)
  is predicated on joining clone/similarity detection to commit provenance, and
  `semantic-canonicalization-entropy-floor` (#1646) is predicated on clone detection sharpening
  as canonicalization improves. Both consume the `CloneClass` interface, so "duplication" means
  whole-unit Type-2 for them too. Changing granularity later is not a local change to one
  detector; it changes what those two features measure.
- **The 60 classes are a backlog this does not fix.** The spec says so explicitly, and the number
  moved during Phase 1 for a reason worth recording: removing an `**/index.*` ignore glob took the
  reported count from 48 to 58 at the spec's `packages/`-only scope. An ignore glob for "barrels"
  is self-defeating — a true barrel is pure re-exports, emits no units, and so cannot produce a
  false positive, meaning the glob could only ever suppress real implementation modules. It was
  hiding `sumCosts` x10, the spec's own flagship evidence.
- **Reported counts are only meaningful with their discovery scope attached.** The same shipped
  detector reports **58** classes at **Scope A** (`packages/` only, 2,065 files via `findFiles` +
  `isEligibleFile`) and **98** at **Scope B** (the detector's own scope — this repository's
  non-test sources, 2,153 files). Neither is a regression against the other; the scopes differ.
  No test asserts either number (spec criterion 10), precisely so that a scope change cannot
  present itself as a behavior change. The D4 bullet below reports **96** at **Scope C** (the
  product scope: what `harness cleanup -t duplication` actually sees, i.e. Scope B minus this
  repository's configured `entropy.excludePatterns`) — a THIRD number answering a different
  question. The labels are the spec's, and they are used here because "this repository's non-test
  sources" and "on this repository" are two phrases a reader cannot tell apart while naming two
  different scopes. Scope C's own counts move whenever this repository gains source files.
- **Whole-unit granularity is only cheap once the token walk is linear.** D2 claims the
  granularity is affordable, and as first implemented it was not: `normalizeTokens` rescanned a
  file's entire token array once per unit, so the per-file cost was O(units x tokens). Phase 2
  replaced the rescan with a binary search over the range-sorted token array (commit `300e92d6d`,
  `packages/core/src/duplication/tokens.ts`). Measured with scope and denominator attached,
  because the figure differs 8x by scope: at the detector's own scope (this repository's non-test
  sources, 2,153 eligible files, 17,064 units) 214,130,152 token visits became 1,976,826 — 108x
  fewer, from 140.9x the token count down to 1.30x, counting tokens in unit-bearing files. At the
  spec's `packages/`-only scope the same change is 26,055,026 -> 1,625,558 (16x). The pre-fix cost
  was dominated by single pathological files — two vendored Vite dependency pre-bundles under
  `docs/.vitepress/cache/` were 81.7% of it at the detector's scope — which is exactly why a
  granularity decision cannot be defended with an unscoped number. The guard against reverting it
  is a deterministic token-visit bound, not a wall clock (see the spec's Verification notes for
  that accepted gap).
- **Advisory-first defers a decision rather than removing it.** The per-PR find rate is unknown
  until the detector runs in anger — the 60 classes are a one-time backlog and tell us nothing
  about the steady state. When a ratchet is proposed, D4 is the record that it must be argued, and
  #855 is the record of what it must not become.
- **That downstream consequence is now RESOLVED in Phase 3.** Clone classes count in
  `EntropyReport.summary.totalIssues`, and `packages/cli/src/commands/cleanup.ts` gates its exit
  code on a field of the same name. Phase 3 decided it consciously: `CleanupResult.totalIssues`
  carries drift + dead code + pattern violations ONLY, and clone classes land on a separate
  optional `duplication` block. Phase 3 also found a SECOND channel on the same field —
  `--findings-json` publishes `totalIssues` as the #691 maintenance contract, where a consumer
  gating on `findings > 0` would fail a build on advisory output — and excluded duplication from
  that too. Observed at Scope C (2026-10-21): `harness cleanup -t duplication` exits **0** over 96
  advisory classes and prints `{"findings":0,"v":1,"check":"cleanup"}`. A spawned-process test
  holds the line: folding `duplication.classes.length` into the sum turns the real process's
  status to 1 and the contract line to `{ findings: 1 }`. D4 is unchanged — it was honored
  downstream, not amended.
- **A related honesty fix rode along.** `-t duplication` runs no drift, dead-code or pattern
  analyzer, so `totalIssues` is 0 BY OMISSION. Printing the usual green-ticked "Entropy issues: 0"
  there would report a pass over three checks that never executed (#1760 one layer out), so
  `CleanupResult` gained a `ran` map derived from report presence and the command prints
  "Entropy issues: not checked" instead.
- **Severity can be raised later; it cannot be raised accidentally.** Adding an `errorCount` to
  `DuplicationReport.stats` is a visible, reviewable type change that also requires editing
  `EntropyAnalyzer`'s summary arithmetic. That is the intended cost.

## References

- `docs/changes/duplication-detection/proposal.md` — spec decisions D2, D3, D4; the Evidence
  section's granularity probe (60 whole-unit classes vs 6,173 sliding-window at >= 3) and the
  named instances (`sumCosts` x10; a JSON-response helper x16 across three names in
  `packages/orchestrator/src/server/routes/`).
- `packages/core/src/duplication/index.ts` — `DEFAULT_DUPLICATION_CONFIG` (`minInstances: 3`,
  `minTokens: 40`), the two `Err` refusals, and the `CloneClass` / `CloneIndex` surface.
- `packages/core/src/duplication/tokens.ts` — Type-2 normalization (identifiers to `I`, literals
  to `L`), which is what makes the 16 JSON-response copies cluster despite three different names;
  also the binary-searched range walk that makes whole-unit granularity affordable, with its
  measurements by scope and denominator.
- `packages/core/tests/entropy/analyzer.duplication.test.ts` — the D4 runtime test, the second of
  the two layers above.
- `docs/changes/duplication-detection/proposal.md`, Verification notes — criterion 6's accepted
  wall-clock gap and the transience of the Scope-B evidence figures.
- `packages/core/src/entropy/types/duplication.ts` — `DuplicationReport`, and the deliberate
  absence of `errorCount` / `warningCount` that implements D4.
- `packages/core/src/entropy/analyzer.ts` — the summary arithmetic: `classesReported` into
  `totalIssues`, nothing into `errors` or `warnings`.
- `packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts` — CODE-R004, whose Rule
  of Three clause D3 aligns with and whose repair is Phase 5.
- `packages/cli/src/commands/cleanup.ts` — the `totalIssues` exit-code gate, and the
  `--findings-json` contract beside it; both now exclude clone classes, with the reason recorded
  on the `totalIssues` field itself.
- `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts` — the spawned-CLI
  regression test for both channels (exit 0, `{ findings: 0 }`).
- `packages/cli/src/shared/duplication-request.ts` — the opt-in and refusal rules shared by
  `harness cleanup -t duplication` and `detect_entropy type: "duplication"`.
- GitHub #855 — the fail-closed pre-commit architecture gate, D4's cautionary precedent.
- GitHub #1612 (`idiom-contagion-epidemiology`), #1646 — the two tracked items that inherit this
  definition.
