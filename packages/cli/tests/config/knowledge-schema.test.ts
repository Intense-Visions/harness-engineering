// packages/cli/tests/config/knowledge-schema.test.ts
import { describe, it, expect } from 'vitest';
import { KnowledgeConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('KnowledgeConfigSchema', () => {
  it('accepts a fully populated knowledge config', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['agents/<dir>', 'examples/<dir>'],
      domainBlocklist: ['scratch', 'fixtures'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = KnowledgeConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults domainPatterns to empty array when absent', () => {
    const result = KnowledgeConfigSchema.parse({});
    expect(result.domainPatterns).toEqual([]);
  });

  it('defaults domainBlocklist to empty array when absent', () => {
    const result = KnowledgeConfigSchema.parse({});
    expect(result.domainBlocklist).toEqual([]);
  });

  it('accepts explicitly empty arrays', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: [],
      domainBlocklist: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts pattern with hyphenated single-segment prefix', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['services-v2/<dir>'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts pattern with dotted single-segment prefix', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['my.service/<dir>'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects pattern missing the <dir> suffix', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['agents'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.');
      expect(path).toBe('domainPatterns.0');
    }
  });

  it('rejects pattern with literal name instead of <dir>', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['agents/foo'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects pattern with multi-segment suffix after <dir>', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['agents/<dir>/sub'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects pattern with multi-segment prefix before <dir>', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: ['agents/skills/<dir>'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string in domainBlocklist', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainBlocklist: [''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.');
      expect(path).toBe('domainBlocklist.0');
    }
  });

  it('rejects non-array domainPatterns', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: 'agents/<dir>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array domainBlocklist', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainBlocklist: 'scratch',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string element in domainPatterns', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainPatterns: [123],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string element in domainBlocklist', () => {
    const result = KnowledgeConfigSchema.safeParse({
      domainBlocklist: [123],
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with knowledge block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test-project',
  };

  it('accepts config with populated knowledge block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      knowledge: {
        domainPatterns: ['agents/<dir>'],
        domainBlocklist: ['scratch'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with empty knowledge block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      knowledge: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without knowledge block (back-compat)', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('rejects config with malformed knowledge.domainPatterns entry', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      knowledge: { domainPatterns: ['agents'] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.');
      expect(path).toBe('knowledge.domainPatterns.0');
    }
  });

  it('rejects config with empty string in knowledge.domainBlocklist', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      knowledge: { domainBlocklist: [''] },
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults when knowledge block is empty object', () => {
    const result = HarnessConfigSchema.parse({
      ...baseConfig,
      knowledge: {},
    });
    expect(result.knowledge).toEqual({
      domainPatterns: [],
      domainBlocklist: [],
    });
  });
});
