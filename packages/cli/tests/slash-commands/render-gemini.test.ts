import { describe, it, expect } from 'vitest';
import { renderGemini } from '../../src/slash-commands/render-gemini';
import { GENERATED_HEADER_GEMINI } from '../../src/slash-commands/types';
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

const skillMdContent = '# Test Skill\n\nDo things.';
const skillYamlContent = 'name: harness-execution\nversion: "1.0.0"';

describe('renderGemini', () => {
  it('starts with the generated header', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output.startsWith(GENERATED_HEADER_GEMINI)).toBe(true);
  });

  it('includes description field', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('description = "Execute implementation plans"');
  });

  it('inlines SKILL.md content in execution_context', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('--- SKILL.md');
    expect(output).toContain('# Test Skill');
    expect(output).toContain('Do things.');
  });

  it('inlines skill.yaml content in execution_context', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('--- skill.yaml');
    expect(output).toContain('name: harness-execution');
  });

  it('includes all four prompt sections', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('<context>');
    expect(output).toContain('<objective>');
    expect(output).toContain('<execution_context>');
    expect(output).toContain('<process>');
  });

  it('omits execution_context when no content provided', () => {
    const noCtx = { ...baseSpec, prompt: { ...baseSpec.prompt, executionContext: '' } };
    const output = renderGemini(noCtx, '', '');
    expect(output).not.toContain('<execution_context>');
  });

  it('uses SKILL.md fallback wording in process when MCP unavailable', () => {
    const output = renderGemini(baseSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('follow the SKILL.md workflow provided above directly');
  });

  it('escapes double quotes in description', () => {
    const quotedSpec = { ...baseSpec, description: 'Run the "fast" mode' };
    const output = renderGemini(quotedSpec, skillMdContent, skillYamlContent);
    expect(output).toContain('description = "Run the \\"fast\\" mode"');
  });
});
