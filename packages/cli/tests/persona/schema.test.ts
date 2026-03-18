import { describe, it, expect } from 'vitest';
import { PersonaSchema } from '../../src/persona/schema';

describe('PersonaSchema', () => {
  const validPersona = {
    version: 1,
    name: 'Architecture Enforcer',
    description: 'Validates architectural constraints',
    role: 'Enforce layer boundaries',
    skills: ['enforce-architecture', 'check-mechanical-constraints'],
    commands: ['check-deps', 'validate'],
    triggers: [
      { event: 'on_pr', conditions: { paths: ['src/**'] } },
      { event: 'on_commit', conditions: { branches: ['main'] } },
      { event: 'scheduled', cron: '0 6 * * 1' },
    ],
  };

  it('validates a complete persona', () => {
    const result = PersonaSchema.safeParse(validPersona);
    expect(result.success).toBe(true);
  });

  it('applies config defaults', () => {
    const result = PersonaSchema.parse(validPersona);
    expect(result.config.severity).toBe('error');
    expect(result.config.autoFix).toBe(false);
    expect(result.config.timeout).toBe(300000);
  });

  it('applies output defaults', () => {
    const result = PersonaSchema.parse(validPersona);
    expect(result.outputs['agents-md']).toBe(true);
    expect(result.outputs['ci-workflow']).toBe(true);
    expect(result.outputs['runtime-config']).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = PersonaSchema.safeParse({ ...validPersona, version: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = PersonaSchema.safeParse({ version: 1, name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trigger event', () => {
    const result = PersonaSchema.safeParse({
      ...validPersona,
      triggers: [{ event: 'on_deploy' }],
    });
    expect(result.success).toBe(false);
  });

  it('validates scheduled trigger requires cron', () => {
    const result = PersonaSchema.safeParse({
      ...validPersona,
      triggers: [{ event: 'scheduled' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts custom config overrides', () => {
    const result = PersonaSchema.parse({
      ...validPersona,
      config: { severity: 'warning', autoFix: true, timeout: 60000 },
    });
    expect(result.config.severity).toBe('warning');
    expect(result.config.autoFix).toBe(true);
    expect(result.config.timeout).toBe(60000);
  });
});

describe('PersonaSchema v2', () => {
  const v2Persona = {
    version: 2 as const,
    name: 'Code Reviewer',
    description: 'Full-lifecycle code review',
    role: 'Perform AI-powered code review',
    skills: ['harness-code-review'],
    steps: [
      { command: 'validate', when: 'always' },
      { command: 'check-deps', when: 'always' },
      { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
    ],
    triggers: [{ event: 'on_pr' as const }],
  };

  it('validates a v2 persona with steps', () => {
    const result = PersonaSchema.safeParse(v2Persona);
    expect(result.success).toBe(true);
  });

  it('applies step defaults', () => {
    const result = PersonaSchema.parse({
      ...v2Persona,
      steps: [{ command: 'validate' }, { skill: 'harness-code-review' }],
    });
    if (!('steps' in result)) throw new Error('expected v2');
    expect(result.steps[0]).toEqual({ command: 'validate', when: 'always' });
    expect(result.steps[1]).toEqual({
      skill: 'harness-code-review',
      when: 'always',
      output: 'auto',
    });
  });

  it('rejects steps with invalid when value', () => {
    const result = PersonaSchema.safeParse({
      ...v2Persona,
      steps: [{ command: 'validate', when: 'on_deploy' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects v2 persona with commands instead of steps', () => {
    const result = PersonaSchema.safeParse({
      version: 2,
      name: 'Bad',
      description: 'Bad',
      role: 'Bad',
      skills: [],
      commands: ['validate'],
      triggers: [{ event: 'on_pr' }],
    });
    expect(result.success).toBe(false);
  });

  it('v1 persona still validates', () => {
    const v1 = {
      version: 1 as const,
      name: 'Architecture Enforcer',
      description: 'Validates constraints',
      role: 'Enforce boundaries',
      skills: ['enforce-architecture'],
      commands: ['check-deps', 'validate'],
      triggers: [{ event: 'on_pr' as const }],
    };
    const result = PersonaSchema.safeParse(v1);
    expect(result.success).toBe(true);
  });
});
