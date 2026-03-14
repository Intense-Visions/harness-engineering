import { describe, it, expect } from 'vitest';
import { createStateCommand } from '../../src/commands/state/index';

describe('state command', () => {
  it('creates state command with subcommands', () => {
    const cmd = createStateCommand();
    expect(cmd.name()).toBe('state');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('show');
    expect(subcommands).toContain('reset');
    expect(subcommands).toContain('learn');
  });
});
