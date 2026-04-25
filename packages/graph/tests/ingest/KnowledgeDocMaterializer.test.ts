import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgeDocMaterializer } from '../../src/ingest/KnowledgeDocMaterializer.js';
import type { GapEntry } from '../../src/ingest/KnowledgeStagingAggregator.js';
import type { GraphNode } from '../../src/types.js';

function makeNode(overrides: Partial<GraphNode> & { id: string; name: string }): GraphNode {
  return {
    type: 'business_rule',
    metadata: { domain: 'payments', source: 'extractor' },
    content: 'This is a sufficiently long content string for testing materialization.',
    ...overrides,
  };
}

function makeGap(overrides: Partial<GapEntry> & { nodeId: string; name: string }): GapEntry {
  return {
    nodeType: 'business_rule',
    source: 'extractor',
    hasContent: true,
    ...overrides,
  };
}

describe('KnowledgeDocMaterializer', () => {
  let store: GraphStore;
  let materializer: KnowledgeDocMaterializer;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    materializer = new KnowledgeDocMaterializer(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'materializer-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates doc with correct frontmatter and body from graph node', async () => {
    const node = makeNode({
      id: 'extracted:payments:refund-rules',
      name: 'Refund Rules',
      content: 'Customers may request a refund within 30 days of purchase.',
    });
    store.addNode(node);

    const result = await materializer.materialize([makeGap({ nodeId: node.id, name: node.name })], {
      projectDir: tmpDir,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.filePath).toBe('docs/knowledge/payments/refund-rules.md');
    expect(result.created[0]!.domain).toBe('payments');

    const content = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');
    expect(content).toContain('---\ntype: business_rule\ndomain: payments\n---');
    expect(content).toContain('# Refund Rules');
    expect(content).toContain('Customers may request a refund within 30 days of purchase.');
  });

  it('skips entries where hasContent is false', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:thin',
        name: 'Thin Finding',
        content: 'Has content but gap says no',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:thin', name: 'Thin Finding', hasContent: false })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_content');
  });

  it('skips nodes with content less than 10 chars trimmed', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:short',
        name: 'Short Content',
        content: '  tiny  ',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:short', name: 'Short Content' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_content');
  });

  it('skips nodes with unresolvable domain', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:unknown:orphan',
        name: 'Orphan Node',
        metadata: { source: 'extractor' }, // no domain
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:unknown:orphan', name: 'Orphan Node' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_domain');
  });

  it('creates domain directory when it does not exist', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:billing:invoice-gen',
        name: 'Invoice Generation',
        metadata: { domain: 'billing', source: 'extractor' },
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:billing:invoice-gen', name: 'Invoice Generation' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    const dirStat = await fs.stat(path.join(tmpDir, 'docs', 'knowledge', 'billing'));
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('handles filename collision with -2 suffix', async () => {
    store.addNode(makeNode({ id: 'node1', name: 'Same Name' }));
    store.addNode(makeNode({ id: 'node2', name: 'Same Name' }));

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'node1', name: 'Same Name' }),
        makeGap({ nodeId: 'node2', name: 'Same Name' }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(2);
    expect(result.created[0]!.filePath).toBe('docs/knowledge/payments/same-name.md');
    expect(result.created[1]!.filePath).toBe('docs/knowledge/payments/same-name-2.md');
  });

  it('sanitizes filenames — special chars removed, spaces become hyphens', () => {
    expect(materializer.generateFilename('Annual Earning Cap (US)')).toBe(
      'annual-earning-cap-us.md'
    );
    expect(materializer.generateFilename('foo@bar#baz')).toBe('foo-bar-baz.md');
    expect(materializer.generateFilename('  leading-trailing  ')).toBe('leading-trailing.md');
    expect(materializer.generateFilename('a'.repeat(100))).toMatch(/^a{60}\.md$/);
  });

  it('dry run writes nothing and returns skipped with dry_run reason', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:refund',
        name: 'Refund Policy',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:refund', name: 'Refund Policy' })],
      { projectDir: tmpDir, dryRun: true }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('dry_run');

    // Verify no files written
    await expect(fs.readdir(path.join(tmpDir, 'docs', 'knowledge'))).rejects.toThrow();
  });

  it('maps business_fact to business_rule', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:fact',
        name: 'Tax Rate Fact',
        type: 'business_fact',
      })
    );

    const result = await materializer.materialize(
      [
        makeGap({
          nodeId: 'extracted:payments:fact',
          name: 'Tax Rate Fact',
          nodeType: 'business_fact',
        }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    const content = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');
    expect(content).toContain('type: business_rule');
    expect(content).not.toContain('type: business_fact');
  });

  it('round-trip: materialized doc is parseable by BusinessKnowledgeIngestor frontmatter regex', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:round-trip',
        name: 'Round Trip Test',
        metadata: { domain: 'payments', source: 'extractor', tags: ['billing', 'refund'] },
        content: 'This content should survive the round trip through parseFrontmatter.',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:round-trip', name: 'Round Trip Test' })],
      { projectDir: tmpDir, dryRun: false }
    );

    const raw = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');

    // Use the exact regex from BusinessKnowledgeIngestor.parseFrontmatter()
    const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = raw.match(fmRegex);
    expect(match).not.toBeNull();

    const yamlBlock = match![1]!;
    const body = match![2]!;

    // Parse key-value pairs using the same regex as parseFrontmatter
    const parsed: Record<string, unknown> = {};
    for (const line of yamlBlock.split('\n')) {
      const kvMatch = line.match(/^(\w+):\s*(.+)$/);
      if (!kvMatch) continue;
      const key = kvMatch[1]!;
      const value = kvMatch[2]!.trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        parsed[key] = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim());
      } else {
        parsed[key] = value;
      }
    }

    expect(parsed.type).toBe('business_rule');
    expect(parsed.domain).toBe('payments');
    expect(parsed.tags).toEqual(['billing', 'refund']);

    // Body should contain the heading and content
    expect(body).toContain('# Round Trip Test');
    expect(body).toContain('This content should survive the round trip');
  });

  it('respects maxDocs cap', async () => {
    store.addNode(makeNode({ id: 'node-a', name: 'Node A' }));
    store.addNode(makeNode({ id: 'node-b', name: 'Node B' }));
    store.addNode(makeNode({ id: 'node-c', name: 'Node C' }));

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'node-a', name: 'Node A' }),
        makeGap({ nodeId: 'node-b', name: 'Node B' }),
        makeGap({ nodeId: 'node-c', name: 'Node C' }),
      ],
      { projectDir: tmpDir, dryRun: false, maxDocs: 2 }
    );

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('cap_reached');
    expect(result.skipped[0]!.name).toBe('Node C');
  });

  it('includes tags in frontmatter when present, omits when not', async () => {
    store.addNode(
      makeNode({
        id: 'with-tags',
        name: 'With Tags',
        metadata: { domain: 'payments', source: 'ext', tags: ['a', 'b'] },
      })
    );
    store.addNode(
      makeNode({
        id: 'no-tags',
        name: 'No Tags',
        metadata: { domain: 'payments', source: 'ext' },
      })
    );

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'with-tags', name: 'With Tags' }),
        makeGap({ nodeId: 'no-tags', name: 'No Tags' }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(2);

    const withTagsContent = await fs.readFile(
      path.join(tmpDir, result.created[0]!.filePath),
      'utf-8'
    );
    expect(withTagsContent).toContain('tags: [a, b]');

    const noTagsContent = await fs.readFile(
      path.join(tmpDir, result.created[1]!.filePath),
      'utf-8'
    );
    expect(noTagsContent).not.toContain('tags:');
  });

  it('infers domain from node path when metadata.domain is absent', async () => {
    store.addNode(
      makeNode({
        id: 'path-node',
        name: 'Path Inferred',
        path: 'packages/billing/src/invoices.ts',
        metadata: { source: 'extractor' }, // no domain
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'path-node', name: 'Path Inferred' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.domain).toBe('billing');
    expect(result.created[0]!.filePath).toBe('docs/knowledge/billing/path-inferred.md');
  });
});
