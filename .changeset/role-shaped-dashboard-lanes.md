---
'@harness-engineering/dashboard': minor
---

Add role-shaped front doors to the dashboard: a presentation-only `role`
preference (`dev` | `pm-ba` | `client`) that scopes the sidebar and picks a
per-role default landing route.

- `dev` (default) is unchanged — every page, lands on Signals.
- `pm-ba` sees Roadmap, Work in Flight, live agents/streams, and the proposal
  review queue, landing on Roadmap.
- `client` sees a curated, read-only pair — Roadmap and Traceability — landing
  on Roadmap.

The role resolves from a persisted client preference, else the
`HARNESS_DASHBOARD_ROLE` server default, else `dev`, and can be switched from a
lane selector in the sidebar. This is a navigation convenience, **not a
security boundary**: a viewer can still reach any surface by typing its route.
Real per-role authorization is left as a documented seam at the orchestrator
proxy, pending multi-user hosting and authenticated sessions.
