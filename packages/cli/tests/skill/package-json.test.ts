import { describe, it, expect } from 'vitest';
import { derivePackageJson } from '../../src/skill/package-json';

describe('derivePackageJson', () => {
  it('derives package.json from skill metadata', () => {
    const pkg = derivePackageJson({
      name: 'deployment',
      version: '1.0.0',
      description: 'Deploy applications',
      platforms: ['claude-code', 'gemini-cli'],
      triggers: ['manual', 'on_pr'],
      type: 'flexible',
      tools: ['Bash', 'Read'],
      depends_on: [],
    });

    expect(pkg.name).toBe('@harness-skills/deployment');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.description).toBe('Deploy applications');
    expect(pkg.keywords).toContain('harness-skill');
    expect(pkg.keywords).toContain('claude-code');
    expect(pkg.keywords).toContain('gemini-cli');
    expect(pkg.keywords).toContain('manual');
    expect(pkg.keywords).toContain('on_pr');
    expect(pkg.files).toContain('skill.yaml');
    expect(pkg.files).toContain('SKILL.md');
    expect(pkg.files).toContain('README.md');
    expect(pkg.license).toBe('MIT');
  });

  it('includes repository field when provided', () => {
    const pkg = derivePackageJson({
      name: 'test-skill',
      version: '0.1.0',
      description: 'Test',
      platforms: ['claude-code'],
      triggers: ['manual'],
      type: 'flexible',
      tools: [],
      depends_on: [],
      repository: 'https://github.com/user/repo',
    });

    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'https://github.com/user/repo',
    });
  });

  it('omits repository when not provided', () => {
    const pkg = derivePackageJson({
      name: 'no-repo',
      version: '0.1.0',
      description: 'No repo',
      platforms: ['claude-code'],
      triggers: ['manual'],
      type: 'flexible',
      tools: [],
      depends_on: [],
    });

    expect(pkg.repository).toBeUndefined();
  });
});
