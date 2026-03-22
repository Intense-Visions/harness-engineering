import { describe, it, expect } from 'vitest';
import {
  InteractionOptionSchema,
  InteractionQuestionWithOptionsSchema,
  InteractionConfirmationSchema,
  InteractionTransitionSchema,
  InteractionBatchSchema,
  EmitInteractionInputSchema,
} from '../../src/tools/interaction-schemas';

describe('InteractionOptionSchema', () => {
  it('accepts valid option with pros, cons, risk, effort', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Already in codebase'],
      cons: ['No refresh tokens'],
      risk: 'low',
      effort: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('rejects option with empty pros', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: [],
      cons: ['No refresh tokens'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects option missing cons', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Fast'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid risk enum value', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Fast'],
      cons: ['Slow'],
      risk: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('InteractionQuestionWithOptionsSchema', () => {
  it('accepts question with options and recommendation', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
      recommendation: { optionIndex: 0, reason: 'Simpler', confidence: 'high' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects question with options but no recommendation', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects recommendation with out-of-bounds optionIndex', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
      recommendation: { optionIndex: 5, reason: 'Simpler', confidence: 'high' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts free-form question (no options, no recommendation)', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'What is the target environment?',
    });
    expect(result.success).toBe(true);
  });
});

describe('InteractionConfirmationSchema', () => {
  it('accepts valid confirmation with impact and risk', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
      context: 'All tests pass',
      impact: 'Production updated',
      risk: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('accepts confirmation without optional fields', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
      context: 'All tests pass',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confirmation missing context', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
    });
    expect(result.success).toBe(false);
  });
});

describe('InteractionTransitionSchema', () => {
  it('accepts transition with qualityGate', () => {
    const result = InteractionTransitionSchema.safeParse({
      completedPhase: 'planning',
      suggestedNext: 'execution',
      reason: 'Plan approved',
      artifacts: ['plan.md'],
      requiresConfirmation: true,
      summary: '8 tasks planned',
      qualityGate: {
        checks: [
          { name: 'validate', passed: true },
          { name: 'typecheck', passed: false, detail: '3 errors' },
        ],
        allPassed: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts transition without qualityGate', () => {
    const result = InteractionTransitionSchema.safeParse({
      completedPhase: 'planning',
      suggestedNext: 'execution',
      reason: 'Plan approved',
      artifacts: [],
      requiresConfirmation: true,
      summary: 'Done',
    });
    expect(result.success).toBe(true);
  });
});

describe('InteractionBatchSchema', () => {
  it('accepts batch with low-risk decisions', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these decisions:',
      decisions: [
        { label: 'Use ESM', recommendation: 'Yes', risk: 'low' },
        { label: 'Add vitest', recommendation: 'Yes', risk: 'low' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects batch with non-low risk', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these:',
      decisions: [{ label: 'Drop database', recommendation: 'No', risk: 'high' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects batch with empty decisions', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these:',
      decisions: [],
    });
    expect(result.success).toBe(false);
  });
});
