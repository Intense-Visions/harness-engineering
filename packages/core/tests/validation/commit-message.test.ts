import { describe, it, expect } from 'vitest';
import { validateCommitMessage } from '../../src/validation/commit-message';
import { isOk, isErr } from '../../src/shared/result';

describe('validateCommitMessage', () => {
  // Step 1: Write failing test for valid conventional commit
  it('should validate feat commit without scope', () => {
    const message = 'feat: add new feature';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.type).toBe('feat');
      expect(result.value.scope).toBeUndefined();
      expect(result.value.breaking).toBe(false);
      expect(result.value.issues).toEqual([]);
    }
  });

  it('should validate fix commit with scope', () => {
    const message = 'fix(core): resolve validation bug';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.type).toBe('fix');
      expect(result.value.scope).toBe('core');
      expect(result.value.breaking).toBe(false);
      expect(result.value.issues).toEqual([]);
    }
  });

  it('should validate docs commit', () => {
    const message = 'docs: update README with examples';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.type).toBe('docs');
      expect(result.value.breaking).toBe(false);
    }
  });

  // Step 5: Write test for breaking changes
  it('should detect breaking change with ! marker', () => {
    const message = 'feat(core)!: redesign API';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.breaking).toBe(true);
      expect(result.value.type).toBe('feat');
      expect(result.value.scope).toBe('core');
    }
  });

  it('should detect breaking change with BREAKING CHANGE: in body', () => {
    const message = `feat(api): change response format

BREAKING CHANGE: API response structure has changed`;
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.breaking).toBe(true);
      expect(result.value.type).toBe('feat');
    }
  });

  // Step 7: Write test for invalid format
  it('should reject commit with invalid type', () => {
    const message = 'invalid: some change';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('Commit message validation failed');
      expect(result.error.message).toContain('Invalid commit type');
    }
  });

  it('should reject commit with empty description', () => {
    const message = 'feat(core):';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('does not follow conventional format');
    }
  });

  it('should reject commit that does not follow conventional format', () => {
    const message = 'this is just a random message';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('does not follow conventional format');
      expect(result.error.suggestions.length).toBeGreaterThan(0);
    }
  });
});
