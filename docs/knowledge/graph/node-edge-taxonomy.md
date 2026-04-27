---
type: business_concept
domain: graph
tags: [nodes, edges, taxonomy, schema, ingestors]
---

# Node and Edge Taxonomy

The knowledge graph organizes all project data into typed nodes and directed edges across 8 dimensions.

## Node Type Categories

- **Code** — `file`, `class`, `interface`, `function`, `method`, `variable` — source structure extracted by CodeIngestor
- **Knowledge** — `adr`, `decision`, `learning`, `failure`, `issue`, `document`, `skill`, `conversation` — experiential and design knowledge
- **VCS** — `commit`, `build`, `test_result`, `execution_outcome` — change history and CI outcomes
- **Structural** — `layer`, `pattern`, `constraint`, `violation` — architectural metadata
- **Design** — `design_token`, `aesthetic_intent`, `design_constraint`, `image_annotation` — visual and UX
- **Traceability** — `requirement` — specification linkage via `@req` annotations
- **Business** — `business_rule`, `business_process`, `business_concept`, `business_term`, `business_metric`, `business_fact` — domain knowledge
- **Cache** — `packed_summary` — optimization nodes for context compression

## Edge Type Categories

- **Code**: `contains`, `imports`, `calls`, `implements`, `inherits`, `references`
- **Knowledge**: `applies_to`, `caused_by`, `resolved_by`, `documents`, `violates`, `specifies`, `decided`
- **VCS**: `co_changes_with`, `triggered_by`, `failed_in`, `outcome_of`
- **Design**: `uses_token`, `declares_intent`, `violates_design`, `platform_binding`
- **Business**: `governs` (rule/process to code), `measures` (metric to process/concept), `annotates`

## Ingestor Responsibility Map

Each node category has a dedicated ingestor: CodeIngestor (code), KnowledgeIngestor (knowledge), GitIngestor + CIConnector (VCS), BusinessKnowledgeIngestor (business), DesignIngestor (design), RequirementIngestor (traceability). External data flows through connectors (Jira, Slack, Confluence, Figma, Miro) implementing the `GraphConnector` interface.
