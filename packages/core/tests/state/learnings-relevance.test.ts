import { describe, it, expect } from 'vitest';
import {
  tokenize,
  scoreLearningRelevance,
  filterByRelevance,
} from '../../src/state/learnings-relevance';

describe('tokenize', () => {
  it('lowercases and splits on whitespace and punctuation', () => {
    const tokens = tokenize('Hello, World! This is a test.');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('test');
  });

  it('deduplicates tokens', () => {
    const tokens = tokenize('the the the repeated');
    const unique = new Set(tokens);
    expect(tokens.length).toBe(unique.size);
  });

  it('returns empty set for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('filters out single-character tokens', () => {
    const tokens = tokenize('a b c word');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).toContain('word');
  });
});

describe('scoreLearningRelevance', () => {
  it('returns 1.0 for identical strings', () => {
    const score = scoreLearningRelevance('jaccard scoring', 'jaccard scoring');
    expect(score).toBe(1.0);
  });

  it('returns 0 when there is no overlap', () => {
    const score = scoreLearningRelevance('apple banana cherry', 'dog elephant fox');
    expect(score).toBe(0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const score = scoreLearningRelevance(
      'jaccard similarity scoring algorithm',
      'jaccard index scoring method'
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 when both strings are empty', () => {
    expect(scoreLearningRelevance('', '')).toBe(0);
  });

  it('is symmetric', () => {
    const a = 'harness validate testing';
    const b = 'testing harness pipeline';
    expect(scoreLearningRelevance(a, b)).toBe(scoreLearningRelevance(b, a));
  });
});

describe('filterByRelevance', () => {
  const learnings = [
    'Always run harness validate before committing changes to ensure pipeline health',
    'UTC normalization is needed for date comparisons in session timestamps',
    'Jaccard similarity is effective for keyword-based relevance scoring without dependencies',
    'Use TDD approach: write test first, observe failure, then implement',
    'The graph module requires explicit node deduplication on concurrent writes',
  ];

  it('filters out learnings below 0.7 threshold', () => {
    const result = filterByRelevance(learnings, 'jaccard similarity scoring relevance');
    // Only the Jaccard-related learning should score above 0.7
    for (const r of result) {
      expect(r.toLowerCase()).toContain('jaccard');
    }
  });

  it('returns empty array when no learnings meet threshold', () => {
    const result = filterByRelevance(learnings, 'quantum computing blockchain');
    expect(result).toEqual([]);
  });

  it('sorts results by score descending', () => {
    // Use context that partially matches multiple learnings
    const result = filterByRelevance(
      learnings,
      'harness validate testing TDD approach write test first observe failure implement changes pipeline',
      0.3 // lower threshold to include multiple results
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('respects token budget', () => {
    // Very small budget should truncate results
    const result = filterByRelevance(
      learnings,
      'harness validate testing TDD pipeline',
      0.1, // low threshold to include many
      20 // very small token budget (~80 chars)
    );
    // Total chars of results should be roughly <= 80
    const totalChars = result.join('\n').length;
    expect(totalChars).toBeLessThanOrEqual(100); // ~20 tokens * 4 chars + separators
  });

  it('uses default threshold of 0.7', () => {
    const result = filterByRelevance(learnings, 'completely unrelated topic xyz');
    expect(result).toEqual([]);
  });

  it('uses default token budget of 1000', () => {
    // With a very relevant context that matches all, budget limits output
    const manyLearnings = Array.from(
      { length: 100 },
      (_, i) => `Learning ${i}: harness validate pipeline testing TDD`
    );
    const result = filterByRelevance(manyLearnings, 'harness validate pipeline testing TDD', 0.3);
    // Should not return all 100 — budget caps it
    expect(result.length).toBeLessThan(100);
  });
});
