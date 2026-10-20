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
   `.warnings`. The duplication report's omission is the enforcement mechanism: there is no field
   for a future edit to add into either sum, so duplication structurally cannot raise an error or
   warning count. That is a different kind of guarantee than a convention or a comment — it fails
   at the type level rather than in review.

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
  detector reports **58** classes over `packages/` (2,065 files) and **98** over this repository's
  non-test sources (2,153 files). Neither is a regression against the other; the scopes differ.
  No test asserts either number (spec criterion 10), precisely so that a scope change cannot
  present itself as a behavior change.
- **Advisory-first defers a decision rather than removing it.** The per-PR find rate is unknown
  until the detector runs in anger — the 60 classes are a one-time backlog and tell us nothing
  about the steady state. When a ratchet is proposed, D4 is the record that it must be argued, and
  #855 is the record of what it must not become.
- **A downstream consequence lands in Phase 3, not here.** Clone classes count in
  `summary.totalIssues`, and `packages/cli/src/commands/cleanup.ts` gates its exit code on a field
  of that name. Phase 3 owns `harness cleanup -t duplication` and must decide consciously whether
  that command can exit non-zero on duplication alone — otherwise D4 is violated downstream of a
  Phase-2 choice, by inheritance rather than by anyone deciding it.
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
  to `L`), which is what makes the 16 JSON-response copies cluster despite three different names.
- `packages/core/src/entropy/types/duplication.ts` — `DuplicationReport`, and the deliberate
  absence of `errorCount` / `warningCount` that implements D4.
- `packages/core/src/entropy/analyzer.ts` — the summary arithmetic: `classesReported` into
  `totalIssues`, nothing into `errors` or `warnings`.
- `packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts` — CODE-R004, whose Rule
  of Three clause D3 aligns with and whose repair is Phase 5.
- `packages/cli/src/commands/cleanup.ts` — the `totalIssues` exit-code gate Phase 3 must decide
  about.
- GitHub #855 — the fail-closed pre-commit architecture gate, D4's cautionary precedent.
- GitHub #1612 (`idiom-contagion-epidemiology`), #1646 — the two tracked items that inherit this
  definition.
