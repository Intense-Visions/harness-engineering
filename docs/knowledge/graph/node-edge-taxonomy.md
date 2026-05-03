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

## Domain Inference

Every node carries a `domain` field used by drift detection, gap reporting, and the knowledge pipeline to bucket findings (e.g. `payments`, `auth`, `graph`). Domain is resolved per node by the inference pipeline, with explicit signals winning over heuristic ones.

### Precedence (first match wins)

1. **Explicit `metadata.domain`** on the node — authoritative; any extractor or connector that knows the domain should set it directly
2. **User-configured `knowledge.domainPatterns`** in `harness.config.json` — project-specific patterns that extend the defaults
3. **Built-in patterns** — `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>` (regex `^[\w.-]+\/<dir>$`)
4. **Generic first-segment fallback** — the leading directory of the path
5. **`'unknown'`** — when every prior step fails

Two refinements apply across all stages:

- **Extension allowlist:** only `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` files are inferred. Other extensions return `'unknown'`.
- **Symmetric blocklist:** if a path matches a pattern but the captured segment is on the blocklist (built-in: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`), the result is `'unknown'` directly — it does not fall through to lower-priority steps.

### Worked Example

Given a project with `harness.config.json`:

```json
{
  "knowledge": {
    "domainPatterns": ["agents/skills/<dir>"]
  }
}
```

| Path                                            | Match step                                     | Domain             |
| ----------------------------------------------- | ---------------------------------------------- | ------------------ |
| node with `metadata.domain: "billing"`          | (1) explicit metadata                          | `billing`          |
| `agents/skills/harness-planning/SKILL.md`       | (2) user pattern → captures `harness-planning` | `harness-planning` |
| `packages/graph/src/ingest/domain-inference.ts` | (3) built-in `packages/<dir>`                  | `graph`            |
| `node_modules/foo/index.js`                     | (3) match but blocked → unknown                | `unknown`          |
| `tools/scripts/release.ts`                      | (4) generic first-segment                      | `tools`            |
| `README.md`                                     | extension not allowlisted                      | `unknown`          |

The canonical implementation lives at `packages/graph/src/ingest/domain-inference.ts`.
