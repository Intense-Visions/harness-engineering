import { describe, it, expect } from 'vitest';
import { createAutonomyCommand } from '../../src/commands/autonomy/index';
import { commandCreators } from '../../src/commands/_registry';

describe('harness autonomy command group', () => {
  it('exposes show and set (log arrives in Phase 2)', () => {
    const cmd = createAutonomyCommand();
    expect(cmd.name()).toBe('autonomy');
    expect(cmd.commands.map((c) => c.name()).sort()).toEqual(['set', 'show']);
  });
  it('is registered in the generated command registry', () => {
    expect(commandCreators).toContain(createAutonomyCommand);
  });
});
