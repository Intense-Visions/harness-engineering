import { describe, expect, it } from 'vitest';

import { mineRecurringSpans, normalizeSpanText, type CorpusDocument } from './mine';

function doc(id: string, spans: Array<[string, string]>): CorpusDocument {
  return { id, spans: spans.map(([label, text]) => ({ label, text })) };
}

describe('normalizeSpanText', () => {
  it('collapses whitespace and trims when enabled', () => {
    expect(normalizeSpanText('  a\n\n  b   c ', true)).toBe('a b c');
  });
  it('is identity when disabled', () => {
    expect(normalizeSpanText('  a\n b ', false)).toBe('  a\n b ');
  });
});

describe('mineRecurringSpans', () => {
  it('returns nothing for an empty corpus', () => {
    expect(mineRecurringSpans([])).toEqual([]);
  });

  it('mines by document frequency, not raw occurrence', () => {
    // "layers" appears 3x in doc1 but that is still frequency 1 for doc1.
    const corpus = [
      doc('d1', [
        ['layers', 'The layer rules'],
        ['layers', 'The layer rules'],
        ['layers', 'The layer rules'],
      ]),
      doc('d2', [['layers', 'The layer rules']]),
    ];
    const [term] = mineRecurringSpans(corpus, { minFrequency: 2, normalizeWhitespace: true });
    expect(term?.label).toBe('layers');
    expect(term?.frequency).toBe(2);
    expect(term?.length).toBe('The layer rules'.length);
    expect(term?.frequencyTimesLength).toBe(2 * 'The layer rules'.length);
  });

  it('drops labels below minFrequency', () => {
    const corpus = [
      doc('d1', [['rare', 'once']]),
      doc('d2', [['common', 'x']]),
      doc('d3', [['common', 'x']]),
    ];
    const terms = mineRecurringSpans(corpus, { minFrequency: 2, normalizeWhitespace: true });
    expect(terms.map((t) => t.label)).toEqual(['common']);
  });

  it('selects the most frequent text as the canonical definition and counts variants', () => {
    const corpus = [
      doc('d1', [['schema', 'v2 shape']]),
      doc('d2', [['schema', 'v2 shape']]),
      doc('d3', [['schema', 'v1 shape']]),
    ];
    const [term] = mineRecurringSpans(corpus, { minFrequency: 2, normalizeWhitespace: true });
    expect(term?.definition).toBe('v2 shape');
    expect(term?.variants).toBe(2);
  });

  it('groups trivially-reformatted texts when normalization is on', () => {
    const corpus = [doc('d1', [['conv', 'use  the\nrule']]), doc('d2', [['conv', 'use the rule']])];
    const [term] = mineRecurringSpans(corpus, { minFrequency: 2, normalizeWhitespace: true });
    expect(term?.variants).toBe(1);
    expect(term?.definition).toBe('use the rule');
  });

  it('sorts by frequency × length descending with a deterministic label tiebreak', () => {
    const corpus = [
      doc('d1', [
        ['a', 'short'],
        ['b', 'a much longer definition body'],
      ]),
      doc('d2', [
        ['a', 'short'],
        ['b', 'a much longer definition body'],
      ]),
    ];
    const terms = mineRecurringSpans(corpus, { minFrequency: 2, normalizeWhitespace: true });
    expect(terms.map((t) => t.label)).toEqual(['b', 'a']);
  });
});
