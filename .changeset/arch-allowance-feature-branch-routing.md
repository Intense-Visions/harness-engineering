---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

Fix `check-arch --update-baseline` rewriting the committed arch snapshot on a feature branch
when the base ref is unreadable (closing a gap in the per-PR allowance feature).

The allowance feature routed `--update-baseline` to the snapshot-rewriting whole-snapshot path
for EVERY resolution that was not `base-ref`. But a feature branch resolves to `working-tree`
not only in the legitimate single-writer contexts (on the base branch, in a non-git dir, under
`HARNESS_ARCH_FORCE_WORKING_TREE`) — it also falls back to `working-tree` whenever the base ref
is merely unreadable: an unfetched worktree, a shallow clone, or a moved/unreadable base copy.
In that case `--update-baseline` REWROTE `.harness/arch/baselines.json` on the branch (and
without `--allow-regress` refused with "it WORSENS N metric(s)"), silently reintroducing the
exact `baselines.json` merge cascade the allowance mechanism exists to prevent, so a legitimate
value regression (e.g. `dependency-depth`, `module-size`) could never be acknowledged
conflict-free.

The whole-snapshot (snapshot-rewriting) path is now restricted to the contexts where it is
actually correct — the base branch, a non-git dir, `HARNESS_ARCH_FORCE_WORKING_TREE` (the
post-merge refresh-baselines job), and a genuine bootstrap where the base branch has no
baseline at all. A feature branch whose base ref was unreadable but which already has a
committed baseline now writes a per-PR allowance against the working-tree baseline instead,
leaving `baselines.json` byte-identical. Aggregate category value regressions and warning-level
new violations are both allowanceable; error-severity new violations are still never
allowanceable — a genuine threshold breach must be fixed.

- `resolveArchBaseline` now reports a `fallback` reason (`forced` / `non-git` / `base-branch` /
  `base-ref-unreachable` / `base-ref-absent` / `base-ref-invalid`) on every non-`base-ref`
  resolution, and a new `isWholeSnapshotContext(resolution)` helper encodes which contexts may
  rewrite the committed snapshot. Both are re-exported from `@harness-engineering/core`.
