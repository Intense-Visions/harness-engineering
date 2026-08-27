---
'@harness-engineering/core': minor
'@harness-engineering/types': minor
'@harness-engineering/cli': patch
---

feat(fleet): cross-run advisory work-claim lease for the ID-based members

Adds a GitHub-backed advisory work-claim lease so two people running an ID-based
fleet (`roadmap-fleet`, `issue-fleet`, `pr-fleet`) on different clones auto-partition
the backlog instead of duplicating work. New `FleetClaim` type in
`@harness-engineering/types` and a pure, offline `fleet/claims` module in
`@harness-engineering/core` (`buildClaimBody` / `parseClaimComment` / `isLeaseLive` /
`resolveClaimWinner` / `classifyClaim` / `selectUnclaimed` + constants). Soft
reservation with a TTL+heartbeat lease measured off the GitHub server clock; the open
PR is the durable claim. The `cli` bump is an incidental command-registry regeneration.
