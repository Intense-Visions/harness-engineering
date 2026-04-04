import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { sanitizePath } from '../utils/sanitize-path.js';
import {
  EmitInteractionInputSchema,
  InteractionQuestionWithOptionsSchema,
  InteractionConfirmationSchema,
  InteractionTransitionSchema,
  InteractionBatchSchema,
} from './interaction-schemas.js';
import {
  renderQuestion,
  renderConfirmation,
  renderTransition,
  renderBatch,
} from './interaction-renderer.js';

export const emitInteractionDefinition = {
  name: 'emit_interaction',
  description:
    'Emit a structured interaction (question, confirmation, phase transition, or batch decision) for round-trip communication with the user',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['question', 'confirmation', 'transition', 'batch'],
        description: 'Type of interaction',
      },
      stream: {
        type: 'string',
        description: 'State stream for recording (auto-resolves from branch if omitted)',
      },
      session: {
        type: 'string',
        description:
          'Session slug for session-scoped handoff (takes priority over stream when provided)',
      },
      question: {
        type: 'object',
        description: 'Question payload (required when type is question)',
        properties: {
          text: { type: 'string', description: 'The question text' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                pros: { type: 'array', items: { type: 'string' } },
                cons: { type: 'array', items: { type: 'string' } },
                risk: { type: 'string', enum: ['low', 'medium', 'high'] },
                effort: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
              required: ['label', 'pros', 'cons'],
            },
            description: 'Structured options with pros/cons (omit for free-form)',
          },
          recommendation: {
            type: 'object',
            properties: {
              optionIndex: { type: 'number', description: 'Index of recommended option' },
              reason: { type: 'string', description: 'Why this option is recommended' },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['optionIndex', 'reason', 'confidence'],
            description: 'Required when options are provided',
          },
          default: { type: 'number', description: 'Default option index' },
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
          impact: { type: 'string', description: 'Impact description' },
          risk: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Risk level' },
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
          qualityGate: {
            type: 'object',
            properties: {
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    passed: { type: 'boolean' },
                    detail: { type: 'string' },
                  },
                  required: ['name', 'passed'],
                },
              },
              allPassed: { type: 'boolean' },
            },
            required: ['checks', 'allPassed'],
            description: 'Quality gate results for the completed phase',
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
      batch: {
        type: 'object',
        description: 'Batch decision payload (required when type is batch)',
        properties: {
          text: { type: 'string', description: 'Batch description' },
          decisions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                recommendation: { type: 'string' },
                risk: { type: 'string', enum: ['low'] },
              },
              required: ['label', 'recommendation', 'risk'],
            },
            description: 'Low-risk decisions to approve in batch',
          },
        },
        required: ['text', 'decisions'],
      },
    },
    required: ['path', 'type'],
  },
};

import { type McpResponse, type McpContentItem, mcpError } from '../utils.js';

function dualContent(prompt: string, metadata: Record<string, unknown>): McpContentItem[] {
  return [
    {
      type: 'text' as const,
      text: prompt,
      annotations: { audience: ['user' as const, 'assistant' as const], priority: 1.0 },
    },
    {
      type: 'text' as const,
      text: JSON.stringify(metadata),
      annotations: { audience: ['assistant' as const], priority: 0.2 },
    },
  ];
}

