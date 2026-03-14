import { describe, it, expect } from 'vitest';
import { createPersonaCommand } from '../../src/commands/persona/index';

describe('persona command', () => {
  it('creates persona command with list and generate subcommands', () => {
    const cmd = createPersonaCommand();
    expect(cmd.name()).toBe('persona');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('generate');
  });
});
