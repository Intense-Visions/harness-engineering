---
slug: "continuous-fuzzing-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 142
---

### Continuous corpus-accumulating fuzzing fleet

- **Status:** planned
- **Spec:** —
- **Summary:** Mutation testing (filed) checks whether the gates catch seeded defects; nothing continuously hunts real defects in the product code with the one background technique that has decades of industrial proof: coverage-guided fuzzing with a persistent, growing corpus. The model is well established — harnessable entry points get fuzz targets, a background fleet runs them continuously within a compute budget, the corpus accumulates as an asset (every interesting input found makes all future fuzzing better), crashes/violations are deduplicated, minimized, and filed with reproducers. The fleet-family framing fits exactly: a standing background fleet, budget-governed, whose findings enter the normal intake queue as issues with reproducing tests attached (the bug-fleet's no-reproduction-no-bug rule satisfied by construction — a fuzz finding IS a reproducer). Agent leverage is the new part: agents write and maintain the fuzz targets — historically the adoption bottleneck — by identifying harnessable surfaces (parsers, deserializers, state machines, public APIs with structured input) and generating targets from type signatures, which is precisely the mechanical-authoring work agents do well.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1640
