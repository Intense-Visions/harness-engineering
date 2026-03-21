import { randomUUID } from 'crypto';
import { sanitizePath } from '../utils/sanitize-path.js';

export const emitInteractionDefinition = {
  name: 'emit_interaction',
  description:
    'Emit a structured interaction (question, confirmation, or phase transition) for round-trip communication with the user',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['question', 'confirmation', 'transition'],
        description: 'Type of interaction',
      },
      stream: {
        type: 'string',
        description: 'State stream for recording (auto-resolves from branch if omitted)',
      },
      question: {
        type: 'object',
        description: 'Question payload (required when type is question)',
        properties: {
          text: { type: 'string', description: 'The question text' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Multiple choice options (omit for free-form)',
          },
          default: { type: 'string', description: 'Default answer' },
        },
        required: ['text'],
      },
      confirmation: {
        type: 'object',
        description: 'Confirmation payload (required when type is confirmation)',
        properties: {
          text: { type: 'string', description: 'What to confirm' },
          context: {
            type: 'string',
            description: 'Why confirmation is needed',
          },
        },
        required: ['text', 'context'],
      },
      transition: {
        type: 'object',
        description: 'Transition payload (required when type is transition)',
        properties: {
          completedPhase: {
            type: 'string',
            description: 'Phase that was completed',
          },
          suggestedNext: {
            type: 'string',
            description: 'Suggested next phase',
          },
          reason: {
            type: 'string',
            description: 'Why the transition is happening',
          },
          artifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths produced during the completed phase',
          },
          requiresConfirmation: {
            type: 'boolean',
            description: 'true = wait for user confirmation, false = proceed immediately',
          },
          summary: {
            type: 'string',
            description: '1-2 sentence rich summary with key metrics',
          },
        },
        required: [
          'completedPhase',
          'suggestedNext',
          'reason',
          'artifacts',
          'requiresConfirmation',
          'summary',
        ],
      },
    },
    required: ['path', 'type'],
  },
};

interface EmitInteractionInput {
  path: string;
  type: 'question' | 'confirmation' | 'transition';
  stream?: string;
  question?: { text: string; options?: string[]; default?: string };
  confirmation?: { text: string; context: string };
  transition?: {
    completedPhase: string;
    suggestedNext: string;
    reason: string;
    artifacts: string[];
    requiresConfirmation: boolean;
    summary: string;
  };
}

export async function handleEmitInteraction(input: EmitInteractionInput) {
  try {
    const projectPath = sanitizePath(input.path);
    const id = randomUUID();

    switch (input.type) {
      case 'question': {
        if (!input.question) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: question payload is required when type is question',
              },
            ],
            isError: true,
          };
        }
        const { text, options, default: defaultAnswer } = input.question;
        let prompt = text;
        if (options && options.length > 0) {
          prompt +=
            '\n\nOptions:\n' +
            options.map((o, i) => `  ${String.fromCharCode(65 + i)}) ${o}`).join('\n');
        }
        if (defaultAnswer) {
          prompt += `\n\nDefault: ${defaultAnswer}`;
        }

        // Record in state decisions array
        await recordInteraction(projectPath, id, 'question', text, input.stream);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ id, prompt }) }],
        };
      }

      case 'confirmation': {
        if (!input.confirmation) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: confirmation payload is required when type is confirmation',
              },
            ],
            isError: true,
          };
        }
        const { text, context } = input.confirmation;
        const prompt = `${text}\n\nContext: ${context}\n\nProceed? (yes/no)`;

        await recordInteraction(projectPath, id, 'confirmation', text, input.stream);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ id, prompt }) }],
        };
      }

      case 'transition': {
        if (!input.transition) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: transition payload is required when type is transition',
              },
            ],
            isError: true,
          };
        }
        const { completedPhase, suggestedNext, reason, artifacts, requiresConfirmation, summary } =
          input.transition;
        const prompt =
          `Phase "${completedPhase}" complete. ${reason}\n\n` +
          `${summary}\n\n` +
          `Artifacts produced:\n${artifacts.map((a) => `  - ${a}`).join('\n')}\n\n` +
          (requiresConfirmation
            ? `Suggested next: "${suggestedNext}". Proceed?`
            : `Proceeding to ${suggestedNext}...`);

        // Write handoff
        try {
          const { saveHandoff } = await import('@harness-engineering/core');
          await saveHandoff(
            projectPath,
            {
              timestamp: new Date().toISOString(),
              fromSkill: 'emit_interaction',
              phase: completedPhase,
              summary: reason,
              completed: [completedPhase],
              pending: [suggestedNext],
              concerns: [],
              decisions: [],
              blockers: [],
              contextKeywords: [],
            },
            input.stream
          );
        } catch {
          // Handoff write failure is non-fatal
        }

        await recordInteraction(
          projectPath,
          id,
          'transition',
          `${completedPhase} -> ${suggestedNext}`,
          input.stream
        );

        const responsePayload: Record<string, unknown> = { id, prompt, handoffWritten: true };
        if (!requiresConfirmation) {
          responsePayload.autoTransition = true;
          responsePayload.nextAction = `Invoke harness-${suggestedNext} skill now`;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(responsePayload),
            },
          ],
        };
      }

      default: {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: unknown interaction type: ${String(input.type)}`,
            },
          ],
          isError: true,
        };
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function recordInteraction(
  projectPath: string,
  id: string,
  type: string,
  decision: string,
  stream?: string
): Promise<void> {
  try {
    const { loadState, saveState } = await import('@harness-engineering/core');
    const stateResult = await loadState(projectPath, stream);
    if (stateResult.ok) {
      const state = stateResult.value;
      state.decisions.push({
        date: new Date().toISOString(),
        decision: `[${type}:${id}] ${decision}`,
        context: 'pending user response',
      });
      await saveState(projectPath, state, stream);
    }
  } catch {
    // State recording failure is non-fatal
  }
}
