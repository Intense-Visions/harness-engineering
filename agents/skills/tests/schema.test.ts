// agents/skills/tests/schema.test.ts
import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from './schema';

describe('SkillMetadataSchema', () => {
  it('validates a complete skill.yaml', () => {
    const valid = {
      name: 'validate-context-engineering',
      version: '1.0.0',
      description: 'Validate repository context engineering practices',
      platform: 'claude-code',
      triggers: ['manual', 'on_pr'],
      tools: ['Bash', 'Read'],
      cli_command: 'harness validate --json',
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid name format', () => {
    const invalid = {
      name: 'Invalid Name',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.error.issues.find(issue => issue.path.includes('name'));
      expect(nameError).toBeDefined();
      expect(nameError?.message).toContain('lowercase');
    }
  });

  it('rejects invalid platform', () => {
    const invalid = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'invalid-platform',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows optional fields', () => {
    const minimal = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depends_on).toEqual([]);
      expect(result.data.includes).toEqual([]);
    }
  });

  it('validates depends_on as array of strings', () => {
    const withDeps = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
      depends_on: ['other-skill'],
    };
    const result = SkillMetadataSchema.safeParse(withDeps);
    expect(result.success).toBe(true);
  });
});
