import { describe, it, expect } from 'vitest';
import {
  computeKeywordOverlap,
  computeStackMatch,
  computeTermOverlap,
  computeDomainMatch,
  scoreSkillByContent,
  classifyTier,
  inferWhen,
  matchContent,
} from '../../src/skill/content-matcher.js';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder.js';
import type { ContentSignals } from '../../src/skill/content-matcher-types.js';
import { extractSignals } from '../../src/skill/signal-extractor.js';
import { generateSkillsMd, parseSkillsMd } from '../../src/skill/skills-md-writer.js';

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
    ...overrides,
  };
}

function makeIndex(skills: Record<string, SkillIndexEntry>): SkillsIndex {
  return { version: 1, hash: 'abc', generatedAt: '2025-01-01', skills };
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

// ---------------------------------------------------------------------------
// computeKeywordOverlap
// ---------------------------------------------------------------------------

describe('computeKeywordOverlap', () => {
  it('returns 1.0 for perfect overlap', () => {
    const score = computeKeywordOverlap(['auth', 'session'], ['auth', 'session']);
    expect(score).toBe(1.0);
  });

  it('returns 0 when no overlap', () => {
    const score = computeKeywordOverlap(['database', 'sql'], ['auth', 'session']);
    expect(score).toBe(0);
  });

  it('returns partial overlap ratio', () => {
    const score = computeKeywordOverlap(['auth', 'database'], ['auth', 'session']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('matches with stemming (responsive matches responsive-strategy)', () => {
    const score = computeKeywordOverlap(['responsive-strategy'], ['responsive']);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when both arrays are empty', () => {
    expect(computeKeywordOverlap([], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeStackMatch
// ---------------------------------------------------------------------------

describe('computeStackMatch', () => {
  it('returns 1.0 when all skill signals match', () => {
    expect(computeStackMatch(['react', 'typescript'], ['react', 'typescript', 'next'])).toBe(1.0);
  });

  it('returns 0 when no signals match', () => {
    expect(computeStackMatch(['vue', 'nuxt'], ['react', 'typescript'])).toBe(0);
  });

  it('returns partial match ratio', () => {
    const score = computeStackMatch(['react', 'vue'], ['react', 'typescript']);
    expect(score).toBe(0.5);
  });

  it('returns 0 when skill has no stack signals', () => {
    expect(computeStackMatch([], ['react'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeTermOverlap
// ---------------------------------------------------------------------------

describe('computeTermOverlap', () => {
  it('returns high score when description terms appear in spec', () => {
    const score = computeTermOverlap(
      'Responsive layout design with breakpoints',
      'Build a responsive layout with custom breakpoints and grid system'
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns 0 when no terms overlap', () => {
    const score = computeTermOverlap('Database migration tool', 'CSS animation framework');
    expect(score).toBe(0);
  });

  it('returns 0 for empty description', () => {
    expect(computeTermOverlap('', 'some spec text')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeDomainMatch
// ---------------------------------------------------------------------------

describe('computeDomainMatch', () => {
  it('returns 1.0 when skill keywords match a feature domain', () => {
    const entry = makeEntry({ keywords: ['authentication', 'oauth', 'session'] });
    expect(computeDomainMatch(entry, ['auth'])).toBe(1.0);
  });

  it('returns 0 when no domain match', () => {
    const entry = makeEntry({ keywords: ['database', 'sql'] });
    expect(computeDomainMatch(entry, ['design'])).toBe(0);
  });

  it('returns 0 for empty domains', () => {
    const entry = makeEntry({ keywords: ['auth'] });
    expect(computeDomainMatch(entry, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyTier
// ---------------------------------------------------------------------------

describe('classifyTier', () => {
  it('classifies >= 0.6 as apply', () => {
    expect(classifyTier(0.6)).toBe('apply');
    expect(classifyTier(0.85)).toBe('apply');
  });

  it('classifies 0.35-0.59 as reference', () => {
    expect(classifyTier(0.35)).toBe('reference');
    expect(classifyTier(0.5)).toBe('reference');
    expect(classifyTier(0.59)).toBe('reference');
  });

  it('classifies 0.15-0.34 as consider', () => {
    expect(classifyTier(0.15)).toBe('consider');
    expect(classifyTier(0.25)).toBe('consider');
    expect(classifyTier(0.34)).toBe('consider');
  });

  it('returns null for < 0.15 (excluded)', () => {
    expect(classifyTier(0.14)).toBeNull();
    expect(classifyTier(0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inferWhen
// ---------------------------------------------------------------------------

describe('inferWhen', () => {
  it('returns "End of phase" for scan/audit skills', () => {
    expect(inferWhen('harness-security-scan', makeEntry({}))).toBe('End of phase');
    expect(inferWhen('harness-i18n', makeEntry({}))).toBe('End of phase');
  });

  it('returns "Testing" for test skills', () => {
    expect(inferWhen('test-component-react', makeEntry({ keywords: ['test', 'component'] }))).toBe(
      'Testing'
    );
  });

  it('returns "After styling" for a11y/contrast skills', () => {
    expect(inferWhen('a11y-color-contrast', makeEntry({ keywords: ['contrast', 'wcag'] }))).toBe(
      'After styling'
    );
  });

  it('returns "During styling" for CSS/tailwind skills', () => {
    expect(inferWhen('css-tailwind-pattern', makeEntry({ keywords: ['css', 'tailwind'] }))).toBe(
      'During styling'
    );
  });

  it('returns "Layout review" for alignment/spacing skills', () => {
    expect(inferWhen('design-alignment', makeEntry({ keywords: ['alignment', 'visual'] }))).toBe(
      'Layout review'
    );
  });

  it('returns "During polish" for motion/animation skills', () => {
    expect(
      inferWhen('design-motion-principles', makeEntry({ keywords: ['motion', 'animation'] }))
    ).toBe('During polish');
  });

  it('returns "Architecture decisions" for pattern skills', () => {
    expect(inferWhen('gof-strategy-pattern', makeEntry({}))).toBe('Architecture decisions');
  });

  it('returns "During implementation" as default', () => {
    expect(inferWhen('some-random-skill', makeEntry({ keywords: ['random'] }))).toBe(
      'During implementation'
    );
  });
});

// ---------------------------------------------------------------------------
// scoreSkillByContent
// ---------------------------------------------------------------------------

describe('scoreSkillByContent', () => {
  it('returns 0.35 for perfect keyword match only', () => {
    const entry = makeEntry({ keywords: ['auth', 'session'] });
    const signals = makeSignals({ specKeywords: ['auth', 'session'] });
    const score = scoreSkillByContent(entry, signals);
    expect(score).toBeCloseTo(0.35, 1);
  });

  it('returns 0 when nothing matches', () => {
    const entry = makeEntry({ keywords: ['database'], stackSignals: ['vue'] });
    const signals = makeSignals({
      specKeywords: ['auth'],
      stackSignals: ['react'],
      specText: 'Nothing about databases.',
      featureDomain: ['security'],
    });
    const score = scoreSkillByContent(entry, signals);
    expect(score).toBe(0);
  });

  it('combines multiple signal dimensions', () => {
    const entry = makeEntry({
      keywords: ['auth', 'session'],
      stackSignals: ['react'],
      description: 'Authentication with OAuth session management',
    });
    const signals = makeSignals({
      specKeywords: ['auth', 'session'],
      stackSignals: ['react', 'typescript'],
      specText: 'Build authentication with OAuth session management',
      featureDomain: ['auth'],
    });
    const score = scoreSkillByContent(entry, signals);
    expect(score).toBeGreaterThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// matchContent
// ---------------------------------------------------------------------------

describe('matchContent', () => {
  it('returns matches sorted by score descending', () => {
    const index = makeIndex({
      'skill-high': makeEntry({
        keywords: ['auth', 'session', 'oauth'],
        description: 'Authentication and session management',
      }),
      'skill-low': makeEntry({
        keywords: ['database'],
        description: 'Database queries',
      }),
    });
    const signals = makeSignals({
      specKeywords: ['auth', 'session', 'oauth'],
      specText: 'Authentication and session management system.',
      featureDomain: ['auth'],
    });
    const result = matchContent(index, signals);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    if (result.matches.length > 1) {
      expect(result.matches[0]!.score).toBeGreaterThanOrEqual(result.matches[1]!.score);
    }
  });

  it('excludes skills scoring below 0.15', () => {
    const index = makeIndex({
      'unrelated-skill': makeEntry({
        keywords: ['completely', 'different'],
        description: 'Nothing related at all',
        stackSignals: ['angular'],
      }),
    });
    const signals = makeSignals({
      specKeywords: ['auth'],
      specText: 'Authentication system.',
      stackSignals: ['react'],
    });
    const result = matchContent(index, signals);
    expect(result.matches.length).toBe(0);
  });

  it('classifies tiers correctly', () => {
    const index = makeIndex({
      'exact-match': makeEntry({
        keywords: ['auth', 'session', 'oauth'],
        stackSignals: ['react'],
        description: 'OAuth authentication with session tokens',
      }),
    });
    const signals = makeSignals({
      specKeywords: ['auth', 'session', 'oauth'],
      stackSignals: ['react'],
      specText: 'OAuth authentication with session tokens for React app.',
      featureDomain: ['auth'],
    });
    const result = matchContent(index, signals);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0]!.tier).toBe('apply');
  });

  it('records scanDuration', () => {
    const result = matchContent(makeIndex({}), makeSignals());
    expect(result.scanDuration).toBeGreaterThanOrEqual(0);
  });

  it('includes signalsUsed in result', () => {
    const signals = makeSignals({ specKeywords: ['auth'] });
    const result = matchContent(makeIndex({}), signals);
    expect(result.signalsUsed).toBe(signals);
  });

  it('expands related skills for matches scoring >= 0.35', () => {
    const index = makeIndex({
      'parent-skill': makeEntry({
        keywords: ['auth', 'session', 'oauth'],
        description: 'OAuth authentication',
        relatedSkills: ['expanded-skill'],
      }),
      'expanded-skill': makeEntry({
        // Keywords and description completely unrelated to spec — only reachable via expansion
        keywords: ['rate-limit', 'throttle'],
        description: 'Request throttling and rate limiting',
      }),
    });
    const signals = makeSignals({
      specKeywords: ['auth', 'session', 'oauth'],
      specText: 'OAuth authentication with sessions.',
      featureDomain: ['auth'],
    });
    const result = matchContent(index, signals);
    const expandedMatch = result.matches.find((m) => m.skillName === 'expanded-skill');
    expect(expandedMatch).toBeDefined();
    expect(expandedMatch!.matchReasons.some((r) => r.includes('Related to'))).toBe(true);
  });

  it('does not re-add already-matched skills via expansion', () => {
    const index = makeIndex({
      'skill-a': makeEntry({
        keywords: ['auth', 'session'],
        description: 'Auth system',
        relatedSkills: ['skill-b'],
      }),
      'skill-b': makeEntry({
        keywords: ['auth', 'token'],
        description: 'Token auth',
        relatedSkills: ['skill-a'],
      }),
    });
    const signals = makeSignals({
      specKeywords: ['auth', 'session', 'token'],
      specText: 'Authentication with tokens and sessions.',
      featureDomain: ['auth'],
    });
    const result = matchContent(index, signals);
    const names = result.matches.map((m) => m.skillName);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('populates when field on all matches', () => {
    const index = makeIndex({
      'a11y-color-contrast': makeEntry({
        keywords: ['a11y', 'contrast', 'wcag', 'color'],
        description: 'Color contrast checks',
      }),
    });
    const signals = makeSignals({
      specKeywords: ['a11y', 'contrast', 'wcag', 'color'],
      specText: 'Color contrast accessibility validation.',
      featureDomain: ['a11y'],
    });
    const result = matchContent(index, signals);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0]!.when).toBe('After styling');
  });
});

// ---------------------------------------------------------------------------
// Integration: end-to-end signal extraction -> matching -> SKILLS.md
// ---------------------------------------------------------------------------

describe('end-to-end: signals -> match -> SKILLS.md -> parse', () => {
  it('produces correct tiered output from spec text', () => {
    const index = makeIndex({
      'design-responsive-strategy': makeEntry({
        keywords: ['responsive', 'layout', 'breakpoints', 'design'],
        stackSignals: ['react'],
        description: 'Responsive layout design strategy with breakpoints and grid systems',
        relatedSkills: ['css-container-queries'],
      }),
      'design-dark-mode': makeEntry({
        keywords: ['dark-mode', 'theming', 'color-scheme', 'design'],
        stackSignals: ['react'],
        description: 'Dark mode implementation with theme switching',
        relatedSkills: ['a11y-color-contrast'],
      }),
      'a11y-color-contrast': makeEntry({
        keywords: ['a11y', 'accessibility', 'contrast', 'wcag'],
        description: 'Color contrast accessibility validation',
        type: 'knowledge',
      }),
      'css-container-queries': makeEntry({
        keywords: ['css', 'container', 'queries', 'responsive'],
        description: 'CSS container queries for component-level responsiveness',
        type: 'knowledge',
      }),
      'unrelated-database-skill': makeEntry({
        keywords: ['database', 'sql', 'migration'],
        stackSignals: ['prisma'],
        description: 'Database migration tooling',
      }),
    });

    const specText = `# Responsive Dashboard Redesign

**Keywords:** responsive, dark-mode, layout, design, breakpoints

## Overview
Build a responsive dashboard with dark mode support, custom breakpoints, and accessible color contrast.`;

    const signals = extractSignals(specText, { react: '^18.0.0' }, { typescript: '^5.0.0' });
    const result = matchContent(index, signals);

    const applySkills = result.matches.filter((m) => m.tier === 'apply');
    expect(applySkills.length).toBeGreaterThanOrEqual(1);
    expect(applySkills.some((m) => m.skillName === 'design-responsive-strategy')).toBe(true);

    // Related-skills expansion should bring in at least one related skill
    const allNames = result.matches.map((m) => m.skillName);
    const hasRelatedExpansion =
      allNames.includes('a11y-color-contrast') || allNames.includes('css-container-queries');
    expect(hasRelatedExpansion).toBe(true);

    // Unrelated skill should be excluded or very low
    const dbSkill = result.matches.find((m) => m.skillName === 'unrelated-database-skill');
    if (dbSkill) {
      expect(dbSkill.tier).toBe('consider');
    }

    // Generate and parse SKILLS.md
    const md = generateSkillsMd('Responsive Dashboard Redesign', result, 5);
    expect(md).toContain('# Recommended Skills: Responsive Dashboard Redesign');
    expect(md).toContain('When');

    const parsed = parseSkillsMd(md);
    expect(parsed.length).toBe(result.matches.length);
    expect(parsed[0]!.skillName).toBe(result.matches[0]!.skillName);

    // Verify when field survives round-trip
    for (let i = 0; i < parsed.length; i++) {
      expect(parsed[i]!.when).toBe(result.matches[i]!.when);
    }
  });
});
