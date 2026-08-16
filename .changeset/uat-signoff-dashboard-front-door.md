---
'@harness-engineering/dashboard': minor
---

feat(dashboard): UAT sign-off front door in the client lane (#710)

Surfaces the already-shipped UAT sign-off record primitive as a **Sign-off page in
the dashboard `client` and `pm-ba` lanes** — the missing browser front door that
lets a non-engineer adjudicate shipped work against its intent without opening the
CLI. Closes the inception → acceptance circle at the far end of the lifecycle.

- `GET /api/signoff/:slug` resolves a change's acceptance basis from its
  `docs/changes/<slug>/proposal.md` `## Success Criteria`, soft-degrading to
  `## User-Visible Behavior` then `## Overview` and reporting which section was
  used; a missing proposal returns `items: []` / `basisSection: null` (never 5xx),
  and any prior `signoff.md` is surfaced as `existing` so a signed change renders
  read-only.
- `POST /api/signoff` records the human decision through the **exact same
  `UatSignoffRecorder`** the `uat_signoff` MCP tool uses — one `execution_outcome`
  node (`metadata.source = 'uat-signoff'`, `result = success` iff `ACCEPTED`) — and
  writes `docs/changes/<slug>/signoff.md`. It rejects an incomplete decision (no
  inferred verdict) and blocks nothing: advisory / record-only.
- A new `Signoff` React page renders one neutral disposition control per acceptance
  item, an overall-verdict control, and a signer field; the submit control is gated
  until every item is ruled, a verdict is chosen, and a signer is entered.

Reuses the recorder, the `execution_outcome` node shape, and the `client` role
model — a new presentation + capture surface, not a new capability, node type,
authority, or LLM. UAT stays human-judged and advisory, distinct from the
LLM-judged, blocking `acceptance-eval` / `outcome-eval` gates.

The dashboard architecture layer now permits `@harness-engineering/intelligence`
(the recorder's home) as the single build-time consequence of that mandated reuse.
