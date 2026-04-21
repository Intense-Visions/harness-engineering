# Codebase Analysis: Business Knowledge System

**Date:** 2026-04-21

---

## Current Patterns

### Knowledge Storage

- **Graph** (`packages/graph/src/types.ts`): 28 node types, 24 edge types. Knowledge types: `adr`, `decision`, `learning`, `failure`, `document`, `conversation`. No business-specific types.
- **Session sections** (`packages/types/src/session-state.ts:15-22`): Accumulative sections for `terminology`, `decisions`, `constraints`, `risks`, `openQuestions`, `evidence`. Session-scoped, ephemeral.
- **Learnings** (`packages/core/src/state/learnings*.ts`): Deduplicated via content hashing, tagged with skill provenance and outcomes.

### Knowledge Ingestion

- **CodeIngestor** (`packages/graph/src/ingest/CodeIngestor.ts`): Regex + AST extraction of symbols, imports, calls. No comment/docstring extraction.
- **KnowledgeIngestor** (`packages/graph/src/ingest/KnowledgeIngestor.ts`): Parses ADRs (title, date, status) and learnings. Links to code by name matching.
- **RequirementIngestor** (`packages/graph/src/ingest/RequirementIngestor.ts`): Extracts EARS-pattern requirements from specs. Creates `requires`, `verified_by`, `tested_by` edges.
- **DesignIngestor** (`packages/graph/src/ingest/DesignIngestor.ts`): Parses DTCG tokens and DESIGN.md intent/anti-patterns.
- **TopologicalLinker** (`packages/graph/src/ingest/TopologicalLinker.ts`): Post-ingestion second pass — groups files into modules, detects circular deps. **Only second-pass pattern in the system.**

### External Connectors

- **4 connectors** (`packages/graph/src/ingest/connectors/`): Jira, Slack, Confluence, CI (GitHub Actions)
- **All implement** `GraphConnector` interface (`ConnectorInterface.ts:18-22`): `{ name, source, ingest(store, config) }`
- **All use** `sanitizeExternalText()` (2000-char default truncation) and `linkToCode()` (word-boundary regex matching)
- **SyncManager** (`SyncManager.ts`): Registers connectors, runs sequentially, persists sync metadata
- **No post-connector second pass exists** — no KnowledgeLinker equivalent of TopologicalLinker

### Context Assembly

- **gather_context** (`packages/cli/src/mcp/tools/gather-context.ts:97-350`): Parallel assembly of state + learnings + graph + sessions + handoff + validation + events
- **Assembler** (`packages/graph/src/context/Assembler.ts:34-39`): Phase-to-node-type mapping determines what types surface per workflow phase
- **Token budgets** (`packages/core/src/context/budget.ts:3-28`): Category-based allocation; node types mapped to categories

### Visual/Multimodal

- **Zero visual processing capability** — no OCR, no vision model integration, no diagram parsing
- **Playwright MCP** registered but not wired to any pipeline
- **All connectors discard attachments** (Jira images, Confluence diagrams, Slack file uploads)
- **Dashboard** generates SVG visualizations from graph data but doesn't persist or export them

---

## Integration Points

### Graph Schema Extension

- **File:** `packages/graph/src/types.ts:5-87`
- **Change:** Add node types (`business_fact`, `business_concept`, `business_narrative`, `business_rule`, `business_process`) and edge types (`supports`, `constrains`, `measures`) to existing arrays
- **Complexity:** Low — enum extension, auto-validated by existing Zod schemas

### Serializer Version

- **File:** `packages/graph/src/store/Serializer.ts:5`
- **Change:** Bump `CURRENT_SCHEMA_VERSION` from 1 to 2, add migration logic
- **Complexity:** Medium — needs backward compatibility

### Ingestor Registration

- **File:** `packages/cli/src/mcp/tools/graph/ingest-source.ts:14,52-62`
- **Change:** Add `'business'` source type, dispatch to new BusinessKnowledgeIngestor
- **Complexity:** Low — follows established pattern

### MCP Resources

- **File:** `packages/cli/src/mcp/server.ts:284-355`
- **Change:** Add `harness://business-knowledge` resource definition + handler
- **Complexity:** Low — follows established pattern

### gather_context Constituent

- **File:** `packages/cli/src/mcp/tools/gather-context.ts:121,282,310`
- **Change:** Add `'business-knowledge'` to include enum, add constituent promise, add to response
- **Complexity:** Medium — needs token budget coordination

### Phase Node Mapping

- **File:** `packages/graph/src/context/Assembler.ts:34-39`
- **Change:** Add business node types to each phase's type array
- **Complexity:** Low — array additions

### Session Sections

- **File:** `packages/types/src/session-state.ts:15-22`
- **Change:** Add `'businessContext'` and `'businessAssumptions'` to SESSION_SECTION_NAMES
- **Complexity:** Low — backward compatible

### Health Signals

- **File:** `packages/cli/src/skill/recommendation-types.ts:5-36`
- **Change:** Add business signals (`business-rule-violated`, `business-knowledge-stale`, etc.)
- **Complexity:** Low — enum extension

### Connector Enhancement

- **File:** `packages/graph/src/ingest/connectors/ConnectorUtils.ts:41-80`
- **Change:** Increase truncation limits, add knowledge-aware linking, add term extraction
- **Complexity:** Medium — regex and matching logic changes

### Post-Connector Second Pass (New)

- **Pattern:** TopologicalLinker (`packages/graph/src/ingest/TopologicalLinker.ts`)
- **New file needed:** `packages/graph/src/ingest/KnowledgeLinker.ts`
- **Purpose:** Run after all connectors sync, extract knowledge from ingested external nodes
- **Complexity:** High — new subsystem

---

## Technical Debt

- **2000-char truncation** on all connectors means most Confluence pages lose 80%+ of content
- **No attachment handling** across any connector — diagrams and documents are invisible
- **Word-boundary regex matching** in `linkToCode()` is brittle — no fuzzy matching, no synonym handling
- **No GitHub Issues/PRs connector** — a major source of business context is missing
- **Session sections are ephemeral** — no promotion mechanism to persist knowledge beyond session lifecycle
- **Single-pass ingestion** for connectors — no post-processing aggregation or knowledge extraction

---

## Relevant Files

| File                                             | Why It Matters                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `packages/graph/src/types.ts`                    | Schema definition — new node/edge types go here                    |
| `packages/graph/src/store/Serializer.ts`         | Persistence — version bump needed                                  |
| `packages/graph/src/ingest/`                     | All ingestors — new BusinessKnowledgeIngestor follows this pattern |
| `packages/graph/src/ingest/connectors/`          | All connectors — enhancement point for knowledge extraction        |
| `packages/graph/src/ingest/TopologicalLinker.ts` | Only second-pass pattern — KnowledgeLinker follows this            |
| `packages/graph/src/context/Assembler.ts`        | Phase-aware context — maps business types to phases                |
| `packages/graph/src/search/FusionLayer.ts`       | Search — business nodes must be searchable                         |
| `packages/cli/src/mcp/tools/gather-context.ts`   | Context tool — new constituent for business knowledge              |
| `packages/cli/src/mcp/server.ts`                 | MCP resources — new harness://business-knowledge                   |
| `packages/types/src/session-state.ts`            | Session sections — new business section types                      |
| `packages/cli/src/skill/recommendation-types.ts` | Health signals — new business signals                              |
| `packages/cli/src/skill/recommendation-rules.ts` | Skill routing — trigger skills on business signals                 |
| `packages/core/src/context/budget.ts`            | Token allocation — business knowledge budget category              |
