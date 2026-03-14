import { describe, it, expect } from 'vitest';
import { createSkillCommand } from '../../src/commands/skill/index';

describe('skill command', () => {
  it('creates skill command with subcommands', () => {
    const cmd = createSkillCommand();
    expect(cmd.name()).toBe('skill');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('run');
    expect(subcommands).toContain('validate');
    expect(subcommands).toContain('info');
  });
});
