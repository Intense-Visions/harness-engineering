import { describe, it, expect } from 'vitest';
import { resolveTemplatesDir, resolvePersonasDir, resolveSkillsDir } from '../../src/utils/paths';

describe('resolveTemplatesDir', () => {
  it('returns a string path', () => {
    const result = resolveTemplatesDir();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('path contains templates', () => {
    const result = resolveTemplatesDir();
    expect(result).toContain('templates');
  });
});

describe('resolvePersonasDir', () => {
  it('returns a string path', () => {
    const result = resolvePersonasDir();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('path ends with personas', () => {
    const result = resolvePersonasDir();
    expect(result).toMatch(/personas$/);
  });
});

describe('resolveSkillsDir', () => {
  it('returns a string path', () => {
    const result = resolveSkillsDir();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('path ends with claude-code', () => {
    const result = resolveSkillsDir();
    expect(result).toMatch(/claude-code$/);
  });
});
