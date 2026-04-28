# Plan: ADR System and Knowledge Pipeline Integration (Phase 4)

**Date:** 2026-04-27 | **Spec:** docs/changes/integration-phase/proposal.md (Phase 4) | **Tasks:** 6 | **Time:** ~25 min

## Goal

Establish the ADR directory at `docs/knowledge/decisions/` with format documentation, create a `DecisionIngestor` that parses YAML-frontmatter ADR files into `decision` graph nodes with `decided` edges, wire it into the `KnowledgePipelineRunner` extraction phase, and add `decision` to the knowledge node type list.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/decisions/README.md` exists and documents: ADR frontmatter format (number, title, date, status, tier, source, supersedes), 4-digit zero-padded numbering, status values (accepted, superseded, deprecated), and instructions for creating a new ADR.
2. When an ADR file `0001-test-decision.md` with valid YAML frontmatter is placed in `docs/knowledge/decisions/`, `DecisionIngestor.ingest()` creates a graph node of type `decision` with id `decision:0001-test-decision`, correct metadata, and body content.
3. `DecisionIngestor.ingest()` creates `decided` edges from decision nodes to code nodes mentioned in the ADR body.
4. The `supersedes` frontmatter field is preserved as node metadata for graph queries.
5. `KnowledgePipelineRunner.extract()` invokes `DecisionIngestor` during extraction; decision counts appear in pipeline results.
6. `pnpm --filter @harness-engineering/graph run test` passes with all new tests (node creation, edge linking, superseded metadata, empty dir, pipeline integration).
7. `harness validate` passes after all changes.

## Uncertainties

- [ASSUMPTION] No `supersedes` edge type exists in the graph schema. The `supersedes` field will be stored as metadata on the decision node. A dedicated edge type can be added later without breaking existing nodes.
- [ASSUMPTION] `DecisionIngestor` is a new class (not an extension of `KnowledgeIngestor.ingestADRs()`) because the new format (YAML frontmatter), location (`docs/knowledge/decisions/`), and node type (`decision` vs `adr`) differ from the existing ADR ingestion path.
- [DEFERRABLE] The `ingest_source` MCP tool does not have a `decisions` source type. The pipeline handles decision ingestion automatically; the MCP tool can be extended later.
- [DEFERRABLE] Minor decision enrichment (handoff.json decisions as lightweight graph nodes) is instruction-driven via the integration skill's MATERIALIZE sub-phase using existing `ingest_source`. No additional TypeScript code needed in this plan.

## File Map

```
CREATE  docs/knowledge/decisions/README.md
CREATE  packages/graph/src/ingest/DecisionIngestor.ts
CREATE  packages/graph/tests/ingest/DecisionIngestor.test.ts
MODIFY  packages/graph/src/ingest/KnowledgePipelineRunner.ts (add DecisionIngestor to extract phase)
MODIFY  packages/graph/src/ingest/knowledgeTypes.ts (add 'decision' to KNOWLEDGE_NODE_TYPES)
MODIFY  packages/graph/src/index.ts (export DecisionIngestor)
```

## Tasks

### Task 1: Create ADR directory and README

**Depends on:** none | **Files:** `docs/knowledge/decisions/README.md`

1. Create directory `docs/knowledge/decisions/`.

2. Create `docs/knowledge/decisions/README.md` with the following content:

````markdown
---
type: business_concept
domain: architecture
tags: [adr, decisions, knowledge, architecture]
---

# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for the project. ADRs capture significant technical and architectural decisions along with their context and consequences.

## Format

Every ADR is a Markdown file with YAML frontmatter followed by three required sections:

```yaml
---
number: NNNN
title: <decision title>
date: YYYY-MM-DD
status: accepted | superseded | deprecated
tier: small | medium | large
source: <spec path or session slug>
supersedes: <prior ADR number, if any>
---
```
````

### Required Sections

- **Context** -- What situation prompted this decision? What constraints existed?
- **Decision** -- What was decided and why?
- **Consequences** -- What follows from this decision (positive, negative, and neutral)?

## Numbering Scheme

- Numbers are sequential, 4-digit, zero-padded: `0001`, `0002`, `0003`, etc.
- File names follow the pattern: `NNNN-<slug>.md` (e.g., `0001-tiered-integration-rigor.md`)
- To find the next number, scan this directory for existing ADR files and increment the highest number by 1. If no ADRs exist, start at `0001`.
- Never reuse a number, even if the ADR is deprecated or superseded.

## Status Values

| Status       | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `accepted`   | Active decision that governs current architecture                   |
| `superseded` | Replaced by a newer ADR (set `supersedes` field in the replacement) |
| `deprecated` | No longer relevant; kept for historical context                     |

## Creating a New ADR

1. Scan this directory for existing files to determine the next number.
2. Create a file named `NNNN-<slug>.md` where `NNNN` is the next sequential number and `<slug>` is a lowercase, hyphenated summary (e.g., `0003-use-graph-for-context`).
3. Fill in the YAML frontmatter with all required fields.
4. Write the Context, Decision, and Consequences sections.
5. Commit the ADR alongside the code it documents -- ADRs are reviewable in PRs.

## Pipeline Ingestion

ADR files in this directory are automatically ingested by the knowledge pipeline as `decision` graph nodes. The pipeline:

- Parses YAML frontmatter for metadata (number, status, tier, source)
- Extracts the body text for content
- Creates `decided` edges to code nodes mentioned in the body
- Tracks `superseded` and `deprecated` status in node metadata

````

3. Run: `harness validate`
4. Commit: `docs(adr): create decisions directory with README explaining ADR format`

---

### Task 2: Add `decision` to KNOWLEDGE_NODE_TYPES

**Depends on:** none (parallelizable with Task 1) | **Files:** `packages/graph/src/ingest/knowledgeTypes.ts`

1. Edit `packages/graph/src/ingest/knowledgeTypes.ts`. Add `'decision'` to the `KNOWLEDGE_NODE_TYPES` array:

   **Before:**
   ```typescript
   export const KNOWLEDGE_NODE_TYPES: readonly NodeType[] = [
     'business_fact',
     'business_rule',
     'business_process',
     'business_term',
     'business_concept',
     'business_metric',
     'design_token',
     'design_constraint',
     'aesthetic_intent',
     'image_annotation',
   ];
