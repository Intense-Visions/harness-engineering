---
slug: "intent-as-the-unit-of-record"
milestone: "Planning & Process"
order: 106
---

### Make intent, not the diff, the unit of record

- **Status:** planned
- **Spec:** —
- **Summary:** Every tracking, review, provenance and metric surface in the harness is keyed to the change: a commit, a pull request, a lane. That holds while a human could in principle read the change. At the upper end of the throughput regimes this roadmap contemplates — hundreds of merged changes per person per weekday — no human names, reads, or recalls an individual diff, and pull-request counts stop discriminating between operators entirely because the whole population converges. The artifact of record has to move up a level: a durable, addressable **intent** carrying its acceptance criteria, its blast radius, its conformance evidence and its outcome, with the diffs that satisfied it as an implementation detail beneath. Build: intent as a first-class entity linked to specs, tasks, changes and production outcomes; provenance and cost attributed to intents rather than commits; and review, roadmap and telemetry surfaces re-keyed onto it. Without this, every measurement surface degrades to noise exactly when volume makes measurement matter most.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1538
