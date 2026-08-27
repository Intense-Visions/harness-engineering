---
slug: "graph-edge-provenance-enum"
milestone: "v3.0 Graph Intelligence"
order: 1
---

### Graph edge provenance enum (EXTRACTED / INFERRED / AMBIGUOUS)

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add a first-class provenance enum on graph edges alongside the existing `confidence` float (`packages/graph/src/types.ts`), set at ingest time in CodeIngestor/TopologicalLinker (AST-explicit → EXTRACTED, resolver-derived → INFERRED). Lets every adapter distinguish read-directly from inferred. Highest-leverage, smallest-surface item of the Graphify Option-A port (ADR 0104).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1511
