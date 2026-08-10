---
slug: "runtime-trace-ingestion-to-validate-graph-edges"
milestone: "Intake"
order: 42
---

### Runtime-trace ingestion to validate graph edges

- **Status:** planned
- **Spec:** —
- **Summary:** Ingest runtime traces and use them to confirm or refute statically-derived graph edges — a static call/HTTP edge is a hypothesis until observed traffic supports it. Harness ships ten graph ingestors (`CodeIngestor`, `GitIngestor`, `DecisionIngestor`, `KnowledgeIngestor`, `RequirementIngestor`, `DesignIngestor`, `CanaryResultsIngestor`, `BusinessKnowledgeIngestor`, plus `StructuralDriftDetector` and `ContradictionDetector`) and **no runtime-trace ingestor**: grep for `ingest_traces|ingestTrace|HTTP_CALLS|runtime trace` across `packages` returns zero non-dist hits. Adopted from `DeusData/codebase-memory-mcp`'s `ingest_traces` tool ("ingest runtime traces to validate HTTP_CALLS edges"). Strongly on-thesis for constraints-as-code: an edge validated against production traffic is a materially stronger constraint than one inferred from an AST, and an edge the traces contradict is a drift signal nothing currently emits. Existing seam to build on: `CanaryResultsIngestor` already establishes the pattern of folding execution results back into the graph, and the Canary plugin's `canary-instrument` skill already emits OpenTelemetry run artifacts correlating tests to outbound HTTP requests — a plausible first trace source. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 3.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1282
