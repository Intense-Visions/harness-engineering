import { describe, it, expect } from 'vitest';
import {
  InteractionOptionSchema,
  InteractionQuestionWithOptionsSchema,
  InteractionConfirmationSchema,
  InteractionTransitionSchema,
  InteractionBatchSchema,
  EmitInteractionInputSchema,
} from '../../src/tools/interaction-schemas';
import { emitInteractionDefinition, handleEmitInteraction } from '../../src/tools/interaction';

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

describe('emit_interaction tool', () => {
  it('has correct definition with batch type', () => {
    expect(emitInteractionDefinition.name).toBe('emit_interaction');
    const typeProp = emitInteractionDefinition.inputSchema.properties.type as { enum: string[] };
    expect(typeProp.enum).toContain('batch');
    expect(typeProp.enum).toContain('question');
    expect(typeProp.enum).toContain('confirmation');
    expect(typeProp.enum).toContain('transition');
  });

  describe('question type', () => {
    it('renders markdown table for structured question', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Authentication approach',
          options: [
            {
              label: 'JWT Middleware',
              pros: ['Already in codebase', 'Team knows it'],
              cons: ['No refresh tokens', 'Session-only'],
              risk: 'low',
              effort: 'low',
            },
            {
              label: 'OAuth2 Provider',
              pros: ['Industry standard', 'Refresh tokens built-in'],
              cons: ['New dependency', 'Learning curve'],
              risk: 'medium',
              effort: 'medium',
            },
          ],
          recommendation: {
            optionIndex: 0,
            reason: 'Sufficient for current requirements',
            confidence: 'high',
          },
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.id).toBeDefined();
      expect(parsed.prompt).toContain('### Decision needed:');
      expect(parsed.prompt).toContain('JWT Middleware');
      expect(parsed.prompt).toContain('OAuth2 Provider');
      expect(parsed.prompt).toContain('**Pros**');
      expect(parsed.prompt).toContain('**Cons**');
      expect(parsed.prompt).toContain('**Risk**');
      expect(parsed.prompt).toContain('**Effort**');
      expect(parsed.prompt).toContain('**Recommendation:**');
      expect(parsed.prompt).toContain('confidence: high');
    });

    it('renders free-form question without table', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: { text: 'What is the target environment?' },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('What is the target environment?');
      expect(parsed.prompt).not.toContain('### Decision needed:');
    });

    it('returns error when question has options but no recommendation', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Pick one',
          options: [
            { label: 'A', pros: ['Good'], cons: ['Bad'] },
            { label: 'B', pros: ['Fast'], cons: ['Slow'] },
          ],
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('recommendation');
    });

    it('returns error when question payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('confirmation type', () => {
    it('renders confirmation with impact and risk', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: {
          text: 'Deploy to production?',
          context: 'All staging tests pass',
          impact: 'Production environment will be updated',
          risk: 'medium',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('Deploy to production?');
      expect(parsed.prompt).toContain('All staging tests pass');
      expect(parsed.prompt).toContain('Impact:');
      expect(parsed.prompt).toContain('Risk: Medium');
      expect(parsed.prompt).toContain('Proceed? (yes/no)');
    });

    it('renders confirmation without optional fields', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: { text: 'Continue?', context: 'Step complete' },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).not.toContain('Impact:');
      expect(parsed.prompt).not.toContain('Risk:');
    });

    it('returns error when confirmation payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('transition type', () => {
    it('renders transition with qualityGate', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'planning',
          suggestedNext: 'execution',
          reason: 'Plan approved',
          artifacts: ['docs/plans/plan.md'],
          requiresConfirmation: true,
          summary: '8 tasks, 30 min estimate',
          qualityGate: {
            checks: [
              { name: 'validate', passed: true },
              { name: 'typecheck', passed: false, detail: '3 type errors' },
            ],
            allPassed: false,
          },
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('[PASS] validate');
      expect(parsed.prompt).toContain('[FAIL] typecheck');
      expect(parsed.prompt).toContain('3 type errors');
      expect(parsed.prompt).toContain('Some checks failed');
      expect(parsed.handoffWritten).toBe(true);
    });

    it('renders transition without qualityGate', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'SCOPE',
          suggestedNext: 'DECOMPOSE',
          reason: 'All must-haves derived',
          artifacts: ['docs/plans/plan.md'],
          requiresConfirmation: true,
          summary: 'All must-haves derived from goals.',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).not.toContain('Quality Gate');
      expect(parsed.prompt).toContain('SCOPE');
    });

    it('returns autoTransition for non-confirmed transitions', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'execution',
          suggestedNext: 'verification',
          reason: 'All tasks complete',
          artifacts: ['src/service.ts'],
          requiresConfirmation: false,
          summary: 'Completed 5 tasks.',
        },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.autoTransition).toBe(true);
      expect(parsed.nextAction).toContain('verification');
    });

    it('returns error when transition payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('batch type', () => {
    it('renders batch decisions and returns batchMode flag', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'batch',
        batch: {
          text: 'The following low-risk decisions need approval:',
          decisions: [
            { label: 'Use ESM modules', recommendation: 'Yes, standard for Node 22', risk: 'low' },
            { label: 'Add vitest', recommendation: 'Yes, already used in project', risk: 'low' },
          ],
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.batchMode).toBe(true);
      expect(parsed.prompt).toContain('Use ESM modules');
      expect(parsed.prompt).toContain('Add vitest');
      expect(parsed.prompt).toContain('Approve all?');
    });

    it('returns error when batch payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'batch',
      });
      expect(response.isError).toBe(true);
    });
  });

  it('returns error for unknown type', async () => {
    const response = await handleEmitInteraction({
      path: '/tmp/test-interaction',
      type: 'unknown' as 'question',
    });
    expect(response.isError).toBe(true);
  });
});
