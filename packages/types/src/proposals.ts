import { z } from 'zod';

/**
 * Provenance taxonomy for skills in the catalog. Closed enum — adding a value
 * requires an ADR. Backfill writes `user-authored` onto every pre-Phase-4 skill.
 */
export const SkillProvenanceSchema = z.enum(['community', 'agent-proposed', 'user-authored']);
export type SkillProvenance = z.infer<typeof SkillProvenanceSchema>;

// Skill-change enum (renamed from ProposalKindSchema). Alias retained below.
export const SkillKindSchema = z.enum(['new-skill', 'refinement']);
export type SkillKind = z.infer<typeof SkillKindSchema>;

/** @deprecated back-compat alias; identical to SkillKindSchema. */
export const ProposalKindSchema = SkillKindSchema;
export type ProposalKind = SkillKind;

// Outer discriminator.
export const ProposalTypeSchema = z.enum(['skill', 'model']);
export type ProposalType = z.infer<typeof ProposalTypeSchema>;

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

// ── Skill variant (plain object; cross-field refine applied at the union) ──
const SkillProposalObject = z.object({
  kind: z.literal('skill'),
  skillKind: SkillKindSchema,
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  targetSkill: z.string().optional(),
  proposedBy: z.string().min(1),
  source: ProposalSourceSchema,
  content: ProposalContentSchema,
  status: ProposalStatusSchema,
  gate: ProposalGateSchema.optional(),
  decision: ProposalDecisionSchema.optional(),
});

function skillProposalRefine(val: z.infer<typeof SkillProposalObject>, ctx: z.RefinementCtx): void {
  if (val.skillKind === 'new-skill') {
    if (!val.content.skillYaml || !val.content.skillMd)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'new-skill proposals require skillYaml and skillMd',
      });
    if (val.targetSkill)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetSkill'],
        message: 'targetSkill is forbidden on new-skill proposals',
      });
    if (val.content.diff)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content', 'diff'],
        message: 'diff is forbidden on new-skill proposals',
      });
  } else {
    if (!val.targetSkill)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetSkill'],
        message: 'refinement proposals require targetSkill',
      });
    if (!val.content.diff)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content', 'diff'],
        message: 'refinement proposals require a unified diff',
      });
    if (val.content.skillYaml || val.content.skillMd)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'skillYaml/skillMd are forbidden on refinement proposals (use diff)',
      });
  }
}

// ── Model variant ──
export const ModelProposalActionSchema = z.enum(['add', 'swap', 'evict']);
export type ModelProposalAction = z.infer<typeof ModelProposalActionSchema>;

/** Status enum for model proposals: base lifecycle + stale-target terminal (D13/F11). */
export const ModelProposalStatusSchema = z.enum([
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
  'failed_target_missing',
]);
export type ModelProposalStatus = z.infer<typeof ModelProposalStatusSchema>;

export const ModelProposalContentSchema = z
  .object({
    action: ModelProposalActionSchema,
    target: z.object({ hfRepoId: z.string().min(1), ollamaName: z.string().min(1) }),
    replaces: z.object({ ollamaName: z.string().min(1) }).optional(),
    scoreDelta: z.number(),
    justification: z.object({
      summary: z.string(),
      benchmarkBasis: z.array(z.string()),
      hardwareFit: z.string(),
      evidence: z.string(),
      freshness: z.string(),
    }),
    diskImpactGb: z.number(),
  })
  .strict();
export type ModelProposalContent = z.infer<typeof ModelProposalContentSchema>;

const ModelProposalObject = z.object({
  kind: z.literal('model'),
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  proposedBy: z.string().min(1),
  source: ProposalSourceSchema,
  model: ModelProposalContentSchema,
  status: ModelProposalStatusSchema,
  decision: ProposalDecisionSchema.optional(),
});

export type SkillProposal = z.infer<typeof SkillProposalObject>;
export type ModelProposalRecord = z.infer<typeof ModelProposalObject>;

// ── Read-migration: legacy records lack the outer `kind`; the old `kind`
//    held the skill-change value. Map to { kind:'skill', skillKind:<old> }. ──
export function migrateProposalRecord(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (r['kind'] === 'new-skill' || r['kind'] === 'refinement') {
      const { kind, ...rest } = r;
      return { ...rest, kind: 'skill', skillKind: kind };
    }
  }
  return raw;
}

const ProposalObjectUnion = z.discriminatedUnion('kind', [
  SkillProposalObject,
  ModelProposalObject,
]);
export type Proposal = z.infer<typeof ProposalObjectUnion>;

/** Full proposal schema. Accepts legacy + generalized records; runs skill cross-field checks. */
export const ProposalSchema = z.preprocess(
  migrateProposalRecord,
  ProposalObjectUnion.superRefine((val, ctx) => {
    if (val.kind === 'skill') skillProposalRefine(val, ctx);
  })
);

/** Skill-only schema (retained name). Accepts legacy + generalized skill records. */
export const SkillProposalSchema = z.preprocess(
  migrateProposalRecord,
  SkillProposalObject.superRefine(skillProposalRefine)
);

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
