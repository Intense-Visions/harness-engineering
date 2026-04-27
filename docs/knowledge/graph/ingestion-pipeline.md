---
type: business_process
domain: graph
tags: [ingestion, extraction, knowledge-pipeline, convergence-loop]
---

# Knowledge Ingestion Pipeline

The knowledge pipeline is a 4-phase convergence loop that extracts business knowledge from code, diagrams, documents, and external connectors, then reconciles it against the existing graph state.

## Phases

1. **EXTRACT** — Assembles knowledge from 5 sources with pre/post-extraction snapshots:
   - Code signal extractors (test descriptions, enum constants, validation rules, API paths)
   - Diagram parsers (Mermaid, D2, PlantUML) extracting entities and relationships
   - Image analysis via vision model providers (when enabled)
   - Business knowledge from `docs/knowledge/` (YAML frontmatter + markdown)
   - Knowledge linker scanning connector-ingested nodes for business signals via heuristic patterns

2. **RECONCILE** — Compares pre-extraction and post-extraction snapshots using `StructuralDriftDetector`. Identifies NEW, STALE, DRIFTED, and CONTRADICTING entries and computes a drift score (0.0-1.0).

3. **DETECT** — Generates gap reports via `KnowledgeStagingAggregator` and coverage scores via `CoverageScorer`. Classifies findings by severity and safety.

4. **REMEDIATE** (optional, requires `--fix`) — Auto-removes stale nodes, materializes undocumented entries as docs via `KnowledgeDocMaterializer`, and runs a convergence loop (max 5 iterations) until finding count stabilizes.

## Extraction Output

Extracted signals are written as JSONL to `.harness/knowledge/extracted/` with each record containing: extractor name, language, file path, line number, node type, content, and confidence score (0.0-1.0).

## Convergence Rule

The remediation loop terminates when either: (a) issue count stops decreasing between iterations, or (b) max 5 iterations reached. Remaining unresolved findings require human intervention.
