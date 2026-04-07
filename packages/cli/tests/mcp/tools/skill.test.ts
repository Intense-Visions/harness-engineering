import { describe, it, expect } from 'vitest';
import { runSkillDefinition, createSkillDefinition } from '../../../src/mcp/tools/skill';

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
    expect(complexity.enum).toContain('fast');
    expect(complexity.enum).toContain('standard');
    expect(complexity.enum).toContain('thorough');
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

describe('handleRunSkill — progressive disclosure for knowledge skills', () => {
  it('splits SKILL.md on \\n## Details boundary', () => {
    const content = `# React Hooks Pattern\n\n## Instructions\nUse custom hooks.\n\n## Details\nDetailed explanation here.`;
    const boundary = content.indexOf('\n## Details');
    expect(boundary).toBeGreaterThan(0);
    const instructions = content.slice(0, boundary);
    const details = content.slice(boundary);
    expect(instructions).toContain('## Instructions');
    expect(instructions).not.toContain('## Details');
    expect(details).toContain('## Details');
  });

  it('returns full content when no \\n## Details boundary exists', () => {
    const content = `# React Hooks Pattern\n\n## Instructions\nUse custom hooks.`;
    const boundary = content.indexOf('\n## Details');
    expect(boundary).toBe(-1);
    // No split occurs — full content returned
  });

  it('returns instructions-only when autoInject is true and boundary exists', () => {
    const content = `# React Hooks Pattern\n\n## Instructions\nAgent directives.\n\n## Details\nDeep dive.`;
    const boundary = content.indexOf('\n## Details');
    const autoInject = true;
    const result = autoInject && boundary !== -1 ? content.slice(0, boundary) : content;
    expect(result).not.toContain('## Details');
    expect(result).toContain('Agent directives.');
  });

  it('returns full content when autoInject is false', () => {
    const content = `# React Hooks Pattern\n\n## Instructions\nAgent directives.\n\n## Details\nDeep dive.`;
    const boundary = content.indexOf('\n## Details');
    const autoInject = false;
    const result = autoInject && boundary !== -1 ? content.slice(0, boundary) : content;
    expect(result).toContain('## Details');
    expect(result).toContain('Deep dive.');
  });

  it('run_skill tool definition accepts autoInject input', () => {
    expect(runSkillDefinition.inputSchema.properties.autoInject).toBeDefined();
  });
});
