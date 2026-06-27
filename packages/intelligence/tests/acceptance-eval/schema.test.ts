import { describe, it, expect } from 'vitest';
import { acceptanceVerdictSchema } from '../../src/acceptance-eval/prompts.js';

describe('acceptanceVerdictSchema', () => {
  it('accepts a well-formed LLM verdict payload', () => {
    const parsed = acceptanceVerdictSchema.parse({
      measurability: 'NOT_MEASURABLE',
      confidence: 'high',
      rationale: 'No section states an observable, testable outcome.',
      criteriaFindings: [{ target: 'Criterion 1', message: 'not observable' }],
      coverageFindings: [{ target: 'login flow', message: 'no covering test' }],
    });
    expect(parsed.measurability).toBe('NOT_MEASURABLE');
    expect(parsed.criteriaFindings[0].target).toBe('Criterion 1');
    expect(parsed.coverageFindings[0].message).toBe('no covering test');
  });

  it('does not expose authority as a field', () => {
    expect(Object.keys(acceptanceVerdictSchema.shape)).not.toContain('authority');
  });

  it('rejects a payload that injects authority directly', () => {
    const result = acceptanceVerdictSchema.safeParse({
      measurability: 'NOT_MEASURABLE',
      confidence: 'high',
      rationale: 'attempting to self-assign blocking authority',
      criteriaFindings: [],
      coverageFindings: [],
      authority: 'blocking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-enum measurability', () => {
    const result = acceptanceVerdictSchema.safeParse({
      measurability: 'MAYBE',
      confidence: 'high',
      rationale: 'x',
      criteriaFindings: [],
      coverageFindings: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a finding with an extra key (strict findings)', () => {
    const result = acceptanceVerdictSchema.safeParse({
      measurability: 'MEASURABLE',
      confidence: 'low',
      rationale: 'ok',
      criteriaFindings: [{ target: 't', message: 'm', severity: 'high' }],
      coverageFindings: [],
    });
    expect(result.success).toBe(false);
  });
});
