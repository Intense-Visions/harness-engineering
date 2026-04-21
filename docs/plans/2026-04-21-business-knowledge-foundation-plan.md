# Plan: Phase 1 — Business Knowledge Foundation

**Date:** 2026-04-21 | **Spec:** docs/changes/business-knowledge-foundation/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

The harness knowledge graph supports business domain knowledge with 5 new node types, 2 edge types, a BusinessKnowledgeIngestor, a `harness://business-knowledge` MCP resource, gather_context integration, and 2 pilot knowledge files.

## Observable Truths (Acceptance Criteria)

1. `NODE_TYPES` in `packages/graph/src/types.ts` includes `business_rule`, `business_process`, `business_concept`, `business_term`, `business_metric`
2. `EDGE_TYPES` in `packages/graph/src/types.ts` includes `governs`, `measures`
3. `BusinessKnowledgeIngestor.ingest(dir)` creates nodes from YAML-frontmatter markdown files with correct types
4. `BusinessKnowledgeIngestor.ingest(dir)` creates `governs` edges from `business_rule`/`business_process` to code nodes
5. `BusinessKnowledgeIngestor.ingest(dir)` creates `measures` edges from `business_metric` to `business_process`/`business_concept` nodes
6. When `docs/knowledge/` does not exist, `BusinessKnowledgeIngestor.ingest()` returns empty result with no errors
7. `harness://business-knowledge` MCP resource returns JSON with domains, file counts, and file metadata
8. `gather_context` with `include: ['businessKnowledge']` returns a `businessKnowledge` key in output
9. `docs/knowledge/architecture/layer-boundaries.md` and `docs/knowledge/architecture/graph-schema.md` exist with valid frontmatter
10. `BusinessKnowledgeIngestor` is exported from `packages/graph/src/index.ts`
11. TypeScript compiles with no errors; `harness validate` passes

## File Map

```
MODIFY  packages/graph/src/types.ts
CREATE  packages/graph/src/ingest/BusinessKnowledgeIngestor.ts
CREATE  packages/graph/tests/ingest/BusinessKnowledgeIngestor.test.ts
MODIFY  packages/graph/src/index.ts
CREATE  packages/cli/src/mcp/resources/business-knowledge.ts
MODIFY  packages/cli/src/mcp/server.ts
MODIFY  packages/cli/src/mcp/tools/gather-context.ts
CREATE  docs/knowledge/architecture/layer-boundaries.md
CREATE  docs/knowledge/architecture/graph-schema.md
```

## Tasks

### Task 1: Extend graph schema with business knowledge types

**Depends on:** none | **Files:** packages/graph/src/types.ts

1. Add 5 node types after the `// Knowledge` section: `business_rule`, `business_process`, `business_concept`, `business_term`, `business_metric`
2. Add 2 edge types after the `// Knowledge relationships` section: `governs`, `measures`
3. Run: `npx harness validate`
4. Commit: `feat(graph): add business knowledge node and edge types`

### Task 2: Create BusinessKnowledgeIngestor with TDD

**Depends on:** Task 1 | **Files:** packages/graph/tests/ingest/BusinessKnowledgeIngestor.test.ts, packages/graph/src/ingest/BusinessKnowledgeIngestor.ts

1. Create test file `packages/graph/tests/ingest/BusinessKnowledgeIngestor.test.ts` with tests for:
   - Creates nodes from YAML frontmatter markdown with correct types
   - Creates `governs` edges from business_rule nodes to code nodes
   - Creates `measures` edges from business_metric to business_process nodes
   - Returns empty result for missing directory
   - Handles files without frontmatter gracefully
2. Run tests — observe failures
3. Create `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` implementing:
   - `ingest(knowledgeDir: string): Promise<IngestResult>`
   - YAML frontmatter parsing (regex-based: split on `---`)
   - Node creation with ID format `bk:<domain>:<filename>`
   - `linkToCode()` for keyword-based code linking
   - `governs` edges for business_rule/business_process nodes
   - `measures` edges for business_metric nodes linking to business_process/business_concept nodes
4. Run tests — observe pass
5. Run: `npx harness validate`
6. Commit: `feat(graph): add BusinessKnowledgeIngestor`

### Task 3: Export BusinessKnowledgeIngestor from graph package

**Depends on:** Task 2 | **Files:** packages/graph/src/index.ts

1. Add export: `export { BusinessKnowledgeIngestor } from './ingest/BusinessKnowledgeIngestor.js';`
2. Run: `npx harness validate`
3. Commit: `feat(graph): export BusinessKnowledgeIngestor`

### Task 4: Create harness://business-knowledge MCP resource

**Depends on:** Task 1 | **Files:** packages/cli/src/mcp/resources/business-knowledge.ts, packages/cli/src/mcp/server.ts

1. Create `packages/cli/src/mcp/resources/business-knowledge.ts`:
   - `getBusinessKnowledgeResource(projectRoot: string): Promise<string>`
   - Reads `docs/knowledge/` recursively for .md files
   - Parses YAML frontmatter for type/domain
   - Returns JSON with `domains` (grouped by domain), `totalFiles`, `totalDomains`
   - Returns `{ domains: {}, totalFiles: 0, totalDomains: 0 }` if dir missing
2. Register in `packages/cli/src/mcp/server.ts`:
   - Import `getBusinessKnowledgeResource`
   - Add resource definition to `RESOURCE_DEFINITIONS`
   - Add handler to `RESOURCE_HANDLERS`
3. Run: `npx harness validate`
4. Commit: `feat(cli): add harness://business-knowledge MCP resource`

### Task 5: Integrate businessKnowledge into gather_context

**Depends on:** Task 1 | **Files:** packages/cli/src/mcp/tools/gather-context.ts

1. Add `'businessKnowledge'` to the `IncludeKey` type union
2. Add `businessKnowledge` constituent promise that reads knowledge files from `docs/knowledge/`
3. Add to `Promise.allSettled` array and extract result
4. Add `businessKnowledge` key to output object
5. Run: `npx harness validate`
6. Commit: `feat(cli): integrate businessKnowledge into gather_context`

### Task 6: Author pilot domain knowledge files

**Depends on:** none | **Files:** docs/knowledge/architecture/layer-boundaries.md, docs/knowledge/architecture/graph-schema.md

1. Create `docs/knowledge/architecture/layer-boundaries.md` with:
   - Frontmatter: `type: business_rule`, `domain: architecture`, `tags: [layers, imports, dependencies]`
   - Content: Layer boundary rules, the 9-layer hierarchy, forbidden import constraints
2. Create `docs/knowledge/architecture/graph-schema.md` with:
   - Frontmatter: `type: business_concept`, `domain: architecture`, `tags: [graph, nodes, edges, schema]`
   - Content: Graph schema purpose, node type categories, edge type categories
3. Run: `npx harness validate`
4. Commit: `docs: add pilot architecture knowledge files`

### Task 7: Final integration verification

**Depends on:** Tasks 1-6 | **Files:** none (verification only)

1. Run: `cd packages/graph && npx vitest run tests/ingest/BusinessKnowledgeIngestor.test.ts`
2. Run: `npx tsc --noEmit` (from root)
3. Run: `npx harness validate`
4. Verify all observable truths are met
