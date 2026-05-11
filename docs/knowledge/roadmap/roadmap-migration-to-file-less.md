---
type: business_process
domain: roadmap
tags: [file-less, migration, dry-run, idempotent, archive, github-issues, operator]
---

# Roadmap Migration to File-less Mode

The one-shot migration that converts an existing file-backed project (`docs/roadmap.md` is canonical, `roadmap.mode` is absent or `"file-backed"`) into a file-less project (the configured GitHub Issues tracker is canonical, `roadmap.mode: "file-less"`, `docs/roadmap.md` archived). Designed to be dry-run-previewable, idempotent on re-run, and atomic at the config-flip step (the mode flag flips only after the tracker side of the move is complete).

## Trigger

The operator runs `harness roadmap migrate --to=file-less [--dry-run]` after:

1. Configuring `roadmap.tracker` in `harness.config.json` (verified by `harness validate` returning clean).
2. Confirming the pre-flight checklist in `docs/changes/roadmap-tracker-only/migration.md` §"Pre-flight checklist" (clean tree, no in-flight claims, no concurrent operators).

The migration is operator-initiated. There is no auto-migration; doing the move silently on first run would create mass GitHub issue traffic without operator awareness.

## Flow

The steps mirror the Phase 5 implementation in `packages/core/src/roadmap/migrate/run.ts`:

1. **Pre-check.** Verify `roadmap.tracker` is configured. If absent, abort with `ROADMAP_MODE_MISSING_TRACKER`.
2. **Parse.** Parse the current `docs/roadmap.md` via `parseRoadmap()`.
3. **Create missing.** For each feature without an `External-ID`, call `client.create()`. Title-only collisions (an existing issue has the same title but no recorded `External-ID` on the roadmap-side feature) refuse and exit `AMBIGUOUS` (Phase 5 decision D-P5-E). The operator resolves by recording the External-ID in `roadmap.md` and re-running.
4. **Update bodies.** For each feature with an `External-ID`, call `client.update()` to write the canonical body metadata block. The `bodyMetaMatches` short-circuit skips features whose body block already matches what would be written (Phase 5 decision D-P5-B).
5. **Append history.** For each pre-existing `Assignment-History` row, call `client.appendHistory()`. Events whose 8-char content-addressed hash already exists on the issue are skipped (Phase 5 decision D-P5-C — see ADR 0009 for the hash design).
6. **Archive.** Rename `docs/roadmap.md` → `docs/roadmap.md.archived`. Archive collisions (the destination file already exists) refuse-and-abort (Phase 5 decision D-P5-D); the operator deletes or moves the prior archive first.
7. **Flip config.** Write `harness.config.json.pre-migration` as a byte-for-byte backup (Phase 5 decision D-P5-F), then mutate `harness.config.json` to set `roadmap.mode: "file-less"`.

The config flip is the last step. If any earlier step fails, the mode flag stays `"file-backed"` and the project remains operable on the file-backed code paths. Recovery is the operator's responsibility (see "Rollback recipe").

## Dry run

`--dry-run` performs steps 1 through 4 in-memory, with no GitHub API writes. The output shows:

- `Would create: N` — features that would be created (no External-ID recorded).
- `Would update: M` — features whose body block would be rewritten.
- `Unchanged: K` — features whose body block already matches.
- `Would append history: H` — history events that would be posted.
- `Ambiguous: A` — title-only collisions that would block a real run.

The dry run is the operator's expected first action; the migration guide flags it as mandatory in `docs/changes/roadmap-tracker-only/migration.md` §"Dry run".

## Idempotence

Re-runs after a successful migration exit at step 1 with `Already migrated; nothing to do.`. Re-runs after a partial failure pick up where they stopped:

- Step 3 (create) skips features with a recorded External-ID.
- Step 5 (history) skips events whose 8-char hash is already posted on the issue.
- Step 6 (archive) refuses if the archived file already exists (the prior run wrote it).
- Step 7 (flip) skips if `roadmap.mode` is already `"file-less"`.

The idempotence guarantees combine: a failed run in the middle of step 3 can be re-invoked safely; the second run does not duplicate issues. A failed run after step 6 but before step 7 is recoverable by re-invoking — the second run skips steps 2–6 (file is archived) and runs step 7.

Two failure modes are NOT auto-recoverable on re-run and require explicit operator intervention before the migration can proceed:

