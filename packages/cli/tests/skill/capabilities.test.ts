import { describe, it, expect } from 'vitest';
import {
  SkillMetadataSchema,
  SkillCapabilitiesSchema,
  FILESYSTEM_LEVELS,
  deriveCapabilities,
  capabilityDriftErrors,
  capabilityRoleErrors,
} from '../../src/skill/schema';

describe('deriveCapabilities', () => {
  it('marks filesystem read-write when a mutating tool is present', () => {
    expect(deriveCapabilities(['Read', 'Write']).filesystem).toBe('read-write');
    expect(deriveCapabilities(['Edit']).filesystem).toBe('read-write');
    // Bash counts as read-write: a shell can create and delete files.
    expect(deriveCapabilities(['Bash', 'Read']).filesystem).toBe('read-write');
  });

  it('marks filesystem read when only read-only tools are present', () => {
    expect(deriveCapabilities(['Read', 'Glob', 'Grep']).filesystem).toBe('read');
  });

  it('marks filesystem none when no filesystem tools are present', () => {
    expect(deriveCapabilities([]).filesystem).toBe('none');
    expect(deriveCapabilities(['WebFetch']).filesystem).toBe('none');
  });

  it('sets network true only when a network tool is present', () => {
    expect(deriveCapabilities(['WebFetch']).network).toBe(true);
    expect(deriveCapabilities(['WebSearch', 'Read']).network).toBe(true);
    expect(deriveCapabilities(['Bash', 'Read', 'Write']).network).toBe(false);
  });

  it('mirrors the tools list verbatim', () => {
    const tools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];
    expect(deriveCapabilities(tools).tools).toEqual(tools);
  });

  const toolCombos: string[][] = [[], ['Read'], ['Bash'], ['WebFetch'], ['Read', 'Edit']];
  it.each(toolCombos)('always produces a valid filesystem level for %j', (...tools) => {
    expect(FILESYSTEM_LEVELS).toContain(deriveCapabilities(tools).filesystem);
  });
});

describe('capabilityDriftErrors', () => {
  it('returns no errors when the declaration matches the derived envelope', () => {
    const tools = ['Bash', 'Read', 'Write'];
    expect(capabilityDriftErrors(tools, deriveCapabilities(tools))).toEqual([]);
  });

  it('flags a tool-set mismatch', () => {
    const errors = capabilityDriftErrors(['Bash', 'Read'], {
      tools: ['Bash'],
      network: false,
      filesystem: 'read-write',
    });
    expect(errors.some((e) => e.includes('capabilities.tools'))).toBe(true);
  });

  it('flags a network mismatch', () => {
    const errors = capabilityDriftErrors(['Read'], {
      tools: ['Read'],
      network: true,
      filesystem: 'read',
    });
    expect(errors.some((e) => e.includes('capabilities.network'))).toBe(true);
  });

  it('flags a filesystem mismatch', () => {
    const errors = capabilityDriftErrors(['Read', 'Write'], {
      tools: ['Read', 'Write'],
      network: false,
      filesystem: 'read',
    });
    expect(errors.some((e) => e.includes('capabilities.filesystem'))).toBe(true);
  });
});

describe('SkillCapabilitiesSchema', () => {
  it('rejects an invalid filesystem level', () => {
    expect(() =>
      SkillCapabilitiesSchema.parse({ tools: [], network: false, filesystem: 'write-only' })
    ).toThrow();
  });

  it('requires network and filesystem', () => {
    expect(() => SkillCapabilitiesSchema.parse({ tools: ['Read'] })).toThrow();
  });
});

describe('SkillMetadataSchema — capabilities field', () => {
  const validBase = {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill',
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: ['Read', 'Write'],
    type: 'rigid' as const,
  };

  it('accepts a skill with a capabilities envelope', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      capabilities: { tools: ['Read', 'Write'], network: false, filesystem: 'read-write' },
    });
    expect(result.capabilities?.filesystem).toBe('read-write');
  });

  it('leaves capabilities optional for backward compatibility', () => {
    const result = SkillMetadataSchema.parse(validBase);
    expect(result.capabilities).toBeUndefined();
  });
});

describe('capabilityRoleErrors (#1425)', () => {
  it('returns no errors when all three roles are filled', () => {
    expect(
      capabilityRoleErrors({
        definition: 'the backend contract',
        providers: ['ollama-backend'],
        consumers: ['orchestrator'],
      })
    ).toEqual([]);
  });

  it('returns no errors when exactly two roles are filled (work-in-progress seam)', () => {
    expect(
      capabilityRoleErrors({
        definition: 'the backend contract',
        providers: ['ollama-backend'],
        consumers: [],
      })
    ).toEqual([]);
  });

  it('flags a definition-only declaration, naming present and both missing roles', () => {
    const errors = capabilityRoleErrors({
      definition: 'the backend contract',
      providers: [],
      consumers: [],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"definition"');
    expect(errors[0]).toContain('"providers"');
    expect(errors[0]).toContain('"consumers"');
    expect(errors[0]).toContain('single-implementation lock-in');
  });

  it('flags a providers-only declaration, naming present and both missing roles', () => {
    const errors = capabilityRoleErrors({
      definition: '',
      providers: ['ollama-backend'],
      consumers: [],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('only the "providers" role');
    expect(errors[0]).toContain('"definition"');
    expect(errors[0]).toContain('"consumers"');
  });

  it('flags a consumers-only declaration, naming present and both missing roles', () => {
    const errors = capabilityRoleErrors({
      definition: '',
      providers: [],
      consumers: ['orchestrator'],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('only the "consumers" role');
    expect(errors[0]).toContain('"definition"');
    expect(errors[0]).toContain('"providers"');
  });

  it('flags a zero-role (empty) declaration with a "names no role" error', () => {
    const errors = capabilityRoleErrors({ definition: '', providers: [], consumers: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('names no role');
  });

  it('treats whitespace-only entries as unfilled', () => {
    const errors = capabilityRoleErrors({
      definition: '  ',
      providers: ['  '],
      consumers: [],
    });
    // definition and providers are whitespace-only → zero roles filled.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('names no role');
  });
});

describe('SkillMetadataSchema — capabilityRoles field (#1425)', () => {
  const validBase = {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill',
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: ['Read', 'Write'],
    type: 'rigid' as const,
  };

  it('parses a skill.yaml object WITH a capabilityRoles field', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      capabilityRoles: {
        definition: 'the backend contract',
        providers: ['ollama-backend'],
        consumers: ['orchestrator'],
      },
    });
    expect(result.capabilityRoles?.definition).toBe('the backend contract');
    expect(result.capabilityRoles?.providers).toEqual(['ollama-backend']);
    expect(result.capabilityRoles?.consumers).toEqual(['orchestrator']);
  });

  it('leaves capabilityRoles optional (omission parses)', () => {
    const result = SkillMetadataSchema.parse(validBase);
    expect(result.capabilityRoles).toBeUndefined();
  });
});
