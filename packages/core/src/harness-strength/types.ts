import { z } from 'zod';

// --- Enums ---

export const ModeSchema = z.enum(['adopter', 'toolkit']);
export type Mode = z.infer<typeof ModeSchema>;

export const SeveritySchema = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const TierSchema = z.enum(['solid', 'at-risk', 'theatre']);
export type Tier = z.infer<typeof TierSchema>;

// --- Finding ---

export const StrengthFindingSchema = z.object({
  id: z.string(), // e.g. "STRENGTH-001"
  gearPiece: z.string(), // label only (v1) — gear piece this defends
  severity: SeveritySchema,
  file: z.string(), // relative to root
  line: z.number().int().positive().optional(), // when locatable
  message: z.string(), // what's wrong
  remediation: z.string(), // concrete fix
});
export type StrengthFinding = z.infer<typeof StrengthFindingSchema>;

// --- HarnessConfig subset (core-local; cli's HarnessConfig is not importable here) ---
// Only the keys Phase 2 rules read. Lenient parse: unknown keys pass through.

export const HarnessConfigSubsetSchema = z
  .object({
    layers: z.array(z.unknown()).optional(),
    architecture: z
      // `thresholds` distinguishes absent (undefined) from empty ({}): Phase 2's
      // STRENGTH-004 rule treats both as meaningful — undefined = key never set,
      // {} = key present but no thresholds configured.
      .object({ thresholds: z.record(z.unknown()).optional() })
      .passthrough()
      .optional(),
    template: z.object({ level: z.string().optional() }).passthrough().optional(),
    audit: z
      .object({
        harnessStrength: z
          .object({ severities: z.record(SeveritySchema).optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type HarnessConfigSubset = z.infer<typeof HarnessConfigSubsetSchema>;

// --- ProjectContext ---

export const HookFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  text: z.string(),
});
export type HookFile = z.infer<typeof HookFileSchema>;

export const ProjectContextSchema = z.object({
  root: z.string(),
  mode: ModeSchema,
  config: HarnessConfigSubsetSchema.nullable(),
  preCommit: z.string().nullable(),
  hookFiles: z.array(HookFileSchema),
  workflows: z.array(z.object({ path: z.string(), text: z.string() })),
  healthSnapshot: z.unknown().nullable(),
  templates: z.array(z.object({ path: z.string(), text: z.string() })).optional(),
  initSkill: z.string().nullable().optional(),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

// --- AuditResult ---

export const AuditSummarySchema = z.object({
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
  rulesRun: z.number().int().nonnegative(),
  rulesPassing: z.number().int().nonnegative(),
});

export const AuditResultSchema = z.object({
  mode: ModeSchema,
  score: z.number().min(0).max(100),
  tier: TierSchema,
  findings: z.array(StrengthFindingSchema),
  summary: AuditSummarySchema,
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

// --- StrengthRule interface (registry contract; implementations land in Phase 2) ---

export interface StrengthRule {
  id: string;
  gearPiece: string;
  defaultSeverity: Severity;
  appliesIn(mode: Mode): boolean;
  /**
   * Optional. Returns false when the rule's required input is absent, so the
   * auditor excludes it from rulesRun/rulesPassing (a "not evaluable" pattern
   * must never count as a pass — success criterion #7). Omitted => always evaluable.
   */
  evaluable?(ctx: ProjectContext): boolean;
  // severity is applied by the auditor (config-overridable); detect returns the rest:
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[];
}
