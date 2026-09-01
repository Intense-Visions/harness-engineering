import { describe, expect, it } from 'vitest';

import { buildCodebookReport } from './report';
import { deriveHandle, expand, type Codebook } from './codebook';
import type { CorpusDocument } from './mine';

/** Build a corpus where `label` appears in `docs` documents with `text`. */
function corpusWith(
  entries: Array<{ label: string; text: string; docs: number }>
): CorpusDocument[] {
  const maxDocs = Math.max(0, ...entries.map((e) => e.docs));
  const docs: CorpusDocument[] = [];
  for (let i = 0; i < maxDocs; i++) {
    const spans = entries.filter((e) => i < e.docs).map((e) => ({ label: e.label, text: e.text }));
    docs.push({ id: `d${i}`, spans });
  }
  return docs;
}

const membershipConfig = { entryThreshold: 200, retirementThreshold: 100, handleCost: 8 };
const mineConfig = { minFrequency: 2, normalizeWhitespace: true };

describe('buildCodebookReport', () => {
  it('produces an empty, non-throwing report for an empty corpus', () => {
    const report = buildCodebookReport({ corpus: [] });
    expect(report.corpusSize).toBe(0);
    expect(report.mined).toEqual([]);
    expect(report.codebook.entries).toEqual([]);
    expect(report.savings.savedChars).toBe(0);
    expect(report.savings.savedFraction).toBe(0);
  });

  it('admits amortizing recurring terms and projects positive savings (AC1)', () => {
    const corpus = corpusWith([
      { label: 'layers', text: 'The four architectural layers and their import rules', docs: 6 },
    ]);
    const report = buildCodebookReport({ corpus, mineConfig, membershipConfig });
    expect(report.membershipCounts.enter).toBe(1);
    expect(report.codebook.entries).toHaveLength(1);
    // Paired comparison: dictionary chars strictly below verbatim baseline.
    expect(report.savings.baselineChars).toBeGreaterThan(0);
    expect(report.savings.dictionaryChars).toBeLessThan(report.savings.baselineChars);
    expect(report.savings.savedChars).toBeGreaterThan(0);
    expect(report.savings.savedTokensEstimate).toBeGreaterThan(0);
    expect(report.savings.savedFraction).toBeGreaterThan(0);
    expect(report.savings.savedFraction).toBeLessThanOrEqual(1);
  });

  it('never projects negative savings (non-amortizing terms excluded)', () => {
    // Short span, handle barely helps: freq 3 x length 8, handleCost 8 -> no saving.
    const corpus = corpusWith([{ label: 't', text: 'abcdefgh', docs: 3 }]);
    const report = buildCodebookReport({
      corpus,
      mineConfig,
      membershipConfig: { entryThreshold: 1, retirementThreshold: 1, handleCost: 8 },
    });
    expect(report.savings.savedChars).toBeGreaterThanOrEqual(0);
  });

  it('bumps a version and preserves old pinned meaning across runs (AC2)', () => {
    const textV1 = 'user record has id, email and createdAt fields on the user schema';
    const textV2 = 'user record has id, email, role and createdAt fields on the user schema';
    const c1 = corpusWith([{ label: 'schema', text: textV1, docs: 6 }]);
    const run1 = buildCodebookReport({ corpus: c1, mineConfig, membershipConfig });
    expect(run1.codebook.entries[0]?.version).toBe(1);

    const c2 = corpusWith([{ label: 'schema', text: textV2, docs: 6 }]);
    const run2 = buildCodebookReport({
      corpus: c2,
      priorCodebook: run1.codebook,
      mineConfig,
      membershipConfig,
    });
    expect(run2.driftBumps).toBe(1);
    expect(run2.codebook.entries[0]?.version).toBe(2);

    const handle = deriveHandle('schema');
    expect(expand(run2.codebook, handle, 1)).toBe(textV1);
    expect(expand(run2.codebook, handle, 2)).toBe(textV2);
  });

  it('drives entry and exit purely by measured usage across a soak (AC3)', () => {
    // Window 1: "conv" is heavily recurring -> enters. No hand-curation anywhere.
    const w1 = corpusWith([
      { label: 'conv', text: 'always run the CLI build before committing', docs: 6 },
    ]);
    let book: Codebook | undefined;
    const r1 = buildCodebookReport({ corpus: w1, mineConfig, membershipConfig });
    book = r1.codebook;
    expect(book.entries.map((e) => e.label)).toContain('conv');

    // Window 2: usage decays to a single doc -> falls below minFrequency, mined
    // out, and (being previously live) retires automatically.
    const w2 = corpusWith([
      { label: 'conv', text: 'always run the CLI build before committing', docs: 1 },
      { label: 'other', text: 'a different recurring standing instruction block', docs: 6 },
    ]);
    const r2 = buildCodebookReport({
      corpus: w2,
      priorCodebook: book,
      mineConfig,
      membershipConfig,
    });
    expect(r2.codebook.entries.map((e) => e.label)).not.toContain('conv');
    expect(r2.codebook.entries.map((e) => e.label)).toContain('other');
    // 'conv' left the live set but stays expandable from history for old pins.
    expect(r2.codebook.history.some((h) => h.label === 'conv')).toBe(true);
  });
});
