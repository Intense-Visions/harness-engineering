import { describe, it, expect } from 'vitest';
import { handleRunSkill } from '../../src/tools/skill';

describe('run_skill path traversal prevention', () => {
  it('rejects skill names with path traversal sequences', async () => {
    const result = await handleRunSkill({ skill: '../../etc/passwd' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Invalid skill name');
  });

  it('rejects skill names with directory separators', async () => {
    const result = await handleRunSkill({ skill: 'foo/bar' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Invalid skill name');
  });

  it('rejects skill names starting with a dot', async () => {
    const result = await handleRunSkill({ skill: '.hidden-skill' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Invalid skill name');
  });

  it('rejects empty skill name', async () => {
    const result = await handleRunSkill({ skill: '' });
    expect(result.isError).toBe(true);
  });

  it('accepts valid kebab-case skill names', async () => {
    // This will return "Skill not found" but NOT "Invalid skill name"
    const result = await handleRunSkill({ skill: 'valid-skill-name' });
    if (result.isError) {
      const text = (result.content[0] as { text: string }).text;
      expect(text).not.toContain('Invalid skill name');
      expect(text).not.toContain('Invalid skill path');
    }
  });

  it('accepts skill names with dots and underscores', async () => {
    const result = await handleRunSkill({ skill: 'my_skill.v2' });
    if (result.isError) {
      const text = (result.content[0] as { text: string }).text;
      expect(text).not.toContain('Invalid skill name');
    }
  });
});
