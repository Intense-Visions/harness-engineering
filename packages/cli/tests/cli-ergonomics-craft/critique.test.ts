import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/cli-ergonomics-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { namesArePredictableRubric } from '../../src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable';

describe('critiqueOne (cli-ergonomics-craft)', () => {
  const input = {
    file: '/repo/src/commands/build.ts',
    relative: 'src/commands/build.ts',
    kind: 'leaf' as const,
    content: "new Command('build').option('--out <f>').action(() => {});",
    rubric: namesArePredictableRubric,
  };

  it('parses a fenced-JSON finding and emits a CliErgonomicsFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"--out breaks the --output convention used elsewhere"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('CLI-R001');
    expect(finding!.tier).toBe('foundational');
    expect(finding!.impact).toBe('large');
    expect(finding!.confidence).toBe('high');
    expect(finding!.target.file).toBe('/repo/src/commands/build.ts');
    expect(finding!.target.relative).toBe('src/commands/build.ts');
    expect(finding!.target.kind).toBe('leaf');
    expect(finding!.cite.rubricId).toBe('CLI-R001');
    expect(finding!.cite.source).toBe(namesArePredictableRubric.source);
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'CLI-R001', response: '```json\nnull\n```' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when LLM response is malformed', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'CLI-R001', response: 'no JSON here' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when axes are invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"sky-high","message":"bad"}\n```',
      },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('emits low-confidence findings honestly (ADR 0019)', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"aspirational","impact":"small","confidence":"low","message":"maybe"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.confidence).toBe('low');
  });
});
