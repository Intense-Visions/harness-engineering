import { describe, it, expect } from 'vitest';
import {
  AcceptanceEvaluator,
  deriveAcceptanceAuthority,
  acceptanceVerdictSchema,
  ACCEPTANCE_EVAL_SYSTEM_PROMPT,
  buildAcceptanceUserPrompt,
} from '../../src/index.js';
import type { AcceptanceVerdict } from '../../src/index.js';

describe('@harness-engineering/intelligence acceptance-eval surface', () => {
  it('re-exports AcceptanceEvaluator, deriveAcceptanceAuthority, acceptanceVerdictSchema', () => {
    expect(typeof AcceptanceEvaluator).toBe('function');
    expect(typeof deriveAcceptanceAuthority).toBe('function');
    expect(typeof acceptanceVerdictSchema.parse).toBe('function');
  });

  it('AcceptanceVerdict type is importable from the barrel (compile-time)', () => {
    const v: AcceptanceVerdict = {
      measurability: 'MEASURABLE',
      confidence: 'low',
      authority: 'advisory',
      judgedAgainst: 'success-criteria',
      criteriaFindings: [],
      coverageFindings: [],
      rationale: 'ok',
    };
    expect(v.authority).toBe('advisory');
  });

  it('re-exports the prompt builder and system prompt from the barrel', () => {
    expect(typeof buildAcceptanceUserPrompt).toBe('function');
    expect(typeof ACCEPTANCE_EVAL_SYSTEM_PROMPT).toBe('string');
    expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
