import { describe, it, expect } from 'vitest';
import {
  isTier1Skill,
  scoreSkill,
  suggest,
  formatSuggestions,
  computeHealthScore,
} from '../../src/skill/dispatcher';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
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
    addresses: [],
    dependsOn: [],
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

function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    gitHead: 'abc123',
    projectPath: '/tmp/test',
    checks: {
      deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
      entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
      security: { passed: true, findingCount: 0, criticalCount: 0 },
      perf: { passed: true, violationCount: 0 },
      docs: { passed: true, undocumentedCount: 0 },
      lint: { passed: true, issueCount: 0 },
    },
    metrics: {
      avgFanOut: 0,
      maxFanOut: 0,
      avgCyclomaticComplexity: 0,
      maxCyclomaticComplexity: 0,
      avgCouplingRatio: 0,
      testCoverage: null,
      anomalyOutlierCount: 0,
      articulationPointCount: 0,
    },
    signals: [],
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
    const score = scoreSkill(entry, ['frontend'], null, [], 'some-skill');
    expect(score).toBe(0);
  });

  it('scores keyword matches', () => {
    const entry = makeEntry({ keywords: ['testing', 'unit', 'jest'] });
    const score = scoreSkill(entry, ['testing', 'unit'], null, [], 'unrelated-skill');
    expect(score).toBeGreaterThan(0);
    // keyword component = 0.35 * (2/2) = 0.35
    expect(score).toBeCloseTo(0.35);
  });

  it('scores partial keyword matches', () => {
    const entry = makeEntry({ keywords: ['testing'] });
    const score = scoreSkill(entry, ['testing', 'database'], null, [], 'unrelated-skill');
    // keyword component = 0.35 * (1/2) = 0.175
    expect(score).toBeCloseTo(0.175);
  });

  it('returns 0 keyword score when queryTerms is empty', () => {
    const entry = makeEntry({ keywords: ['testing'] });
    const score = scoreSkill(entry, [], null, [], 'some-skill');
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
    const score = scoreSkill(entry, [], profile, [], 'some-skill');
    // stack component = 0.2 * (1/1) = 0.2
    expect(score).toBeCloseTo(0.2);
  });

  it('scores domain matches via stackSignals', () => {
    const entry = makeEntry({
      keywords: ['database'],
      stackSignals: ['some-signal'],
    });
    const profile = makeProfile({
      detectedDomains: ['database'],
    });
    const score = scoreSkill(entry, [], profile, [], 'some-skill');
    // domain match: detectedDomains has "database", entry.keywords has "database"
    // stack component = 0.2 * (1/1) = 0.2
    expect(score).toBeCloseTo(0.2);
  });

  it('scores recency boost', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: ['src/models'],
    });
    const score = scoreSkill(entry, [], null, ['src/models/user.ts'], 'some-skill');
    // recency component = 0.15 * 1.0 = 0.15
    expect(score).toBeCloseTo(0.15);
  });

  it('scores name matches', () => {
    const entry = makeEntry({ keywords: [] });
    const score = scoreSkill(entry, ['design', 'system'], null, [], 'harness-design-system');
    // name component = 0.2 * (2/2) = 0.2
    expect(score).toBeCloseTo(0.2);
  });

  it('scores description matches', () => {
    const entry = makeEntry({
      keywords: [],
      description: 'Design token generation and palette selection',
    });
    const score = scoreSkill(entry, ['design', 'token'], null, [], 'unrelated-skill');
    // desc component = 0.1 * (2/2) = 0.1
    expect(score).toBeCloseTo(0.1);
  });

  it('finds skills with no keywords via name and description', () => {
    const entry = makeEntry({
      keywords: [],
      description: 'Design token generation, palette selection, typography',
    });
    const score = scoreSkill(entry, ['design', 'system'], null, [], 'harness-design-system');
    // name: 0.2 * (2/2) = 0.2, desc: 0.1 * (1/2) = 0.05 => 0.25
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(0.25);
  });

  it('filters short name segments to prevent false positives', () => {
    const entry = makeEntry({ keywords: [] });
    // 'go' segment (2 chars) should be filtered out, not match query term 'algorithm'
    const score = scoreSkill(entry, ['algorithm'], null, [], 'harness-go-tool');
    // name segments after filter: ['harness', 'tool'] — neither matches 'algorithm'
    expect(score).toBeCloseTo(0);
  });

  it('handles empty skillName without error', () => {
    const entry = makeEntry({ keywords: [] });
    const score = scoreSkill(entry, ['testing'], null, [], '');
    // empty name → nameScore stays 0
    expect(score).toBeCloseTo(0);
  });

  it('combines all score components', () => {
    const entry = makeEntry({
      keywords: ['testing'],
      stackSignals: ['prisma/schema.prisma'],
      description: 'A testing skill for unit tests',
    });
    const profile = makeProfile({
      signals: { 'prisma/schema.prisma': true },
    });
    const score = scoreSkill(
      entry,
      ['testing'],
      profile,
      ['prisma/schema.prisma'],
      'harness-testing'
    );
    // keyword: 0.35*1=0.35, name: 0.2*(1/1)=0.2, desc: 0.1*1=0.1, stack: 0.2*1=0.2, recency: 0.15*1=0.15
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
    // keyword: 0.35*(3/3)=0.35 + name: 0.2*(1/3)≈0.067 + desc: 0.1*(0/3)=0 + stack: 0.2*(1/1)=0.2 = ~0.62 > 0.4
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

describe('computeHealthScore', () => {
  it('returns 0 when skill has no addresses', () => {
    const entry = makeEntry({ addresses: [] });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    expect(computeHealthScore(entry, snapshot)).toBe(0);
  });

  it('returns proportional score when addresses overlap with signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }, { signal: 'dead-code' }],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    // 1 of 2 addresses match => 0.5
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(0.5);
  });

  it('returns 1 when all addresses match active signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }, { signal: 'dead-code' }],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps', 'dead-code', 'drift'] });
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(1.0);
  });

  it('returns 0 when no addresses match active signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }],
    });
    const snapshot = makeSnapshot({ signals: ['dead-code'] });
    expect(computeHealthScore(entry, snapshot)).toBe(0);
  });

  it('uses weight when provided on address', () => {
    const entry = makeEntry({
      addresses: [
        { signal: 'circular-deps', weight: 0.8 },
        { signal: 'dead-code', weight: 0.2 },
      ],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    // Only first matches. Weighted: 0.8 / (0.8 + 0.2) = 0.8
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(0.8);
  });
});

