// packages/core/src/interaction/types.ts
import { z } from 'zod';

export const InteractionTypeSchema = z.enum(['question', 'confirmation', 'transition']);

export const QuestionSchema = z.object({
  text: z.string(),
  options: z.array(z.string()).optional(),
  default: z.string().optional(),
});

export const ConfirmationSchema = z.object({
  text: z.string(),
  context: z.string(),
});

export const TransitionSchema = z.object({
  completedPhase: z.string(),
  suggestedNext: z.string(),
  reason: z.string(),
  artifacts: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  summary: z.string(),
});

export const EmitInteractionInputSchema = z.object({
  path: z.string(),
  type: InteractionTypeSchema,
  stream: z.string().optional(),
  question: QuestionSchema.optional(),
  confirmation: ConfirmationSchema.optional(),
  transition: TransitionSchema.optional(),
});

export type InteractionType = z.infer<typeof InteractionTypeSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Confirmation = z.infer<typeof ConfirmationSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type EmitInteractionInput = z.infer<typeof EmitInteractionInputSchema>;
