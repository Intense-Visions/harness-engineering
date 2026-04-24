import { describe, it, expect } from 'vitest';
import {
  StructuralDriftDetector,
  type KnowledgeSnapshot,
  type KnowledgeSnapshotEntry,
} from '../../src/ingest/StructuralDriftDetector.js';

function makeEntry(
  overrides: Partial<KnowledgeSnapshotEntry> & { id: string }
): KnowledgeSnapshotEntry {
  return {
    type: 'business_fact',
    contentHash: 'default-hash',
    source: 'extractor',
    name: 'Default Name',
    ...overrides,
  };
}

function makeSnapshot(entries: KnowledgeSnapshotEntry[]): KnowledgeSnapshot {
  return { entries, timestamp: new Date().toISOString() };
}

describe('StructuralDriftDetector', () => {
  const detector = new StructuralDriftDetector();

  it('returns zero findings for identical snapshots', () => {
    const snapshot = makeSnapshot([makeEntry({ id: 'fact:abc' })]);
    const result = detector.detect(snapshot, snapshot);
    expect(result.findings).toHaveLength(0);
    expect(result.driftScore).toBe(0);
  });

  it('classifies entity in fresh but not current as NEW', () => {
    const current = makeSnapshot([]);
    const fresh = makeSnapshot([makeEntry({ id: 'fact:abc', name: 'New Rule' })]);
    const result = detector.detect(current, fresh);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].classification).toBe('new');
    expect(result.findings[0].severity).toBe('low');
    expect(result.findings[0].fresh).toBeDefined();
    expect(result.findings[0].current).toBeUndefined();
  });

  it('classifies entity in current but not fresh as STALE', () => {
    const current = makeSnapshot([makeEntry({ id: 'fact:abc', name: 'Old Rule' })]);
    const fresh = makeSnapshot([]);
    const result = detector.detect(current, fresh);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].classification).toBe('stale');
    expect(result.findings[0].severity).toBe('high');
    expect(result.findings[0].current).toBeDefined();
    expect(result.findings[0].fresh).toBeUndefined();
  });

  it('classifies same ID with different contentHash as DRIFTED', () => {
    const current = makeSnapshot([makeEntry({ id: 'fact:abc', contentHash: 'hash-v1' })]);
    const fresh = makeSnapshot([makeEntry({ id: 'fact:abc', contentHash: 'hash-v2' })]);
    const result = detector.detect(current, fresh);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].classification).toBe('drifted');
    expect(result.findings[0].severity).toBe('medium');
    expect(result.findings[0].current).toBeDefined();
    expect(result.findings[0].fresh).toBeDefined();
  });

  it('classifies same entity name from different sources with different content as CONTRADICTING', () => {
    const current = makeSnapshot([]);
    const fresh = makeSnapshot([
      makeEntry({ id: 'ext:abc', name: 'Settlement SLA', source: 'extractor', contentHash: 'h1' }),
      makeEntry({ id: 'link:abc', name: 'Settlement SLA', source: 'linker', contentHash: 'h2' }),
    ]);
    const result = detector.detect(current, fresh);
    const contradictions = result.findings.filter((f) => f.classification === 'contradicting');
    expect(contradictions.length).toBeGreaterThanOrEqual(1);
    expect(contradictions[0].severity).toBe('critical');
  });

  it('does NOT flag contradiction when same name from same source', () => {
    const current = makeSnapshot([]);
    const fresh = makeSnapshot([
      makeEntry({ id: 'ext:abc', name: 'Same Rule', source: 'extractor', contentHash: 'h1' }),
      makeEntry({ id: 'ext:def', name: 'Same Rule', source: 'extractor', contentHash: 'h2' }),
    ]);
    const result = detector.detect(current, fresh);
    const contradictions = result.findings.filter((f) => f.classification === 'contradicting');
    expect(contradictions).toHaveLength(0);
  });

  it('does NOT flag contradiction when same name, different sources, but same content', () => {
    const current = makeSnapshot([]);
    const fresh = makeSnapshot([
      makeEntry({
        id: 'ext:abc',
        name: 'Same Rule',
        source: 'extractor',
        contentHash: 'same-hash',
      }),
      makeEntry({ id: 'link:abc', name: 'Same Rule', source: 'linker', contentHash: 'same-hash' }),
    ]);
    const result = detector.detect(current, fresh);
    const contradictions = result.findings.filter((f) => f.classification === 'contradicting');
    expect(contradictions).toHaveLength(0);
  });

  it('computes driftScore as findings / total unique entries', () => {
    const current = makeSnapshot([
      makeEntry({ id: 'a', contentHash: 'h1' }),
      makeEntry({ id: 'b', contentHash: 'h2' }),
    ]);
    const fresh = makeSnapshot([
      makeEntry({ id: 'b', contentHash: 'h2' }), // unchanged
      makeEntry({ id: 'c', contentHash: 'h3' }), // new
    ]);
    // Total unique: a, b, c = 3
    // Findings: a is stale (1), c is new (1) = 2
    const result = detector.detect(current, fresh);
    expect(result.driftScore).toBeCloseTo(2 / 3, 5);
  });

  it('handles empty snapshots gracefully', () => {
    const empty = makeSnapshot([]);
    const result = detector.detect(empty, empty);
    expect(result.findings).toHaveLength(0);
    expect(result.driftScore).toBe(0);
    expect(result.summary).toEqual({ new: 0, drifted: 0, stale: 0, contradicting: 0 });
  });

  it('summary counts match finding classifications', () => {
    const current = makeSnapshot([
      makeEntry({ id: 'a', contentHash: 'old' }),
      makeEntry({ id: 'b', contentHash: 'h2' }),
    ]);
    const fresh = makeSnapshot([
      makeEntry({ id: 'a', contentHash: 'new' }), // drifted
      makeEntry({ id: 'c', contentHash: 'h3' }), // new
    ]);
    // b is stale, a is drifted, c is new
    const result = detector.detect(current, fresh);
    expect(result.summary.new).toBe(1);
    expect(result.summary.drifted).toBe(1);
    expect(result.summary.stale).toBe(1);
    expect(result.summary.contradicting).toBe(0);
    expect(
      result.summary.new +
        result.summary.drifted +
        result.summary.stale +
        result.summary.contradicting
    ).toBe(result.findings.length);
  });
});
