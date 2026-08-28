---
slug: "compiled-comprehension-substrate"
milestone: "Parallel Execution & State"
order: 126
---

### Compile comprehension once; stop re-deriving it per leaf

- **Status:** done
- **Spec:** docs/changes/compiled-comprehension-substrate/proposal.md
- **Summary:** The dominant cost term in measured agent operation is context replay, not generation: one operator's local usage shows **cache-read tokens at 298x output tokens** across 698 sessions. What that volume buys, over and over, is the same thing — an agent re-reading source to re-derive an understanding some previous agent already held and discarded. The knowledge graph exists but is a *reference* agents may consult; source files remain the working substrate. Build the compiler analogy properly: a persistent, incrementally-maintained comprehension layer — per-module summaries, interface contracts, invariants, dependency slices — recompiled only for surfaces whose source changed (the git diff is the invalidation signal), versioned alongside the code, and served to fleet leaves as their *primary* context with raw source as the fallback for the region under edit. Correctness requirement stated up front: a stale summary is worse than no summary, so every served unit carries its source-hash provenance and the leaf can demand recompilation. This attacks the largest single line item in the token economics, and it compounds — every other item on this roadmap gets cheaper when comprehension stops being re-purchased per run.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1558
