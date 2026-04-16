import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { validateSkillEntry, createValidateCommand } from '../../src/commands/skill/validate';

describe('skill validate command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-validate-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const validFlexibleYaml = `name: test-skill
version: "1.0.0"
description: A test skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
`;

  const validKnowledgeYaml = `name: knowledge-skill
version: "1.0.0"
description: Knowledge skill
triggers: [manual]
platforms: [claude-code]
tools: []
type: knowledge
`;

  const validRigidYaml = `name: rigid-skill
version: "1.0.0"
description: Rigid skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: rigid
`;

  function writeSkill(name: string, yaml: string, md?: string): void {
    const skillDir = path.join(tempDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), yaml);
    if (md !== undefined) {
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md);
    }
  }

  describe('validateSkillEntry', () => {
    it('returns false and adds error when skill.yaml is missing', () => {
      const skillDir = path.join(tempDir, 'no-yaml');
      fs.mkdirSync(skillDir, { recursive: true });

      const errors: string[] = [];
      const result = validateSkillEntry('no-yaml', tempDir, errors);
      expect(result).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing skill.yaml');
    });

    it('returns false and adds error when skill.yaml fails schema validation', () => {
      const skillDir = path.join(tempDir, 'bad-schema');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'name: test\n# missing required fields');

      const errors: string[] = [];
      const result = validateSkillEntry('bad-schema', tempDir, errors);
      expect(result).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('returns true with no errors for valid flexible skill with proper SKILL.md', () => {
      const md = `# Test Skill
## When to Use
Use this skill when testing.
## Process
1. Do things.
## Harness Integration
Works with harness.
## Success Criteria
All tests pass.
## Examples
Example 1.
## Rationalizations to Reject
Do not skip tests.
`;
      writeSkill('valid-flex', validFlexibleYaml, md);

      const errors: string[] = [];
      const result = validateSkillEntry('valid-flex', tempDir, errors);
      expect(result).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('adds error when SKILL.md is missing', () => {
      writeSkill('no-md', validFlexibleYaml);
      // No SKILL.md

      const errors: string[] = [];
      const result = validateSkillEntry('no-md', tempDir, errors);
      expect(result).toBe(true); // schema validation passes
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing SKILL.md');
    });

    it('adds error when SKILL.md does not start with h1', () => {
      writeSkill(
        'no-h1',
        validFlexibleYaml,
        'No heading here\n## When to Use\n## Process\n## Harness Integration\n## Success Criteria\n## Examples\n## Rationalizations to Reject\n'
      );

      const errors: string[] = [];
      validateSkillEntry('no-h1', tempDir, errors);
      expect(errors.some((e) => e.includes('h1 heading'))).toBe(true);
    });

    it('adds errors for missing behavioral sections in flexible skill', () => {
      writeSkill('missing-sections', validFlexibleYaml, '# Skill\nSome content.');

      const errors: string[] = [];
      validateSkillEntry('missing-sections', tempDir, errors);
      expect(errors.some((e) => e.includes('## When to Use'))).toBe(true);
      expect(errors.some((e) => e.includes('## Process'))).toBe(true);
      expect(errors.some((e) => e.includes('## Harness Integration'))).toBe(true);
      expect(errors.some((e) => e.includes('## Success Criteria'))).toBe(true);
    });

    it('validates knowledge skill requires ## Instructions section', () => {
      writeSkill('knowledge-no-inst', validKnowledgeYaml, '# Knowledge\nSome content.');

      const errors: string[] = [];
      validateSkillEntry('knowledge-no-inst', tempDir, errors);
      expect(errors.some((e) => e.includes('## Instructions'))).toBe(true);
    });

    it('passes knowledge skill validation with ## Instructions section', () => {
      writeSkill('knowledge-ok', validKnowledgeYaml, '# Knowledge\n## Instructions\nDo stuff.');

      const errors: string[] = [];
      validateSkillEntry('knowledge-ok', tempDir, errors);
      expect(errors).toHaveLength(0);
    });

    it('validates rigid skill requires ## Gates and ## Escalation', () => {
      const md = `# Rigid Skill
## When to Use
testing
## Process
do stuff
## Harness Integration
yes
## Success Criteria
done
## Examples
example
## Rationalizations to Reject
none
`;
      writeSkill('rigid-no-gates', validRigidYaml, md);

      const errors: string[] = [];
      validateSkillEntry('rigid-no-gates', tempDir, errors);
      expect(errors.some((e) => e.includes('## Gates'))).toBe(true);
      expect(errors.some((e) => e.includes('## Escalation'))).toBe(true);
    });

    it('passes rigid skill with all sections', () => {
      const md = `# Rigid Skill
## When to Use
testing
## Process
do stuff
## Harness Integration
yes
## Success Criteria
done
## Examples
example
## Rationalizations to Reject
none
## Gates
gate 1
## Escalation
escalate here
`;
      writeSkill('rigid-ok', validRigidYaml, md);

      const errors: string[] = [];
      validateSkillEntry('rigid-ok', tempDir, errors);
      expect(errors).toHaveLength(0);
    });

    it('handles YAML parse error gracefully', () => {
      const skillDir = path.join(tempDir, 'bad-yaml');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), '{{{{invalid yaml');

      const errors: string[] = [];
      const result = validateSkillEntry('bad-yaml', tempDir, errors);
      expect(result).toBe(false);
      expect(errors.some((e) => e.includes('parse error'))).toBe(true);
    });
  });

  describe('createValidateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createValidateCommand();
      expect(cmd.name()).toBe('validate');
    });

    it('has correct description', () => {
      const cmd = createValidateCommand();
      expect(cmd.description()).toContain('skill.yaml');
    });
  });
});
