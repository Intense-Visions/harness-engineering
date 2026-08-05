import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/code-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { revealsIntentRubric } from '../../src/code-craft/catalog/rubrics/reveals-intent';
import { controlFlowHonestRubric } from '../../src/code-craft/catalog/rubrics/control-flow-honest';
import type { CodeUnit } from '../../src/code-craft/findings/schema';

const unit: CodeUnit = { kind: 'function', name: 'handleRequest', line: 3, endLine: 8 };

const source = `import { load } from './db';

export function handleRequest(req) {
  if (req.ok) {
    const doc = load(req.id);
    return doc;
  }
  return null;
}
`;

describe('critiqueOne (code-craft)', () => {
  it('parses a fenced-JSON finding and emits a CodeFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CODE-R001',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"the guard could name the domain rule"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/h.ts',
      source,
      unit,
      rubric: revealsIntentRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('CODE-R001');
    expect(finding!.tier).toBe('polish');
    expect(finding!.impact).toBe('medium');
    expect(finding!.confidence).toBe('high');
    expect(finding!.target.file).toBe('/tmp/h.ts');
    expect(finding!.target.unit).toBe('handleRequest');
    expect(finding!.target.kind).toBe('function');
    expect(finding!.target.line).toBe(3);
    expect(finding!.cite.rubricId).toBe('CODE-R001');
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null` (rubric not applicable)', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'CODE-R001', response: '```json\nnull\n```' },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/h.ts',
      source,
      unit,
      rubric: revealsIntentRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when the LLM response is malformed', async () => {
    const provider = new MockLlmProvider([{ promptIncludes: 'CODE-R002', response: 'no JSON' }]);
    const finding = await critiqueOne({
      file: '/tmp/h.ts',
      source,
      unit,
      rubric: controlFlowHonestRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when axes are invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CODE-R001',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"sky-high","message":"x"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/h.ts',
      source,
      unit,
      rubric: revealsIntentRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('default mock provider returns confidence: low (honest per ADR 0019)', async () => {
    const provider = new MockLlmProvider([]);
    const finding = await critiqueOne({
      file: '/tmp/h.ts',
      source,
      unit,
      rubric: revealsIntentRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.confidence).toBe('low');
  });
});
