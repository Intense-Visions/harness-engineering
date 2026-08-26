import { describe, it, expect } from 'vitest';
import {
  SolutionDocFrontmatterSchema,
  BUG_TRACK_CATEGORIES,
  KNOWLEDGE_TRACK_CATEGORIES,
} from './schema';

const validBug = {
  module: 'orchestrator',
  tags: ['concurrency'],
  problem_type: 'race-condition',
  last_updated: '2026-05-05',
  track: 'bug-track' as const,
  category: 'integration-issues' as const,
};

describe('SolutionDocFrontmatterSchema', () => {
  it('accepts a valid bug-track frontmatter', () => {
    expect(SolutionDocFrontmatterSchema.parse(validBug)).toEqual(validBug);
  });

  it('accepts a valid knowledge-track frontmatter', () => {
    const valid = { ...validBug, track: 'knowledge-track', category: 'design-patterns' };
    expect(SolutionDocFrontmatterSchema.parse(valid)).toEqual(valid);
  });

  it('accepts frontmatter without the optional enforces field (fill-forward)', () => {
    const parsed = SolutionDocFrontmatterSchema.parse(validBug);
    expect(parsed).not.toHaveProperty('enforces');
  });

  it('accepts frontmatter with an enforces provenance list (ADR 0100)', () => {
    const withEnforces = {
      ...validBug,
      enforces: ['STRENGTH-002', 'arch:no-cross-package-import'],
    };
    expect(SolutionDocFrontmatterSchema.parse(withEnforces)).toEqual(withEnforces);
  });

  it('rejects a non-string-array enforces field', () => {
    expect(() =>
      SolutionDocFrontmatterSchema.parse({ ...validBug, enforces: 'STRENGTH-002' })
    ).toThrow();
  });

  it('rejects unknown category', () => {
    expect(() =>
      SolutionDocFrontmatterSchema.parse({ ...validBug, category: 'unicorn-bugs' })
    ).toThrow();
  });

  it('rejects malformed last_updated', () => {
    expect(() =>
      SolutionDocFrontmatterSchema.parse({ ...validBug, last_updated: '05/05/2026' })
    ).toThrow();
  });

  it('rejects mismatched track/category combinations', () => {
    const mismatch = { ...validBug, track: 'knowledge-track', category: 'integration-issues' };
    expect(() => SolutionDocFrontmatterSchema.parse(mismatch)).toThrow();
  });

  it('exports complete category lists', () => {
    expect(BUG_TRACK_CATEGORIES).toHaveLength(9);
    expect(KNOWLEDGE_TRACK_CATEGORIES).toHaveLength(6);
  });
});