````

**After:**

```typescript
export const KNOWLEDGE_NODE_TYPES: readonly NodeType[] = [
  'business_fact',
  'business_rule',
  'business_process',
  'business_term',
  'business_concept',
  'business_metric',
  'decision',
  'design_token',
  'design_constraint',
  'aesthetic_intent',
  'image_annotation',
];
```

2. Run: `harness validate`
3. Commit: `feat(graph): add decision to KNOWLEDGE_NODE_TYPES`

---

### Task 3: Create DecisionIngestor with TDD (test file)

**Depends on:** Task 2 | **Files:** `packages/graph/tests/ingest/DecisionIngestor.test.ts`

1. Create the test file `packages/graph/tests/ingest/DecisionIngestor.test.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { DecisionIngestor } from '../../src/ingest/DecisionIngestor.js';

describe('DecisionIngestor', () => {
  let store: GraphStore;
  let ingestor: DecisionIngestor;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    ingestor = new DecisionIngestor(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'decision-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDecision(filename: string, content: string) {
    await fs.writeFile(path.join(tmpDir, filename), content, 'utf-8');
  }

  const VALID_ADR = `---
number: 0001
title: Use graph for context assembly
date: 2026-04-27
status: accepted
tier: large
source: docs/changes/graph-context/proposal.md
---

## Context

The existing context system uses glob-based file grouping with no semantic understanding.

## Decision

Build a unified knowledge graph using GraphStore for context assembly.

## Consequences

- All context queries go through the graph
- Legacy glob-based assembly is deprecated
`;

  describe('ingest', () => {
    it('should create decision nodes from YAML frontmatter ADR files', async () => {
      await writeDecision('0001-use-graph-for-context.md', VALID_ADR);

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(1);
      expect(result.errors).toHaveLength(0);

      const node = store.getNode('decision:0001-use-graph-for-context');
      expect(node).not.toBeNull();
      expect(node!.type).toBe('decision');
      expect(node!.name).toBe('Use graph for context assembly');
      expect(node!.metadata.number).toBe('0001');
      expect(node!.metadata.date).toBe('2026-04-27');
      expect(node!.metadata.status).toBe('accepted');
      expect(node!.metadata.tier).toBe('large');
      expect(node!.metadata.source).toBe('docs/changes/graph-context/proposal.md');
      expect(node!.content).toContain('The existing context system');
    });

    it('should skip non-ADR markdown files (no valid frontmatter)', async () => {
      await writeDecision(
        'README.md',
        `---
