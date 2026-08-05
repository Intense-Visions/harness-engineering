import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/docs-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { teachesNotDescribesRubric } from '../../src/docs-craft/catalog/rubrics/teaches-not-describes';

describe('critiqueOne (docs-craft)', () => {
  const input = {
    file: '/repo/docs/guides/intro.md',
    relative: 'docs/guides/intro.md',
    kind: 'guide' as const,
    content: '# Intro\n\nThe system supports X, Y, and Z.',
    rubric: teachesNotDescribesRubric,
  };

  it('parses a fenced-JSON finding and emits a DocsFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"enumerates features, never teaches the model"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('DOCS-R001');
    expect(finding!.tier).toBe('foundational');
    expect(finding!.impact).toBe('large');
    expect(finding!.confidence).toBe('high');
    expect(finding!.target.file).toBe('/repo/docs/guides/intro.md');
    expect(finding!.target.relative).toBe('docs/guides/intro.md');
    expect(finding!.target.kind).toBe('guide');
    expect(finding!.cite.rubricId).toBe('DOCS-R001');
    expect(finding!.cite.source).toBe(teachesNotDescribesRubric.source);
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'DOCS-R001', response: '```json\nnull\n```' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when LLM response is malformed', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'DOCS-R001', response: 'no JSON here' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when axes are invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"sky-high","message":"bad"}\n```',
      },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('emits low-confidence findings honestly (ADR 0019)', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"aspirational","impact":"small","confidence":"low","message":"maybe"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.confidence).toBe('low');
  });
});
