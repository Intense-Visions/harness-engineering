import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/copy-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { whatWhyHowToFixRubric } from '../../src/copy-craft/catalog/rubrics/what-why-how-to-fix';
import type { ExtractedCopyItem } from '../../src/copy-craft/findings/schema';

const item: ExtractedCopyItem = {
  file: 'src/parse.ts',
  line: 14,
  surface: 'error',
  snippet: 'parse error',
  context: { errorType: 'Error' },
};

describe('critiqueOne', () => {
  it('parses a fenced-JSON finding and emits a CopyFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'parse error',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"medium","message":"too generic"}\n```',
      },
    ]);
    const finding = await critiqueOne({ item, rubric: whatWhyHowToFixRubric, provider });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('COPY-R001');
    expect(finding!.target.surface).toBe('error');
    expect(finding!.target.line).toBe(14);
    expect(finding!.cite.rubricId).toBe('COPY-R001');
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'parse error', response: '```json\nnull\n```' },
    ]);
    const finding = await critiqueOne({ item, rubric: whatWhyHowToFixRubric, provider });
    expect(finding).toBeNull();
  });

  it('returns null on invalid axes', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'parse error',
        response:
          '```json\n{"tier":"foundational","impact":"giant","confidence":"high","message":"x"}\n```',
      },
    ]);
    const finding = await critiqueOne({ item, rubric: whatWhyHowToFixRubric, provider });
    expect(finding).toBeNull();
  });
});
