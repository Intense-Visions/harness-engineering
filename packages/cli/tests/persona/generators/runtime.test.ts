import { describe, it, expect } from 'vitest';
import { generateRuntime } from '../../../src/persona/generators/runtime';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce boundaries',
  skills: ['enforce-architecture', 'check-mechanical-constraints'],
  steps: [
    { command: 'check-deps', when: 'always' },
    { command: 'validate', when: 'always' },
  ],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateRuntime', () => {
  it('generates valid runtime config JSON', () => {
    const result = generateRuntime(mockPersona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = JSON.parse(result.value);
    expect(config.name).toBe('architecture-enforcer');
    expect(config.skills).toEqual(['enforce-architecture', 'check-mechanical-constraints']);
    expect(config.steps).toEqual([
      { command: 'check-deps', when: 'always' },
      { command: 'validate', when: 'always' },
    ]);
    expect(config.timeout).toBe(300000);
    expect(config.severity).toBe('error');
  });

  it('converts name to kebab-case slug', () => {
    const result = generateRuntime({ ...mockPersona, name: 'Documentation Maintainer' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = JSON.parse(result.value);
    expect(config.name).toBe('documentation-maintainer');
  });

  it('generates runtime config with skill steps for v2 persona', () => {
    const v2Persona: Persona = {
      ...mockPersona,
      version: 2,
      steps: [
        { command: 'validate', when: 'always' },
        { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
      ],
    };
    const result = generateRuntime(v2Persona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = JSON.parse(result.value);
    expect(config.steps).toEqual([
      { command: 'validate', when: 'always' },
      { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
    ]);
  });
});
