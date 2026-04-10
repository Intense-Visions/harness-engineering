import { describe, it, expect } from 'vitest';
import {
  TruncationStrategy,
  DEFAULT_TOKEN_BUDGET,
} from '../../src/compaction/strategies/truncation';

describe('TruncationStrategy', () => {
  const strategy = new TruncationStrategy();

  it('has name "truncate" and lossy false', () => {
    expect(strategy.name).toBe('truncate');
    expect(strategy.lossy).toBe(false);
  });

  it('exports DEFAULT_TOKEN_BUDGET of 4000', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBe(4000);
  });

  it('returns content unchanged when within budget', () => {
    const content = 'short content';
    expect(strategy.apply(content)).toBe(content);
  });

  it('truncates content that exceeds default token budget', () => {
    // 4000 tokens * 4 chars/token = 16000 chars budget
    const overBudget = 'x'.repeat(20000);
    const result = strategy.apply(overBudget);
    expect(result.length).toBeLessThan(overBudget.length);
  });

  it('respects a custom budget passed at apply time', () => {
    const content = 'a'.repeat(1000);
    // budget = 100 tokens = 400 chars
    const result = strategy.apply(content, 100);
    expect(result.length).toBeLessThanOrEqual(400 + 50); // small margin for truncation marker
  });

  it('preserves identifier-like tokens (capitalized words, camelCase, paths)', () => {
    // Build a string with high-priority content followed by filler
    const highPriority = 'UserService /src/services/user.ts ERROR: Cannot read property';
    const filler = 'verbose description '.repeat(500);
    const content = highPriority + '\n' + filler;
    const result = strategy.apply(content, 50); // very tight budget
    expect(result).toContain('UserService');
  });

  it('preserves lines containing "error" or "Error" keywords', () => {
    const filler = 'unimportant filler text '.repeat(500);
    const errorLine = 'Error: Connection refused at port 5432';
    const content = filler + '\n' + errorLine;
    const result = strategy.apply(content, 50);
    expect(result.toLowerCase()).toContain('error');
  });

  it('preserves lines containing file paths (contains /)', () => {
    const filler = 'verbose output text '.repeat(500);
    const pathLine = '/src/services/critical-module.ts line 42';
    const content = filler + '\n' + pathLine;
    const result = strategy.apply(content, 50);
    expect(result).toContain('/src/services/critical-module.ts');
  });

  it('appends a truncation marker when content is cut', () => {
    const overBudget = 'word '.repeat(5000);
    const result = strategy.apply(overBudget, 10);
    expect(result).toContain('[truncated');
  });

  it('handles empty string without error', () => {
    expect(strategy.apply('')).toBe('');
  });
});
