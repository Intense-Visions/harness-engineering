---
'@harness-engineering/cli': minor
---

`manage_roadmap add` accepts an `external_id` that links the new row to an existing tracker ticket. When supplied, no tracker ticket is created (previously the add minted a duplicate of the issue being linked), the add is idempotent by External-ID (a second add with the same id writes nothing and returns `added: false`), and the response is a compact `{ added, feature, milestone, externalId }` envelope instead of the whole roadmap. File-less mode refuses `external_id` rather than creating a ticket. The `issue-fleet` skill now uses it to add a roadmap row for every issue routed to `roadmap-fleet`, then re-reads the roadmap to confirm each row landed (#2328).
