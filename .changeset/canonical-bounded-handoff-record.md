---
'@harness-engineering/types': minor
---

feat(types): add the canonical bounded fleet-worker handoff record. New `FleetHandoffRecord` (zod `FleetHandoffRecordSchema`) plus `validateFleetHandoffRecord`/`parseFleetHandoffRecord` helpers give every fleet-family worker (bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet, cleanup-fleet, security-fleet, test-fleet, issue-fleet, adr-fleet) ONE shared, bounded report shape — `status` (`done|parked|blocked|failed`), `summary`, `evidence`, `next_steps`, `blocker`, plus `fleet`/`item` provenance — modeled on a Ralph-loop bounded structured report. The record is bounded: `.strict()` rejects unknown keys and the validator rejects any non-`done` status that omits a `blocker`, so `fleet-command` can parse any fleet's worker output uniformly instead of special-casing each ad hoc shape. Reusable primitive only; retrofitting the fleet SKILL.md files is downstream adoption.