type: business_concept
domain: architecture
---

# Not an ADR
`
      );

      const result = await ingestor.ingest(tmpDir);
      expect(result.nodesAdded).toBe(0);
    });

    it('should skip files without required frontmatter fields', async () => {
      await writeDecision(
        '0002-incomplete.md',
        `---
title: Missing number field
---

## Context
Something.

## Decision
Something.

## Consequences
Something.
`
      );

      const result = await ingestor.ingest(tmpDir);
      expect(result.nodesAdded).toBe(0);
    });

    it('should handle superseded ADRs with supersedes metadata', async () => {
      await writeDecision(
        '0002-new-approach.md',
        `---
number: 0002
title: New approach to context
date: 2026-04-28
status: accepted
tier: large
source: session-abc
supersedes: 0001
---

## Context

The original graph approach had performance issues.

## Decision

Switch to a hybrid approach.

## Consequences

- Better performance
- More complexity
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(1);
      const node = store.getNode('decision:0002-new-approach');
      expect(node).not.toBeNull();
      expect(node!.metadata.supersedes).toBe('0001');
    });

    it('should create decided edges to code nodes mentioned in body', async () => {
      // Pre-populate the store with code nodes
      store.addNode({
        id: 'class:GraphStore',
        type: 'class',
        name: 'GraphStore',
        metadata: {},
      });
      store.addNode({
        id: 'file:src/context/assembler.ts',
        type: 'file',
        name: 'assembler.ts',
        path: 'src/context/assembler.ts',
        metadata: {},
      });

      await writeDecision('0001-use-graph-for-context.md', VALID_ADR);

      const result = await ingestor.ingest(tmpDir);

      expect(result.edgesAdded).toBeGreaterThanOrEqual(1);
      const edges = store.getEdges({
        from: 'decision:0001-use-graph-for-context',
        type: 'decided',
      });
      const targetIds = edges.map((e) => e.to);
      expect(targetIds).toContain('class:GraphStore');
    });

    it('should handle empty directory gracefully', async () => {
      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle non-existent directory gracefully', async () => {
      const result = await ingestor.ingest(path.join(tmpDir, 'nonexistent'));

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should ingest multiple ADRs', async () => {
      await writeDecision('0001-first.md', VALID_ADR);
      await writeDecision(
        '0002-second.md',
        `---
number: 0002
title: Second decision
date: 2026-04-28
status: accepted
tier: medium
source: session-xyz
---

## Context

Need a second decision.

## Decision

Made a second decision.

## Consequences

- Consequence A
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(2);
      expect(store.getNode('decision:0001-first')).not.toBeNull();
      expect(store.getNode('decision:0002-second')).not.toBeNull();
    });

    it('should record errors for malformed files without crashing', async () => {
      // Valid ADR
      await writeDecision('0001-good.md', VALID_ADR);
      // Completely invalid file (binary-like)
      await writeDecision('0002-bad.md', '\x00\x01\x02');

      const result = await ingestor.ingest(tmpDir);

      // The valid one should still be ingested
      expect(result.nodesAdded).toBe(1);
      expect(store.getNode('decision:0001-good')).not.toBeNull();
    });
  });
});
```

2. Run tests, observe failure: `pnpm --filter @harness-engineering/graph run test -- --run tests/ingest/DecisionIngestor.test.ts`

   Expected: tests fail because `DecisionIngestor` does not exist yet.

3. Commit: `test(graph): add DecisionIngestor tests for ADR knowledge pipeline ingestion`

---

### Task 4: Implement DecisionIngestor

**Depends on:** Task 3 | **Files:** `packages/graph/src/ingest/DecisionIngestor.ts`

1. Create `packages/graph/src/ingest/DecisionIngestor.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, NodeType, EdgeType } from '../types.js';
import { emptyResult } from './ingestUtils.js';

const CODE_NODE_TYPES: readonly NodeType[] = [
  'file',
  'function',
  'class',
  'method',
  'interface',
  'variable',
];

interface DecisionFrontmatter {
  number: string;
  title: string;
  date?: string;
  status?: string;
  tier?: string;
  source?: string;
  supersedes?: string;
}

/**
 * Ingests ADR files from docs/knowledge/decisions/ into the knowledge graph.
 *
 * Parses YAML frontmatter with fields: number, title, date, status, tier,
 * source, supersedes. Creates `decision` type graph nodes with `decided`
 * edges to code nodes mentioned in the body.
 */
export class DecisionIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingest(decisionsDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    let files: string[];
    try {
      files = await this.findDecisionFiles(decisionsDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    let nodesAdded = 0;
    let edgesAdded = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseFrontmatter(raw);
        if (!parsed) continue;

        const { frontmatter, body } = parsed;
        if (!frontmatter.number || !frontmatter.title) continue;

        const filename = path.basename(filePath, '.md');
        const nodeId = `decision:${filename}`;

        const node: GraphNode = {
          id: nodeId,
          type: 'decision' as NodeType,
          name: frontmatter.title,
          path: filePath,
          content: body.trim(),
          metadata: {
            number: frontmatter.number,
            ...(frontmatter.date && { date: frontmatter.date }),
            ...(frontmatter.status && { status: frontmatter.status }),
            ...(frontmatter.tier && { tier: frontmatter.tier }),
            ...(frontmatter.source && { source: frontmatter.source }),
            ...(frontmatter.supersedes && { supersedes: frontmatter.supersedes }),
          },
        };

        this.store.addNode(node);
        nodesAdded++;

        edgesAdded += this.linkToCode(body, nodeId);
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private parseFrontmatter(raw: string): { frontmatter: DecisionFrontmatter; body: string } | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const yamlBlock = match[1]!;
    const body = match[2]!;

    const frontmatter: Record<string, string> = {};
    for (const line of yamlBlock.split('\n')) {
      const kvMatch = line.match(/^(\w+):\s*(.+)$/);
      if (!kvMatch) continue;
      frontmatter[kvMatch[1]!] = kvMatch[2]!.trim();
    }

    // Require `number` and `title` to distinguish ADRs from other markdown
    if (!frontmatter.number || !frontmatter.title) return null;

    return {
      frontmatter: frontmatter as unknown as DecisionFrontmatter,
      body,
    };
  }

  private linkToCode(content: string, sourceNodeId: string): number {
    let count = 0;

    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = this.store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        if (node.name.length < 3) continue;
        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(content)) {
          this.store.addEdge({
            from: sourceNodeId,
            to: node.id,
            type: 'decided' as EdgeType,
          });
          count++;
        }
      }
    }

    return count;
  }

  private async findDecisionFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
      .map((e) => path.join(dir, e.name));
  }
}
```

2. Run tests, observe pass: `pnpm --filter @harness-engineering/graph run test -- --run tests/ingest/DecisionIngestor.test.ts`

3. Run: `harness validate`
4. Commit: `feat(graph): implement DecisionIngestor for ADR knowledge pipeline ingestion`

---

### Task 5: Wire DecisionIngestor into KnowledgePipelineRunner and export from barrel

**Depends on:** Task 4 | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`, `packages/graph/src/index.ts`

1. Edit `packages/graph/src/ingest/KnowledgePipelineRunner.ts`. Add the import at the top alongside the other ingestor imports:

   **Add after the existing imports (after the `import { KnowledgeDocMaterializer ... }` line):**

   ```typescript
   import { DecisionIngestor } from './DecisionIngestor.js';
   ```

2. In the same file, update the `SNAPSHOT_NODE_TYPES` array to include `'decision'`:

   **Before:**

   ```typescript
   const SNAPSHOT_NODE_TYPES: readonly NodeType[] = [
     ...BUSINESS_NODE_TYPES,
     'design_token',
     'design_constraint',
     'aesthetic_intent',
     'image_annotation',
   ];
   ```

   **After:**

   ```typescript
   const SNAPSHOT_NODE_TYPES: readonly NodeType[] = [
     ...BUSINESS_NODE_TYPES,
     'decision',
     'design_token',
     'design_constraint',
     'aesthetic_intent',
     'image_annotation',
   ];
   ```

3. In the same file, update the `ExtractionCounts` interface to add `decisions`:

   **Before:**

   ```typescript
   export interface ExtractionCounts {
     readonly codeSignals: number;
     readonly diagrams: number;
     readonly linkerFacts: number;
     readonly businessKnowledge: number;
     readonly images: number;
   }
   ```

   **After:**

   ```typescript
   export interface ExtractionCounts {
     readonly codeSignals: number;
     readonly diagrams: number;
     readonly linkerFacts: number;
     readonly businessKnowledge: number;
     readonly decisions: number;
     readonly images: number;
   }
   ```

4. In the same file, update the `extract` method. Add decision ingestion after the business knowledge block and before the knowledge linker:

   **Add after the `bkResult` block (after the catch block that sets `bkResult`) and before the KnowledgeLinker block:**

   ```typescript
   // Decision ADRs from docs/knowledge/decisions/
   const decisionsDir = path.join(options.projectDir, 'docs', 'knowledge', 'decisions');
   const decisionIngestor = new DecisionIngestor(this.store);
   let decisionResult: IngestResult;
   try {
     decisionResult = await decisionIngestor.ingest(decisionsDir);
   } catch {
     decisionResult = {
       nodesAdded: 0,
       nodesUpdated: 0,
       edgesAdded: 0,
       edgesUpdated: 0,
       errors: [],
       durationMs: 0,
     };
   }
   ```

5. In the same method, update the return statement to include `decisions`:

   **Before:**

   ```typescript
   return {
     codeSignals: extractionResult.nodesAdded,
     diagrams: diagramResult.nodesAdded,
     linkerFacts: linkResult.factsCreated,
     businessKnowledge: bkResult.nodesAdded,
     images: imageCount,
   };
   ```

   **After:**

   ```typescript
   return {
     codeSignals: extractionResult.nodesAdded,
     diagrams: diagramResult.nodesAdded,
     linkerFacts: linkResult.factsCreated,
     businessKnowledge: bkResult.nodesAdded,
     decisions: decisionResult.nodesAdded,
     images: imageCount,
   };
   ```

6. Edit `packages/graph/src/index.ts`. Add the DecisionIngestor export after the `BusinessKnowledgeIngestor` export:

   **Add after `export { BusinessKnowledgeIngestor } from './ingest/BusinessKnowledgeIngestor.js';`:**

   ```typescript
   export { DecisionIngestor } from './ingest/DecisionIngestor.js';
   ```

7. Run full test suite: `pnpm --filter @harness-engineering/graph run test`

   Note: The `KnowledgePipelineRunner.test.ts` tests may need the `ExtractionCounts` type update. Check if existing tests reference the `extraction` field and update the test expectations if they do a strict shape check. If the tests use `.extraction.codeSignals` etc. individually, they should still pass with the added `decisions` field.

8. Run: `harness validate`
9. Commit: `feat(graph): wire DecisionIngestor into knowledge pipeline and barrel export`

---

### Task 6: Verify round-trip and run final validation

**Depends on:** Task 5 | **Files:** none (verification only)

[checkpoint:human-verify]

1. Run full graph test suite to confirm all 792+ tests pass: `pnpm --filter @harness-engineering/graph run test`

2. Run `harness validate` to confirm no architectural violations.

3. Run `harness check-deps` to confirm no dependency issues.

4. Verify the round-trip manually:
   - Confirm `docs/knowledge/decisions/README.md` exists and has correct content
   - Confirm `DecisionIngestor` is exported from `@harness-engineering/graph`
   - Confirm `KnowledgePipelineRunner` imports and invokes `DecisionIngestor`
   - Confirm `ExtractionCounts` includes the `decisions` field
   - Confirm `SNAPSHOT_NODE_TYPES` includes `'decision'`
   - Confirm `KNOWLEDGE_NODE_TYPES` includes `'decision'`

5. Report results.
