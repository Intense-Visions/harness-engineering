import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from '../../src/skill/schema';

const validBase = {
  name: 'test-skill',
  version: '1.0.0',
  description: 'A test skill',
  triggers: ['manual'],
  platforms: ['claude-code'],
  tools: ['Read'],
  type: 'rigid' as const,
};

describe('SkillMetadataSchema', () => {
  it('accepts valid skill without repository', () => {
    const result = SkillMetadataSchema.parse(validBase);
    expect(result.name).toBe('test-skill');
    expect(result.repository).toBeUndefined();
  });

  it('accepts valid skill with repository URL', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      repository: 'https://github.com/user/my-skill',
    });
    expect(result.repository).toBe('https://github.com/user/my-skill');
  });

  it('rejects repository field with non-string value', () => {
    expect(() => SkillMetadataSchema.parse({ ...validBase, repository: 123 })).toThrow();
  });

  it('rejects repository field with invalid URL string', () => {
    expect(() => SkillMetadataSchema.parse({ ...validBase, repository: 'not-a-url' })).toThrow();
  });

  it('preserves backward compatibility with existing fields', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      depends_on: ['other-skill'],
      cognitive_mode: 'adversarial-reviewer',
    });
    expect(result.depends_on).toEqual(['other-skill']);
    expect(result.cognitive_mode).toBe('adversarial-reviewer');
  });
});
