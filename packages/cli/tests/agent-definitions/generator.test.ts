import { describe, it, expect } from 'vitest';
import {
  generateAgentDefinition,
  inlineRelativeLinks,
  AGENT_DESCRIPTIONS,
  DEFAULT_TOOLS,
  GEMINI_TOOL_MAP,
} from '../../src/agent-definitions/generator';
import type { Persona } from '../../src/persona/schema';

const mockPersona: Persona = {
  version: 2,
  name: 'Code Reviewer',
  description: 'Full-lifecycle code review',
  role: 'Perform AI-powered code review',
  skills: ['harness-code-review'],
  steps: [
    { command: 'validate', when: 'always' },
    { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
  ],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 600000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateAgentDefinition', () => {
  it('produces an AgentDefinition from a persona', () => {
    const skillContents = new Map([['harness-code-review', '# Code Review\n\nMethodology...']]);
    const def = generateAgentDefinition(mockPersona, skillContents);
    expect(def.name).toBe('harness-code-reviewer');
    expect(def.role).toBe('Perform AI-powered code review');
    expect(def.skills).toEqual(['harness-code-review']);
    expect(def.methodology).toContain('Methodology');
  });

  it('uses task-aware description from AGENT_DESCRIPTIONS', () => {
    const skillContents = new Map([['harness-code-review', '# Review']]);
    const def = generateAgentDefinition(mockPersona, skillContents);
    expect(def.description).toContain('review');
    expect(def.description).toContain('findings');
  });

  it('falls back to persona description when no custom description exists', () => {
    const persona: Persona = { ...mockPersona, name: 'Unknown Persona' };
    const def = generateAgentDefinition(persona, new Map());
    expect(def.description).toBe('Full-lifecycle code review');
  });

  it('concatenates multiple skill contents', () => {
    const persona: Persona = { ...mockPersona, skills: ['skill-a', 'skill-b'] };
    const skillContents = new Map([
      ['skill-a', '# Skill A'],
      ['skill-b', '# Skill B'],
    ]);
    const def = generateAgentDefinition(persona, skillContents);
    expect(def.methodology).toContain('Skill A');
    expect(def.methodology).toContain('Skill B');
    expect(def.methodology).toContain('---');
  });

  it('includes default tools', () => {
    const def = generateAgentDefinition(mockPersona, new Map());
    expect(def.tools).toContain('Bash');
    expect(def.tools).toContain('Read');
    expect(def.tools).toContain('Write');
  });

  it('GEMINI_TOOL_MAP covers every DEFAULT_TOOLS entry', () => {
    for (const tool of DEFAULT_TOOLS) {
      expect(GEMINI_TOOL_MAP[tool], `missing Gemini mapping for "${tool}"`).toBeDefined();
    }
  });

  it('has descriptions for all known personas', () => {
    expect(AGENT_DESCRIPTIONS['code-reviewer']).toBeDefined();
    expect(AGENT_DESCRIPTIONS['task-executor']).toBeDefined();
    expect(AGENT_DESCRIPTIONS['parallel-coordinator']).toBeDefined();
    expect(AGENT_DESCRIPTIONS['architecture-enforcer']).toBeDefined();
    expect(AGENT_DESCRIPTIONS['documentation-maintainer']).toBeDefined();
    expect(AGENT_DESCRIPTIONS['entropy-cleaner']).toBeDefined();
  });
});

describe('inlineRelativeLinks (#2132)', () => {
  it('names a sibling reference by its skill-qualified path instead of linking it', () => {
    expect(
      inlineRelativeLinks(
        'per the [confidence rubric](references/confidence-rubric.md).',
        'harness-code-review'
      )
    ).toBe('per the confidence rubric (`harness-code-review/references/confidence-rubric.md`).');
  });

  it('does not repeat the path when the link text already is the path', () => {
    expect(
      inlineRelativeLinks('[references/risk-keywords.md](references/risk-keywords.md)', 'cr')
    ).toBe('`cr/references/risk-keywords.md`');
  });

  it('keeps only the in-repo tail of a path that climbs out of the skill directory', () => {
    expect(
      inlineRelativeLinks(
        'See [`auto-done.md`](../../../../docs/knowledge/roadmap/auto-done.md).',
        'harness-execution'
      )
    ).toBe('See `auto-done.md` (`docs/knowledge/roadmap/auto-done.md`).');
  });

  it('leaves URLs, anchors, absolute paths and code untouched', () => {
    const input = [
      '[site](https://example.com/a.md) [top](#top) [abs](/etc/x.md) `[x](y.md)`',
      '```',
      '[fenced](references/x.md)',
      '```',
    ].join('\n');
    expect(inlineRelativeLinks(input, 'skill')).toBe(input);
  });
});
