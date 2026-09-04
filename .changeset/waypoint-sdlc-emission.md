---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

feat(waypoint): opt-in `sdlc.*` event emission and repo-local spool
(pnyon/pnyon#124).

Adds an additive, OPT-IN Waypoint emission layer: with `waypoint.sink`
configured in `harness.config.json`, the sanctioned roadmap mutators
(`setStatus`/`claim`/`release`), skill phase transitions (`emit_interaction`),
persisted eval/UAT verdicts, and fleet artifact writes each append exactly one
CloudEvents-1.0-profile `sdlc.*.v1` event to a bounded, per-process JSONL
spool under `.harness/spool/` (drop-oldest at cap with a persistent
`droppedEvents` counter; client-side best-effort secret scrub; ULID
idempotency keys). The pinned 19-type `sdlc.*.v1` vocabulary is registered on
the gateway webhook bus, delivered through the existing `GatewayEvent`
envelope and `WebhookQueue` retry machinery via a new orchestrator-side
bridge. A new `harness waypoint` command records fleet
provenance/handoff artifacts and reports spool health.

THE HARD INVARIANT: with no `waypoint.sink` configured, nothing changes —
no new files, no new I/O, no behavior change to any existing command, mode,
or test (verified by dedicated non-adopter invariance tests). Shipping
spooled events to a hosted ingest is explicitly out of scope (pnyon owns
ingest).
