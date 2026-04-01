import { describe, it, expect } from 'vitest';
import { renderCursor } from '../../src/slash-commands/render-cursor';
import { GENERATED_HEADER_CURSOR } from '../../src/slash-commands/types';
import type { SlashCommandSpec } from '../../src/slash-commands/types';

const baseSpec: SlashCommandSpec = {
  name: 'brainstorming',
  namespace: 'harness',
  fullName: 'harness:brainstorming',
  description: 'Structured ideation and exploration with harness methodology',
  version: '1.0.0',
  cognitiveMode: 'constructive-architect',
  tools: ['Read', 'Write', 'Bash'],
  args: [{ name: 'path', description: 'Project path', required: false }],
  skillYamlName: 'harness-brainstorming',
  sourceDir: 'harness-brainstorming',
  skillsBaseDir: 'agents/skills/claude-code',
  prompt: {
    context: 'Cognitive mode: constructive-architect\nType: rigid',
    objective: 'Structured ideation and exploration',
    executionContext: '@agents/skills/claude-code/harness-brainstorming/SKILL.md',
    process: '1. Read SKILL.md and follow its workflow directly',
  },
};

const skillMdContent = '# Harness Brainstorming\n\nExplore ideas systematically.';

describe('renderCursor', () => {
  it('outputs valid YAML frontmatter with --- delimiters', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output.startsWith('---\n')).toBe(true);
    expect(output).toContain('\n---\n');
  });

  it('includes description in frontmatter', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output).toContain(
      'description: Structured ideation and exploration with harness methodology'
    );
  });

  it('defaults alwaysApply to false when no cursor config', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output).toContain('alwaysApply: false');
  });

  it('sets alwaysApply: true when cursor.alwaysApply is true', () => {
    const output = renderCursor(baseSpec, skillMdContent, { alwaysApply: true });
    expect(output).toContain('alwaysApply: true');
  });

  it('includes globs in frontmatter when cursor.globs is provided', () => {
    const output = renderCursor(baseSpec, skillMdContent, { globs: ['src/**/*.ts'] });
    expect(output).toContain('globs:');
    expect(output).toContain('src/**/*.ts');
  });

  it('omits globs when cursor config has no globs', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output).not.toContain('globs:');
  });

  it('includes SKILL.md content after frontmatter', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output).toContain('# Harness Brainstorming');
    expect(output).toContain('Explore ideas systematically.');
  });

  it('includes the generated header comment after frontmatter', () => {
    const output = renderCursor(baseSpec, skillMdContent);
    expect(output).toContain(GENERATED_HEADER_CURSOR);
  });
});
