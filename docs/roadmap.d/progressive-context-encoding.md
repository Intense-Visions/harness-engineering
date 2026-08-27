---
slug: "progressive-context-encoding"
milestone: "Parallel Execution & State"
order: 138
---

### Progressive context encoding — coarse-to-fine loading driven by attention

- **Status:** planned
- **Spec:** —
- **Summary:** Progressive JPEG sends the image coarse-to-fine so a consumer can stop when it has enough. Context is served the opposite way: full resolution up front, on the guess that the agent might need any of it — and most of those tokens are never read. Serve context progressively: the first layer is low-resolution (file outlines, signatures, decision summaries, digest-level telemetry), and the agent requests refinement only where its attention actually lands — unfold this function, expand that decision's full rationale, show the verbatim diff. The mechanics largely exist (outline/unfold tooling); what's missing is making progressive the default contract for every context class and — the more valuable half — instrumenting the refinement-request stream. That log is a direct measurement of which context earns its tokens: refinement frequency per context class is exactly the demand signal that rate-distortion compaction needs as a prior and the trained dictionary needs for membership scoring. One design guard: refinement round-trips add latency, so the policy must batch predictable refinements (prefetch what this task class historically refines) rather than paying a round-trip per unfold.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1632
