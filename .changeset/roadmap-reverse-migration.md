---
'@harness-engineering/cli': patch
---

Implement `harness roadmap migrate --to=file-backed` (reverse migration), which previously errored `--to=file-backed reverse migration is not yet implemented`. It is the inverse of the forward (file-backed → file-less) migration: it fetches every feature from the configured tracker, reconstructs a `docs/roadmap.md` (grouping features by milestone, with un-milestoned features in a Backlog section), and flips `roadmap.mode` back to `file-backed` after taking a byte-identical `harness.config.json.pre-migration` backup — mirroring the forward path's config rewrite.

Safety: it short-circuits to `already-migrated` when the project is already file-backed, refuses to overwrite an existing `docs/roadmap.md` (the file-less invariant is that the file must not exist), and honors `--dry-run` (prints the plan, writes nothing) and `--format=json`. Exposes `featuresToRoadmap` for reuse/testing.
