---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
'@harness-engineering/types': minor
---

feat(roadmap): `harness roadmap sync` CLI with CI-safety guards and zero-denominator exit

The full bidirectional roadmap↔tracker sync was reachable only through the
`manage_roadmap action:"sync"` MCP tool. CI could therefore only ever flip rows
**to `done`** (via `roadmap reconcile`) — every other transition and the whole
tracker-label push depended on a human remembering to run an MCP tool. In one
downstream repo that left `last_synced` 22 days behind `last_manual_edit` and 22
issues with no tracker labels at all, invisible to a tracker scoped by a
selector label.

`harness roadmap sync` closes the loop, and is **dry-run by default** — `--apply`
is required to write anything. Two guards make an unattended run safe by
switching off the two destructive powers:

- `--no-state-change` (`syncIssueState: false`) omits the issue `state` field
  from every patch body, so labels converge but no issue is ever closed or
  reopened. The `statusMap` maps `done → closed`, so one mis-set roadmap row was
  otherwise enough to close a live issue.
- `--no-create` (`allowCreate: false`) never creates a ticket for a row lacking
  an `External-ID`, and reports each skipped row rather than dropping it. A cron
  that invents issues is unacceptable.

Both defaults preserve today's behaviour exactly; CI turns them off explicitly.
`--force` maps to the existing `forceSync` and is documented as unsafe
unattended (it overrides the human-always-wins rule).

`ExternalSyncOptions` gains `dryRun`, `allowCreate`, and `syncIssueState`,
threaded through `syncToExternal` / `syncFromExternal` to the adapter write path
(`TicketWriteOptions` on `TrackerSyncAdapter.updateTicket`; a `syncIssueState`
constructor option on `GitHubIssuesTrackerAdapter`). `SyncResult` gains
`dryRun`, `planned`, `skippedCreates`, `skippedStateChanges`, and `examined`.
The label-preservation logic in `buildIssuePatchBody` — skip the labels field
entirely when the refresh GET fails, so a transient blip cannot wipe the
`harness-managed` selector — is unchanged on both guard settings.

Denominator discipline: every run reports what it examined (rows compared,
tickets fetched), and the new `ExitCode.ZERO_DENOMINATOR` (3) fires when it
examined nothing. A sync that matched nothing has abstained, not succeeded, and
must never read as a pass.

Intended consumer pattern: a nightly
`harness roadmap sync --apply --no-create --no-state-change` converges labels
safely, while issue closure stays with the PR-merge auto-done path.
