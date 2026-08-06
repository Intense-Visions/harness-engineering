import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/api-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { verbsAreHonestRubric } from '../../src/api-craft/catalog/rubrics/verbs-are-honest';

describe('critiqueOne (api-craft)', () => {
  const input = {
    file: '/repo/src/routes/widgets.ts',
    relative: 'src/routes/widgets.ts',
    kind: 'route' as const,
    content: "router.get('/widgets/delete/:id', (req, res) => { db.delete(req.params.id); });",
    rubric: verbsAreHonestRubric,
  };

  it('parses a fenced-JSON finding and emits an ApiFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"GET /widgets/delete/:id mutates state; use DELETE /widgets/:id"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('API-R003');
    expect(finding!.tier).toBe('foundational');
    expect(finding!.impact).toBe('large');
    expect(finding!.confidence).toBe('high');
    expect(finding!.target.file).toBe('/repo/src/routes/widgets.ts');
    expect(finding!.target.relative).toBe('src/routes/widgets.ts');
    expect(finding!.target.kind).toBe('route');
    expect(finding!.cite.rubricId).toBe('API-R003');
    expect(finding!.cite.source).toBe(verbsAreHonestRubric.source);
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'API-R003', response: '```json\nnull\n```' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when LLM response is malformed', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'API-R003', response: 'no JSON here' },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('returns null when axes are invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"sky-high","message":"bad"}\n```',
      },
    ]);
    expect(await critiqueOne({ ...input, provider })).toBeNull();
  });

  it('emits low-confidence findings honestly (ADR 0019)', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"aspirational","impact":"small","confidence":"low","message":"maybe"}\n```',
      },
    ]);
    const finding = await critiqueOne({ ...input, provider });
    expect(finding).not.toBeNull();
    expect(finding!.confidence).toBe('low');
  });

  it('labels an openapi surface in the prompt', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'OpenAPI / Swagger specification document',
        response: '```json\nnull\n```',
      },
    ]);
    const result = await critiqueOne({
      ...input,
      kind: 'openapi',
      content: 'openapi: 3.0.0',
      provider,
    });
    // The mock returns `null` only when the openapi label reached the prompt;
    // had it not, the mock's default (a foundational finding) would apply and
    // result would be non-null. So a null result proves the kind was threaded
    // into the prompt text.
    expect(result).toBeNull();
  });
});
