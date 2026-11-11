---
'@harness-engineering/cli': minor
---

Clumping's intake seam: `harness fleet clump-issues` and `issue-fleet`'s fifth triage axis.

An open-issue backlog is triaged on four axes today — label, dedup, route, prioritize —
and every surviving issue becomes its own work unit, paying a fixed ceremony cost
(branch, worktree, 3-OS matrix, review pass, merge, baseline refresh) that is invariant
to its payload. The `clump` axis groups DISTINCT issues of the same type over the same
scope into one work unit, through the same `formClumps` primitive the craft and review
seams already use, so all three seams group identically.

`harness fleet clump-issues` is the callable: it enumerates the backlog (`gh issue list`,
or `--input <dump.json>`), prints the clump table, every shed count, and the conservation
arithmetic, and exits non-zero if the buckets ever stop partitioning the input. Read-only.

Clumping is NOT dedup, and the two axes run independently: dedup removes restatements of
ONE issue; clumping groups DISTINCT issues and closes nothing. Three rules the adapter
does not bend — an `unscoped` issue (one naming no repository path) never co-clumps with
a scoped one; an issue with no single type label is terminal, reported and never clumped;
and two issues naming the same file never share a clump. Every count is reported on
`issue-fleet`'s EXISTING single CONFIRM round, because a second gate would cost exactly
the review attention the axis exists to save.
