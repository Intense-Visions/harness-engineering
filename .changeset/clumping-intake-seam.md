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
does not bend — an `unscoped` issue (one naming no repository path) is not groupable at
all, with a scoped issue or with another unscoped one, because grouping on the ABSENCE of
a signal is not grouping; an issue with no single type label is terminal, reported and
never clumped; and two issues naming the same file never share a clump. Paths nobody
edits are not a scope signal either: the tracker's own roadmap shards, and build
artifacts under `dist/` / `node_modules/` / `coverage/` / `.turbo/` arriving in pasted
stack traces, are dropped before the scope and the conflict keys are derived. Every count
is reported on `issue-fleet`'s EXISTING single CONFIRM round, because a second gate would
cost exactly the review attention the axis exists to save.

`--json` emits the dispatchable dump: each clump member is `{ id, ref: { number, title } }`
— the shape `harness fleet clump-dispatch --input` reads — so the advertised
intake-to-dispatch path produces real commit subjects and real citations.

`--input` reads the dump rather than casting it. An entry needs at least a numeric
`number`, a string `title` and a `labels` array; anything else refuses with the entry and
the field named, and exits `12` (backlog unavailable) having simulated nothing. A dump
with the wrong field names used to be accepted and reported as a clean "0 clumps, 0
clumped, conservation holds" run at exit 0 — indistinguishable from a backlog that
genuinely holds no groups. `labels` must be PRESENT because `gh issue list --json …
labels` emits `[]` for an issue carrying no labels: `[]` is the producer saying
"genuinely untyped", while an absent field only says the field was never queried. An
empty backlog (`[]`) is still a clean run.
