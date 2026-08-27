---
slug: "graph-community-detection"
milestone: "v3.0 Graph Intelligence"
order: 2
---

### Graph community detection (Leiden / Louvain)

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add a real community-detection pass over GraphStore with labeled subsystems exposed on nodes. Today only `clusterBySource` grouping exists (`packages/graph/src/ingest/KnowledgeLinker.ts:163`). Ported from Graphify (ADR 0104 Option A).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1512
