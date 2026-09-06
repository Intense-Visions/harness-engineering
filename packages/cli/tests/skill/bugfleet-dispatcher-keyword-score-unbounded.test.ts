import { describe, it, expect } from 'vitest';
import { scoreSkill } from '../../src/skill/dispatcher.js';
import type { SkillIndexEntry } from '../../src/skill/index-builder.js';

/**
 * dispatcher.scoreSkill documents a composite whose six weights sum to exactly
 * 1.00 (0.30 + 0.15 + 0.10 + 0.15 + 0.10 + 0.20), and suggest() consumes the
 * result against ABSOLUTE thresholds (0.7 auto-inject knowledge, 0.4 recommend)
 * plus `Math.max(score, 1.0)` as the forced-inclusion ceiling. So the composite
 * is a 0-to-1 quantity.
 *
 * keywordScore is computed as
 *   matchedKeywords.length / queryTerms.length
 * where the numerator counts matching SKILL KEYWORDS but the denominator counts
 * QUERY TERMS. Every other component divides by queryTerms.length with a
 * numerator ALSO drawn from queryTerms, so only this one can exceed 1. A skill
 * with several keywords that all substring-match one query term therefore scores
 * above the ceiling.
 */
function makeEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  return {
    tier: 3,
    type: 'knowledge',
    description: 'A test skill',
    keywords: [],
    stackSignals: [],
    cognitiveMode: undefined,
    phases: [],
    paths: [],
    relatedSkills: [],
    source: 'bundled',
    addresses: [],
    dependsOn: [],
    triggers: ['manual'],
    ...overrides,
  };
}

describe('bugfleet: dispatcher.scoreSkill exceeds its documented 0-to-1 range', () => {
  it('keeps the composite score within the documented 0-to-1 range', () => {
    // Ordinary keyword list for a testing skill. Every entry either contains
    // "testing" or is contained by it, so all six match the single query term.
    const entry = makeEntry({
      keywords: [
        'test',
        'testing',
        'unit testing',
        'integration testing',
        'e2e testing',
        'testing framework',
      ],
    });

    const score = scoreSkill(entry, ['testing'], null, [], 'unrelated-skill');

    expect(score).toBeLessThanOrEqual(1);
  });
});
