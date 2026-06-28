---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Roadmap shard store — Phase 3 (git and hook integration). Make `docs/roadmap.md`
a self-healing, conflict-free generated aggregate of the per-row shards under
`docs/roadmap.d/`:

- **Regen git hooks (husky):** a pre-commit block regenerates and re-stages
  `docs/roadmap.md` whenever any shard is staged (no-op otherwise), and a new
  `.husky/post-merge` clears `merge=ours` staleness by regenerating after a
  merge. Both are thin wrappers over the deterministic `harness roadmap regen`.
  These are intentionally git hooks, not Claude Code tool-use hooks (those
  registries cannot model `git commit` / `git merge`).
- **`merge=ours` declaration:** `.gitattributes` now declares
  `docs/roadmap.md merge=ours` so disjoint row edits never re-conflict.
- **Merge-driver setup + doctor:** `harness init` now runs
  `git config merge.ours.driver true` (non-fatal if git is unavailable), and
  `harness validate` warns when `merge=ours` is declared but the driver is unset
  in the current clone (the one-time per-clone fix).
- **Read-source invariant (R):** a new core detector
  (`findRoadmapReadSourceViolations` + `ROADMAP_READ_ALLOWLIST`) plus a repo
  guard test fail when any new source file starts reading the generated
  `docs/roadmap.md` aggregate instead of the shard store. The allowlist enumerates
  today's legacy readers and shrinks as writers migrate onto `RoadmapStore`.
