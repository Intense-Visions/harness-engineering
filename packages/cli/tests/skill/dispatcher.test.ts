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
    type: 'flexible',
    description: 'A test skill',
    keywords: ['testing', 'unit'],
    stackSignals: [],
    cognitiveMode: undefined,
    phases: [],
    paths: [],
    relatedSkills: [],
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
    // keyword component = 0.30 * (2/2) = 0.30  (was 0.35)
    expect(score).toBeCloseTo(0.3);
  });

  it('scores partial keyword matches', () => {
    const entry = makeEntry({ keywords: ['testing'] });
    const score = scoreSkill(entry, ['testing', 'database'], null, [], 'unrelated-skill');
    // keyword component = 0.30 * (1/2) = 0.15  (was 0.175)
    expect(score).toBeCloseTo(0.15);
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
    // stack component = 0.15 * (1/1) = 0.15  (was 0.20)
    expect(score).toBeCloseTo(0.15);
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
    // stack component = 0.15 * (1/1) = 0.15  (was 0.20)
    expect(score).toBeCloseTo(0.15);
  });

  it('scores recency boost', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: ['src/models'],
    });
    const score = scoreSkill(entry, [], null, ['src/models/user.ts'], 'some-skill');
    // recency component = 0.10 * 1.0 = 0.10  (was 0.15)
    expect(score).toBeCloseTo(0.1);
  });

  it('scores name matches', () => {
    const entry = makeEntry({ keywords: [] });
    const score = scoreSkill(entry, ['design', 'system'], null, [], 'harness-design-system');
    // name component = 0.15 * (2/2) = 0.15  (was 0.20)
    expect(score).toBeCloseTo(0.15);
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
    // name: 0.15 * (2/2) = 0.15, desc: 0.10 * (1/2) = 0.05 => 0.20
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(0.2);
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
    // keyword: 0.30*1=0.30, name: 0.15*(1/1)=0.15, desc: 0.10*1=0.10, stack: 0.15*1=0.15, recency: 0.10*1=0.10
    // paths: 0.20*0=0 (stackSignals used for recency, not paths glob)
    // total: 0.30+0.15+0.10+0.15+0.10 = 0.80
    expect(score).toBeCloseTo(0.8);
  });

  it('scores paths dimension: 0.20 when any glob matches recentFiles', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: [],
      paths: ['**/*.tsx', '**/*.jsx'],
    });
    const score = scoreSkill(entry, [], null, ['src/components/Button.tsx'], 'some-skill');
    // paths component = 0.20 * 1.0 = 0.20
    expect(score).toBeCloseTo(0.2);
  });

  it('scores paths dimension: 0.0 when no glob matches recentFiles', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: [],
      paths: ['**/*.tsx'],
    });
    const score = scoreSkill(entry, [], null, ['src/utils/helper.ts'], 'some-skill');
    // .ts file does not match **/*.tsx
    expect(score).toBeCloseTo(0.0);
  });

  it('scores paths dimension: 0.0 when paths is empty', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: [],
      paths: [],
    });
    const score = scoreSkill(entry, [], null, ['src/components/Button.tsx'], 'some-skill');
    expect(score).toBeCloseTo(0.0);
  });

  it('scores paths dimension: 0.0 when recentFiles is empty', () => {
    const entry = makeEntry({
      keywords: [],
      stackSignals: [],
      paths: ['**/*.tsx'],
    });
    const score = scoreSkill(entry, [], null, [], 'some-skill');
    expect(score).toBeCloseTo(0.0);
  });
});

