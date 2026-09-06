import { describe, it, expect } from 'vitest';
import { computeDomainMatch, matchContent } from '../../src/skill/content-matcher.js';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder.js';
import type { ContentSignals } from '../../src/skill/content-matcher-types.js';

/**
 * content-matcher.computeDomainMatch tests skill keywords against
 * DOMAIN_KEYWORD_MAP entries with an unanchored two-way substring test:
 *   kw.includes(dk) || dk.includes(kw)
 * The `design` domain lists the two-letter marker 'ui', so ANY skill keyword
 * that happens to contain the letters "ui" -- 'build', 'guide', 'quick-start' --
 * is scored a full 1.0 domain match against a design spec.
 *
 * The domain component carries weight 0.15 and TIER_THRESHOLDS.consider is 0.15,
 * so this cross-talk alone promotes a wholly unrelated skill into the dispatch
 * result at tier 'consider'.
 */
function makeEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  return {
    tier: 3,
    type: 'flexible',
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

function makeSignals(overrides: Partial<ContentSignals> = {}): ContentSignals {
  return {
    specKeywords: [],
    specText: '',
    stackSignals: [],
    featureDomain: [],
    ...overrides,
  };
}

describe('bugfleet: computeDomainMatch cross-talks on unanchored substrings', () => {
  it('does not treat the keyword "build" as a design-domain match', () => {
    const entry = makeEntry({ keywords: ['build'] });
    expect(computeDomainMatch(entry, ['design'])).toBe(0);
  });

  it('does not dispatch a build skill for a design spec on that cross-talk alone', () => {
    const index: SkillsIndex = {
      version: 1,
      hash: 'test',
      generatedAt: '2026-01-01',
      skills: { 'build-tooling': makeEntry({ keywords: ['build'] }) },
    };

    const result = matchContent(index, makeSignals({ featureDomain: ['design'] }));

    expect(result.matches.map((m) => m.skillName)).toEqual([]);
  });
});
