import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from '../../src/skill/schema';

const validBase = {
  name: 'test-skill',
  version: '1.0.0',
  description: 'A test skill',
  triggers: ['manual'],
  platforms: ['claude-code'],
  tools: ['Read'],
  type: 'rigid' as const,
};

describe('SkillMetadataSchema', () => {
  it('accepts valid skill without repository', () => {
    const result = SkillMetadataSchema.parse(validBase);
    expect(result.name).toBe('test-skill');
    expect(result.repository).toBeUndefined();
  });

  it('accepts valid skill with repository URL', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      repository: 'https://github.com/user/my-skill',
    });
    expect(result.repository).toBe('https://github.com/user/my-skill');
  });

  it('rejects repository field with non-string value', () => {
    expect(() => SkillMetadataSchema.parse({ ...validBase, repository: 123 })).toThrow();
  });

  it('rejects repository field with invalid URL string', () => {
    expect(() => SkillMetadataSchema.parse({ ...validBase, repository: 'not-a-url' })).toThrow();
  });

  it('preserves backward compatibility with existing fields', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      depends_on: ['other-skill'],
      cognitive_mode: 'adversarial-reviewer',
    });
    expect(result.depends_on).toEqual(['other-skill']);
    expect(result.cognitive_mode).toBe('adversarial-reviewer');
  });

  it('accepts cursor block with alwaysApply and globs', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      cursor: { globs: ['src/**/*.ts'], alwaysApply: true },
    });
    expect(result.cursor?.alwaysApply).toBe(true);
    expect(result.cursor?.globs).toEqual(['src/**/*.ts']);
  });

  it('accepts cursor block with defaults', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      cursor: {},
    });
    expect(result.cursor?.alwaysApply).toBe(false);
  });

  it('accepts codex block with instructions_override', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      codex: { instructions_override: 'Custom instructions here' },
    });
    expect(result.codex?.instructions_override).toBe('Custom instructions here');
  });

  it('accepts codex block without instructions_override', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      codex: {},
    });
    expect(result.codex).toBeDefined();
    expect(result.codex?.instructions_override).toBeUndefined();
  });

  it('accepts skill with codex platform in platforms array', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      platforms: ['claude-code', 'codex'],
    });
    expect(result.platforms).toContain('codex');
  });

  it('accepts skill with cursor platform in platforms array', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      platforms: ['claude-code', 'cursor'],
    });
    expect(result.platforms).toContain('cursor');
  });

  it('accepts skill with valid addresses array', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      addresses: [
        { signal: 'circular-deps', hard: true },
        { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
      ],
    });
    expect(result.addresses).toHaveLength(2);
    expect(result.addresses![0]!.signal).toBe('circular-deps');
    expect(result.addresses![0]!.hard).toBe(true);
    expect(result.addresses![1]!.weight).toBe(0.8);
  });

  it('defaults addresses to empty array when omitted', () => {
    const result = SkillMetadataSchema.parse(validBase);
    expect(result.addresses).toEqual([]);
  });

  it('rejects addresses entry with weight > 1', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        ...validBase,
        addresses: [{ signal: 'high-coupling', weight: 1.5 }],
      })
    ).toThrow();
  });

  it('rejects addresses entry with weight < 0', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        ...validBase,
        addresses: [{ signal: 'high-coupling', weight: -0.1 }],
      })
    ).toThrow();
  });

  it('rejects addresses entry without signal field', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        ...validBase,
        addresses: [{ hard: true }],
      })
    ).toThrow();
  });

  it('accepts addresses entry with only signal (all others optional)', () => {
    const result = SkillMetadataSchema.parse({
      ...validBase,
      addresses: [{ signal: 'dead-code' }],
    });
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses![0]!.signal).toBe('dead-code');
    expect(result.addresses![0]!.hard).toBeUndefined();
    expect(result.addresses![0]!.metric).toBeUndefined();
  });
});

describe('SkillMetadataSchema — knowledge skill fields', () => {
  const knowledgeBase = {
    name: 'react-hooks-pattern',
    version: '1.0.0',
    description: 'Custom hooks for stateful logic reuse',
    triggers: ['manual'] as const,
    platforms: ['claude-code'] as const,
    tools: [],
    type: 'knowledge' as const,
  };

  it('accepts type: knowledge', () => {
    const result = SkillMetadataSchema.parse(knowledgeBase);
    expect(result.type).toBe('knowledge');
  });

  it('accepts paths array and defaults to empty', () => {
    const withPaths = SkillMetadataSchema.parse({ ...knowledgeBase, paths: ['**/*.tsx'] });
    expect(withPaths.paths).toEqual(['**/*.tsx']);
    const withoutPaths = SkillMetadataSchema.parse(knowledgeBase);
    expect(withoutPaths.paths).toEqual([]);
  });

  it('accepts related_skills array and defaults to empty', () => {
    const result = SkillMetadataSchema.parse({
      ...knowledgeBase,
      related_skills: ['react-compound-pattern'],
    });
    expect(result.related_skills).toEqual(['react-compound-pattern']);
    const defaults = SkillMetadataSchema.parse(knowledgeBase);
    expect(defaults.related_skills).toEqual([]);
  });

  it('accepts metadata object with optional fields', () => {
    const result = SkillMetadataSchema.parse({
      ...knowledgeBase,
      metadata: {
        author: 'patterns.dev',
        version: '1.1.0',
        upstream: 'PatternsDev/skills/react',
      },
    });
    expect(result.metadata.author).toBe('patterns.dev');
    expect(result.metadata.upstream).toBe('PatternsDev/skills/react');
  });

  it('defaults metadata to empty object when omitted', () => {
    const result = SkillMetadataSchema.parse(knowledgeBase);
    expect(result.metadata).toEqual({});
  });

  it('metadata passthrough allows arbitrary extra keys', () => {
    const result = SkillMetadataSchema.parse({
      ...knowledgeBase,
      metadata: { customKey: 'value' },
    });
    expect((result.metadata as Record<string, unknown>).customKey).toBe('value');
  });
});

describe('SkillMetadataSchema — knowledge skill refinement constraints', () => {
  const knowledgeBase = {
    name: 'react-hooks-pattern',
    version: '1.0.0',
    description: 'Custom hooks for stateful logic reuse',
    triggers: ['manual'] as const,
    platforms: ['claude-code'] as const,
    tools: [],
    type: 'knowledge' as const,
  };

  it('rejects knowledge skill with non-empty tools', () => {
    expect(() => SkillMetadataSchema.parse({ ...knowledgeBase, tools: ['Read'] })).toThrow();
  });

  it('rejects knowledge skill with non-empty phases', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        ...knowledgeBase,
        phases: [{ name: 'phase-1', description: 'desc', required: true }],
      })
    ).toThrow();
  });

  it('rejects knowledge skill with state.persistent: true', () => {
    expect(() =>
      SkillMetadataSchema.parse({ ...knowledgeBase, state: { persistent: true, files: [] } })
    ).toThrow();
  });

  it('accepts knowledge skill with empty tools, empty phases, and persistent: false (default)', () => {
    const result = SkillMetadataSchema.parse(knowledgeBase);
    expect(result.type).toBe('knowledge');
    expect(result.tools).toEqual([]);
    expect(result.phases).toBeUndefined();
    expect(result.state.persistent).toBe(false);
  });

  it('accepts rigid skill with non-empty tools (refinement does not affect non-knowledge)', () => {
    const result = SkillMetadataSchema.parse({
      ...knowledgeBase,
      type: 'rigid',
      tools: ['Read', 'Write'],
    });
    expect(result.tools).toEqual(['Read', 'Write']);
  });
});
