import { describe, it, expect } from 'vitest';
import { generateSkillsMd, parseSkillsMd } from '../../src/skill/skills-md-writer.js';
import type { ContentMatchResult } from '../../src/skill/content-matcher-types.js';

/**
 * skills-md-writer declares round-trip fidelity ("Generates markdown output and
 * parses it back for round-trip fidelity"). A match whose matchReasons array is
 * empty renders an empty Purpose cell; parseTableRow's
 * `.filter((c) => c.length > 0)` drops that INTERIOR empty cell along with the
 * two leading/trailing empties from `split('|')`, leaving 3 cells, which trips
 * the `cells.length < 4` guard and silently discards the row.
 *
 * Empty matchReasons is reachable from the real engine: buildMatchReasons()
 * returns [] when a skill matched on description term-overlap alone (no keyword
 * hit, no stack hit, no feature domain), which alone clears the consider tier.
 */
function makeResult(matchReasons: string[]): ContentMatchResult {
  return {
    matches: [
      {
        skillName: 'term-overlap-only',
        score: 0.42,
        tier: 'reference',
        matchReasons,
        category: 'patterns',
        when: 'During implementation',
      },
    ],
    signalsUsed: {
      specKeywords: [],
      specText: 'some spec body',
      stackSignals: [],
      featureDomain: [],
    },
    scanDuration: 1,
  };
}

describe('bugfleet: SKILLS.md round-trip drops reason-less rows', () => {
  it('round-trips a match that has no matchReasons', () => {
    const md = generateSkillsMd('Some Feature', makeResult([]), 1);

    // The row IS written to the markdown...
    expect(md).toContain('`term-overlap-only`');

    // ...but parsing it back loses it entirely.
    const parsed = parseSkillsMd(md);
    expect(parsed.map((m) => m.skillName)).toEqual(['term-overlap-only']);
  });

  it('control: the same match round-trips fine once it has a reason', () => {
    const md = generateSkillsMd('Some Feature', makeResult(['Keywords: layout']), 1);
    const parsed = parseSkillsMd(md);
    expect(parsed.map((m) => m.skillName)).toEqual(['term-overlap-only']);
  });
});
