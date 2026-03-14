import { describe, it, expect } from 'vitest';
import { runSkillDefinition } from '../../src/tools/skill';

describe('run_skill tool', () => {
  it('has correct definition', () => {
    expect(runSkillDefinition.name).toBe('run_skill');
    expect(runSkillDefinition.inputSchema.required).toContain('skill');
  });
});
