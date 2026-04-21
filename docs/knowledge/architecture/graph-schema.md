---
type: business_concept
domain: architecture
tags: [graph, nodes, edges, schema, knowledge-graph]
---

# Knowledge Graph Schema

The harness knowledge graph is a unified data structure that connects code, knowledge, and operational data. It is stored in-memory using LokiJS and persisted to `.harness/graph/`.

## Node Type Categories

- **Code nodes:** repository, module, file, class, interface, function, method, variable — extracted by CodeIngestor via regex-based multi-language parsing
- **Knowledge nodes:** adr, decision, learning, failure, issue, document, skill, conversation — extracted by KnowledgeIngestor from `.harness/` markdown files
- **Business knowledge nodes:** business_rule, business_process, business_concept, business_term, business_metric — extracted by BusinessKnowledgeIngestor from `docs/knowledge/`
- **VCS nodes:** commit, build, test_result, execution_outcome — extracted by GitIngestor and CIConnector
- **Structural nodes:** layer, pattern, constraint, violation — derived from architecture analysis
- **Design nodes:** design_token, aesthetic_intent, design_constraint — extracted by DesignIngestor
- **Traceability nodes:** requirement — extracted by RequirementIngestor from `@req` annotations

## Edge Type Categories

- **Code relationships:** contains, imports, calls, implements, inherits, references
- **Knowledge relationships:** applies_to, caused_by, resolved_by, documents, violates, specifies, decided
- **Business knowledge relationships:** governs (rule/process to code), measures (metric to process/concept)
- **VCS relationships:** co_changes_with, triggered_by, failed_in, outcome_of
- **Design relationships:** uses_token, declares_intent, violates_design, platform_binding
- **Traceability relationships:** requires, verified_by, tested_by

## Query Interfaces

- **ContextQL** — Graph traversal from root nodes with depth limits and type filtering
- **FusionLayer** — Hybrid keyword + semantic search combining BM25 and vector similarity
- **NLQ (askGraph)** — Natural language queries translated to graph operations
