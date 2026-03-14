import { describe, it, expect } from 'vitest';
import { createRunCommand } from '../../src/commands/agent/run';

describe('harness agent run --persona', () => {
  it('accepts --persona flag', () => {
    const cmd = createRunCommand();
    const personaOpt = cmd.options.find((o) => o.long === '--persona');
    expect(personaOpt).toBeDefined();
  });

  it('task argument is optional (for persona mode)', () => {
    const cmd = createRunCommand();
    const taskArg = cmd.registeredArguments[0];
    expect(taskArg.required).toBe(false);
  });
});
