import { describe, it, expect } from 'vitest';
import {
  InteractionOptionSchema,
  InteractionQuestionWithOptionsSchema,
  InteractionConfirmationSchema,
  InteractionTransitionSchema,
  InteractionBatchSchema,
  EmitInteractionInputSchema,
} from '../../../src/mcp/tools/interaction-schemas';
import {
  emitInteractionDefinition,
  handleEmitInteraction,
} from '../../../src/mcp/tools/interaction';

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
      const markdown = response.content[0].text;
      const meta = JSON.parse(response.content[1].text);
      expect(meta.id).toBeDefined();
      expect(response.content[0].annotations).toEqual({
        audience: ['user', 'assistant'],
        priority: 1.0,
      });
      expect(response.content[1].annotations).toEqual({ audience: ['assistant'], priority: 0.2 });
      expect(markdown).toContain('### Decision needed:');
      expect(markdown).toContain('JWT Middleware');
      expect(markdown).toContain('OAuth2 Provider');
      expect(markdown).toContain('**Pros**');
      expect(markdown).toContain('**Cons**');
      expect(markdown).toContain('**Risk**');
      expect(markdown).toContain('**Effort**');
      expect(markdown).toContain('**Recommendation:**');
      expect(markdown).toContain('confidence: high');
    });

    it('renders free-form question without table', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: { text: 'What is the target environment?' },
      });
      const markdown = response.content[0].text;
      expect(markdown).toContain('What is the target environment?');
      expect(markdown).not.toContain('### Decision needed:');
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

    it('escapes pipe characters in pros and cons', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Pick one',
          options: [
            { label: 'Option A', pros: ['Fast | reliable'], cons: ['Complex | fragile'] },
            { label: 'Option B', pros: ['Simple'], cons: ['Slow'] },
          ],
          recommendation: { optionIndex: 0, reason: 'Better', confidence: 'high' },
        },
      });
      expect(response.isError).toBeFalsy();
      const markdown = response.content[0].text;
      // Pipes in cell content should be escaped
      expect(markdown).toContain('Fast \\| reliable');
      expect(markdown).toContain('Complex \\| fragile');
    });

    it('rejects more than 10 options', async () => {
      const options = Array.from({ length: 11 }, (_, i) => ({
        label: `Option ${i}`,
        pros: ['Pro'],
        cons: ['Con'],
      }));
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Too many',
          options,
          recommendation: { optionIndex: 0, reason: 'First', confidence: 'low' },
        },
      });
      expect(response.isError).toBe(true);
    });

    it('returns error when default index exceeds options length', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Pick one',
          options: [
            { label: 'A', pros: ['Good'], cons: ['Bad'] },
            { label: 'B', pros: ['Fast'], cons: ['Slow'] },
          ],
          recommendation: { optionIndex: 0, reason: 'Better', confidence: 'high' },
          default: 99,
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('default');
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
      const markdown = response.content[0].text;
      expect(markdown).toContain('Deploy to production?');
      expect(markdown).toContain('All staging tests pass');
      expect(markdown).toContain('Impact:');
      expect(markdown).toContain('Risk: Medium');
      expect(markdown).toContain('Proceed? (yes/no)');
    });

    it('renders confirmation without optional fields', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: { text: 'Continue?', context: 'Step complete' },
      });
      const markdown = response.content[0].text;
      expect(markdown).not.toContain('Impact:');
      expect(markdown).not.toContain('Risk:');
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
      const markdown = response.content[0].text;
      const meta = JSON.parse(response.content[1].text);
      expect(markdown).toContain('[PASS] validate');
      expect(markdown).toContain('[FAIL] typecheck');
      expect(markdown).toContain('3 type errors');
      expect(markdown).toContain('Some checks failed');
      expect(meta.handoffWritten).toBe(true);
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
      const markdown = response.content[0].text;
      expect(markdown).not.toContain('Quality Gate');
      expect(markdown).toContain('SCOPE');
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
      const meta = JSON.parse(response.content[1].text);
      expect(meta.autoTransition).toBe(true);
      expect(meta.nextAction).toContain('verification');
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
      const markdown = response.content[0].text;
      const meta = JSON.parse(response.content[1].text);
      expect(meta.batchMode).toBe(true);
      expect(markdown).toContain('Use ESM modules');
      expect(markdown).toContain('Add vitest');
      expect(markdown).toContain('Approve all?');
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
