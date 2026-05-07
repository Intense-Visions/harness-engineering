import { describe, it, expect } from 'vitest';
import { renderCursorCommand } from '../../src/slash-commands/render-cursor-command';
import { GENERATED_HEADER_CURSOR } from '../../src/slash-commands/types';
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
  skillsBaseDir: 'agents/skills/cursor',
  prompt: {
    context: 'Cognitive mode: meticulous-implementer\nType: rigid',
    objective: 'Execute implementation plans',
    executionContext:
      '@agents/skills/cursor/harness-execution/SKILL.md\n@agents/skills/cursor/harness-execution/skill.yaml',
    process:
      '1. Try: invoke mcp__harness__run_skill with skill: "harness-execution"\n2. If MCP unavailable: read SKILL.md and follow its workflow directly\n3. Pass through any arguments provided by the user',
  },
};

describe('renderCursorCommand', () => {
  it('starts with YAML frontmatter and includes the generated header', () => {
    const output = renderCursorCommand(baseSpec);
    expect(output.startsWith('---\n')).toBe(true);
    expect(output).toContain(GENERATED_HEADER_CURSOR);
  });

  it('includes only name and description in frontmatter (no argument-hint or allowed-tools)', () => {
    const output = renderCursorCommand(baseSpec);
    expect(output).toContain('name: harness:execution');
    expect(output).toContain('description: Execute implementation plans');
    // Cursor's plugin command frontmatter is minimal — argument-hint and
    // allowed-tools are Claude Code-specific.
    expect(output).not.toContain('argument-hint');
    expect(output).not.toContain('allowed-tools');
  });

  it('includes all four prompt sections', () => {
    const output = renderCursorCommand(baseSpec);
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
    const output = renderCursorCommand(noCtx);
    expect(output).not.toContain('<execution_context>');
  });
});
