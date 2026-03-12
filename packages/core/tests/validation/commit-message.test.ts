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

  it('should reject empty message', () => {
    const message = '';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('non-empty string');
    }
  });

  it('should reject null or non-string message', () => {
    const result = validateCommitMessage(null as any, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('non-empty string');
    }
  });

  it('should validate angular format (same as conventional)', () => {
    const message = 'feat(core): add new feature';
    const result = validateCommitMessage(message, 'angular');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.type).toBe('feat');
    }
  });

  it('should accept any non-empty message in custom format', () => {
    const message = 'This is any message without format';
    const result = validateCommitMessage(message, 'custom');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.breaking).toBe(false);
      expect(result.value.issues).toEqual([]);
    }
  });

  it('should handle commit with both invalid type and empty description', () => {
    const message = 'badtype(scope):';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('should detect breaking change marker in header', () => {
    const message = 'fix(api)!: breaking fix';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.breaking).toBe(true);
    }
  });

  it('should handle message with only header line', () => {
    const message = 'feat: single line feature';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.breaking).toBe(false);
    }
  });

  it('should reject message with empty header line', () => {
    const message = '\nBody content without header';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.message).toContain('header cannot be empty');
    }
  });

  it('should validate commit with scope containing multiple levels', () => {
    const message = 'feat(api/core): add new feature';
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.scope).toBe('api/core');
    }
  });

  it('should handle commit with whitespace description', () => {
    const message = 'feat(core):     ';
    const result = validateCommitMessage(message, 'conventional');

    // The regex matches and description is " " (space), which trims to empty
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('should detect both empty description and invalid type', () => {
    const message = 'badtype: ';
    const result = validateCommitMessage(message, 'conventional');

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('should detect BREAKING CHANGE in body without ! marker', () => {
    const message = `feat(api): change response format
Some description here.

BREAKING CHANGE: API response structure has changed`;
    const result = validateCommitMessage(message, 'conventional');

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.breaking).toBe(true);
    }
  });
});
