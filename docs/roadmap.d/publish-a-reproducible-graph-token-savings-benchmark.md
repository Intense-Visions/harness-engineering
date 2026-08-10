---
slug: "publish-a-reproducible-graph-token-savings-benchmark"
milestone: "Intake"
order: 31
---

### Publish a reproducible graph token-savings benchmark

- **Status:** planned
- **Spec:** —
- **Summary:** Harness ships the code-graph context-scoping capability its two closest competitors benchmark and market, and has never published a number for it. Build a reproducible benchmark comparing graph-scoped retrieval (`query_graph`, `ask_graph`, `get_impact`, `compute_blast_radius`, `code_outline`, `find_context_for`) against naive file-by-file exploration, and publish the methodology alongside the result. Comparators: `DeusData/codebase-memory-mcp` (38.3k, MIT) whose arXiv preprint 2603.27277 reports **10x fewer tokens, 83% answer quality, 2.1x fewer tool calls across 31 real repos** — that is the honest number to beat, NOT the 99.2% README figure which came from 5 hand-picked structural queries; and `tirth8205/code-review-graph` (29.6k, MIT) which publishes `docs/REPRODUCING.md` and claims 71x on flask. Accept the risk that the number may be unflattering: harness's graph is multi-purpose (review scoping, impact, blast radius) where both comparators are single-purpose and optimized for this exact metric, so a losing result is a roadmap input rather than a reason not to measure. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 6.75).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1271
