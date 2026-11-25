---
number: 0140
title: 'The final pipeline review is cold and full: the whole diff from the merge base, every reviewer, no prior findings'
date: 2026-11-20
status: accepted
tier: large
source: docs/changes/shift-left-pipeline-fidelity/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D5 and D6** of
> `docs/changes/shift-left-pipeline-fidelity/proposal.md`. It reverses the previous
> FINAL_REVIEW brief in `agents/skills/claude-code/harness-autopilot/SKILL.md`.

Autopilot's final review was briefed to "focus on cross-phase coherence: naming, duplicated
utilities, architectural drift" and was handed the findings of every earlier phase review. It
was neither a full bug hunt nor a fresh read. A human who then ran `/harness:code-review` on the
same PR, cold, found new blocking issues. The human's review is the one the pipeline has to
match, and it is cold.

## Decision

### Cold (D6)

The final review covers `merge-base(origin/<default branch>, HEAD)..HEAD`. No reviewer brief
carries a prior finding, a per-phase summary, or a coherence-only focus. If the default branch
cannot be resolved, the base is autopilot's `startingCommit` and the receipt records
`diff.baseSource: "starting-commit"`. The
gate resolves the default branch as `refs/remotes/origin/HEAD`, then `origin/main`, then
`origin/master`. Autopilot does not resolve the base itself: it takes the base and its source
from `harness review-tier --moment final --session <slug>`, which runs the gate's own resolver
and rule, so the writer and the gate cannot disagree. The declaration is not a switch: the gate
accepts it only when it resolves no merge base itself and `diff.base` is the session's starting
commit (an unknown starting commit fails `STARTING_COMMIT_UNKNOWN`), and when a merge base
resolves the base must be that commit whatever the receipt declares. A review after a fix starts
at the merge base again; a final review never covers the fix alone.

Prior findings are used only after every reviewer has returned: the orchestrating session labels
a final finding whose file and start line match a per-phase finding as `previously-raised`. The
label never removes a finding and never lowers its severity.

### Stacked branches

A branch stacked on another unmerged branch (its PR targets that branch, not the default branch)
would otherwise be reviewed from the default branch's merge base, so its final review would also
cover the parent's commits, and keep covering them after the parent squash-merges.
`harness review-tier --moment final --target <ref>` takes the remote-tracking branch the PR
targets: only a ref that `git rev-parse --symbolic-full-name --end-of-options` resolves under
`refs/remotes/`, never a sha, a HEAD-relative name, a local branch or a tag. That restriction
alone does not stop a session basing its final review on its own last pushed commit: the
branch's own upstream is a remote-tracking ref too. So the branch under review is refused as
its own target: its upstream (`@{upstream}`) and any `refs/remotes/<remote>/<current branch
name>` fail `TARGET_OWN_BRANCH` at the gate, and `harness review-tier` reports them unresolved.
The base is then the merge base with that
ref instead of the default branch's, and the command prints the full ref. The receipt records it
as `diff.target` (a final receipt only), and the gate reads it from there: the receipt is the one
source, so no gate run can measure against a different ref, and the gate's PASS line names the
ref it measured against. The default stays `origin/HEAD`, `origin/main`, `origin/master`. A
`diff.target` that is not a remote-tracking branch that resolves fails `TARGET_UNRESOLVED` and
never falls back to the starting commit. The target is still the session's choice among the
other remote-tracking refs, and those refs are local and rewritable (`git update-ref`): a session
that names a branch it does not merge into, or moves a ref, chooses its own base. That is a
forging route the gate does not close (ADR 0139, Threat model); refusing the branch's own
upstream closes the route an honest session could take by mistake. The unit PRs of the shift-left fidelity stack
use it: each unit's final review is based at the merge base with the unit below it.

### Full (D5)

The final review always runs the `full` tier: `compliance`, `bug`, `security`, `architecture`
and each conditional reviewer the depth calibration activates, one dispatch per reviewer.
`--fast` does not lower it. Per-phase reviews are risk-tiered (`harness review-tier`, over
`selectReviewTier`, `packages/core/src/review/tier-selector.ts`) because full fan-out on every
phase multiplies cost by the phase count; the final review is where parity with the human's
review is decided.

### Enforced

`validateReviewReceipt` fails a `final` receipt unless `tier` is `full` (`FINAL_NOT_FULL`),
`coldContext` is true (`FINAL_NOT_COLD`), `priorFindingsSupplied` is false
(`FINAL_PRIOR_FINDINGS`) and `diff.base` is the merge base with the default branch
(`FINAL_BASE_NOT_MERGE_BASE`; a receipt that declares `baseSource: "starting-commit"` is
accepted only when no default-branch merge base resolves and its base is the session's starting
commit, and fails `STARTING_COMMIT_UNKNOWN` when that commit is unknown). A receipt is a final receipt because
it sits in `final-all/`, not because it says so and not because of a flag: one there that
declares another moment fails `MOMENT_MISMATCH`, and so does `--moment phase` passed for it.
Autopilot may not leave FINAL_REVIEW without a passing receipt unless the human overrides; an
override is recorded in `decisions[]`.

### One commit, one final review

The final receipt is for one commit. Any commit after it (a final-review fix, an OUTCOME_EVAL
fix) returns autopilot to FINAL_REVIEW, where every reviewer runs again at the new head.

## Consequences

- "Reviewed" on a pipeline-built PR means a cold, full review of the whole change.
- The final review costs more than before: every reviewer reads the whole diff.
- A session that cannot dispatch subagents cannot produce a `full` review. Its final receipt
  records `light`, the final gate fails, and the run ends in a human override or a halt. There
  is no quiet path to a passing final review on such a client.
- Findings already raised and fixed in a phase can reappear if the fix was incomplete. That is
  intended; the `previously-raised` label lets a reader see the repeat.
- `coldContext` and `priorFindingsSupplied` are self-reported. The gate checks that they are
  set, not that they are true. It does check the base: a final receipt whose `diff.base` is not
  the merge base fails, whatever `baseSource` it declares, so the range is proven to start
  there, against the default branch ref as the clone holds it (the gate does not fetch). That
  ref is local and the session can rewrite it, so the proof is only as good as the clone's
  remote-tracking refs (ADR 0139, Consequences).
- The two ship-boundary stages now read different ranges. FINAL_REVIEW reviews from the merge
  base; OUTCOME_EVAL, which follows it, still judges `startingCommit..HEAD`. They differ when
  the branch held commits before the autopilot session started.

## Alternatives rejected

- **Keep the coherence-only final review and strengthen per-phase reviews.** Phase reviews see
  one phase's diff; defects that live between phases, and documents made stale by a later
  phase, are visible only in the whole diff.
- **Give the final reviewers the prior findings "for context".** A reviewer handed conclusions
  tends to confirm them. The human's review, which finds more, starts with none.
- **Let `--fast` lower the final tier.** The final review is the parity point; a rigor flag that
  removes it removes the guarantee.
