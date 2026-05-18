import { z } from 'zod';

/**
 * Provenance taxonomy for skills in the catalog. Closed enum — adding a value
 * requires an ADR. Backfill writes `user-authored` onto every pre-Phase-4 skill.
 */
export const SkillProvenanceSchema = z.enum(['community', 'agent-proposed', 'user-authored']);
export type SkillProvenance = z.infer<typeof SkillProvenanceSchema>;

export const ProposalKindSchema = z.enum(['new-skill', 'refinement']);
export type ProposalKind = z.infer<typeof ProposalKindSchema>;

export const ProposalStatusSchema = z.enum([
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalGateFindingSchema = z.object({
  severity: z.enum(['error', 'warning']),
  title: z.string(),
  detail: z.string(),
});
export type ProposalGateFinding = z.infer<typeof ProposalGateFindingSchema>;

export const ProposalGateSchema = z.object({
  lastRunAt: z.string().datetime().optional(),
  findings: z.array(ProposalGateFindingSchema).optional(),
});
export type ProposalGate = z.infer<typeof ProposalGateSchema>;

export const ProposalDecisionSchema = z.object({
  decidedAt: z.string().datetime(),
  decidedBy: z.string(),
  action: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});
export type ProposalDecision = z.infer<typeof ProposalDecisionSchema>;

export const ProposalContentSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .max(64),
    description: z.string().min(20).max(280),
    skillYaml: z.string().optional(),
    skillMd: z.string().optional(),
    diff: z.string().optional(),
  })
  .strict();
export type ProposalContent = z.infer<typeof ProposalContentSchema>;

export const ProposalSourceSchema = z.object({
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  justification: z.string().min(20).max(2000),
});
export type ProposalSource = z.infer<typeof ProposalSourceSchema>;

export const SkillProposalSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    kind: ProposalKindSchema,
    targetSkill: z.string().optional(),
    proposedBy: z.string().min(1),
    source: ProposalSourceSchema,
    content: ProposalContentSchema,
    status: ProposalStatusSchema,
    gate: ProposalGateSchema.optional(),
    decision: ProposalDecisionSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'new-skill') {
      if (!val.content.skillYaml || !val.content.skillMd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message: 'new-skill proposals require skillYaml and skillMd',
        });
      }
      if (val.targetSkill) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetSkill'],
          message: 'targetSkill is forbidden on new-skill proposals',
        });
      }
      if (val.content.diff) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'diff'],
          message: 'diff is forbidden on new-skill proposals',
        });
      }
    } else if (val.kind === 'refinement') {
      if (!val.targetSkill) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetSkill'],
          message: 'refinement proposals require targetSkill',
        });
      }
      if (!val.content.diff) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'diff'],
          message: 'refinement proposals require a unified diff',
        });
      }
      if (val.content.skillYaml || val.content.skillMd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message: 'skillYaml/skillMd are forbidden on refinement proposals (use diff)',
        });
      }
    }
  });
export type SkillProposal = z.infer<typeof SkillProposalSchema>;

/** Input payload accepted by `emit_skill_proposal`. */
export const EmitSkillProposalInputSchema = z.object({
  kind: ProposalKindSchema,
  targetSkill: z.string().optional(),
  proposedBy: z.string().min(1).max(120),
  justification: z.string().min(20).max(2000),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  content: ProposalContentSchema,
});
export type EmitSkillProposalInput = z.infer<typeof EmitSkillProposalInputSchema>;

/** Edit payload accepted by PATCH /api/v1/proposals/:id. */
export const EditProposalInputSchema = z.object({
  content: ProposalContentSchema.partial(),
});
export type EditProposalInput = z.infer<typeof EditProposalInputSchema>;