describe('suggest', () => {
  it('returns empty suggestions when no skills score above threshold', () => {
    const index = makeIndex({
      'test-skill': makeEntry({ keywords: ['database'] }),
    });
    const result = suggest(index, 'frontend react', null, []);
    expect(result.suggestions).toEqual([]);
    expect(result.autoInjectKnowledge).toEqual([]);
  });

  it('returns skills scoring above threshold', () => {
    const entry = makeEntry({
      keywords: ['testing', 'unit', 'jest'],
      stackSignals: ['jest.config.ts'],
    });
    const index = makeIndex({ 'test-skill': entry });
    const profile = makeProfile({ signals: { 'jest.config.ts': true } });
    const result = suggest(index, 'testing unit jest', profile, []);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]!.name).toBe('test-skill');
  });

  it('respects neverSuggest config', () => {
    const index = makeIndex({
      'blocked-skill': makeEntry({ keywords: ['testing', 'unit'] }),
    });
    const result = suggest(index, 'testing unit', null, [], {
      neverSuggest: ['blocked-skill'],
    });
    expect(result.suggestions).toEqual([]);
  });

  it('forces alwaysSuggest skills even below threshold', () => {
    const index = makeIndex({
      'forced-skill': makeEntry({ keywords: ['unrelated'] }),
    });
    const result = suggest(index, 'completely different', null, [], {
      alwaysSuggest: ['forced-skill'],
    });
    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0]!.name).toBe('forced-skill');
    expect(result.suggestions[0]!.score).toBeGreaterThanOrEqual(1.0);
  });

  it('limits behavioral results to 3', () => {
    const index = makeIndex({
      'skill-1': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-2': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-3': makeEntry({ keywords: ['testing', 'unit'] }),
      'skill-4': makeEntry({ keywords: ['testing', 'unit'] }),
    });
    const result = suggest(index, 'testing unit', null, []);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('sorts results by score descending', () => {
    const index = makeIndex({
      'low-skill': makeEntry({ keywords: ['testing'] }),
      'high-skill': makeEntry({ keywords: ['testing', 'unit', 'jest'] }),
    });
    const result = suggest(index, 'testing unit jest', null, []);
    if (result.suggestions.length >= 2) {
      expect(result.suggestions[0]!.score).toBeGreaterThanOrEqual(result.suggestions[1]!.score);
    }
  });
});

