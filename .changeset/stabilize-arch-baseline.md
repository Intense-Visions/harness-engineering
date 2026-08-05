---
'@harness-engineering/core': patch
---

Make the architecture baseline file (`.harness/arch/baselines.json`) a pure
function of its metrics, eliminating spurious merge-conflict churn.

`ArchBaselineManager.update` now preserves the `updatedAt`/`updatedFrom` stamps
when a refresh does not actually change any metric, and `capture` sorts each
category's `violationIds`. A no-op regeneration therefore produces a
byte-identical file, so a PR that moves no metric never touches the baseline —
and no longer conflicts with `main` on every merge. (The `merge=ours` git
attribute only resolves this file for _local_ merges; GitHub's server-side merge
cannot run a custom driver, so any diff here surfaces as a conflict there.)
Genuine metric changes still bump the stamps and update the values as before.
