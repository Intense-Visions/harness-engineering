import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/naming-craft/phases/critique';
import { MockLlmProvider } from '../../src/naming-craft/llm/provider';
import { predictivePowerRubric } from '../../src/naming-craft/catalog/rubrics/predictive-power';
import { sampleConventions } from '../../src/naming-craft/extract/convention';
import type { ExtractedIdentifier } from '../../src/naming-craft/extract/identifiers';

const identifier: ExtractedIdentifier = {
  name: 'processData',
  kind: 'function',
  file: 'a.ts',
  line: 10,
  exported: true,
  scopeSize: 'long',
  contextLines: ['function processData(input) {', '  return input;', '}'],
};

describe('critiqueOne', () => {
  it('parses a fenced-JSON finding and emits a NamingFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'processData',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"vague verb"}\n```',
      },
    ]);
    const convention = sampleConventions([], []);
    const finding = await critiqueOne({
      identifier,
      rubric: predictivePowerRubric,
      convention,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('NAME-R001');
    expect(finding!.tier).toBe('polish');
    expect(finding!.impact).toBe('medium');
    expect(finding!.confidence).toBe('high');
    expect(finding!.message).toBe('vague verb');
    expect(finding!.target.identifier).toBe('processData');
    expect(finding!.cite.rubricId).toBe('NAME-R001');
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null`', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'processData', response: '```json\nnull\n```' },
    ]);
    const convention = sampleConventions([], []);
    const finding = await critiqueOne({
      identifier,
      rubric: predictivePowerRubric,
      convention,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when LLM response is malformed', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'processData', response: 'not a JSON block' },
    ]);
    const convention = sampleConventions([], []);
    const finding = await critiqueOne({
      identifier,
      rubric: predictivePowerRubric,
      convention,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when 3-axis fields are missing or invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'processData',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"super-high","message":"bad"}\n```',
      },
    ]);
    const convention = sampleConventions([], []);
    const finding = await critiqueOne({
      identifier,
      rubric: predictivePowerRubric,
      convention,
      provider,
    });
    expect(finding).toBeNull();
  });
});
