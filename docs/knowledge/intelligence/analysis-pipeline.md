---
type: business_concept
domain: intelligence
tags: [intelligence, analysis, enrichment, complexity, simulation]
---

# Intelligence Analysis Pipeline

The intelligence package provides AI-powered analysis capabilities that enrich the orchestrator's dispatch decisions. It depends on types and graph packages.

## Analysis Layers

1. **Spec Enrichment Layer (SEL)** — Parses and understands issue intent, identifying affected systems, requirements, unknowns, and ambiguities through LLM-assisted analysis
2. **Complexity Measurement Layer (CML)** — Estimates task difficulty using graph-based blast radius scoring, historical outcomes, and semantic complexity analysis to produce a multi-dimensional complexity score
3. **Predictive Execution Simulation Layer (PESL)** — Simulates execution to predict success confidence through plan expansion, dependency simulation, failure injection, and test projection

## Integration

The `AnalysisProvider` interface accepts prompts and returns structured analysis results. The intelligence layer integrates with the orchestrator's dispatch pipeline to inform routing decisions — high-complexity or low-confidence issues can trigger human escalation rather than automatic agent dispatch.

## Graph Dependency

All analysis layers leverage the knowledge graph for blast radius computation, historical outcome lookup, and system dependency mapping, making the graph's completeness directly impact analysis quality.
