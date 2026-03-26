import { z } from 'zod';

export const RiskLevel = z.enum(['low', 'medium', 'high']);
export const EffortLevel = z.enum(['low', 'medium', 'high']);
export const ConfidenceLevel = z.enum(['low', 'medium', 'high']);

export const InteractionOptionSchema = z.object({
  label: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  risk: RiskLevel.optional(),
  effort: EffortLevel.optional(),
});

export const InteractionQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(InteractionOptionSchema).min(2).max(10).optional(),
  recommendation: z
    .object({
      optionIndex: z.number().int().min(0),
      reason: z.string().min(1),
      confidence: ConfidenceLevel,
    })
    .optional(),
  default: z.number().int().min(0).optional(),
});

// Enforce: if options are provided, recommendation is required
export const InteractionQuestionWithOptionsSchema = InteractionQuestionSchema.refine(
  (data) => {
    if (data.options && data.options.length > 0) {
      return data.recommendation !== undefined;
    }
    return true;
  },
  { message: 'recommendation is required when options are provided' }
)
  .refine(
    (data) => {
      if (data.recommendation && data.options) {
        return data.recommendation.optionIndex < data.options.length;
      }
      return true;
    },
    { message: 'recommendation.optionIndex must reference a valid option' }
  )
  .refine(
    (data) => {
      if (data.default !== undefined && data.options) {
        return data.default < data.options.length;
      }
      return true;
    },
    { message: 'default must reference a valid option index' }
  );

export const InteractionConfirmationSchema = z.object({
  text: z.string().min(1),
  context: z.string().min(1),
  impact: z.string().optional(),
  risk: RiskLevel.optional(),
});

export const QualityGateCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().optional(),
});

export const QualityGateSchema = z.object({
  checks: z.array(QualityGateCheckSchema).min(1),
  allPassed: z.boolean(),
});

export const InteractionTransitionSchema = z.object({
  completedPhase: z.string().min(1),
  suggestedNext: z.string().min(1),
  reason: z.string().min(1),
  artifacts: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  summary: z.string().min(1),
  qualityGate: QualityGateSchema.optional(),
});

export const BatchDecisionSchema = z.object({
  label: z.string().min(1),
  recommendation: z.string().min(1),
  risk: z.literal('low'),
});

export const InteractionBatchSchema = z.object({
  text: z.string().min(1),
  decisions: z.array(BatchDecisionSchema).min(1),
});

export const InteractionTypeSchema = z.enum(['question', 'confirmation', 'transition', 'batch']);

export const EmitInteractionInputSchema = z.object({
  path: z.string().min(1),
  type: InteractionTypeSchema,
  stream: z.string().optional(),
  session: z.string().optional(),
  // Uses base schema here; refined validation (recommendation required with options)
  // is applied in the handler's question branch via InteractionQuestionWithOptionsSchema.
  // Refined schemas with .refine() cannot be nested inside z.object().optional() reliably.
  question: InteractionQuestionSchema.optional(),
  confirmation: InteractionConfirmationSchema.optional(),
  transition: InteractionTransitionSchema.optional(),
  batch: InteractionBatchSchema.optional(),
});

// Exported types
export type InteractionOption = z.infer<typeof InteractionOptionSchema>;
export type InteractionQuestion = z.infer<typeof InteractionQuestionSchema>;
export type InteractionConfirmation = z.infer<typeof InteractionConfirmationSchema>;
export type InteractionTransition = z.infer<typeof InteractionTransitionSchema>;
export type InteractionBatch = z.infer<typeof InteractionBatchSchema>;
export type QualityGate = z.infer<typeof QualityGateSchema>;
export type EmitInteractionInput = z.infer<typeof EmitInteractionInputSchema>;
