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

  // Issue #504 Finding 3 — index `docs/architecture/<topic>/ADR-*.md`
  // (the storage convention used by harness-architecture-advisor).
  describe('ingestArchitecture', () => {
    const ARCH_ADR_TEMPLATE = `# ADR-001: Use AuthService for authentication

**Date:** 2026-04-27
**Status:** Accepted
**Deciders:** @cwarner, @arch-team

## Context

The existing approach mixes auth concerns across modules.

## Decision

Centralize on AuthService. Calls to hashPassword route through it.

## Alternatives Considered

### Inline auth in each handler

Rejected because of duplication.

## Consequences

### Positive
- One place to audit.

### Negative
- Migration cost.

## Action Items

- [ ] Migrate user-service to AuthService.
`;

    async function writeArchAdr(topic: string, filename: string, content: string) {
      const topicDir = path.join(tmpDir, topic);
      await fs.mkdir(topicDir, { recursive: true });
      await fs.writeFile(path.join(topicDir, filename), content, 'utf-8');
    }

    it('creates decision nodes from markdown-style ADRs (no frontmatter required)', async () => {
      await writeArchAdr('auth', 'ADR-001.md', ARCH_ADR_TEMPLATE);

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(1);
      expect(result.errors).toHaveLength(0);

      const node = store.getNode('decision:architecture:auth:ADR-001');
      expect(node).not.toBeNull();
      expect(node!.type).toBe('decision');
      expect(node!.name).toBe('Use AuthService for authentication');
      expect(node!.metadata.number).toBe('001');
      expect(node!.metadata.date).toBe('2026-04-27');
      expect(node!.metadata.status).toBe('Accepted');
      expect(node!.metadata.deciders).toBe('@cwarner, @arch-team');
      expect(node!.metadata.domain).toBe('auth');
      expect(node!.metadata.source).toBe('architecture');
    });

    it('parses Status: Superseded so snapshot drift detection can flag it', async () => {
      await writeArchAdr(
        'auth',
        'ADR-001.md',
        ARCH_ADR_TEMPLATE.replace('**Status:** Accepted', '**Status:** Superseded')
      );

      await ingestor.ingestArchitecture(tmpDir);
      const node = store.getNode('decision:architecture:auth:ADR-001');
      expect(node!.metadata.status).toBe('Superseded');
    });

    it('recursively scans nested topic directories', async () => {
      await writeArchAdr('auth', 'ADR-001.md', ARCH_ADR_TEMPLATE);
      await writeArchAdr(
        'data',
        'ADR-002.md',
        '# ADR-002: Use Postgres\n\n**Date:** 2026-05-01\n**Status:** Accepted\n\n## Decision\n\nUse Postgres.\n'
      );

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(2);
      expect(store.getNode('decision:architecture:auth:ADR-001')).not.toBeNull();
      expect(store.getNode('decision:architecture:data:ADR-002')).not.toBeNull();
    });

    it('namespaces node ids by topic so duplicate ADR numbers across topics coexist', async () => {
      await writeArchAdr('auth', 'ADR-001.md', ARCH_ADR_TEMPLATE);
      await writeArchAdr(
        'data',
        'ADR-001.md',
        '# ADR-001: Use Postgres\n\n**Date:** 2026-05-01\n**Status:** Accepted\n\n## Decision\n\nUse Postgres.\n'
      );

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(2);
      const auth = store.getNode('decision:architecture:auth:ADR-001');
      const data = store.getNode('decision:architecture:data:ADR-001');
      expect(auth).not.toBeNull();
      expect(data).not.toBeNull();
      expect(auth!.name).toBe('Use AuthService for authentication');
      expect(data!.name).toBe('Use Postgres');
    });

    it('skips non-ADR markdown files in the architecture tree', async () => {
      await writeArchAdr('auth', 'ADR-001.md', ARCH_ADR_TEMPLATE);
      // proposal.md and analysis.md are common siblings in harness-architecture-advisor topic dirs
      await writeArchAdr('auth', 'proposal.md', '# Proposal\n\nNot an ADR.\n');
      await writeArchAdr('auth', 'analysis.md', '# Analysis\n\nNot an ADR.\n');
      // A README at root
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Architecture\n');

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(1);
      expect(store.getNode('decision:architecture:auth:ADR-001')).not.toBeNull();
    });

    it('skips files whose H1 does not match the ADR pattern even with ADR- prefix', async () => {
      await writeArchAdr('auth', 'ADR-bogus.md', '# Not an ADR\n\n**Status:** Accepted\n');

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(0);
    });

    it('returns empty result when architecture directory is absent', async () => {
      const result = await ingestor.ingestArchitecture(path.join(tmpDir, 'does-not-exist'));

      expect(result.nodesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('omits metadata.domain when ADRs live at the architecture root (no topic dir)', async () => {
      await fs.writeFile(path.join(tmpDir, 'ADR-001.md'), ARCH_ADR_TEMPLATE, 'utf-8');

      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.nodesAdded).toBe(1);
      const node = store.getNode('decision:architecture:ADR-001');
      expect(node).not.toBeNull();
      expect(node!.metadata.domain).toBeUndefined();
    });

    it('creates decided edges to code nodes referenced in the body', async () => {
      store.addNode({
        id: 'class:AuthService',
        type: 'class',
        name: 'AuthService',
        metadata: {},
      });
      store.addNode({
        id: 'function:hashPassword',
        type: 'function',
        name: 'hashPassword',
        metadata: {},
      });

      await writeArchAdr('auth', 'ADR-001.md', ARCH_ADR_TEMPLATE);
      const result = await ingestor.ingestArchitecture(tmpDir);

      expect(result.edgesAdded).toBeGreaterThanOrEqual(2);
      const edges = store.getEdges({
        from: 'decision:architecture:auth:ADR-001',
        type: 'decided',
      });
      const targets = edges.map((e) => e.to);
      expect(targets).toContain('class:AuthService');
      expect(targets).toContain('function:hashPassword');
    });
  });
});
