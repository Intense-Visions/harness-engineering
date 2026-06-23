// agents/skills/tests/harness-strategy.test.ts
//
// Contract tests for the harness-strategy skill. The skill prose itself is
// executed by an agent (not by node), so behavioral correctness is
// human-judged in practice. Phase 2 of the strategic-anchor spec owns:
//   - the three pushback rules are *named and cited* in references/interview.md
//   - the 2-round cap is documented
//   - the anti-pattern fixtures exist for each rule
//   - the writer integration is documented in SKILL.md
//
// Generic structure, schema, and platform-parity coverage lives in sibling files
// (structure.test.ts, schema.test.ts, references.test.ts, platform-parity.test.ts).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ALLOWED_PLATFORMS } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

const SKILL_NAME = 'harness-strategy';

function skillFile(platform: string, file: string): string {
  return resolve(SKILLS_DIR, platform, SKILL_NAME, file);
}

describe('harness-strategy skill — Phase 2 contract', () => {
  describe('skill files exist in every supported platform', () => {
    for (const platform of ALLOWED_PLATFORMS) {
      it(`${platform}/${SKILL_NAME}/SKILL.md exists`, () => {
        expect(existsSync(skillFile(platform, 'SKILL.md'))).toBe(true);
      });
      it(`${platform}/${SKILL_NAME}/skill.yaml exists`, () => {
        expect(existsSync(skillFile(platform, 'skill.yaml'))).toBe(true);
      });
      it(`${platform}/${SKILL_NAME}/references/interview.md exists`, () => {
        expect(existsSync(skillFile(platform, 'references/interview.md'))).toBe(true);
      });
    }
  });

  describe('references/interview.md documents the three pushback rules', () => {
    const interview = readFileSync(skillFile('claude-code', 'references/interview.md'), 'utf-8');

    it('names "Fluff detection"', () => {
      expect(interview).toMatch(/Fluff detection/);
    });

    it('names "Goal-as-strategy"', () => {
      expect(interview).toMatch(/Goal-as-strategy/);
    });

    it('names "Feature-list-as-strategy"', () => {
      expect(interview).toMatch(/Feature-list-as-strategy/);
    });

    it('includes a repair script keyword for each rule', () => {
      // Each rule's repair script anchors on a specific keyword the agent
      // quotes when pushing back. Test these by name to keep prose tweaks
      // free while catching accidental rule deletion.
      expect(interview).toMatch(/concrete diagnosis/i);
      expect(interview).toMatch(/\bbet\b/);
      expect(interview).toMatch(/coherent action/i);
    });

    it('documents the 2-round cap explicitly', () => {
      expect(interview).toMatch(/2[ -]?[Rr]ound|two[ -]?round|AT MOST TWICE|at most twice/);
      expect(interview).toMatch(/cap/i);
    });

    it('documents separation from docs/roadmap.md', () => {
      expect(interview).toMatch(/docs\/roadmap\.md/);
      expect(interview).toMatch(/[Dd]ecision 1/);
    });

    it('includes anti-pattern fixtures for each rule', () => {
      expect(interview).toMatch(/Fluff detection fixture/);
      expect(interview).toMatch(/Goal-as-strategy fixture/);
      expect(interview).toMatch(/Feature-list-as-strategy fixture/);
    });
  });

  describe('SKILL.md documents the writer integration', () => {
    const skillMd = readFileSync(skillFile('claude-code', 'SKILL.md'), 'utf-8');

    it('references writeStrategyDoc as the sanctioned write path', () => {
      expect(skillMd).toMatch(/writeStrategyDoc/);
    });

    it('references @harness-engineering/core as the import source', () => {
      expect(skillMd).toMatch(/@harness-engineering\/core/);
    });

    it('documents the stdin-piped Node one-liner pattern', () => {
      // The pattern protects against shell injection from user-supplied
      // section bodies. SKILL.md must show the stdin route, not a shell-arg
      // route, so the agent doesn't paste user input into the command line.
      expect(skillMd).toMatch(/readFileSync\(0/);
      expect(skillMd).toMatch(/JSON\.parse/);
    });

    it('documents Phase 0 routing for present-but-invalid files', () => {
      expect(skillMd).toMatch(/present-but-invalid|present and invalid/i);
      expect(skillMd).toMatch(/STRATEGY\.md\.bak\.[<{]/);
    });

    it('documents the four downstream consumers in the handoff phase', () => {
      expect(skillMd).toMatch(/harness-brainstorming/);
      expect(skillMd).toMatch(/harness-ideate/);
      expect(skillMd).toMatch(/harness-roadmap-pilot/);
      expect(skillMd).toMatch(/BusinessKnowledgeIngestor/);
    });
  });

  describe('skill.yaml metadata', () => {
    const yamlPath = skillFile('claude-code', 'skill.yaml');
    const yaml = readFileSync(yamlPath, 'utf-8');

    it('declares type: rigid (configuration-interviewer)', () => {
      expect(yaml).toMatch(/type:\s*rigid/);
      expect(yaml).toMatch(/cognitive_mode:\s*configuration-interviewer/);
    });

    it('declares the four required platforms', () => {
      expect(yaml).toMatch(/claude-code/);
      expect(yaml).toMatch(/gemini-cli/);
      expect(yaml).toMatch(/cursor/);
      expect(yaml).toMatch(/codex/);
    });

    it('declares manual-only trigger (strategy is never auto-fired)', () => {
      expect(yaml).toMatch(/triggers:\s*\n\s*-\s*manual\s*\n/);
      // No other triggers allowed — strategy is human-owned.
      expect(yaml).not.toMatch(/-\s*on_/);
    });

    it('declares persistent state with STRATEGY.md and .bak files', () => {
      expect(yaml).toMatch(/persistent:\s*true/);
      expect(yaml).toMatch(/STRATEGY\.md\s*$/m);
      expect(yaml).toMatch(/STRATEGY\.md\.bak/);
    });
  });
});
