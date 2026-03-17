import { describe, it, expect } from 'vitest';
import { renderClaudeCode } from '../../src/slash-commands/render-claude-code';
import { GENERATED_HEADER_CLAUDE } from '../../src/slash-commands/types';
import type { SlashCommandSpec } from '../../src/slash-commands/types';

const baseSpec: SlashCommandSpec = {
  name: 'execution',
  namespace: 'harness',
  fullName: 'harness:execution',
  description: 'Execute implementation plans',
  version: '1.0.0',
  cognitiveMode: 'meticulous-implementer',
  tools: ['Read', 'Write', 'Bash'],
  args: [{ name: 'path', description: 'Project path', required: false }],
  skillYamlName: 'harness-execution',
  sourceDir: 'harness-execution',
  prompt: {
    context: 'Cognitive mode: meticulous-implementer\nType: rigid',
    objective: 'Execute implementation plans',
    executionContext:
      '@agents/skills/claude-code/harness-execution/SKILL.md\n@agents/skills/claude-code/harness-execution/skill.yaml',
    process:
      '1. Try: invoke mcp__harness__run_skill with skill: "harness-execution"\n2. If MCP unavailable: read SKILL.md and follow its workflow directly\n3. Pass through any arguments provided by the user',
  },
};

describe('renderClaudeCode', () => {
  it('starts with the generated header', () => {
    const output = renderClaudeCode(baseSpec);
    expect(output.startsWith(GENERATED_HEADER_CLAUDE)).toBe(true);
  });

  it('includes YAML frontmatter with name and description', () => {
    const output = renderClaudeCode(baseSpec);
    expect(output).toContain('name: harness:execution');
    expect(output).toContain('description: Execute implementation plans');
  });

  it('includes argument-hint when args exist', () => {
    const output = renderClaudeCode(baseSpec);
    expect(output).toContain('argument-hint: "[--path <path>]"');
  });

  it('omits argument-hint when args are empty', () => {
    const noArgs = { ...baseSpec, args: [] };
    const output = renderClaudeCode(noArgs);
    expect(output).not.toContain('argument-hint');
  });

  it('includes allowed-tools list', () => {
    const output = renderClaudeCode(baseSpec);
    expect(output).toContain('  - Read');
    expect(output).toContain('  - Write');
    expect(output).toContain('  - Bash');
  });

  it('includes all four prompt sections', () => {
    const output = renderClaudeCode(baseSpec);
    expect(output).toContain('<context>');
    expect(output).toContain('</context>');
    expect(output).toContain('<objective>');
    expect(output).toContain('</objective>');
    expect(output).toContain('<execution_context>');
    expect(output).toContain('</execution_context>');
    expect(output).toContain('<process>');
    expect(output).toContain('</process>');
  });

  it('omits execution_context section when empty', () => {
    const noCtx = { ...baseSpec, prompt: { ...baseSpec.prompt, executionContext: '' } };
    const output = renderClaudeCode(noCtx);
    expect(output).not.toContain('<execution_context>');
  });
});
