// agents/skills/tests/schema.test.ts
import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from './schema';

describe('SkillMetadataSchema', () => {
  const validSkill = {
    name: 'harness-tdd',
    version: '1.0.0',
    description: 'Test-driven development integrated with harness validation',
    triggers: ['manual', 'on_new_feature', 'on_bug_fix'],
    platforms: ['claude-code', 'gemini-cli'],
    tools: ['Bash', 'Read', 'Write', 'Edit'],
    type: 'rigid',
  };

  it('validates a complete skill.yaml', () => {
    const result = SkillMetadataSchema.safeParse(validSkill);
    expect(result.success).toBe(true);
  });

  it('validates with all optional fields', () => {
    const full = {
      ...validSkill,
      cli: {
        command: 'harness skill run harness-tdd',
        args: [{ name: 'path', description: 'Project root', required: false }],
      },
      mcp: { tool: 'run_skill', input: { skill: 'harness-tdd', path: 'string' } },
      phases: [
        { name: 'red', description: 'Write failing test' },
        { name: 'green', description: 'Implement minimal code' },
      ],
      state: { persistent: true, files: ['.harness/state.json'] },
      depends_on: ['harness-verification'],
    };
    const result = SkillMetadataSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = SkillMetadataSchema.parse(validSkill);
    expect(result.state).toEqual({ persistent: false, files: [] });
    expect(result.depends_on).toEqual([]);
  });

  it('rejects invalid name format', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, name: 'Invalid Name' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, platforms: ['invalid'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trigger', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, triggers: ['on_deploy'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, type: 'optional' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid version format', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, version: '1' });
    expect(result.success).toBe(false);
  });

  it('validates phase with required field', () => {
    const withPhases = {
      ...validSkill,
      phases: [
        { name: 'red', description: 'Write failing test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    };
    const result = SkillMetadataSchema.safeParse(withPhases);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases![0].required).toBe(true);
      expect(result.data.phases![1].required).toBe(false);
    }
  });

  it('defaults required to true for phases', () => {
    const withPhases = {
      ...validSkill,
      phases: [{ name: 'red', description: 'Write failing test' }],
    };
    const result = SkillMetadataSchema.parse(withPhases);
    expect(result.phases![0].required).toBe(true);
  });
});