function formatZodErrors(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues
    .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

type ValidatedInput = z.infer<typeof EmitInteractionInputSchema>;

async function handleQuestion(
  validInput: ValidatedInput,
  projectPath: string,
  id: string
): Promise<McpResponse> {
  if (!validInput.question)
    return mcpError('Error: question payload is required when type is question');

  const questionResult = InteractionQuestionWithOptionsSchema.safeParse(validInput.question);
  if (!questionResult.success)
    return mcpError(`Error: ${formatZodErrors(questionResult.error.issues)}`);

  const prompt = renderQuestion(questionResult.data);
  await recordInteraction(projectPath, id, 'question', questionResult.data.text, validInput.stream);
  return { content: dualContent(prompt, { id }) };
}

async function handleConfirmation(
  validInput: ValidatedInput,
  projectPath: string,
  id: string
): Promise<McpResponse> {
  if (!validInput.confirmation)
    return mcpError('Error: confirmation payload is required when type is confirmation');

  const confirmResult = InteractionConfirmationSchema.safeParse(validInput.confirmation);
  if (!confirmResult.success)
    return mcpError(
      `Error: ${confirmResult.error.issues.map((i: { message: string }) => i.message).join('; ')}`
    );

  const prompt = renderConfirmation(confirmResult.data);
  await recordInteraction(
    projectPath,
    id,
    'confirmation',
    confirmResult.data.text,
    validInput.stream
  );
  return { content: dualContent(prompt, { id }) };
}

async function handleTransition(
  validInput: ValidatedInput,
  projectPath: string,
  id: string
): Promise<McpResponse> {
  if (!validInput.transition)
    return mcpError('Error: transition payload is required when type is transition');

  const transitionResult = InteractionTransitionSchema.safeParse(validInput.transition);
  if (!transitionResult.success)
    return mcpError(
      `Error: ${transitionResult.error.issues.map((i: { message: string }) => i.message).join('; ')}`
    );

  const transition = transitionResult.data;
  const prompt = renderTransition(transition);

  try {
    const { saveHandoff } = await import('@harness-engineering/core');
    await saveHandoff(
      projectPath,
      {
        timestamp: new Date().toISOString(),
        fromSkill: 'emit_interaction',
        phase: transition.completedPhase,
        summary: transition.reason,
        completed: [transition.completedPhase],
        pending: [transition.suggestedNext],
        concerns: [],
        decisions: [],
        blockers: [],
        contextKeywords: [],
      },
      validInput.stream,
      validInput.session
    );
  } catch {
    /* Handoff write failure is non-fatal */
  }

  await recordInteraction(
    projectPath,
    id,
    'transition',
    `${transition.completedPhase} -> ${transition.suggestedNext}`,
    validInput.stream
  );

  const metadata: Record<string, unknown> = { id, handoffWritten: true };
  if (!transition.requiresConfirmation) {
    metadata.autoTransition = true;
    metadata.nextAction = `Invoke harness-${transition.suggestedNext} skill now`;
  }

  return { content: dualContent(prompt, metadata) };
}

async function handleBatch(
  validInput: ValidatedInput,
  projectPath: string,
  id: string
): Promise<McpResponse> {
  if (!validInput.batch) return mcpError('Error: batch payload is required when type is batch');

  const batchResult = InteractionBatchSchema.safeParse(validInput.batch);
  if (!batchResult.success)
    return mcpError(
      `Error: ${batchResult.error.issues.map((i: { message: string }) => i.message).join('; ')}`
    );

  const prompt = renderBatch(batchResult.data);
  await recordInteraction(projectPath, id, 'batch', batchResult.data.text, validInput.stream);
  return { content: dualContent(prompt, { id, batchMode: true }) };
}

const INTERACTION_HANDLERS: Record<
  string,
  (validInput: ValidatedInput, projectPath: string, id: string) => Promise<McpResponse>
> = {
  question: handleQuestion,
  confirmation: handleConfirmation,
  transition: handleTransition,
  batch: handleBatch,
};

// Accept broad input type from MCP server handler dispatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleEmitInteraction(input: Record<string, any>) {
  try {
    const parseResult = EmitInteractionInputSchema.safeParse(input);
    if (!parseResult.success)
      return mcpError(`Error: ${formatZodErrors(parseResult.error.issues)}`);

    const validInput = parseResult.data;
    const projectPath = sanitizePath(validInput.path);
    const id = randomUUID();

    const handler = INTERACTION_HANDLERS[validInput.type];
    if (!handler) return mcpError(`Error: unknown interaction type: ${String(validInput.type)}`);

    return await handler(validInput, projectPath, id);
  } catch (error) {
    return mcpError(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
