import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';

const SAMPLE_STRATEGY = `---
name: Sample Product
last_updated: 2026-06-02
version: 1
---

# Sample Product Strategy

## Target problem

Teams ship features without a durable record of why they exist.

## Our approach

A repo-root anchor file that downstream skills read for grounding.

## Who it's for

Engineering teams who lose strategic context across phases.

## Key metrics

- Adoption: percentage of repos with STRATEGY.md
- Recall: percentage of brainstorm specs that cite strategy

## Tracks

- Anchor adoption: ship STRATEGY.md schema + skill
- Downstream grounding: wire brainstorm + ideate + roadmap-pilot

## Milestones

- 2026-Q2: phase 7 ships
- 2026-Q3: phase 8 ships

## Marketing

Public launch deferred until adoption telemetry stabilises.
`;

describe('BusinessKnowledgeIngestor.ingestStrategy', () => {
  let store: GraphStore;
  let ingestor: BusinessKnowledgeIngestor;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    ingestor = new BusinessKnowledgeIngestor(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-ingest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces a business_fact node per non-empty strategy section', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    const result = await ingestor.ingestStrategy(strategyPath);

    expect(result.nodesAdded).toBe(7); // 5 required + Milestones + Marketing
    expect(result.errors).toEqual([]);

    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.length).toBe(7);
    expect(facts.every((n) => n.metadata.domain === 'strategy')).toBe(true);
    expect(facts.every((n) => n.metadata.source === 'STRATEGY.md')).toBe(true);
  });

  it('satisfies the spec contract: at least one business_fact node from a sample STRATEGY.md', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    await ingestor.ingestStrategy(strategyPath);

    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.length).toBeGreaterThanOrEqual(1);
  });

  it('uses bk:strategy:<slug> node ids with kebab-cased section names', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    await ingestor.ingestStrategy(strategyPath);

    expect(store.getNode('bk:strategy:target-problem')).not.toBeNull();
    expect(store.getNode('bk:strategy:our-approach')).not.toBeNull();
    expect(store.getNode('bk:strategy:who-its-for')).not.toBeNull(); // apostrophe stripped
    expect(store.getNode('bk:strategy:key-metrics')).not.toBeNull();
    expect(store.getNode('bk:strategy:tracks')).not.toBeNull();
    expect(store.getNode('bk:strategy:milestones')).not.toBeNull();
    expect(store.getNode('bk:strategy:marketing')).not.toBeNull();
  });

  it('preserves frontmatter context in node metadata', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(strategyPath, SAMPLE_STRATEGY, 'utf-8');

    await ingestor.ingestStrategy(strategyPath);

    const targetProblem = store.getNode('bk:strategy:target-problem');
    expect(targetProblem).not.toBeNull();
    expect(targetProblem!.metadata.product_name).toBe('Sample Product');
    expect(targetProblem!.metadata.last_updated).toBe('2026-06-02');
    expect(targetProblem!.metadata.version).toBe(1);
    expect(targetProblem!.metadata.section_name).toBe('Target problem');
  });

  it('soft-fails on missing STRATEGY.md (returns empty, no error)', async () => {
    const missing = path.join(tmpDir, 'STRATEGY.md');

    const result = await ingestor.ingestStrategy(missing);

    expect(result.nodesAdded).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('surfaces a parse error when frontmatter is missing', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(
      strategyPath,
      '# No frontmatter strategy\n\n## Target problem\n\nbody\n',
      'utf-8'
    );

    const result = await ingestor.ingestStrategy(strategyPath);

    expect(result.nodesAdded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/no frontmatter found/);
  });

  it('skips unfilled placeholder sections', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(
      strategyPath,
      `---
name: Placeholder Product
last_updated: 2026-06-02
version: 1
---

# Placeholder Product Strategy

## Target problem

<2-4 sentences. What specifically is broken in the world that this product addresses?>

## Our approach

Real prose about our approach to the problem.

## Who it's for

<2-4 sentences. Specific persona, not "developers" generically.>

## Key metrics

- adoption: percent of repos
- recall: percent of specs citing strategy

## Tracks

- anchor: ship STRATEGY.md
`,
      'utf-8'
    );

    const result = await ingestor.ingestStrategy(strategyPath);

    // Placeholder bodies for "Target problem" and "Who it's for" are skipped.
    expect(result.nodesAdded).toBe(3);
    expect(store.getNode('bk:strategy:target-problem')).toBeNull();
    expect(store.getNode('bk:strategy:our-approach')).not.toBeNull();
    expect(store.getNode('bk:strategy:who-its-for')).toBeNull();
    expect(store.getNode('bk:strategy:key-metrics')).not.toBeNull();
    expect(store.getNode('bk:strategy:tracks')).not.toBeNull();
  });

  it('ignores unknown section names', async () => {
    const strategyPath = path.join(tmpDir, 'STRATEGY.md');
    await fs.writeFile(
      strategyPath,
      `---
name: Unknown-Section Product
last_updated: 2026-06-02
version: 1
---

# Unknown-Section Product Strategy

## Target problem

real body

## Our approach

real body

## Who it's for

real body

## Key metrics

- m: a metric

## Tracks

- t: a track

## Unknown future section

This name is not in the required/optional allowlist.
`,
      'utf-8'
    );

    const result = await ingestor.ingestStrategy(strategyPath);

    // Five known sections, unknown one is dropped silently.
    expect(result.nodesAdded).toBe(5);
    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.every((n) => n.name !== 'Unknown future section')).toBe(true);
  });
});
