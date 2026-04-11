import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchSkillsDefinition,
  handleSearchSkills,
} from '../../../src/mcp/tools/search-skills.js';

// Mock dependencies
vi.mock('../../../src/skill/index-builder', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../../src/skill/stack-profile', () => ({
  loadOrGenerateProfile: vi.fn(),
}));

vi.mock('../../../src/skill/health-snapshot', () => ({
  loadCachedSnapshot: vi.fn(),
  isSnapshotFresh: vi.fn(),
}));

vi.mock('../../../src/skill/dispatcher', () => ({
  scoreSkill: vi.fn(),
}));

vi.mock('../../../src/config/loader', () => ({
  resolveConfig: vi.fn(() => ({ ok: true, value: {} })),
}));

import { loadOrRebuildIndex } from '../../../src/skill/index-builder';
import { loadOrGenerateProfile } from '../../../src/skill/stack-profile';
import { loadCachedSnapshot, isSnapshotFresh } from '../../../src/skill/health-snapshot';
import { scoreSkill } from '../../../src/skill/dispatcher';

function makeSkillEntry(overrides: Record<string, unknown> = {}) {
  return {
    tier: 1,
    description: 'A skill',
    keywords: ['test'],
    stackSignals: [],
    cognitiveMode: undefined,
    phases: ['plan'],
    source: 'bundled' as const,
    addresses: [],
    dependsOn: [],
    ...overrides,
  };
}

function makeIndex(skills: Record<string, ReturnType<typeof makeSkillEntry>>) {
  return {
    version: 1,
    hash: 'test',
    generatedAt: '2026-04-11',
    skills,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  (loadOrGenerateProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
  (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(null);
  (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(false);
});

// ── Definition tests ──────────────────────────────────────────────

describe('search_skills definition', () => {
  it('has correct name', () => {
    expect(searchSkillsDefinition.name).toBe('search_skills');
  });

  it('has query, path, and platform properties', () => {
    const props = searchSkillsDefinition.inputSchema.properties;
    expect(props).toHaveProperty('query');
    expect(props).toHaveProperty('path');
    expect(props).toHaveProperty('platform');
  });

  it('requires query parameter', () => {
    expect(searchSkillsDefinition.inputSchema.required).toEqual(['query']);
  });
});

// ── MIN_SCORE filtering tests ─────────────────────────────────────

describe('handleSearchSkills — MIN_SCORE filtering', () => {
  it('filters out results with score < 0.25', async () => {
    const index = makeIndex({
      'low-scorer': makeSkillEntry({ description: 'Low scoring skill' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValue(0.1);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(0);
  });

  it('includes results with score >= 0.25', async () => {
    const index = makeIndex({
      'high-scorer': makeSkillEntry({ description: 'High scoring skill' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValue(0.5);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].name).toBe('high-scorer');
  });

  it('includes result at exactly 0.25 boundary', async () => {
    const index = makeIndex({
      'boundary-skill': makeSkillEntry({ description: 'Boundary skill' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValue(0.25);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(1);
  });

  it('filters mixed results — keeps only those scoring >= 0.25', async () => {
    const index = makeIndex({
      'skill-a': makeSkillEntry({ description: 'Skill A' }),
      'skill-b': makeSkillEntry({ description: 'Skill B' }),
      'skill-c': makeSkillEntry({ description: 'Skill C' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.3);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(2);
    const names = parsed.results.map((r: { name: string }) => r.name);
    expect(names).not.toContain('skill-b');
  });
});

// ── Empty query returns all skills ────────────────────────────────

describe('handleSearchSkills — empty query', () => {
  it('returns all skills regardless of score when query produces no terms', async () => {
    const index = makeIndex({
      'low-skill': makeSkillEntry({ description: 'Low' }),
      'zero-skill': makeSkillEntry({ description: 'Zero' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValueOnce(0.05).mockReturnValueOnce(0.0);

    // Empty string produces no query terms (all tokens <= 2 chars are filtered)
    const result = await handleSearchSkills({ query: '', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(2);
  });

  it('returns all skills when query has only short tokens', async () => {
    const index = makeIndex({
      'skill-x': makeSkillEntry({ description: 'X' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValue(0.01);

    // "ab cd" — both tokens are <= 2 chars, so queryTerms is empty
    const result = await handleSearchSkills({ query: 'ab cd', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(1);
  });
});

// ── Sorting tests ─────────────────────────────────────────────────

describe('handleSearchSkills — sorting', () => {
  it('returns results sorted by score descending', async () => {
    const index = makeIndex({
      'skill-low': makeSkillEntry({ description: 'Low' }),
      'skill-mid': makeSkillEntry({ description: 'Mid' }),
      'skill-high': makeSkillEntry({ description: 'High' }),
    });
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    (scoreSkill as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.9);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0].score).toBeGreaterThanOrEqual(parsed.results[1].score);
    expect(parsed.results[1].score).toBeGreaterThanOrEqual(parsed.results[2].score);
  });
});

// ── Top 5 limit tests ────────────────────────────────────────────

describe('handleSearchSkills — result limit', () => {
  it('returns at most 5 results', async () => {
    const skills: Record<string, ReturnType<typeof makeSkillEntry>> = {};
    for (let i = 0; i < 8; i++) {
      skills[`skill-${i}`] = makeSkillEntry({ description: `Skill ${i}` });
    }
    const index = makeIndex(skills);
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(index);
    // All score above threshold
    (scoreSkill as ReturnType<typeof vi.fn>).mockReturnValue(0.5);

    const result = await handleSearchSkills({ query: 'testing', path: '/tmp/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(5);
  });
});
