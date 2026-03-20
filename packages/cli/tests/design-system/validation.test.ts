// packages/cli/tests/design-system/validation.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SKILLS_CLAUDE = path.join(REPO_ROOT, 'agents/skills/claude-code');
const SKILLS_GEMINI = path.join(REPO_ROOT, 'agents/skills/gemini-cli');
const SHARED_KNOWLEDGE = path.join(REPO_ROOT, 'agents/skills/shared/design-knowledge');

function readSkill(platform: string, skillName: string): string {
  const skillDir = platform === 'claude-code' ? SKILLS_CLAUDE : SKILLS_GEMINI;
  return fs.readFileSync(path.join(skillDir, skillName, 'SKILL.md'), 'utf-8');
}

function skillExists(platform: string, skillName: string): boolean {
  const skillDir = platform === 'claude-code' ? SKILLS_CLAUDE : SKILLS_GEMINI;
  return (
    fs.existsSync(path.join(skillDir, skillName, 'SKILL.md')) &&
    fs.existsSync(path.join(skillDir, skillName, 'skill.yaml'))
  );
}

describe('Design System Skills — Phase 7 Validation', () => {
  // SC1: harness-design-system generates valid W3C DTCG tokens.json
  describe('SC1: harness-design-system W3C DTCG token generation', () => {
    const content = readSkill('claude-code', 'harness-design-system');

    it('instructs W3C DTCG format generation', () => {
      expect(content).toContain('W3C');
      expect(content).toContain('DTCG');
      expect(content).toContain('tokens.json');
    });

    it('specifies $value and $type token structure', () => {
      expect(content).toContain('$value');
      expect(content).toContain('$type');
    });

    it('covers color, typography, and spacing token groups', () => {
      expect(content.toLowerCase()).toContain('color');
      expect(content.toLowerCase()).toContain('typography');
      expect(content.toLowerCase()).toContain('spacing');
    });
  });

  // SC2: harness-accessibility detects WCAG AA contrast failures
  describe('SC2: harness-accessibility WCAG AA contrast detection', () => {
    const content = readSkill('claude-code', 'harness-accessibility');

    it('references WCAG AA compliance', () => {
      expect(content).toContain('WCAG');
      expect(content).toMatch(/WCAG\s+AA|WCAG.*Level\s+AA/i);
    });

    it('specifies contrast ratio threshold', () => {
      expect(content).toContain('4.5:1');
    });

    it('instructs detection of contrast failures', () => {
      expect(content.toLowerCase()).toContain('contrast');
      expect(content.toLowerCase()).toContain('violation');
    });
  });

  // SC3: harness-design produces DESIGN.md with required sections
  describe('SC3: harness-design DESIGN.md generation', () => {
    const content = readSkill('claude-code', 'harness-design');

    it('instructs DESIGN.md generation', () => {
      expect(content).toContain('DESIGN.md');
    });

    it('covers aesthetic direction section', () => {
      expect(content.toLowerCase()).toContain('aesthetic');
      expect(content.toLowerCase()).toContain('direction');
    });

    it('covers tone section', () => {
      expect(content.toLowerCase()).toContain('tone');
    });

    it('covers anti-patterns section', () => {
      expect(content.toLowerCase()).toContain('anti-pattern');
    });

    it('covers platform notes section', () => {
      expect(content.toLowerCase()).toContain('platform');
    });
  });

  // SC4: harness-design-web generates token-referencing components
  describe('SC4: harness-design-web token references (no hardcoded values)', () => {
    const content = readSkill('claude-code', 'harness-design-web');

    it('instructs referencing design tokens', () => {
      expect(content.toLowerCase()).toContain('token');
      expect(content).toContain('tokens.json');
    });

    it('prohibits hardcoded values', () => {
      expect(content.toLowerCase()).toContain('hardcoded');
    });

    it('covers web frameworks', () => {
      expect(content).toContain('Tailwind');
      expect(content).toMatch(/React|Vue|Svelte/);
    });
  });

  // SC5: harness-design-mobile generates platform-appropriate patterns
  describe('SC5: harness-design-mobile platform-appropriate patterns', () => {
    const content = readSkill('claude-code', 'harness-design-mobile');

    it('covers iOS Human Interface Guidelines', () => {
      expect(content).toMatch(/HIG|Human Interface Guidelines/);
    });

    it('covers Material Design', () => {
      expect(content).toMatch(/Material Design|Material 3/);
    });

    it('covers SwiftUI', () => {
      expect(content).toContain('SwiftUI');
    });

    it('covers Flutter', () => {
      expect(content).toContain('Flutter');
    });

    it('covers React Native', () => {
      expect(content).toContain('React Native');
    });

    it('covers Compose', () => {
      expect(content).toContain('Compose');
    });
  });

  // SC6: designStrictness: strict causes a11y violations to surface as error
  describe('SC6: designStrictness strict -> error', () => {
    const verifyContent = readSkill('claude-code', 'harness-verify');

    it('documents strict mode surfacing violations as error', () => {
      expect(verifyContent.toLowerCase()).toContain('strict');
      expect(verifyContent).toMatch(/strict.*error|error.*strict/is);
    });
  });

  // SC7: designStrictness: permissive downgrades to info
  describe('SC7: designStrictness permissive -> info', () => {
    const verifyContent = readSkill('claude-code', 'harness-verify');

    it('documents permissive mode downgrading to info', () => {
      expect(verifyContent.toLowerCase()).toContain('permissive');
      expect(verifyContent).toMatch(/permissive.*info|info.*permissive/is);
    });
  });

  // SC8: Token change triggers impact-analysis
  describe('SC8: token change -> impact-analysis', () => {
    const content = readSkill('claude-code', 'harness-impact-analysis');

    it('documents design token impact tracing', () => {
      expect(content).toContain('DesignToken');
      expect(content).toContain('USES_TOKEN');
    });

    it('references tokens.json changes', () => {
      expect(content).toContain('tokens.json');
    });
  });

  // SC9: enforce-architecture reports design violations
  describe('SC9: enforce-architecture design violations', () => {
    const content = readSkill('claude-code', 'enforce-architecture');

    it('documents DESIGN-001 through DESIGN-004 codes', () => {
      expect(content).toContain('DESIGN-001');
      expect(content).toContain('DESIGN-002');
      expect(content).toContain('DESIGN-003');
      expect(content).toContain('DESIGN-004');
    });

    it('documents token compliance checking', () => {
      expect(content.toLowerCase()).toContain('token');
      expect(content.toLowerCase()).toContain('hardcoded');
    });
  });

  // SC10: Industry knowledge YAML files for 8+ verticals
  describe('SC10: industry knowledge YAML files', () => {
    const industriesDir = path.join(SHARED_KNOWLEDGE, 'industries');
    const yamlFiles = fs.readdirSync(industriesDir).filter((f) => f.endsWith('.yaml'));

    it('has at least 8 industry vertical files', () => {
      expect(yamlFiles.length).toBeGreaterThanOrEqual(8);
    });

    for (const file of yamlFiles) {
      describe(`industry: ${file}`, () => {
        const content = YAML.parse(fs.readFileSync(path.join(industriesDir, file), 'utf-8'));

        it('has a name field', () => {
          expect(content.name).toBeDefined();
          expect(typeof content.name).toBe('string');
        });

        it('has a styles section', () => {
          expect(content.styles).toBeDefined();
        });

        it('has a palette section', () => {
          expect(content.palette).toBeDefined();
        });

        it('has a typography section', () => {
          expect(content.typography).toBeDefined();
        });
      });
    }
  });

  // SC11: All 5 skills pass harness validate and existing tests
  // (This is verified by running `pnpm test` — covered by Task 2)
  describe('SC11: skill schema and structure', () => {
    const DESIGN_SKILLS = [
      'harness-design-system',
      'harness-accessibility',
      'harness-design',
      'harness-design-web',
      'harness-design-mobile',
    ];

    for (const skill of DESIGN_SKILLS) {
      describe(`skill: ${skill}`, () => {
        it('has SKILL.md in claude-code', () => {
          expect(fs.existsSync(path.join(SKILLS_CLAUDE, skill, 'SKILL.md'))).toBe(true);
        });

        it('has skill.yaml in claude-code', () => {
          expect(fs.existsSync(path.join(SKILLS_CLAUDE, skill, 'skill.yaml'))).toBe(true);
        });

        it('skill.yaml is valid YAML with required fields', () => {
          const yamlContent = YAML.parse(
            fs.readFileSync(path.join(SKILLS_CLAUDE, skill, 'skill.yaml'), 'utf-8')
          );
          expect(yamlContent.name).toBe(skill);
          expect(yamlContent.description).toBeDefined();
          expect(yamlContent.triggers).toBeDefined();
          expect(Array.isArray(yamlContent.platforms)).toBe(true);
          expect(yamlContent.platforms).toContain('claude-code');
          expect(yamlContent.platforms).toContain('gemini-cli');
        });

        it('SKILL.md is substantive (>100 lines)', () => {
          const content = fs.readFileSync(path.join(SKILLS_CLAUDE, skill, 'SKILL.md'), 'utf-8');
          const lines = content.split('\n').length;
          expect(lines).toBeGreaterThan(100);
        });
      });
    }
  });

  // SC12: Platform parity
  describe('SC12: platform parity', () => {
    const DESIGN_SKILLS = [
      'harness-design-system',
      'harness-accessibility',
      'harness-design',
      'harness-design-web',
      'harness-design-mobile',
    ];

    for (const skill of DESIGN_SKILLS) {
      describe(`parity: ${skill}`, () => {
        it('exists in both claude-code and gemini-cli', () => {
          expect(skillExists('claude-code', skill)).toBe(true);
          expect(skillExists('gemini-cli', skill)).toBe(true);
        });

        it('SKILL.md content matches between platforms', () => {
          const claudeContent = readSkill('claude-code', skill);
          const geminiContent = readSkill('gemini-cli', skill);
          expect(claudeContent).toBe(geminiContent);
        });

        it('skill.yaml content matches between platforms', () => {
          const claudeYaml = fs.readFileSync(
            path.join(SKILLS_CLAUDE, skill, 'skill.yaml'),
            'utf-8'
          );
          const geminiYaml = fs.readFileSync(
            path.join(SKILLS_GEMINI, skill, 'skill.yaml'),
            'utf-8'
          );
          expect(claudeYaml).toBe(geminiYaml);
        });
      });
    }
  });

  // SC13: Graph ingestion produces correct nodes and edges
  // (Verified by existing DesignIngestor.test.ts — this test confirms tests exist)
  describe('SC13: graph ingestion tests exist', () => {
    it('DesignIngestor.test.ts exists', () => {
      expect(
        fs.existsSync(path.join(REPO_ROOT, 'packages/graph/tests/ingest/DesignIngestor.test.ts'))
      ).toBe(true);
    });

    it('DesignConstraintAdapter.test.ts exists', () => {
      expect(
        fs.existsSync(
          path.join(REPO_ROOT, 'packages/graph/tests/constraints/DesignConstraintAdapter.test.ts')
        )
      ).toBe(true);
    });

    it('DesignIngestor test covers DesignToken nodes', () => {
      const testContent = fs.readFileSync(
        path.join(REPO_ROOT, 'packages/graph/tests/ingest/DesignIngestor.test.ts'),
        'utf-8'
      );
      expect(testContent).toContain('design_token');
      expect(testContent).toContain('nodesAdded');
    });
  });

  // SC14: Anti-pattern detection covers key categories
  describe('SC14: anti-pattern detection coverage', () => {
    const antiPatternsDir = path.join(SHARED_KNOWLEDGE, 'anti-patterns');

    it('has color anti-patterns (hardcoded colors, contrast)', () => {
      const content = fs.readFileSync(path.join(antiPatternsDir, 'color.yaml'), 'utf-8');
      expect(content.toLowerCase()).toContain('hardcoded');
      expect(content.toLowerCase()).toContain('contrast');
    });

    it('has typography anti-patterns (generic fonts)', () => {
      const content = fs.readFileSync(path.join(antiPatternsDir, 'typography.yaml'), 'utf-8');
      expect(content.toLowerCase()).toMatch(/generic|system|default.*font/);
    });

    it('accessibility skill covers missing alt text detection', () => {
      const content = readSkill('claude-code', 'harness-accessibility');
      expect(content.toLowerCase()).toContain('alt');
    });

    it('DesignConstraintAdapter covers hardcoded color + font detection', () => {
      const testContent = fs.readFileSync(
        path.join(REPO_ROOT, 'packages/graph/tests/constraints/DesignConstraintAdapter.test.ts'),
        'utf-8'
      );
      expect(testContent).toContain('checkForHardcodedColors');
      expect(testContent).toContain('checkForHardcodedFonts');
    });
  });

  // SC15: Skills compose — design -> design-web produces consistent output
  describe('SC15: skill composition', () => {
    it('harness-design-web references tokens from harness-design-system', () => {
      const webContent = readSkill('claude-code', 'harness-design-web');
      expect(webContent).toContain('tokens.json');
      expect(webContent).toContain('design-system');
    });

    it('harness-design-web references intent from harness-design', () => {
      const webContent = readSkill('claude-code', 'harness-design-web');
      expect(webContent).toContain('DESIGN.md');
    });

    it('harness-design-mobile references tokens from harness-design-system', () => {
      const mobileContent = readSkill('claude-code', 'harness-design-mobile');
      expect(mobileContent).toContain('tokens.json');
    });

    it('harness-design depends on harness-design-system in skill.yaml', () => {
      const yamlContent = YAML.parse(
        fs.readFileSync(path.join(SKILLS_CLAUDE, 'harness-design', 'skill.yaml'), 'utf-8')
      );
      expect(yamlContent.depends_on).toContain('harness-design-system');
    });

    it('harness-design-web depends on harness-design-system in skill.yaml', () => {
      const yamlContent = YAML.parse(
        fs.readFileSync(path.join(SKILLS_CLAUDE, 'harness-design-web', 'skill.yaml'), 'utf-8')
      );
      expect(yamlContent.depends_on).toContain('harness-design-system');
    });
  });
});
