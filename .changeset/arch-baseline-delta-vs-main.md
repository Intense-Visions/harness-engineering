---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Arch baseline gating is now delta-vs-base with per-PR allowance files, ending the
`.harness/arch/baselines.json` merge cascade.

Previously a PR that added complexity failed the arch gate, and the only way to pass was
`check-arch --update-baseline`, which REWROTE the shared `baselines.json` snapshot on the
branch. The `merge=ours` attribute only resolves LOCAL merges, so GitHub's server-side
3-way merge conflicted, and every merge into the trunk re-conflicted all other open PRs.

Two additive changes fix it:

- **Base-aware resolution** (`resolveArchBaseline`): in a PR context the gate compares
  current metrics against the base ref's committed baseline
  (`git show origin/main:…`, overridable via `HARNESS_ARCH_BASE_REF`) rather than the
  working-tree file — a true delta-vs-base. It is strictly fail-open: on the base branch,
  a fresh/detached checkout with no reachable base ref, a non-git directory, or an
  absent/invalid base copy, it falls back to today's working-tree behavior and never
  produces a false failure.

- **Per-PR allowance files** (`.harness/arch/allowances/<branch>.json`): an intentional
  regression is acknowledged with a uniquely-named per-PR file (the same conflict-free
  one-file-per-PR pattern as changesets), so two branches never touch the same file. In a
  PR context `check-arch --update-baseline --reason "…"` WRITES an allowance instead of
  rewriting the snapshot; on the trunk it keeps the whole-snapshot behavior. The gate
  accepts a regression only when a present allowance covers it. Genuine NEW error-severity
  threshold violations are NEVER allowanced and still hard-fail — only the
  snapshot-commit requirement is removed, not the gate itself.

The committed snapshot is now single-writer: only the post-merge baseline-refresh job
advances it, and it also folds in and deletes consumed allowance files.