- **AMBIGUOUS title collision (Phase 5 decision D-P5-E).** If an issue with a matching feature title exists in the tracker but the roadmap-side feature has no `External-ID` recorded, the migration aborts at step 3 to avoid mis-binding the wrong issue. The operator must either (a) hand-record the correct `External-ID` against the feature in `docs/roadmap.md`, or (b) close or rename the colliding issue, then re-invoke. The migration never guesses; ambiguous binding is treated as a hard stop.
- **Archive collision (Phase 5 decision D-P5-D).** If `docs/roadmap.md.archived` already exists when step 6 runs, the migration refuses to overwrite it. The operator must rename or remove the existing archive (the destination from a prior run, or an unrelated file with the same name) before re-invoking. Refusing to overwrite preserves the operator's earlier archive in case the prior migration was abandoned mid-flight.

## Known limitations (carry-forward)

Per Phase 6 decision D-P6-G, the following Phase-5-flagged caveats are documented here as known limitations that an LLM or operator may encounter:

- **REV-P5-S1 — history-hash day-granularity.** Events on the same day with the same `type` + `actor` collide: the hash `sha256(type + actor + at + JSON.stringify(details ?? {}))` truncates to 8 hex chars, and migration backfill of legacy `Assignment-History` rows hashes at day-grain because the source data only records `assigned` / `released` / `completed` with day-grain dates. This is acceptable for backfill (legacy history was already day-grain) but means migrated history cannot distinguish two events the same actor performed on the same day with different details. Future history events from interactive workflows hash at second-grain via the `at` field and do not have this collision.
- **REV-P5-S7 — no advisory lockfile.** Two concurrent invocations of `harness roadmap migrate` (for example, the operator running it manually at the same minute a CI workflow runs it) are not prevented by harness itself — coordination is the operator's responsibility. The migration guide flags this in §"Pre-flight checklist". The most likely failure mode for a concurrent invocation is duplicate `create()` calls on features that lacked an External-ID; the second invocation would observe the issues created by the first and resolve correctly on the next run, but the in-flight state can produce noisy output. Add an advisory lock in a future round if operator demand justifies the complexity.
- **C-P5-rawBody-resolver-overupdates.** The Phase 2 GitHub Issues adapter does not expose raw issue bodies on `TrackedFeature`; the adapter parses bodies internally and returns the canonical shape with no `body` field. As a consequence, the migration runner's `bodyMetaMatches` short-circuit (step 4) cannot detect "body block already matches" cases and treats every feature with an External-ID as `toUpdate`. The dry-run plan over-reports `Would update: M` (inflated count). The writes themselves are still idempotent at the adapter level (a re-write of the same canonical body block is a no-op semantically), so the inflation is cosmetic, not behavioral. The migration guide's "Dry run" section explains this in §"Re-run output looks different from a fresh run". A subsequent enhancement could expose `body` on `TrackedFeature` or add a sibling `fetchRawBody` method to enable the short-circuit. Tracked as a follow-up.

## Rollback recipe

If the migration produces an undesired state (rare but possible — operator changed their mind, or the tracker side has unexpected issues):

1. Delete the issues that the migration created. Identify them by the body metadata block (`<!-- harness-meta -->` fenced section). Useful query: `gh issue list --search 'in:body harness-meta'` plus a date filter.
2. Restore `harness.config.json` from `harness.config.json.pre-migration`.
3. Restore `docs/roadmap.md` from `docs/roadmap.md.archived`. Verify by running `harness validate`.
4. Re-run `harness validate` to confirm `roadmap.mode` is back to `"file-backed"` and `docs/roadmap.md` is canonical.

The full operator-facing rollback walkthrough lives in `docs/changes/roadmap-tracker-only/migration.md` §"Rollback recipe".

## Cross-links

- `File-less Roadmap Mode` (sibling `business_concept`).
- `Tracker as Source of Truth` (sibling `business_rule`).
- ADR 0008 — IssueTrackerClient abstraction in core.
- ADR 0009 — Audit history as issue comments (the hash design used by step 5).
- Migration guide: `docs/changes/roadmap-tracker-only/migration.md`.

## Key Files

- `packages/cli/src/commands/roadmap/migrate.ts` — CLI command entry point.
- `packages/core/src/roadmap/migrate/run.ts` — orchestrator-level run function.
- `packages/core/src/roadmap/migrate/plan-builder.ts` — produces the per-feature plan.
- `packages/core/src/roadmap/migrate/history-hash.ts` — content-addressed hash for history events.
- `packages/core/src/roadmap/migrate/body-diff.ts` — `bodyMetaMatches` short-circuit (subject to the rawBody-resolver limitation above).
- `docs/changes/roadmap-tracker-only/migration.md` — operator-facing migration guide.
