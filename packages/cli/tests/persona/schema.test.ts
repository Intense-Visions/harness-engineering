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
    const result = PersonaSchema.safeParse({ ...validPersona, version: 2 });
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
