import { describe, it, expect } from 'vitest';
import { validateBranchName, type BranchingConfig } from '../../src/validation/branch';

describe('validateBranchName', () => {
  const defaultConfig: BranchingConfig = {
    prefixes: ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf'],
    enforceKebabCase: true,
    ignore: ['main', 'release/**', 'dependabot/**', 'harness/**'],
  };

  it('should allow ignored branches', () => {
    expect(validateBranchName('main', defaultConfig).valid).toBe(true);
    expect(validateBranchName('release/v1.0.0', defaultConfig).valid).toBe(true);
    expect(validateBranchName('dependabot/npm/something', defaultConfig).valid).toBe(true);
  });

  it('should require a prefix and a slash', () => {
    const result = validateBranchName('my-feature', defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('must have a prefix followed by a slash');
  });

  it('should validate allowed prefixes', () => {
    expect(validateBranchName('feat/valid-feature', defaultConfig).valid).toBe(true);
    expect(validateBranchName('fix/valid-fix', defaultConfig).valid).toBe(true);

    const result = validateBranchName('feature/invalid-prefix', defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Prefix "feature" is not allowed');
  });

  it('should enforce kebab-case by default', () => {
    expect(validateBranchName('feat/valid-kebab-case', defaultConfig).valid).toBe(true);

    const result = validateBranchName('feat/invalid_snake_case', defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('must be in kebab-case');

    const result2 = validateBranchName('feat/InvalidCamelCase', defaultConfig);
    expect(result2.valid).toBe(false);
  });

  it('should allow ticket IDs in kebab-case slugs', () => {
    expect(validateBranchName('feat/PROJ-123-short-desc', defaultConfig).valid).toBe(true);
    expect(validateBranchName('feat/HNS-456-another-one', defaultConfig).valid).toBe(true);

    const result = validateBranchName('feat/PROJ-123-Invalid_Snake', defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('does not follow kebab-case after the ticket ID');
  });

  it('should support custom regex', () => {
    const customConfig: BranchingConfig = {
      ...defaultConfig,
      customRegex: '^user/.*$',
    };

    expect(validateBranchName('user/anything', customConfig).valid).toBe(true);
    expect(validateBranchName('feat/something', customConfig).valid).toBe(false);
  });

  it('should allow deep hierarchies if all parts are kebab-case', () => {
    expect(validateBranchName('feat/ui/button/primary', defaultConfig).valid).toBe(true);

    const result = validateBranchName('feat/ui/Button/Primary', defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('must be in kebab-case');
  });
});
