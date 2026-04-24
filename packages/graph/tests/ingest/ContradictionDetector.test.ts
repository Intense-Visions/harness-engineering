import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { ContradictionDetector } from '../../src/ingest/ContradictionDetector.js';
import type { GraphNode } from '../../src/types.js';

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: 'business_fact',
    name: 'default-name',
    metadata: {},
    ...overrides,
  };
}

describe('ContradictionDetector', () => {
  const detector = new ContradictionDetector();

  it('detects value_mismatch when same name has different content from different sources', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a',
        type: 'business_fact',
        name: 'max-retries',
        content: 'Max retries is 3',
        hash: 'hash1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b',
        type: 'business_fact',
        name: 'max-retries',
        content: 'Max retries is 5',
        hash: 'hash2',
        metadata: { source: 'confluence' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].conflictType).toBe('value_mismatch');
    expect(result.contradictions[0].severity).toBe('critical');
  });

  it('returns no contradictions when content matches', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a',
        type: 'business_fact',
        name: 'max-retries',
        content: 'Max retries is 3',
        hash: 'same-hash',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b',
        type: 'business_fact',
        name: 'max-retries',
        content: 'Max retries is 3',
        hash: 'same-hash',
        metadata: { source: 'confluence' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(0);
  });

  it('returns empty result for empty graph', () => {
    const store = new GraphStore();
    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(0);
    expect(result.totalChecked).toBe(0);
    expect(result.sourcePairCounts).toEqual({});
  });

  it('detects definition_conflict across business terms', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'term-a',
        type: 'business_term',
        name: 'settlement',
        content: 'T+2 settlement',
        hash: 'h1',
        metadata: { source: 'glossary' },
      })
    );
    store.addNode(
      makeNode({
        id: 'term-b',
        type: 'business_term',
        name: 'settlement',
        content: 'T+1 settlement',
        hash: 'h2',
        metadata: { source: 'wiki' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].conflictType).toBe('definition_conflict');
    expect(result.contradictions[0].severity).toBe('high');
  });

  it('detects multiple contradiction groups', () => {
    const store = new GraphStore();
    // Group 1: max-retries
    store.addNode(
      makeNode({
        id: 'a1',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'a2',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h2',
        metadata: { source: 'confluence' },
      })
    );
    // Group 2: timeout
    store.addNode(
      makeNode({
        id: 'b1',
        type: 'business_fact',
        name: 'timeout',
        hash: 'h3',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b2',
        type: 'business_fact',
        name: 'timeout',
        hash: 'h4',
        metadata: { source: 'slack' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions.length).toBeGreaterThanOrEqual(2);
  });

  it('skips nodes from the same source', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h2',
        metadata: { source: 'jira' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(0);
  });

  it('detects temporal_conflict when lastModified differs', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'proc-a',
        type: 'business_process',
        name: 'onboarding-flow',
        content: 'Step 1 then step 2',
        hash: 'h1',
        metadata: { source: 'wiki' },
        lastModified: '2026-01-01T00:00:00Z',
      })
    );
    store.addNode(
      makeNode({
        id: 'proc-b',
        type: 'business_process',
        name: 'onboarding-flow',
        content: 'Step 1 then step 3',
        hash: 'h2',
        metadata: { source: 'confluence' },
        lastModified: '2026-03-15T00:00:00Z',
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].conflictType).toBe('temporal_conflict');
    expect(result.contradictions[0].severity).toBe('medium');
  });

  it('detects status_divergence when no temporal data exists', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'rule-a',
        type: 'business_rule',
        name: 'approval-threshold',
        content: 'Threshold is $500',
        hash: 'h1',
        metadata: { source: 'policy-doc' },
      })
    );
    store.addNode(
      makeNode({
        id: 'rule-b',
        type: 'business_rule',
        name: 'approval-threshold',
        content: 'Threshold is $1000',
        hash: 'h2',
        metadata: { source: 'training-manual' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].conflictType).toBe('status_divergence');
    expect(result.contradictions[0].severity).toBe('medium');
  });

  it('detects fuzzy matches across similar but not identical names', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a',
        type: 'business_fact',
        name: 'api-timeout',
        content: 'Timeout is 30s',
        hash: 'h1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b',
        type: 'business_fact',
        name: 'api-timeouts',
        content: 'Timeout is 60s',
        hash: 'h2',
        metadata: { source: 'confluence' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].similarity).toBeGreaterThanOrEqual(0.8);
    expect(result.contradictions[0].similarity).toBeLessThan(1.0);
  });

  it('does not match names below similarity threshold', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a',
        type: 'business_fact',
        name: 'timeout',
        content: 'Timeout is 30s',
        hash: 'h1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b',
        type: 'business_fact',
        name: 'max-retries',
        content: 'Max retries is 5',
        hash: 'h2',
        metadata: { source: 'confluence' },
      })
    );

    const result = detector.detect(store);
    expect(result.contradictions).toHaveLength(0);
  });

  it('returns correct sourcePairCounts', () => {
    const store = new GraphStore();
    store.addNode(
      makeNode({
        id: 'a1',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h1',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'a2',
        type: 'business_fact',
        name: 'max-retries',
        hash: 'h2',
        metadata: { source: 'confluence' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b1',
        type: 'business_fact',
        name: 'timeout',
        hash: 'h3',
        metadata: { source: 'jira' },
      })
    );
    store.addNode(
      makeNode({
        id: 'b2',
        type: 'business_fact',
        name: 'timeout',
        hash: 'h4',
        metadata: { source: 'confluence' },
      })
    );

    const result = detector.detect(store);
    const pairKey = ['confluence', 'jira'].sort().join('\u2194');
    expect(result.sourcePairCounts[pairKey]).toBe(2);
  });
});
