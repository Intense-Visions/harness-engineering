---
slug: "concurrent-change-coordination-at-scale"
milestone: "Parallel Execution & State"
order: 107
---

### Semantic conflict detection and region leases for high-concurrency change

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet isolation today is per-lane worktrees plus textual merge, which is sufficient while concurrent lanes rarely touch the same code. At high change rates collision becomes the normal case rather than the exception — a ten-operator team at the top regime considered here implies thousands of merges per day against a substrate that serialises them. Textual non-conflict is also not semantic safety: two lanes can merge cleanly and jointly break an invariant neither violated alone. Build on the primitives that already exist (`predict_conflicts`, `compute_blast_radius`): advisory **leases** over code regions so lanes are dispatched to avoid collision rather than resolving it afterwards, semantic conflict checks over the union of concurrent changes rather than pairwise diffs, and change composition into verified batches so merge throughput is not one-at-a-time. Correctness, not speed, is the reason: the failure mode is a clean merge that is jointly wrong.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1539
