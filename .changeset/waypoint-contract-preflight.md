---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Check spooled `sdlc.*` events against pnyon's published contract before shipping them.

`shipSpool` now validates every event against the vendored
`https://pnyon.com/schema/sdlc-v1.schema.json` and refuses the ones the ledger would reject —
without a round trip. Refused events go to the existing dead-letter file with the offending field
named, and the checkpoint does not advance past them. `harness waypoint ship --skip-contract-check`
ships anyway, for when the live ledger has moved ahead of the vendored copy.

Adds `validateAgainstContract`, `sdlcContract` and `describeViolations` to `@harness-engineering/core`.
