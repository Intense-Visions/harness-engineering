import { describe, it, expect } from 'vitest';
import type { CiReviewResult, DiffInfo } from '@harness-engineering/core';
import { BRIEF_MARKER, buildBriefBody } from '../../src/commands/pre-merge-brief';

type Verdict = CiReviewResult['verdict'];
type Finding = Verdict['findings'][number];

/** A review finding fixture. */
function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'critical',
    file: 'src/a.ts',
    lineRange: [10, 12],
    title: 'null deref',
    ...over,
  } as Finding;
}

/** A review verdict fixture (not schema-validated; passed directly to the renderer). */
function makeVerdict(over: Partial<Verdict> = {}): Verdict {
  return {
    assessment: 'request-changes',
    runner: 'claude',
    findings: [],
    blockingFindings: [],
    skipped: false,
    ...over,
  } as Verdict;
}

/** A DiffInfo fixture with two changed files, one new. */
function makeDiff(): DiffInfo {
  return {
    changedFiles: ['a.ts', 'b.ts'],
    newFiles: ['b.ts'],
    deletedFiles: [],
    totalDiffLines: 12,
    fileDiffs: new Map(),
  };
}

describe('buildBriefBody', () => {
  it('starts with the hidden marker and a header', () => {
    const body = buildBriefBody({ diff: makeDiff() });
    const firstNonEmpty = body.split('\n').find((l) => l.trim().length > 0) ?? '';
    // The marker and a `# ` title lead the brief.
    expect(body).toContain(BRIEF_MARKER);
    expect(body).toMatch(/^# /m);
    // The marker precedes the visible title.
    expect(body.indexOf(BRIEF_MARKER)).toBeLessThan(body.indexOf('# '));
    expect(firstNonEmpty).toBeTruthy();
  });

  it('renders diff summary when diff present', () => {
    const body = buildBriefBody({ diff: makeDiff() });
    expect(body).toMatch(/Diff summary/);
    // file + line counts appear
    expect(body).toContain('2');
    expect(body).toContain('12');
  });

  it('diff summary unavailable when diff omitted', () => {
    const body = buildBriefBody({});
    const idx = body.indexOf('Diff summary');
    expect(idx).toBeGreaterThanOrEqual(0);
    // the "unavailable" line follows the heading
    expect(body.slice(idx)).toMatch(/unavailable/i);
  });

  it('renders review verdict with assessment + finding counts', () => {
    const f1 = makeFinding({ id: 'f1', title: 'null deref', severity: 'critical' });
    const f2 = makeFinding({
      id: 'f2',
      title: 'style nit',
      severity: 'warning',
      file: 'src/b.ts',
      lineRange: undefined,
    });
    const body = buildBriefBody({
      review: makeVerdict({ findings: [f1, f2], blockingFindings: [f1] }),
    });
    // a review heading + the assessment appear
    expect(body).toMatch(/review/i);
    expect(body).toContain('request-changes');
    // blocking + other findings rendered as bullets
    expect(body).toContain('null deref');
    expect(body).toContain('style nit');
    expect(body).toMatch(/src\/a\.ts:10/);
  });

  it('review section unavailable when review omitted', () => {
    const body = buildBriefBody({});
    const idx = body.search(/review/i);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(body.slice(idx)).toMatch(/unavailable/i);
  });
});
