---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Roadmap-shard follow-ups: correctness + CLI parity.

- **Offline reconcile honors `state_reason` (correctness).** `harness roadmap
reconcile` no longer flips a row whose linked issue was closed as
  `not_planned`/`wontfix` — only a `completed` close (or a close whose reason the
  tracker does not report, a conservative back-compat default) drives an auto-done
  flip. `ExternalTicketState` now carries an optional `stateReason`, populated by
  the GitHub adapter.
- **Cross-repo issue mis-map fixed (correctness).** A PR can close an issue in a
  different repo; the prior path built External-IDs from bare numbers against the
  configured repo, so a colliding number could flip the wrong local row. New
  `harness roadmap reconcile --from-refs owner/repo#number` builds each External-ID
  from the ref's own `owner/repo` and matches the full External-ID; the auto-done
  Action now fetches `repository.nameWithOwner` per closing issue and passes refs
  through. `--from-issues` (configured-repo numbers) is retained.
- **`regen`/`unshard` gain `--dry-run` and `--format json`** for parity with
  `shard` (unshard can now preview before the destructive shard-dir deletion).
- **Internal cleanup:** the `github:owner/repo#NNN` parser is consolidated into one
  canonical module (`roadmap/external-id.ts`); `roadmapSourceExists` shares the
  shard-dir probe with the storage-mode detector.