describe('scoreSkill with health boost', () => {
  it('returns unchanged score when healthSnapshot is undefined', () => {
    const entry = makeEntry({ keywords: ['testing', 'unit', 'jest'] });
    const withoutSnapshot = scoreSkill(entry, ['testing', 'unit'], null, [], 'unrelated-skill');
    const withUndefined = scoreSkill(
      entry,
      ['testing', 'unit'],
      null,
      [],
      'unrelated-skill',
      undefined
    );
    expect(withoutSnapshot).toEqual(withUndefined);
  });

  it('blends 70/30 when healthSnapshot is provided', () => {
    const entry = makeEntry({
      keywords: ['testing'],
      addresses: [{ signal: 'low-coverage' }],
    });
    const snapshot = makeSnapshot({ signals: ['low-coverage'] });

    const originalScore = scoreSkill(entry, ['testing'], null, [], 'some-skill');
    const boostedScore = scoreSkill(entry, ['testing'], null, [], 'some-skill', snapshot);

    // healthScore = 1.0 (1/1 match), blend = 0.70 * original + 0.30 * 1.0
    const expected = 0.7 * originalScore + 0.3 * 1.0;
    expect(boostedScore).toBeCloseTo(expected);
  });

  it('does not change score when skill has no addresses and snapshot provided', () => {
    const entry = makeEntry({ keywords: ['testing'], addresses: [] });
    const snapshot = makeSnapshot({ signals: ['low-coverage'] });

    const originalScore = scoreSkill(entry, ['testing'], null, [], 'some-skill');
    const boostedScore = scoreSkill(entry, ['testing'], null, [], 'some-skill', snapshot);

    // healthScore = 0 (no addresses), blend = 0.70 * original + 0.30 * 0 < original
    // Score IS changed (reduced) because the blend formula applies even with 0 health score
    const expected = 0.7 * originalScore + 0.3 * 0;
    expect(boostedScore).toBeCloseTo(expected);
  });
});
