import { describe, it, expect } from 'vitest';
import {
  checkOverlap,
  computeLexicalSimilarity,
  computeStructuralMatch,
  computeRootCauseMatch,
  computeTemporalProximity,
  computeCodeReferenceOverlap,
  extractFileReferences,
} from '../../src/state/learnings-overlap';

describe('computeLexicalSimilarity', () => {
  it('returns 1.0 for identical normalized content', () => {
    expect(
      computeLexicalSimilarity(
        'the auth module has a race condition',
        'the auth module has a race condition'
      )
    ).toBe(1.0);
  });

  it('returns 0.0 for completely different content', () => {
    expect(
      computeLexicalSimilarity('auth module race condition', 'database schema migration')
    ).toBe(0.0);
  });

  it('returns partial score for overlapping words', () => {
    const score = computeLexicalSimilarity(
      'auth module race condition fix',
      'auth module timeout issue fix'
    );
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8);
  });
});

describe('computeStructuralMatch', () => {
  it('returns 1.0 for same skill and outcome', () => {
    const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
    const b = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** other';
    expect(computeStructuralMatch(a, b)).toBe(1.0);
  });

  it('returns 0.5 for same skill but different outcome', () => {
    const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
    const b = '- **2026-04-17 [skill:debugging] [outcome:success]:** other';
    expect(computeStructuralMatch(a, b)).toBe(0.5);
  });

  it('returns 0.0 for different skill and outcome', () => {
    const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
    const b = '- **2026-04-17 [skill:testing] [outcome:success]:** other';
    expect(computeStructuralMatch(a, b)).toBe(0.0);
  });
});

describe('computeRootCauseMatch', () => {
  it('returns 1.0 for same root cause', () => {
    const a = '- **2026-04-17 [root_cause:circular-import]:** text';
    const b = '- **2026-04-17 [root_cause:circular-import]:** other';
    expect(computeRootCauseMatch(a, b)).toBe(1.0);
  });

  it('returns 0.0 for different root cause', () => {
    const a = '- **2026-04-17 [root_cause:circular-import]:** text';
    const b = '- **2026-04-17 [root_cause:race-condition]:** other';
    expect(computeRootCauseMatch(a, b)).toBe(0.0);
  });

  it('returns 0.0 when neither has root cause', () => {
    expect(computeRootCauseMatch('text without tags', 'other without tags')).toBe(0.0);
  });
});

describe('computeTemporalProximity', () => {
  it('returns 1.0 for same date', () => {
    const a = '- **2026-04-17:** text';
    const b = '- **2026-04-17:** other';
    expect(computeTemporalProximity(a, b)).toBe(1.0);
  });

  it('returns ~0.5 for 7 days apart', () => {
    const a = '- **2026-04-17:** text';
    const b = '- **2026-04-10:** other';
    const score = computeTemporalProximity(a, b);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  it('returns 0.0 for 30+ days apart', () => {
    const a = '- **2026-04-17:** text';
    const b = '- **2026-03-01:** other';
    expect(computeTemporalProximity(a, b)).toBe(0.0);
  });
});

describe('extractFileReferences', () => {
  it('extracts file paths from text', () => {
    const refs = extractFileReferences('Changed src/state/learnings.ts to fix the bug');
    expect(refs).toContain('src/state/learnings.ts');
  });

  it('returns empty for text without file references', () => {
    expect(extractFileReferences('no files here')).toEqual([]);
  });
});

describe('computeCodeReferenceOverlap', () => {
  it('returns 1.0 for identical file references', () => {
    const a = 'Changed src/state/learnings.ts to fix the bug';
    const b = 'The file src/state/learnings.ts had a race condition';
    expect(computeCodeReferenceOverlap(a, b)).toBe(1.0);
  });

  it('returns 0.0 for no shared references', () => {
    const a = 'Changed src/state/learnings.ts';
    const b = 'Changed packages/cli/src/commands/prune.ts';
    expect(computeCodeReferenceOverlap(a, b)).toBe(0.0);
  });

  it('returns 0.0 when no file references found', () => {
    expect(computeCodeReferenceOverlap('no files here', 'none here either')).toBe(0.0);
  });
});

describe('checkOverlap', () => {
  it('returns high score for near-duplicate entries', () => {
    const newEntry =
      '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** The graph package had a circular dependency in src/state/learnings.ts';
    const existing = [
      '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** Found circular dependency issue in src/state/learnings.ts graph package',
    ];
    const result = checkOverlap(newEntry, existing);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.matchedEntry).toBe(existing[0]);
  });

  it('returns low score for unrelated entries', () => {
    const newEntry = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** Auth token expiry bug';
    const existing = [
      '- **2026-03-01 [skill:testing] [outcome:success]:** Database migration completed successfully',
    ];
    const result = checkOverlap(newEntry, existing);
    expect(result.score).toBeLessThan(0.3);
  });

  it('returns score 0 when no existing entries', () => {
    const result = checkOverlap('- **2026-04-17:** something', []);
    expect(result.score).toBe(0);
    expect(result.matchedEntry).toBeUndefined();
  });

  it('returns dimensions breakdown', () => {
    const newEntry =
      '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** auth issue in src/auth.ts';
    const existing = [
      '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** auth problem in src/auth.ts',
    ];
    const result = checkOverlap(newEntry, existing);
    expect(result.dimensions).toBeDefined();
    expect(typeof result.dimensions.lexical).toBe('number');
    expect(typeof result.dimensions.structural).toBe('number');
    expect(typeof result.dimensions.rootCause).toBe('number');
    expect(typeof result.dimensions.temporal).toBe('number');
    expect(typeof result.dimensions.codeReference).toBe('number');
  });
});
