---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

Knowledge pipeline (Phases 4-5)

**@harness-engineering/graph:**

- Add KnowledgePipelineRunner with 4-phase convergence loop for end-to-end knowledge extraction
- Complete Phase 4 knowledge pipeline with D2/PlantUML parsers, staging aggregator, and CLI integration
- Add Phase 5 Visual & Advanced pipeline capabilities
- Add DiagramParseResult types and MermaidParser for diagram-to-graph ingestion
- Add StructuralDriftDetector with deterministic classification
- Add ContentCondenser with passthrough and truncation tiers
- Add KnowledgeLinker with heuristic pattern registry, clustering, staged output, and deduplication
- Add code signal extractors for business knowledge extraction
- Add business knowledge foundation with `business_fact` node type and `maxContentLength` config field
- Add `execution_outcome` node type and `outcome_of` edge type

**@harness-engineering/cli:**

- Add Phase 5 Visual & Advanced pipeline capabilities
- Add business-signals source to graph ingest
