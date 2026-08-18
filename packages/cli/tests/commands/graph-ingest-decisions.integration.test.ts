import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Real integration test (NO module mocks): exercises the actual
// `@harness-engineering/graph` ingestors against a real on-disk fixture and a
// real GraphStore.
//
// Regression: github issue #1351 — `graph ingest --source knowledge` ran
// KnowledgeIngestor + BusinessKnowledgeIngestor but NEVER constructed
// DecisionIngestor, and KnowledgeIngestor explicitly excludes docs/knowledge/**.
// Net: ADRs under docs/knowledge/decisions entered the graph via NO ingestor on
// this command path. This test writes a real ADR, runs the handler, reloads the
// graph, and asserts the `decision` node is present.
import { runIngest } from '../../src/commands/graph/ingest';

const VALID_ADR = `---
number: 0001
title: Use graph for context assembly
date: 2026-08-18
status: accepted
tier: large
source: docs/changes/graph-context/proposal.md
---

## Context

The existing context system uses glob-based file grouping.

## Decision

Build a unified knowledge graph using GraphStore for context assembly.

## Consequences

- All context queries go through the graph.
`;

describe('graph ingest --source knowledge (real DecisionIngestor routing, #1351)', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-decisions-'));
    const decisionsDir = path.join(projectDir, 'docs', 'knowledge', 'decisions');
    await fs.mkdir(decisionsDir, { recursive: true });
    await fs.writeFile(path.join(decisionsDir, '0001-use-graph.md'), VALID_ADR, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('ingests docs/knowledge/decisions/*.md as decision nodes into the GraphStore', async () => {
    await runIngest(projectDir, 'knowledge');

    // Reload the persisted graph from disk and assert the decision node landed.
    const { GraphStore } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    await store.load(path.join(projectDir, '.harness', 'graph'));

    const decisions = store.findNodes({ type: 'decision' });
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(store.getNode('decision:0001-use-graph')).not.toBeNull();
  });
});
