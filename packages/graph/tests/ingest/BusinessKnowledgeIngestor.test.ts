import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';

describe('BusinessKnowledgeIngestor', () => {
  let store: GraphStore;
  let ingestor: BusinessKnowledgeIngestor;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    ingestor = new BusinessKnowledgeIngestor(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeKnowledgeFile(subdir: string, filename: string, content: string) {
    const dir = path.join(tmpDir, subdir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), content, 'utf-8');
  }

  describe('ingest', () => {
    it('should create nodes from YAML frontmatter markdown with correct types', async () => {
      await writeKnowledgeFile(
        'architecture',
        'layer-rules.md',
        `---
type: business_rule
domain: architecture
tags: [layers, imports]
---

# Layer Boundary Rules

The monorepo enforces strict layer boundaries.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(1);
      expect(result.errors).toHaveLength(0);

      const node = store.getNode('bk:architecture:layer-rules');
      expect(node).not.toBeNull();
      expect(node!.type).toBe('business_rule');
      expect(node!.name).toBe('Layer Boundary Rules');
      expect(node!.metadata.domain).toBe('architecture');
      expect(node!.metadata.tags).toEqual(['layers', 'imports']);
    });

    it('should create nodes for multiple knowledge types', async () => {
      await writeKnowledgeFile(
        'ops',
        'deploy-flow.md',
        `---
type: business_process
domain: ops
---

# Deploy Flow

Standard deployment process.
`
      );

      await writeKnowledgeFile(
        'ops',
        'uptime.md',
        `---
type: business_metric
domain: ops
---

# Uptime SLA

99.9% uptime target.
`
      );

      await writeKnowledgeFile(
        'glossary',
        'monorepo.md',
        `---
type: business_term
domain: glossary
---

# Monorepo

A single repository containing multiple packages.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(3);

      const processNode = store.getNode('bk:ops:deploy-flow');
      expect(processNode).not.toBeNull();
      expect(processNode!.type).toBe('business_process');

      const metricNode = store.getNode('bk:ops:uptime');
      expect(metricNode).not.toBeNull();
      expect(metricNode!.type).toBe('business_metric');

      const termNode = store.getNode('bk:glossary:monorepo');
      expect(termNode).not.toBeNull();
      expect(termNode!.type).toBe('business_term');
    });

    it('should create governs edges from business_rule nodes to code nodes', async () => {
      // Add a code node to the store
      store.addNode({
        id: 'fn:validateLayer',
        type: 'function',
        name: 'validateLayer',
        path: 'src/validate.ts',
        metadata: {},
      });

      await writeKnowledgeFile(
        'architecture',
        'layer-rules.md',
        `---
type: business_rule
domain: architecture
---

# Layer Validation

The validateLayer function enforces boundaries.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

      const edges = store.getEdges({ from: 'bk:architecture:layer-rules', type: 'governs' });
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges.some((e) => e.to === 'fn:validateLayer')).toBe(true);
    });

    it('should create governs edges from business_process nodes to code nodes', async () => {
      store.addNode({
        id: 'fn:deployService',
        type: 'function',
        name: 'deployService',
        path: 'src/deploy.ts',
        metadata: {},
      });

      await writeKnowledgeFile(
        'ops',
        'deploy-flow.md',
        `---
type: business_process
domain: ops
---

# Deployment Process

Uses the deployService function.
`
      );

      const result = await ingestor.ingest(tmpDir);

      const edges = store.getEdges({ from: 'bk:ops:deploy-flow', type: 'governs' });
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges.some((e) => e.to === 'fn:deployService')).toBe(true);
    });

    it('should create measures edges from business_metric to business_process nodes', async () => {
      await writeKnowledgeFile(
        'ops',
        'deploy-flow.md',
        `---
type: business_process
domain: ops
---

# Deploy Flow

Standard deployment process.
`
      );

      await writeKnowledgeFile(
        'ops',
        'deploy-time.md',
        `---
type: business_metric
domain: ops
---

# Deploy Time

Measures the Deploy Flow duration.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(2);

      const edges = store.getEdges({ from: 'bk:ops:deploy-time', type: 'measures' });
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges.some((e) => e.to === 'bk:ops:deploy-flow')).toBe(true);
    });

    it('should return empty result for missing directory', async () => {
      const result = await ingestor.ingest('/nonexistent/path');

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip files without valid frontmatter', async () => {
      await writeKnowledgeFile(
        'misc',
        'no-frontmatter.md',
        `# Just a regular markdown file

No YAML frontmatter here.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip files with frontmatter missing required type field', async () => {
      await writeKnowledgeFile(
        'misc',
        'no-type.md',
        `---
domain: misc
---

# Missing Type

This file has no type field.
`
      );

      const result = await ingestor.ingest(tmpDir);

      expect(result.nodesAdded).toBe(0);
    });

    it('should extract title from first heading', async () => {
      await writeKnowledgeFile(
        'arch',
        'concepts.md',
        `---
type: business_concept
domain: arch
---

# Domain-Driven Design

We use DDD principles.
`
      );

      await ingestor.ingest(tmpDir);

      const node = store.getNode('bk:arch:concepts');
      expect(node).not.toBeNull();
      expect(node!.name).toBe('Domain-Driven Design');
    });

    it('should use filename as name if no heading found', async () => {
      await writeKnowledgeFile(
        'arch',
        'no-heading.md',
        `---
type: business_concept
domain: arch
---

Some content without a heading.
`
      );

      await ingestor.ingest(tmpDir);

      const node = store.getNode('bk:arch:no-heading');
      expect(node).not.toBeNull();
      expect(node!.name).toBe('no-heading');
    });

    it('should store file path in node', async () => {
      await writeKnowledgeFile(
        'architecture',
        'rules.md',
        `---
type: business_rule
domain: architecture
---

# Rules

Content.
`
      );

      await ingestor.ingest(tmpDir);

      const node = store.getNode('bk:architecture:rules');
      expect(node).not.toBeNull();
      expect(node!.path).toContain('architecture/rules.md');
    });
  });
});
