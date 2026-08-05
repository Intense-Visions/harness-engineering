import { describe, it, expect } from 'vitest';
import {
  SkillMetadataSchema,
  SkillCapabilitiesSchema,
  FILESYSTEM_LEVELS,
  deriveCapabilities,
  capabilityDriftErrors,
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