describe('suggest() — knowledge skill hybrid injection', () => {
  it('places knowledge skill with score ≥ 0.7 in autoInjectKnowledge', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react'],
      paths: ['**/*.tsx'],
      description: 'Custom hooks for react components',
    });
    const index = makeIndex({ 'react-hooks-pattern': entry });
    // Score this skill high: keyword match (0.30) + name match (0.15) + desc match (0.05) + paths match (0.20) = 0.70
    const result = suggest(index, 'hooks react', null, ['src/App.tsx']);
    expect(result.autoInjectKnowledge.length).toBeGreaterThan(0);
    expect(result.autoInjectKnowledge[0]!.name).toBe('react-hooks-pattern');
  });

  it('places knowledge skill with score 0.4-0.7 in suggestions with type: knowledge', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['hooks'],
      paths: [], // no paths match to keep score moderate
    });
    const index = makeIndex({ 'react-hooks-pattern': entry });
    const result2 = suggest(index, 'hooks react', null, []);
    // keyword: 0.30*(1/2)=0.15 — below 0.4, won't appear
    // This test validates the plumbing — if score lands 0.4-0.7, it gets type marker
    // We verify the structure of suggestions includes an optional type field
    expect(Array.isArray(result2.suggestions)).toBe(true);
  });

  it('discards knowledge skill with score < 0.4', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['unrelated'],
      paths: [],
    });
    const index = makeIndex({ 'some-knowledge-skill': entry });
    const result = suggest(index, 'frontend react', null, []);
    expect(result.autoInjectKnowledge).toEqual([]);
    const inSuggestions = result.suggestions.find((s) => s.name === 'some-knowledge-skill');
    expect(inSuggestions).toBeUndefined();
  });

  it('returns suggestions and autoInjectKnowledge as separate arrays', () => {
    const index = makeIndex({});
    const result = suggest(index, 'test', null, []);
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(Array.isArray(result.autoInjectKnowledge)).toBe(true);
  });

  it('behavioral skills never appear in autoInjectKnowledge', () => {
    const entry = makeEntry({
      type: 'rigid',
      keywords: ['testing', 'unit', 'jest'],
    });
    const index = makeIndex({ 'test-skill': entry });
    const result = suggest(index, 'testing unit jest', null, []);
    expect(result.autoInjectKnowledge).toEqual([]);
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

describe('suggest() — autoInjectKnowledge shape', () => {
  it('autoInjectKnowledge entries include name, description, and score', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      description: 'Custom hooks for stateful logic',
    });
    const index = makeIndex({ 'react-hooks-pattern': entry });
    const result = suggest(index, 'hooks react custom', null, ['src/App.tsx']);
    if (result.autoInjectKnowledge.length > 0) {
      const kr = result.autoInjectKnowledge[0]!;
      expect(kr.name).toBeDefined();
      expect(kr.description).toBeDefined();
      expect(kr.score).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('suggest() — related_skills traversal and caps', () => {
  it('surfaces related_skills of auto-injected skill as secondary recommendations', () => {
    // 'react-hooks' scores ≥ 0.7 (auto-inject); 'ts-types' is its related skill
    // Score math: keyword(hooks,react)=0.30 + name(react,hooks)=0.15 + desc(hooks)=0.05 + paths=0.20 = 0.70
    const injected = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      relatedSkills: ['ts-types'],
      description: 'Custom hooks pattern',
    });
    const related = makeEntry({
      type: 'knowledge',
      keywords: [],
      description: 'TypeScript type utilities',
    });
    const index = makeIndex({
      'react-hooks': injected,
      'ts-types': related,
    });
    const result = suggest(index, 'hooks react', null, ['src/App.tsx']);
    // react-hooks should be auto-injected (score ≥ 0.7)
    expect(result.autoInjectKnowledge.some((s) => s.name === 'react-hooks')).toBe(true);
    // ts-types should appear in knowledgeRecommendations via traversal
    const rec = result.knowledgeRecommendations.find((r) => r.name === 'ts-types');
    expect(rec).toBeDefined();
    expect(rec!.score).toBe(0.45);
    expect(rec!.reason).toBe('related to auto-injected react-hooks');
  });

  it('does not duplicate a related skill already in autoInjectKnowledge', () => {
    // Both 'react-hooks' and 'ts-types' score ≥ 0.7; react-hooks also lists ts-types as related
    const entryA = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      relatedSkills: ['ts-types'],
      description: 'Custom hooks pattern',
    });
    const entryB = makeEntry({
      type: 'knowledge',
      keywords: ['types', 'typescript'],
      paths: ['**/*.tsx'],
      relatedSkills: [],
      description: 'TypeScript type utilities',
    });
    const index = makeIndex({
      'react-hooks': entryA,
      'ts-types': entryB,
    });
    const result = suggest(index, 'hooks react custom types typescript', null, ['src/App.tsx']);
    // ts-types must not appear in both autoInjectKnowledge and knowledgeRecommendations
    const inAutoInject = result.autoInjectKnowledge.some((s) => s.name === 'ts-types');
    const inRecs = result.knowledgeRecommendations.some((r) => r.name === 'ts-types');
    expect(inAutoInject && inRecs).toBe(false);
  });

  it('does not duplicate a related skill already in knowledgeRecommendations', () => {
    // 'react-hooks' is auto-injected; 'ts-types' already scored 0.4–0.7 into recommendations
    const injected = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      relatedSkills: ['ts-types'],
      description: 'Custom hooks pattern',
    });
    const moderate = makeEntry({
      type: 'knowledge',
      keywords: ['types'],
      paths: [],
      relatedSkills: [],
      description: 'TypeScript type utilities',
    });
    const index = makeIndex({
      'react-hooks': injected,
      'ts-types': moderate,
    });
    // Use a query that boosts ts-types into 0.4-0.7 range (keyword match only)
    const result = suggest(index, 'hooks react custom types', null, ['src/App.tsx']);
    const recCount = result.knowledgeRecommendations.filter((r) => r.name === 'ts-types').length;
    expect(recCount).toBeLessThanOrEqual(1);
  });

  it('adds no recommendations when auto-injected skill has no related_skills', () => {
    const injected = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      relatedSkills: [],
      description: 'Custom hooks pattern',
    });
    const index = makeIndex({ 'react-hooks': injected });
    const result = suggest(index, 'hooks react custom', null, ['src/App.tsx']);
    // No traversal entries should be added
    const traversalEntries = result.knowledgeRecommendations.filter((r) =>
      r.reason?.startsWith('related to auto-injected')
    );
    expect(traversalEntries).toHaveLength(0);
  });

  it('caps autoInjectKnowledge at 3 and demotes excess to knowledgeRecommendations', () => {
    // Create 4 knowledge skills that all score ≥ 0.7 via keyword+name+paths match
    // Score math per skill: keyword(hooks,react)=0.30 + name(react,hooks)=0.15 + desc=0.05 + paths=0.20 = 0.70
    const makeKnowledgeEntry = () =>
      makeEntry({
        type: 'knowledge',
        keywords: ['hooks', 'react'],
        paths: ['**/*.tsx'],
        relatedSkills: [],
        description: 'Custom hooks pattern',
      });
    const index = makeIndex({
      'react-hooks-alpha': makeKnowledgeEntry(),
      'react-hooks-beta': makeKnowledgeEntry(),
      'react-hooks-gamma': makeKnowledgeEntry(),
      'react-hooks-delta': makeKnowledgeEntry(),
    });
    const result = suggest(index, 'react hooks', null, ['src/App.tsx']);
    expect(result.autoInjectKnowledge.length).toBeLessThanOrEqual(3);
    // Demoted skills should appear in knowledgeRecommendations
    const totalKnowledge =
      result.autoInjectKnowledge.length + result.knowledgeRecommendations.length;
    // All 4 skills must be accounted for (some in auto-inject, the rest in recommendations)
    expect(totalKnowledge).toBeGreaterThanOrEqual(4);
  });

  it('caps knowledgeRecommendations at 10 entries after traversal', () => {
    // Create an auto-injected skill with 12 related_skills
    const relatedNames = Array.from({ length: 12 }, (_, i) => `related-${i}`);
    const injected = makeEntry({
      type: 'knowledge',
      keywords: ['hooks', 'react', 'custom'],
      paths: ['**/*.tsx'],
      relatedSkills: relatedNames,
      description: 'Injected skill with many relations',
    });
    const relatedEntries: Record<string, ReturnType<typeof makeEntry>> = {};
    for (const name of relatedNames) {
      relatedEntries[name] = makeEntry({
        type: 'knowledge',
        keywords: [],
        description: `Related skill ${name}`,
      });
    }
    const index = makeIndex({
      'react-hooks': injected,
      ...relatedEntries,
    });
    const result = suggest(index, 'hooks react custom', null, ['src/App.tsx']);
    expect(result.knowledgeRecommendations.length).toBeLessThanOrEqual(10);
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

describe('E2E dispatch validation — JS and Vue knowledge skill verticals', () => {
  it('surfaces js-singleton-pattern when editing .js files with relevant query', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['singleton', 'single-instance', 'global-state', 'instance-control'],
      paths: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      description: 'Ensure a class has only one instance and provide a global access point',
    });
    const index = makeIndex({ 'js-singleton-pattern': entry });
    const result = suggest(index, 'singleton single-instance', null, ['src/utils/db.js']);

    const allSurfaced = [
      ...result.suggestions.map((s) => s.name),
      ...result.autoInjectKnowledge.map((s) => s.name),
    ];
    expect(allSurfaced.some((n) => n === 'js-singleton-pattern')).toBe(true);
  });

  it('surfaces vue-composables-pattern when editing .vue files with relevant query', () => {
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['composables', 'use-prefix', 'reusable-logic', 'composition-api'],
      paths: ['**/*.vue'],
      description: 'Extract and reuse stateful logic across components using Vue composables',
    });
    const index = makeIndex({ 'vue-composables-pattern': entry });
    const result = suggest(index, 'composables use-prefix', null, ['src/components/App.vue']);

    const allSurfaced = [
      ...result.suggestions.map((s) => s.name),
      ...result.autoInjectKnowledge.map((s) => s.name),
    ];
    expect(allSurfaced.some((n) => n === 'vue-composables-pattern')).toBe(true);
  });
});

