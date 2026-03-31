import { describe, it, expect } from 'vitest';
import { isTier1Skill, scoreSkill, suggest, formatSuggestions } from '../../src/skill/dispatcher';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder';
import type { StackProfile } from '../../src/skill/stack-profile';

function makeEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  return {
    tier: 3,
    description: 'A test skill',
    keywords: ['testing', 'unit'],
    stackSignals: [],
    cognitiveMode: undefined,
    phases: [],
    source: 'bundled',
    ...overrides,
  };
}

function makeIndex(skills: Record<string, SkillIndexEntry>): SkillsIndex {
  return { version: 1, hash: 'abc', generatedAt: '2025-01-01', skills };
}

function makeProfile(overrides: Partial<StackProfile> = {}): StackProfile {
  return {
    generatedAt: '2025-01-01',
    signals: {},
    detectedDomains: [],
    ...overrides,
  };
}

describe('isTier1Skill', () => {
  it('returns true for known tier 1 skills', () => {
    expect(isTier1Skill('harness-brainstorming')).toBe(true);
    expect(isTier1Skill('harness-planning')).toBe(true);
    expect(isTier1Skill('harness-execution')).toBe(true);
    expect(isTier1Skill('harness-autopilot')).toBe(true);
    expect(isTier1Skill('harness-tdd')).toBe(true);
    expect(isTier1Skill('harness-debugging')).toBe(true);
    expect(isTier1Skill('harness-refactoring')).toBe(true);
  });

  it('returns false for non-tier-1 skills', () => {
    expect(isTier1Skill('harness-docs')).toBe(false);
    expect(isTier1Skill('some-random-skill')).toBe(false);
  });
});

describe('scoreSkill', () => {
  it('returns 0 when no matches', () => {
    const entry = makeEntry({ keywords: ['database'], stackSignals: [] });
    const score = scoreSkill(entry, ['frontend'], null, []);
    expect(score).toBe(0);
  });

  it('scores keyword matches', () => {
    const entry = makeEntry({ keywords: ['testing', 'unit', 'jest'] });
    const score = scoreSkill(entry, ['testing', 'unit'], null, []);
    expect(score).toBeGreaterThan(0);
    // keyword component = 0.5 * (2/2) = 0.5
    expect(score).toBeCloseTo(0.5);
  });

  it('scores partial keyword matches', () => {
    const entry = makeEntry({ keywords: ['testing'] });
    const score = scoreSkill(entry, ['testing', 'database'], null, []);
    // keyword component = 0.5 * (1/2) = 0.25
    expect(score).toBeCloseTo(0.25);
  });

  it('returns 0 keyword score when queryTerms is empty', () => {
    const entry = makeEntry({ keywords: ['testing'] });
    const score = scoreSkill(entry, [], null, []);
    expect(score).toBe(0);
  });

  it('scores stack signal matches', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: ['prisma/schema.prisma'],
    });
    const profile = makeProfile({
      signals: { 'prisma/schema.prisma': true },
    });
    const score = scoreSkill(entry, [], profile, []);
    // stack component = 0.3 * (1/1) = 0.3
    expect(score).toBeCloseTo(0.3);
  });

  it('scores domain matches via stackSignals', () => {
    const entry = makeEntry({
      keywords: ['database'],
      stackSignals: ['some-signal'],
    });
    const profile = makeProfile({
      detectedDomains: ['database'],
    });
    const score = scoreSkill(entry, [], profile, []);
    // domain match: detectedDomains has "database", entry.keywords has "database"
    // stack component = 0.3 * (1/1) = 0.3
    expect(score).toBeCloseTo(0.3);
  });

  it('scores recency boost', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: ['src/models'],
    });
    const score = scoreSkill(entry, [], null, ['src/models/user.ts']);
    // recency component = 0.2 * 1.0 = 0.2
    expect(score).toBeCloseTo(0.2);
  });

  it('combines all score components', () => {
    const entry = makeEntry({
      keywords: ['testing'],
      stackSignals: ['prisma/schema.prisma'],
    });
    const profile = makeProfile({
      signals: { 'prisma/schema.prisma': true },
    });
    const score = scoreSkill(entry, ['testing'], profile, ['prisma/schema.prisma']);
    // keyword: 0.5 * 1 = 0.5, stack: 0.3 * 1 = 0.3, recency: 0.2 * 1 = 0.2
    expect(score).toBeCloseTo(1.0);
  });
});

describe('suggest', () => {
  it('returns empty array when no skills score above threshold', () => {
    const index = makeIndex({
      'test-skill': makeEntry({ keywords: ['database'] }),
    });
    const result = suggest(index, 'frontend react', null, []);
    expect(result).toEqual([]);
  });

  it('returns skills scoring above threshold', () => {
    const entry = makeEntry({
      keywords: ['testing', 'unit', 'jest'],
      stackSignals: ['jest.config.ts'],
    });
    const index = makeIndex({ 'test-skill': entry });
    const profile = makeProfile({ signals: { 'jest.config.ts': true } });
    // keyword: 0.5*(3/3)=0.5 + stack: 0.3*(1/1)=0.3 = 0.8 > 0.4
    const result = suggest(index, 'testing unit jest', profile, []);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.name).toBe('test-skill');
  });

  it('respects neverSuggest config', () => {
    const index = makeIndex({
      'blocked-skill': makeEntry({ keywords: ['testing', 'unit'] }),
    });
    const result = suggest(index, 'testing unit', null, [], {
      neverSuggest: ['blocked-skill'],
    });
    expect(result).toEqual([]);
  });

  it('forces alwaysSuggest skills even below threshold', () => {
    const index = makeIndex({
      'forced-skill': makeEntry({ keywords: ['unrelated'] }),
    });
    const result = suggest(index, 'completely different', null, [], {
      alwaysSuggest: ['forced-skill'],
    });
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('forced-skill');
    expect(result[0]!.score).toBeGreaterThanOrEqual(1.0);
  });

  it('limits results to 3', () => {
    const index = makeIndex({
      'skill-1': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-2': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-3': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-4': makeEntry({ keywords: ['testing', 'unit'] }),
    });
    const result = suggest(index, 'testing unit', null, []);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('sorts results by score descending', () => {
    const index = makeIndex({
      'low-skill': makeEntry({ keywords: ['testing'] }),
      'high-skill': makeEntry({ keywords: ['testing', 'unit', 'jest'] }),
    });
    const result = suggest(index, 'testing unit jest', null, []);
    if (result.length >= 2) {
      expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
    }
  });
});

describe('formatSuggestions', () => {
  it('returns empty string for no suggestions', () => {
    expect(formatSuggestions([])).toBe('');
  });

  it('formats suggestions as markdown', () => {
    const result = formatSuggestions([
      { name: 'test-skill', description: 'A test skill', score: 0.8 },
    ]);
    expect(result).toContain('## Suggested Domain Skills');
    expect(result).toContain('**test-skill**');
    expect(result).toContain('A test skill');
    expect(result).toContain('search_skills');
  });

  it('includes multiple suggestions', () => {
    const result = formatSuggestions([
      { name: 'skill-a', description: 'First', score: 0.9 },
      { name: 'skill-b', description: 'Second', score: 0.7 },
    ]);
    expect(result).toContain('**skill-a**');
    expect(result).toContain('**skill-b**');
  });
});
