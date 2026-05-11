# Migrating to File-less Roadmap Mode

This guide walks operators through migrating a project's roadmap from the legacy file-backed format (`docs/roadmap.md` as the source of truth) to file-less mode, where the GitHub Issues tracker becomes the canonical source. The migration is one-shot, idempotent on re-run, and explicitly recoverable when partial failures interrupt the process. See [proposal.md](./proposal.md) for the design rationale and decisions table.

## Pre-flight checklist

Before running the migration, confirm each of the following:

- `roadmap.tracker.kind: "github"` is set in `harness.config.json` (only `github` is supported in this release).
- The `GITHUB_TOKEN` environment variable is present in the shell that will run the command, and the token has `repo` scope (writable) for the target repository.
- The repository configured at `roadmap.tracker.repo` is writable by that token (verify by, for example, manually creating and deleting a test issue).
- The working tree is clean. Strongly recommended: create a git checkpoint (`git commit` or `git stash`) before running so rollback is trivial.
- No concurrent dashboard or orchestrator activity touches the roadmap during the run. The migration assumes single-writer semantics; coordinate with your team so nobody else is calling claim/release/complete or editing `docs/roadmap.md` while the command runs.

## Dry run (always do this first)

Run a dry-run to inspect the migration plan without making any changes:

```sh
harness roadmap migrate --to=file-less --dry-run
```

Sample output:

```
DRY RUN Migration plan:
  Would create: 12
    - Alpha
    - Beta
    - ...
  Would update: 4
    - Charlie (github:o/r#42): priority,spec
    - ...
  Unchanged:    8
  Would append history: 3
  Ambiguous:    0
DRY RUN complete: 16 writes would be performed.
```

What to check:

- The `Would create` count matches the number of features in `docs/roadmap.md` that lack an `External-ID:` field.
- The `Would update` count is what you expect — see the **count semantics** note below for why this can be higher than intuition suggests.
- `Ambiguous: 0`. Any non-zero value blocks the real run; resolve each entry per the **Title-only collision** section before proceeding.

Note on count semantics: the `Would update` count includes idempotent canonical re-writes. The GitHub Issues adapter in this release does not expose raw issue bodies to the migration planner, so any feature with an existing External-ID falls into `toUpdate` by default. Re-running the migration would update those same issues again with a byte-identical body block; this is functionally a no-op but inflates the count. This is expected and harmless.

## Real run

Once dry-run output looks correct:

```sh
harness roadmap migrate --to=file-less
```

Expected stdout: the same plan summary as dry-run, followed by progress messages and a final success line of the form `Migration applied: N created, M updated, K unchanged, H history events appended.`

Expected duration: under 60 seconds for a typical project of up to 50 features, per the proposal's Performance budget (P4). Larger roadmaps scale roughly linearly with the number of `create`/`update` calls.

## Verification

After the real run, confirm:

- `harness validate` exits cleanly. The new `validateRoadmapMode` rules require `docs/roadmap.md` to be absent in file-less mode; the migration archives it for you.
- `docs/roadmap.md.archived` exists (the archived legacy file).
- `harness.config.json` contains `"mode": "file-less"` under `roadmap`.
- `harness.config.json.pre-migration` exists (byte-identical backup of the original config).
- The GitHub repository's Issues pane shows N issues with a `<!-- harness-meta` body block at the top — these are the canonical features.

## Rollback recipe

If you need to revert immediately after a successful migration:

```sh
mv docs/roadmap.md.archived docs/roadmap.md
mv harness.config.json.pre-migration harness.config.json
harness validate
```

Caveats:

- Rolling back leaves the GitHub issues in place. They can be left untouched (the file-backed sync engine will re-sync them on the next `harness sync`) or closed manually if you prefer a clean slate.
- History comments added to issues during the migration (`<!-- harness-history` blocks) remain on the issues and are not removed by rollback. They are inert in file-backed mode.

## Recovery from partial failure

If the real run aborts after some issues were already created (for example, a transient network error or a rate-limit hit halfway through), the command will exit non-zero and print a `Features created before abort` line listing each created feature with its new `externalId`. For each one, edit `docs/roadmap.md` and add an `External-ID:` field to the matching feature entry:

```md
### Alpha

- **External-ID:** github:o/r#42
- **Status:** backlog
- ...
```

Then re-run `harness roadmap migrate --to=file-less`. The migration is idempotent: the features that already exist on the tracker (identified by External-ID) are skipped at the create step, and only the remaining features are processed. No double-creates are possible as long as the External-IDs are recorded before re-running.

## Title-only collision

If `docs/roadmap.md` contains a feature with no `External-ID:` field whose title (case-insensitive) matches an existing tracker issue, the migration refuses to proceed and lists the offending feature under `Ambiguous`. This is the D-P5-E safety rule and prevents accidental double-creates when an issue already exists for a feature you forgot to record.

Remediation: locate the existing tracker issue, add its identifier as the `External-ID:` for that feature in `docs/roadmap.md`, and re-run the migration. If the existing issue truly is unrelated (rare; two features with the same name across different milestones), rename the local feature to disambiguate, then re-run.

## Archive collision

If `docs/roadmap.md.archived` already exists (for example, from a previous attempt at a different time), the migration refuses to overwrite it and aborts with reason `archive-collision`. This is the D-P5-D safety rule.

Remediation: move the existing archive aside and re-run:

```sh
mv docs/roadmap.md.archived docs/roadmap.md.archived.$(date +%s)
harness roadmap migrate --to=file-less
```

## What changes (semantics)

In file-less mode:

- The tracker is the source of truth for feature status, assignment, blockers, priority, and milestone. `docs/roadmap.md` no longer exists.
- Positional ordering of features (the order they appeared in the legacy file) is dropped. Features are sorted by `Priority` (descending) then by issue number (ascending) for display. This is decision **D4** in the proposal.
- Claim, release, and complete operations write directly to GitHub Issues via labels and assignee fields, with a deterministic `<!-- harness-history` comment block appended for each event.
- `harness validate` enforces that `docs/roadmap.md` is absent and that `roadmap.mode` is `"file-less"` in config.

For the full decisions table and rationale, see [proposal.md](./proposal.md).
