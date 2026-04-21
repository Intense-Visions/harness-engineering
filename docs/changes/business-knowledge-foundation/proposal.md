# Phase 1: Knowledge Foundation

## Overview

Establish the foundation for business domain knowledge in the harness knowledge graph. This adds structured business context (rules, processes, concepts, terms, metrics) that agents can access alongside code context during `gather_context` calls, improving decision quality for domain-aware tasks.

## Goals

1. Extend the graph schema with 5 business knowledge node types and 2 edge types
2. Create `BusinessKnowledgeIngestor` that reads YAML-frontmatter markdown from `docs/knowledge/`
3. Expose business knowledge via `harness://business-knowledge` MCP resource
4. Integrate business knowledge into `gather_context` as a new constituent
5. Author 1-2 pilot domain knowledge files demonstrating the format

## Decisions

| #   | Decision                                                                                                  | Rationale                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Separate `BusinessKnowledgeIngestor` class                                                                | Single responsibility; can evolve independently from ADR/learnings ingestion            |
| 2   | YAML frontmatter + markdown body format                                                                   | Consistent with existing doc patterns; easy to author and parse                         |
| 3   | 5 node types: `business_rule`, `business_process`, `business_concept`, `business_term`, `business_metric` | Covers the key knowledge categories needed for domain context                           |
| 4   | 2 edge types: `governs`, `measures`                                                                       | `governs` links rules/processes to code; `measures` links metrics to processes/concepts |
| 5   | Pilot domains: architecture, release-process                                                              | Immediately useful for this project; demonstrates real value                            |
| 6   | `gather_context` gets `businessKnowledge` constituent                                                     | Parallel assembly alongside graph, state, learnings                                     |

## Technical Design

### Graph Schema Extensions

**New node types** added to `NODE_TYPES` in `packages/graph/src/types.ts`:

```typescript
// Business Knowledge
'business_rule',      // Constraints, policies, invariants
'business_process',   // Workflows, procedures, sequences
'business_concept',   // Domain abstractions, bounded contexts
'business_term',      // Glossary entries, domain vocabulary
'business_metric',    // KPIs, measurements, thresholds
```

**New edge types** added to `EDGE_TYPES` in `packages/graph/src/types.ts`:

```typescript
// Business Knowledge relationships
'governs',   // business_rule/business_process -> code node
'measures',  // business_metric -> business_process/business_concept
```

### Knowledge File Format

Files in `docs/knowledge/` use YAML frontmatter:

```markdown
---
type: business_rule
domain: architecture
tags: [layers, imports, dependencies]
---

# Layer Boundary Enforcement

The harness monorepo enforces strict layer boundaries...
```

**Required frontmatter fields:**

- `type`: One of the 5 business knowledge node types
- `domain`: Domain category string (e.g., "architecture", "release-process")

**Optional frontmatter fields:**

- `tags`: Array of keyword strings for search/linking
- `related`: Array of other knowledge file paths for cross-references

### BusinessKnowledgeIngestor

**Location:** `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`

```typescript
export class BusinessKnowledgeIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingest(knowledgeDir: string): Promise<IngestResult>;
  // Reads all .md files recursively from knowledgeDir
  // Parses YAML frontmatter for type/domain/tags
  // Creates graph nodes with type from frontmatter
  // Links to code nodes via keyword matching (reuses linkToCode pattern)
  // Creates governs/measures edges based on type
}
```

**Node ID format:** `bk:<domain>:<filename>` (e.g., `bk:architecture:layer-boundaries`)

**Edge creation logic:**

- `business_rule` and `business_process` nodes get `governs` edges to matched code nodes
- `business_metric` nodes get `measures` edges to matched `business_process` and `business_concept` nodes
- All types get `documents` edges to matched code nodes via keyword/path matching

### MCP Resource

**URI:** `harness://business-knowledge`

**Location:** `packages/cli/src/mcp/resources/business-knowledge.ts`

Returns a JSON summary of all business knowledge files organized by domain:

```json
{
  "domains": {
    "architecture": [
      {
        "type": "business_rule",
        "name": "Layer Boundary Enforcement",
        "path": "docs/knowledge/architecture/layer-boundaries.md"
      }
    ]
  },
  "totalFiles": 3,
  "totalDomains": 2
}
```

### gather_context Integration

Add a `businessKnowledge` key to the `include` array options and output:

```typescript
type IncludeKey =
  | 'state'
  | 'learnings'
  | 'handoff'
  | 'graph'
  | 'validation'
  | 'sessions'
  | 'events'
  | 'businessKnowledge';
```

The constituent loads business knowledge nodes from the graph and returns them filtered by intent relevance using the FusionLayer search.

**Output shape addition:**

```typescript
{
  // ... existing fields
  businessKnowledge: {
    domains: string[];
    relevantFacts: Array<{ type: string; name: string; domain: string; content: string }>;
    totalNodes: number;
  } | null;
}
```

### Pilot Domain Files

**`docs/knowledge/architecture/layer-boundaries.md`** — Documents the 9-layer architecture and forbidden import rules.

**`docs/knowledge/architecture/graph-schema.md`** — Documents graph node/edge type purposes and usage patterns.

### File Layout

```
packages/graph/src/
  types.ts                                    # +5 node types, +2 edge types
  ingest/BusinessKnowledgeIngestor.ts         # NEW
  index.ts                                    # +export BusinessKnowledgeIngestor

packages/cli/src/mcp/
  resources/business-knowledge.ts             # NEW
  server.ts                                   # +resource registration
  tools/gather-context.ts                     # +businessKnowledge constituent

docs/knowledge/
  architecture/
    layer-boundaries.md                       # NEW pilot
    graph-schema.md                           # NEW pilot

packages/graph/src/ingest/__tests__/
  BusinessKnowledgeIngestor.test.ts           # NEW
```

## Success Criteria

1. `NODE_TYPES` includes all 5 new business knowledge types
2. `EDGE_TYPES` includes `governs` and `measures`
3. `BusinessKnowledgeIngestor` reads `docs/knowledge/`, creates correct node types and edges
4. `BusinessKnowledgeIngestor` gracefully handles missing directory (returns empty result)
5. `harness://business-knowledge` resource returns domain-organized JSON
6. `gather_context` with `include: ['businessKnowledge']` returns relevant business knowledge
7. At least 2 pilot knowledge files exist in `docs/knowledge/architecture/`
8. All existing tests continue to pass
9. `harness validate` passes
10. TypeScript compilation succeeds with no errors

## Implementation Order

1. **Schema extensions** — Add node/edge types to `types.ts`
2. **Ingestor** — Create `BusinessKnowledgeIngestor` with tests
3. **Export** — Wire into `packages/graph/src/index.ts`
4. **MCP resource** — Create resource handler and register in server
5. **gather_context** — Add `businessKnowledge` constituent
6. **Pilot content** — Author architecture domain knowledge files
