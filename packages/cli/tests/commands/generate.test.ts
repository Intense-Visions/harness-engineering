import { describe, it, expect } from 'vitest';
import { createGenerateCommand } from '../../src/commands/generate';

describe('generate command', () => {
  it('creates a command with correct name and description', () => {
    const cmd = createGenerateCommand();
    expect(cmd.name()).toBe('generate');
    expect(cmd.description()).toContain('platform integrations');
  });

  it('has expected options', () => {
    const cmd = createGenerateCommand();
    const optNames = cmd.options.map((o) => o.long);
    expect(optNames).toContain('--platforms');
    expect(optNames).toContain('--global');
    expect(optNames).toContain('--dry-run');
  });
});
