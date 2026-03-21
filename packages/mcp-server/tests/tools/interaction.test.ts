import { describe, it, expect } from 'vitest';
import { emitInteractionDefinition, handleEmitInteraction } from '../../src/tools/interaction';

describe('emit_interaction tool', () => {
  it('has correct definition', () => {
    expect(emitInteractionDefinition.name).toBe('emit_interaction');
    expect(emitInteractionDefinition.inputSchema.required).toContain('path');
    expect(emitInteractionDefinition.inputSchema.required).toContain('type');
  });

  it('has type enum with question, confirmation, transition', () => {
    const typeProp = emitInteractionDefinition.inputSchema.properties.type as {
      enum: string[];
    };
    expect(typeProp.enum).toContain('question');
    expect(typeProp.enum).toContain('confirmation');
    expect(typeProp.enum).toContain('transition');
  });

  describe('question type', () => {
    it('returns id and prompt for a multiple-choice question', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: { text: 'Pick a framework', options: ['React', 'Vue'] },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(parsed.prompt).toContain('Pick a framework');
      expect(parsed.prompt).toContain('React');
      expect(parsed.prompt).toContain('Vue');
    });

    it('returns prompt for a free-form question', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: { text: 'What is the target environment?' },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('What is the target environment?');
    });

    it('returns error when question payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('question');
    });
  });

  describe('confirmation type', () => {
    it('returns id and prompt for a confirmation', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: {
          text: 'Deploy to production?',
          context: 'All staging tests pass',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.id).toBeDefined();
      expect(parsed.prompt).toContain('Deploy to production?');
      expect(parsed.prompt).toContain('All staging tests pass');
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
    it('returns id, prompt, and handoffWritten for a transition', async () => {
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
      expect(parsed.id).toBeDefined();
      expect(parsed.prompt).toContain('SCOPE');
      expect(parsed.prompt).toContain('DECOMPOSE');
      expect(parsed.handoffWritten).toBe(true);
    });

    it('returns autoTransition and nextAction for auto-transitions', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'execution',
          suggestedNext: 'verification',
          reason: 'All tasks complete',
          artifacts: ['src/service.ts'],
          requiresConfirmation: false,
          summary: 'Completed 5 tasks. 3 files created.',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.autoTransition).toBe(true);
      expect(parsed.nextAction).toContain('verification');
      expect(parsed.handoffWritten).toBe(true);
    });

    it('does not include autoTransition for confirmed transitions', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'brainstorming',
          suggestedNext: 'planning',
          reason: 'Spec approved',
          artifacts: ['docs/spec.md'],
          requiresConfirmation: true,
          summary: 'Auth spec approved with 5 decisions.',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.autoTransition).toBeUndefined();
      expect(parsed.nextAction).toBeUndefined();
      expect(parsed.handoffWritten).toBe(true);
    });

    it('includes summary in transition prompt', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'planning',
          suggestedNext: 'execution',
          reason: 'Plan approved',
          artifacts: ['docs/plans/plan.md'],
          requiresConfirmation: true,
          summary: 'Notification system — 8 tasks, 30 min estimate.',
        },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('Notification system');
    });

    it('returns error when transition payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
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
