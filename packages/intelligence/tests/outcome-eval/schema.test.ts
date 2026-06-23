import { describe, it, expect } from 'vitest';
import { verdictSchema } from '../../src/outcome-eval/prompts.js';

describe('verdictSchema', () => {
  it('accepts a well-formed LLM verdict payload', () => {
    const parsed = verdictSchema.parse({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'Criterion 2 unmet: endpoint returns 200 not 404.',
      unmetCriteria: ['Criterion 2'],
    });
    expect(parsed.verdict).toBe('NOT_SATISFIED');
    expect(parsed.confidence).toBe('high');
    expect(parsed.unmetCriteria).toEqual(['Criterion 2']);
  });

  it('does not expose authority as a field (Criterion 4)', () => {
    expect(Object.keys(verdictSchema.shape)).not.toContain('authority');
  });

  it('rejects a payload that attempts to inject authority directly (Criterion 4)', () => {
    const result = verdictSchema.safeParse({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'attempting to self-assign blocking authority',
      unmetCriteria: [],
      authority: 'blocking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-enum verdict', () => {
    const result = verdictSchema.safeParse({
      verdict: 'MAYBE',
      confidence: 'high',
      rationale: 'x',
      unmetCriteria: [],
    });
    expect(result.success).toBe(false);
  });
});
