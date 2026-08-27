---
slug: "rate-distortion-context-compaction"
milestone: "Parallel Execution & State"
order: 136
---

### Rate-distortion context compaction — compression with a measured distortion metric

- **Status:** planned
- **Spec:** —
- **Summary:** Context compaction today is lossy compression with no distortion metric: summarization drops information by vibes, and the loss is discovered downstream as rework, wrong turns, and re-derivation. Rate-distortion theory says the problem is only well-posed once distortion is defined — then there is a frontier, and operating away from it is pure waste. Define distortion empirically and task-conditioned: ablate information classes from context on replayed runs (prior tool results, resolved decisions, code excerpts, conversational history, constraints) and measure which classes' removal raises error/rework rates for which task classes. The result is a distortion model: this task class is insensitive to conversational history but highly sensitive to stated constraints; that one is the reverse. Then compact to the frontier — aggressive summarization along measured-insensitive dimensions, verbatim preservation along sensitive ones — instead of uniform summarization that simultaneously over-compresses the load-bearing content and under-compresses the filler. Every long-running agent system has this problem; none has the distortion measurement. The ablation harness is the deliverable that makes the difference between a summarization heuristic and a compression discipline.
- **Blockers:** Depends on `intent-coding-theory`, `progressive-context-encoding`, and `stability-ordered-context-layout`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1633
