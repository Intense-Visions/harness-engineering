import { describe, it, expect } from 'vitest';
import { createComprehendCommand, resolveMode } from '../../src/commands/comprehend';

describe('createComprehendCommand', () => {
  it('returns a Command named "comprehend" with the four mode flags', () => {
    const cmd = createComprehendCommand();
    expect(cmd.name()).toBe('comprehend');
    const flags = cmd.options.map((o) => o.long);
    expect(flags).toContain('--changed');
    expect(flags).toContain('--all');
    expect(flags).toContain('--check');
    expect(flags).toContain('--stats');
  });
});

describe('resolveMode — flag precedence', () => {
  it('defaults to changed with no flag', () => {
    expect(resolveMode({})).toBe('changed');
    expect(resolveMode({ changed: true })).toBe('changed');
  });
  it('honors precedence check > stats > all > changed', () => {
    expect(resolveMode({ check: true, stats: true, all: true })).toBe('check');
    expect(resolveMode({ stats: true, all: true })).toBe('stats');
    expect(resolveMode({ all: true })).toBe('all');
  });
});
