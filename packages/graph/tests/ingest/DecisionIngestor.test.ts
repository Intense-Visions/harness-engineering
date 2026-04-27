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