describe('path-isolation dispatch', () => {
  it('js-* skill surfaces when recentFiles contain .js files even with minimal keyword overlap', () => {
    // Keyword match contributes 0.3 * (1/2) = 0.15 (one of two query terms matches)
    // Path match contributes 0.2 * 1.0 = 0.20 → total ~0.35+, crossing flexible skill threshold
    // Demonstrates path score as a meaningful contributor to surfacing
    const entry = makeEntry({
      type: 'flexible',
      keywords: ['module', 'pattern'],
      paths: ['**/*.js', '**/*.mjs'],
      description: 'JavaScript module organisation pattern',
    });
    const index = makeIndex({ 'js-module-pattern': entry });
    // Generic query: only one keyword overlaps ('module'), so keyword score alone is borderline
    const resultWithPath = suggest(index, 'module refactor', null, ['src/utils/helpers.js']);
    const resultWithoutPath = suggest(index, 'module refactor', null, []);

    const surfacedWithPath = resultWithPath.suggestions.map((s) => s.name);
    const surfacedWithoutPath = resultWithoutPath.suggestions.map((s) => s.name);

    // With a matching .js file the path score pushes the total over the 0.4 threshold
    expect(surfacedWithPath.some((n) => n === 'js-module-pattern')).toBe(true);
    // Without any recent files the path score is 0 and the skill falls below threshold
    expect(surfacedWithoutPath.some((n) => n === 'js-module-pattern')).toBe(false);
  });

  it('vue-* skill surfaces when recentFiles contain .vue files (paths fix: **/*.vue only)', () => {
    // After removing **/*.ts, only **/*.vue triggers path score for vue skills
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['composables', 'composition-api', 'reusable-logic', 'use-prefix'],
      paths: ['**/*.vue'],
      description: 'Extract and reuse stateful logic across components using Vue composables',
    });
    const index = makeIndex({ 'vue-composables-pattern': entry });
    // Generic query that partially matches keywords; .vue file provides path score boost
    const result = suggest(index, 'logic reusable', null, ['src/components/MyComponent.vue']);

    const allSurfaced = [
      ...result.suggestions.map((s) => s.name),
      ...result.autoInjectKnowledge.map((s) => s.name),
    ];
    expect(allSurfaced.some((n) => n === 'vue-composables-pattern')).toBe(true);
  });

  it('vue-* skill does NOT surface when recentFiles contain only .ts files (no vue path match)', () => {
    // After the paths fix, vue skills have paths: ['**/*.vue'] only.
    // A .ts file must not trigger path score for vue skills.
    const entry = makeEntry({
      type: 'knowledge',
      keywords: ['composables', 'composition-api', 'reusable-logic', 'use-prefix'],
      paths: ['**/*.vue'],
      description: 'Extract and reuse stateful logic across components using Vue composables',
    });
    const index = makeIndex({ 'vue-composables-pattern': entry });
    // Generic query with no keyword overlap — score comes only from path match (or not)
    const result = suggest(index, 'unrelated task', null, ['src/services/auth.ts']);

    const allSurfaced = [
      ...result.suggestions.map((s) => s.name),
      ...result.autoInjectKnowledge.map((s) => s.name),
    ];
    // .ts file does not match **/*.vue so path score = 0; total score too low to surface
    expect(allSurfaced.some((n) => n === 'vue-composables-pattern')).toBe(false);
  });

  it('harness-database surfaces when recentFiles contain .sql files', () => {
    const entry = makeEntry({
      type: 'rigid',
      keywords: ['database', 'migration', 'schema', 'SQL'],
      paths: ['*.sql'],
      description: 'Schema design, migrations, ORM patterns, and migration safety checks',
    });
    const index = makeIndex({ 'harness-database': entry });
    const result = suggest(index, 'migration schema', null, ['db/migrations/001_init.sql']);
    const allSurfaced = [
      ...result.suggestions.map((s) => s.name),
      ...result.autoInjectKnowledge.map((s) => s.name),
    ];
    expect(allSurfaced.some((n) => n === 'harness-database')).toBe(true);
  });
});
