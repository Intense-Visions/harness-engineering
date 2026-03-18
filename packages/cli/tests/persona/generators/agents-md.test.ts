import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from '../../../src/persona/generators/agents-md';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce layer boundaries, detect circular dependencies',
  skills: ['enforce-architecture', 'check-mechanical-constraints'],
  steps: [
    { command: 'check-deps', when: 'always' },
    { command: 'validate', when: 'always' },
  ],
  triggers: [
    { event: 'on_pr' as const, conditions: { paths: ['src/**'] } },
    { event: 'on_commit' as const, conditions: { branches: ['main', 'develop'] } },
    { event: 'scheduled' as const, cron: '0 6 * * 1' },
  ],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateAgentsMd', () => {
  it('generates valid markdown fragment', () => {
    const result = generateAgentsMd(mockPersona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('## Architecture Enforcer Agent');
    expect(result.value).toContain('**Role:**');
    expect(result.value).toContain('Enforce layer boundaries');
    expect(result.value).toContain('**Skills:**');
    expect(result.value).toContain('enforce-architecture');
    expect(result.value).toContain('**Triggers:**');
    expect(result.value).toContain('On PR');
  });

  it('formats triggers correctly', () => {
    const result = generateAgentsMd(mockPersona);
    if (!result.ok) return;
    expect(result.value).toContain('src/**');
    expect(result.value).toContain('main');
    expect(result.value).toContain('cron:');
  });

  it('includes remediation guidance', () => {
    const result = generateAgentsMd(mockPersona);
    if (!result.ok) return;
    expect(result.value).toContain('**When this agent flags an issue:**');
    expect(result.value).toContain('harness check-deps');
  });

  it('generates markdown with commands and skills from steps', () => {
    const v2Persona: Persona = {
      ...mockPersona,
      version: 2,
      steps: [
        { command: 'validate', when: 'always' },
        { command: 'check-deps', when: 'on_commit' },
        { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
      ],
    };
    const result = generateAgentsMd(v2Persona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('harness validate');
    expect(result.value).toContain('harness check-deps');
    expect(result.value).toContain('harness-code-review');
  });
});
