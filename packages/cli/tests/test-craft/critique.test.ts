import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/test-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { contractNotNarrativeNameRubric } from '../../src/test-craft/catalog/rubrics/contract-not-narrative-name';
import type { ExtractedTest } from '../../src/test-craft/findings/schema';

const test: ExtractedTest = {
  file: 'src/foo.test.ts',
  line: 10,
  testName: 'works correctly',
  nesting: ['parseTokens'],
  body: `expect(parseTokens('a,b,c')).toEqual(['a','b','c']);`,
  framework: 'vitest',
  skipped: false,
  todo: false,
  only: false,
};

describe('critiqueOne', () => {
  it('parses a fenced-JSON finding and emits a TestFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'works correctly',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"narrative name"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      test,
      rubric: contractNotNarrativeNameRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('TEST-R001');
    expect(finding!.target.testName).toBe('works correctly');
    expect(finding!.target.nesting).toEqual(['parseTokens']);
    expect(finding!.target.framework).toBe('vitest');
    expect(finding!.cite.rubricId).toBe('TEST-R001');
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'works correctly', response: '```json\nnull\n```' },
    ]);
    const finding = await critiqueOne({
      test,
      rubric: contractNotNarrativeNameRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null on invalid axes', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'works correctly',
        response:
          '```json\n{"tier":"polish","impact":"huge","confidence":"high","message":"x"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      test,
      rubric: contractNotNarrativeNameRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('includes source context in prompt when sourcePair provided', async () => {
    let capturedPrompt = '';
    const provider = new MockLlmProvider();
    // Intercept callText
    const original = provider.callText.bind(provider);
    provider.callText = async (prompt, opts) => {
      capturedPrompt = prompt;
      return original(prompt, opts);
    };
    await critiqueOne({
      test,
      rubric: contractNotNarrativeNameRubric,
      provider,
      sourcePair: { file: 'src/foo.ts', content: 'export function parseTokens(s: string) {}' },
    });
    expect(capturedPrompt).toContain('Source under test');
    expect(capturedPrompt).toContain('parseTokens');
  });
});
