import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';

const SAMPLE_STRATEGY = `---
name: Harness
last_updated: 2026-06-02
version: 1
---

# Harness Strategy

## Target problem

Engineering teams accumulate undocumented constraints faster than they can write specs. The result is rework, drift, and onboarding that takes months.

## Our approach

Treat constraints, decisions, and skills as first-class graph nodes that compound over time, so each engineering session leaves the codebase smarter.

## Who it's for

Senior engineers and engineering leads owning long-lived TypeScript monorepos where context loss has measurable cost.

## Key metrics

- Time-to-context: median minutes from session start to first useful code change
- Rework rate: percent of merged PRs that touch the same files within 14 days

## Tracks

- Knowledge graph: keep the ingestion pipeline honest and fast
- Skill ecosystem: raise the ceiling on agent quality through composable skills

## Not working on

Real-time multi-user collaboration. Out of scope until single-user flow is solid.
`;

describe('BusinessKnowledgeIngestor.ingestStrategy', () => {
  let store: GraphStore;
  let ingestor: BusinessKnowledgeIngestor;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    ingestor = new BusinessKnowledgeIngestor(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-strategy-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces business_fact nodes for each known section in STRATEGY.md', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    const result = await ingestor.ingestStrategy(strategyPath);

    expect(result.errors).toEqual([]);
    expect(result.nodesAdded).toBeGreaterThanOrEqual(1);

    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.length).toBe(result.nodesAdded);

    const sections = facts.map((n) => n.metadata.section as string);
    expect(sections).toContain('Target problem');
    expect(sections).toContain('Our approach');
    expect(sections).toContain('Key metrics');
    expect(sections).toContain('Tracks');
    // Optional sections are emitted only when present.
    expect(sections).toContain('Not working on');
  });

  it('stamps strategy metadata (domain, product_name, last_updated, version) on every node', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    await ingestor.ingestStrategy(strategyPath);

    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.length).toBeGreaterThan(0);
    for (const node of facts) {
      expect(node.metadata.domain).toBe('strategy');
      expect(node.metadata.product_name).toBe('Harness');
      expect(node.metadata.source).toBe('strategy');
      expect(node.metadata.last_updated).toBe('2026-06-02');
      expect(node.metadata.version).toBe(1);
      expect(typeof node.content).toBe('string');
      expect(node.content!.length).toBeGreaterThan(0);
    }
  });

  it('uses stable bk:strategy:<slug> node IDs', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    await ingestor.ingestStrategy(strategyPath);

    expect(store.getNode('bk:strategy:target-problem')).toBeDefined();
    expect(store.getNode('bk:strategy:our-approach')).toBeDefined();
    expect(store.getNode('bk:strategy:who-it-s-for')).toBeDefined();
    expect(store.getNode('bk:strategy:key-metrics')).toBeDefined();
    expect(store.getNode('bk:strategy:tracks')).toBeDefined();
  });

  it('soft-fails (empty result, no errors) when STRATEGY.md does not exist', async () => {
    const result = await ingestor.ingestStrategy(path.join(tmpDir, 'STRATEGY.md'));
    expect(result.nodesAdded).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('reports a single error when STRATEGY.md exists but has no frontmatter', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, '# Strategy\n\n## Target problem\n\nbody\n', 'utf-8');

    const result = await ingestor.ingestStrategy(strategyPath);

    expect(result.nodesAdded).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/missing frontmatter/);
  });

  it('ignores unknown H2 sections (schema-rejected names produce no nodes)', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(
      strategyPath,
      `---
name: Harness
last_updated: 2026-06-02
version: 1
---

# Harness Strategy

## Target problem

A real problem.

## Random Section Name

This should be ignored — not in the known section set.
`,
      'utf-8'
    );

    await ingestor.ingestStrategy(strategyPath);

    const facts = store.findNodes({ type: 'business_fact' });
    const sections = facts.map((n) => n.metadata.section as string);
    expect(sections).toContain('Target problem');
    expect(sections).not.toContain('Random Section Name');
  });
});
