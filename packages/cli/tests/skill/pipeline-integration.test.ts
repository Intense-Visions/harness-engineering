import { describe, it, expect } from 'vitest';
import { extractSignals } from '../../src/skill/signal-extractor.js';
import { matchContent } from '../../src/skill/content-matcher.js';
import { generateSkillsMd, parseSkillsMd } from '../../src/skill/skills-md-writer.js';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder.js';

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
    ...overrides,
  };
}

function makeIndex(skills: Record<string, SkillIndexEntry>): SkillsIndex {
  return { version: 1, hash: 'test', generatedAt: '2026-01-01', skills };
}

describe('Pipeline Integration: spec -> signals -> match -> SKILLS.md', () => {
  const specText = `# Dashboard Redesign

**Keywords:** responsive, dark-mode, accessibility, dashboard, layout

## Overview
Build a responsive dashboard with dark mode support and accessibility compliance.
The dashboard uses a grid layout with responsive breakpoints and color theming.
Typography and contrast ratios must meet WCAG 2.1 AA standards.
`;

  const index = makeIndex({
    'design-responsive-strategy': makeEntry({
      type: 'knowledge',
      description: 'Responsive layout with breakpoints and grid systems',
      keywords: ['responsive', 'layout', 'breakpoint', 'grid', 'design'],
      stackSignals: ['react'],
      relatedSkills: ['css-responsive-design'],
    }),
    'css-dark-mode': makeEntry({
      type: 'knowledge',
      description: 'Dark mode theming and color-scheme switching',
      keywords: ['dark-mode', 'color', 'theme', 'css'],
    }),
    'a11y-color-contrast': makeEntry({
      type: 'knowledge',
      description: 'Verify color combinations meet WCAG contrast ratios',
      keywords: ['a11y', 'contrast', 'wcag', 'color', 'accessibility'],
    }),
    'css-responsive-design': makeEntry({
      type: 'knowledge',
      description: 'CSS media queries and responsive patterns',
      keywords: ['responsive', 'css', 'media-query'],
    }),
    'harness-security-scan': makeEntry({
      type: 'rigid',
      description: 'Lightweight security scan for code',
      keywords: ['security', 'scan', 'audit'],
    }),
  });

  it('extracts signals from spec text and project deps', () => {
    const signals = extractSignals(
      specText,
      { react: '^18.0.0', 'react-dom': '^18.0.0' },
      { typescript: '^5.0.0', vitest: '^1.0.0' }
    );

    expect(signals.specKeywords).toContain('responsive');
    expect(signals.specKeywords).toContain('dark-mode');
    expect(signals.stackSignals).toContain('react');
    expect(signals.stackSignals).toContain('typescript');
    expect(signals.featureDomain).toContain('design');
    expect(signals.featureDomain).toContain('a11y');
  });

  it('matches skills against extracted signals', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, { typescript: '^5.0.0' });
    const result = matchContent(index, signals);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.scanDuration).toBeGreaterThanOrEqual(0);

    const names = result.matches.map((m) => m.skillName);
    expect(names).toContain('design-responsive-strategy');
    expect(names).toContain('a11y-color-contrast');
  });

  it('generates SKILLS.md and parses it back (round-trip)', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);
    const md = generateSkillsMd('Dashboard Redesign', result, 5);

    expect(md).toContain('# Recommended Skills: Dashboard Redesign');
    expect(md).toContain('design-responsive-strategy');
    expect(md).toContain('When');

    const parsed = parseSkillsMd(md);
    expect(parsed.length).toBeGreaterThan(0);

    const originalNames = result.matches.map((m) => m.skillName);
    const parsedNames = parsed.map((m) => m.skillName);
    for (const name of parsedNames) {
      expect(originalNames).toContain(name);
    }
  });

  it('builds recommendedSkills handoff structure from match results', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);

    const recommendedSkills = {
      apply: result.matches.filter((m) => m.tier === 'apply').map((m) => m.skillName),
      reference: result.matches.filter((m) => m.tier === 'reference').map((m) => m.skillName),
      consider: result.matches.filter((m) => m.tier === 'consider').map((m) => m.skillName),
      skillsPath: 'docs/changes/dashboard-redesign/SKILLS.md',
    };

    expect(recommendedSkills).toHaveProperty('apply');
    expect(recommendedSkills).toHaveProperty('reference');
    expect(recommendedSkills).toHaveProperty('consider');
    expect(recommendedSkills).toHaveProperty('skillsPath');
    expect(Array.isArray(recommendedSkills.apply)).toBe(true);
    expect(Array.isArray(recommendedSkills.reference)).toBe(true);
  });

  it('all matches include when field with timing guidance', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);

    for (const match of result.matches) {
      expect(match.when).toBeDefined();
      expect(match.when.length).toBeGreaterThan(0);
    }

    // a11y skill should get "After styling"
    const a11yMatch = result.matches.find((m) => m.skillName === 'a11y-color-contrast');
    if (a11yMatch) {
      expect(a11yMatch.when).toBe('After styling');
    }
  });
});

describe('HandoffSchema with recommendedSkills', () => {
  it('validates handoff with recommendedSkills field', async () => {
    const { HandoffSchema } = await import('@harness-engineering/core');

    const handoff = {
      timestamp: new Date().toISOString(),
      fromSkill: 'harness-brainstorming',
      phase: 'VALIDATE',
      summary: 'Test spec approved',
      completed: [],
      pending: [],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: ['test'],
      recommendedSkills: {
        apply: ['design-responsive-strategy'],
        reference: ['a11y-color-contrast'],
        consider: ['perf-cumulative-layout-shift'],
        skillsPath: 'docs/changes/test/SKILLS.md',
      },
    };

    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedSkills).toBeDefined();
      expect(result.data.recommendedSkills?.apply).toEqual(['design-responsive-strategy']);
      expect(result.data.recommendedSkills?.skillsPath).toBe('docs/changes/test/SKILLS.md');
    }
  });

  it('validates handoff without recommendedSkills (backward compat)', async () => {
    const { HandoffSchema } = await import('@harness-engineering/core');

    const handoff = {
      timestamp: new Date().toISOString(),
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: 'Plan approved',
      contextKeywords: [],
    };

    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedSkills).toBeUndefined();
    }
  });
});
