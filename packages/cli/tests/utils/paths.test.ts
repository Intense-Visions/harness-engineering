import { describe, it, expect } from 'vitest';
import {
  resolveTemplatesDir,
  resolvePersonasDir,
  resolveSkillsDir,
  resolveAllSkillsDirs,
  resolveCommunitySkillsDir,
} from '../../src/utils/paths';

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

describe('resolveCommunitySkillsDir', () => {
  it('returns a string path containing community', () => {
    const result = resolveCommunitySkillsDir();
    expect(typeof result).toBe('string');
    expect(result).toContain('community');
  });

  it('path ends with claude-code for default platform', () => {
    const result = resolveCommunitySkillsDir();
    expect(result).toMatch(/claude-code$/);
  });

  it('path ends with specified platform', () => {
    const result = resolveCommunitySkillsDir('gemini-cli');
    expect(result).toMatch(/gemini-cli$/);
  });
});

describe('resolveAllSkillsDirs', () => {
  it('returns an array of strings', () => {
    const result = resolveAllSkillsDirs();
    expect(Array.isArray(result)).toBe(true);
    result.forEach((dir) => expect(typeof dir).toBe('string'));
  });

  it('returns at least one directory (bundled always exists)', () => {
    const result = resolveAllSkillsDirs();
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('entries end with platform name', () => {
    const result = resolveAllSkillsDirs('claude-code');
    result.forEach((dir) => expect(dir).toMatch(/claude-code$/));
  });

  it('accepts gemini-cli platform', () => {
    const result = resolveAllSkillsDirs('gemini-cli');
    result.forEach((dir) => expect(dir).toMatch(/gemini-cli$/));
  });
});
