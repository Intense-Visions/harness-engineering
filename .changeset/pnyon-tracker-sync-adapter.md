---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': patch
---

Support `roadmap.tracker.kind: "pnyon"` in `harness roadmap sync`

Harness had two tracker adapter families: `RoadmapTrackerClient` (items and
evidence), which gained a Waypoint implementation, and `TrackerSyncAdapter`
(tickets and comments), which drives `roadmap sync` and had none. A project
configured for Waypoint could therefore be read but never synced — the command
refused the config outright. This adds the missing half.

- `PnyonSyncAdapter` translates `TrackerSyncAdapter` onto the Waypoint ledger,
  delegating to the existing client adapter so the versioned-command conflict
  contract applies unchanged.
- `TrackerSyncConfig` is now a discriminated union (`github` | `pnyon`), so
  GitHub-only fields are a type error under a pnyon tracker rather than a
  silently ignored key. A pnyon tracker requires `url` and takes no
  `statusMap` — Waypoint carries roadmap statuses natively, so the identity map
  is derived.
- `roadmap sync` builds the Waypoint adapter, reading its credential from
  `roadmap.tracker.token` or `PNYON_TOKEN` (including from a project `.env`,
  which the previous `GITHUB_TOKEN`-shaped guard skipped).
- Comments are first-class `commented` evidence entries rather than lifecycle
  events carrying prose.
- `fetchTicketState` and `assignTicket` have no Waypoint equivalent and return
  an explanatory error instead of a silent no-op.
- `roadmap reconcile` refuses a non-github tracker with a message explaining
  why: it filters on GitHub's separate closed/completed state, which Waypoint
  does not model, so running it would reconcile nothing while exiting 0.

The orchestrator's two tracker-sync call sites now narrow to the `github` kind
before using GitHub-shaped config, rather than assuming every tracker is one.

Refs #1863.
