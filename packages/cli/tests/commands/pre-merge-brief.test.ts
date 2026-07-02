import { describe, it, expect } from 'vitest';
import type { DiffInfo } from '@harness-engineering/core';
import { BRIEF_MARKER, buildBriefBody } from '../../src/commands/pre-merge-brief';

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
});
