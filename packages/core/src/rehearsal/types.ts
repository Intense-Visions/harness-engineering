import { z } from 'zod';

// --- Rehearsal fixtures & scoring contracts ---
//
// A rehearsal fixture is a tiny, self-contained code (or docs) sample with a
// single deliberately-planted failure mode that one of the harness's own checks
// is designed to catch. An agent (or a persona under evaluation) is pointed at
// the fixture, asked to detect and repair the planted problem, and its recovery
// is SCORED against the fixture's manifest. The scoring is pure and deterministic
// (no LLM, no IO) so a known-good recovery and a known-bad recovery map to stable,
// testable scores — the fixture is the ground truth, the scorer is the referee.

/**
 * The catalogue of planted failure modes. Each maps to a real harness check so
 * the rehearsal validates an actual harness capability, not a synthetic one.
 */
export const FailureModeSchema = z.enum([
  'leaked-secret', // a credential committed into source
  'layer-violation', // an import that crosses an architectural boundary
  'dependency-cycle', // a circular import between modules
  'broken-doc-link', // a documentation link pointing at a missing target
]);
export type FailureMode = z.infer<typeof FailureModeSchema>;

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** The per-dimension rubric text shown to the human/agent (documentation only). */
export const RehearsalRubricSchema = z.object({
  detected: z.string(),
  correctCheck: z.string(),
  fixed: z.string(),
  noCollateral: z.string(),
});
export type RehearsalRubric = z.infer<typeof RehearsalRubricSchema>;

/**
 * A fixture manifest (`rehearsal.json`) — the ground truth for one fixture.
 * Loaded from `templates/rehearsal-fixtures/<id>/rehearsal.json`.
 */
export const RehearsalManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'id must be lowercase-with-hyphens (matches its directory name)'),
  title: z.string(),
  failureMode: FailureModeSchema,
  difficulty: DifficultySchema,
  summary: z.string(),
  /** The file within the fixture that carries the planted defect. */
  plantedFile: z.string(),
  /** Human description of what was planted and where. */
  plantedDescription: z.string(),
  /** The harness check an agent should reach for (e.g. "harness check-security"). */
  expectedCheck: z.string(),
  /** How the fix should look once recovered. */
  expectedFix: z.string(),
  rubric: RehearsalRubricSchema,
});
export type RehearsalManifest = z.infer<typeof RehearsalManifestSchema>;

/**
 * A structured record of ONE recovery attempt against a fixture. The rehearse
 * skill (or a harness gate replaying a fixture) produces this after the agent
 * has attempted detection + repair; the scorer consumes it. It is deliberately
 * structured (not free text) so scoring is deterministic and unit-testable.
 */
export const RecoveryRecordSchema = z.object({
  fixtureId: z.string(),
  /** Did the agent identify that a defect was planted at all? */
  detected: z.boolean(),
  /**
   * What the agent said the failure mode was, if it named one. When present it
   * must match the manifest's failureMode for the `detected` dimension to score;
   * when absent the `detected` boolean alone is trusted.
   */
  identifiedFailureMode: FailureModeSchema.optional(),
  /** The harness check the agent ran or cited (e.g. "harness check-security"). */
  checkCited: z.string().optional(),
  /** Was the planted defect actually resolved? */
  fixed: z.boolean(),
  /** Did the recovery introduce unrelated breakage (collateral damage)? */
  collateralDamage: z.boolean(),
  notes: z.string().optional(),
});
export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>;

// --- Score ---

export const RehearsalTierSchema = z.enum(['pass', 'partial', 'fail']);
export type RehearsalTier = z.infer<typeof RehearsalTierSchema>;

export const ScoreDimensionSchema = z.object({
  name: z.enum(['detected', 'correctCheck', 'fixed', 'noCollateral']),
  weight: z.number().int().nonnegative(),
  credited: z.boolean(),
  reason: z.string(),
});
export type ScoreDimension = z.infer<typeof ScoreDimensionSchema>;

export const RehearsalScoreSchema = z.object({
  fixtureId: z.string(),
  failureMode: FailureModeSchema,
  score: z.number().int().min(0).max(100),
  tier: RehearsalTierSchema,
  dimensions: z.array(ScoreDimensionSchema),
});
export type RehearsalScore = z.infer<typeof RehearsalScoreSchema>;
