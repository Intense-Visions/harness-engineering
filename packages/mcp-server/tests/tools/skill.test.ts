import { describe, it, expect } from 'vitest';
import { runSkillDefinition, createSkillDefinition } from '../../src/tools/skill';

describe('run_skill tool', () => {
  it('has correct definition', () => {
    expect(runSkillDefinition.name).toBe('run_skill');
    expect(runSkillDefinition.inputSchema.required).toContain('skill');
  });

  it('accepts complexity, phase, and party inputs', () => {
    expect(runSkillDefinition.inputSchema.properties.complexity).toBeDefined();
    expect(runSkillDefinition.inputSchema.properties.phase).toBeDefined();
    expect(runSkillDefinition.inputSchema.properties.party).toBeDefined();
  });

  it('complexity has correct enum values', () => {
    const complexity = runSkillDefinition.inputSchema.properties.complexity as {
      type: string;
      enum: string[];
    };
    expect(complexity.enum).toContain('auto');
    expect(complexity.enum).toContain('light');
    expect(complexity.enum).toContain('full');
  });
});

describe('create_skill tool', () => {
  it('has correct definition', () => {
    expect(createSkillDefinition.name).toBe('create_skill');
    expect(createSkillDefinition.inputSchema.required).toContain('path');
    expect(createSkillDefinition.inputSchema.required).toContain('name');
    expect(createSkillDefinition.inputSchema.required).toContain('description');
  });

  it('has valid cognitive mode enum', () => {
    expect(createSkillDefinition.inputSchema.properties.cognitiveMode.enum).toContain(
      'constructive-architect'
    );
    expect(createSkillDefinition.inputSchema.properties.cognitiveMode.enum).toContain(
      'adversarial-reviewer'
    );
  });
});
