---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`harness waypoint record-provenance` now emits the event kind the published `sdlc.*` contract declares, so fleet provenance can actually reach a Waypoint ledger.

It emitted `sdlc.build.finished.v1` carrying `artifact` / `artifactPath` / `stages`. That type declares only `{ outcome, prNumber, mergeCommitSha, pr }`, and an undeclared field is refused rather than ignored — so every event was rejected at the contract check and nothing ever landed. Measured against a live ledger: 0 shipped, 13 permanently refused.

It now emits `sdlc.override.applied.v1` with the declared `fleet-provenance` kind, and forwards the `route`, `issues` and `assumptions` the CLI was already reading off the provenance file and discarding.

Patch rather than minor: the previous behaviour was non-functional by construction, and `FleetProvenanceArtifact` only gained optional fields.
