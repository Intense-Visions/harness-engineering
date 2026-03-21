import { describe, it, expect } from 'vitest';
import {
  InteractionTypeSchema,
  QuestionSchema,
  ConfirmationSchema,
  TransitionSchema,
  EmitInteractionInputSchema,
} from '../../src/interaction/types';

describe('InteractionTypeSchema', () => {
  it('accepts valid types', () => {
    expect(InteractionTypeSchema.safeParse('question').success).toBe(true);
    expect(InteractionTypeSchema.safeParse('confirmation').success).toBe(true);
    expect(InteractionTypeSchema.safeParse('transition').success).toBe(true);
  });

  it('rejects invalid types', () => {
    expect(InteractionTypeSchema.safeParse('invalid').success).toBe(false);
    expect(InteractionTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('QuestionSchema', () => {
  it('validates a question with options', () => {
    const result = QuestionSchema.safeParse({
      text: 'Pick a framework',
      options: ['React', 'Vue', 'Svelte'],
      default: 'React',
    });
    expect(result.success).toBe(true);
  });

  it('validates a free-form question (no options)', () => {
    const result = QuestionSchema.safeParse({ text: 'What is the target?' });
    expect(result.success).toBe(true);
  });

  it('rejects missing text', () => {
    expect(QuestionSchema.safeParse({}).success).toBe(false);
  });
});

describe('ConfirmationSchema', () => {
  it('validates a confirmation', () => {
    const result = ConfirmationSchema.safeParse({
      text: 'Deploy to production?',
      context: 'All tests pass on staging',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing context', () => {
    expect(ConfirmationSchema.safeParse({ text: 'Deploy?' }).success).toBe(false);
  });
});

describe('TransitionSchema', () => {
  it('validates a transition', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'SCOPE',
      suggestedNext: 'DECOMPOSE',
      reason: 'All must-haves derived',
      artifacts: ['docs/plans/plan.md'],
      requiresConfirmation: true,
      summary: 'All must-haves derived from goals.',
    });
    expect(result.success).toBe(true);
  });

  it('validates a transition with requiresConfirmation and summary', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'brainstorming',
      suggestedNext: 'planning',
      reason: 'Spec approved',
      artifacts: ['docs/changes/auth/proposal.md'],
      requiresConfirmation: true,
      summary: 'Auth pipeline — 5 decisions, 8 success criteria.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects transition missing requiresConfirmation', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'brainstorming',
      suggestedNext: 'planning',
      reason: 'Spec approved',
      artifacts: ['spec.md'],
      summary: 'Summary here.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects transition missing summary', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'brainstorming',
      suggestedNext: 'planning',
      reason: 'Spec approved',
      artifacts: ['spec.md'],
      requiresConfirmation: true,
    });
    expect(result.success).toBe(false);
  });

  it('validates auto-transition with requiresConfirmation false', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'execution',
      suggestedNext: 'verification',
      reason: 'All tasks complete',
      artifacts: ['src/service.ts'],
      requiresConfirmation: false,
      summary: 'Completed 5 tasks. 3 files created.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing artifacts', () => {
    const result = TransitionSchema.safeParse({
      completedPhase: 'SCOPE',
      suggestedNext: 'DECOMPOSE',
      reason: 'Done',
    });
    expect(result.success).toBe(false);
  });
});

describe('EmitInteractionInputSchema', () => {
  it('validates a complete question input', () => {
    const result = EmitInteractionInputSchema.safeParse({
      path: '/project',
      type: 'question',
      question: { text: 'Pick one', options: ['A', 'B'] },
    });
    expect(result.success).toBe(true);
  });

  it('validates a confirmation input with stream', () => {
    const result = EmitInteractionInputSchema.safeParse({
      path: '/project',
      type: 'confirmation',
      stream: 'feature-x',
      confirmation: { text: 'Proceed?', context: 'Tests pass' },
    });
    expect(result.success).toBe(true);
  });

  it('validates a transition input', () => {
    const result = EmitInteractionInputSchema.safeParse({
      path: '/project',
      type: 'transition',
      transition: {
        completedPhase: 'EXPLORE',
        suggestedNext: 'EVALUATE',
        reason: 'Context gathered',
        artifacts: ['notes.md'],
        requiresConfirmation: true,
        summary: 'Context gathered from 5 sources.',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing path', () => {
    const result = EmitInteractionInputSchema.safeParse({
      type: 'question',
      question: { text: 'Hi' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = EmitInteractionInputSchema.safeParse({
      path: '/project',
      type: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
