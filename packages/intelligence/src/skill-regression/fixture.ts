import { z } from 'zod';
import type { SkillRegressionFixture } from './types.js';

/**
 * Fixture schema + byte-stable (de)serialization.
 *
 * Golden fixtures are committed to the repo, so their on-disk form MUST be
 * byte-stable: the same fixture always serializes to the same bytes regardless
 * of in-memory key order. `serializeFixture` emits keys in a fixed canonical
 * order with a trailing newline, so a re-`--update-baseline` that does not
 * change any value produces a no-op diff (the arch-baseline lesson).
 */

const rubricCriterionSchema = z
  .object({
    id: z.string().min(1),
    criterion: z.string().min(1),
    weight: z.number().positive().optional(),
  })
  .strict();

const goldenBaselineSchema = z
  .object({
    score: z.number().min(0).max(1),
    k: z.number().int().min(1),
    tolerance: z.number().min(0).max(1),
  })
  .strict();

export const fixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    skill: z.string().min(1),
    id: z.string().min(1),
    description: z.string().optional(),
    input: z.string(),
    // Rubric ids must be distinct: the scorer maps each judge ruling to a
    // criterion by id, so a duplicate id inflates totalWeight while a single
    // ruling silently maps to both, skewing the aggregate score.
    rubric: z
      .array(rubricCriterionSchema)
      .min(1)
      .superRefine((rubric, ctx) => {
        const seen = new Set<string>();
        rubric.forEach((criterion, index) => {
          if (seen.has(criterion.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate rubric id "${criterion.id}"`,
              path: [index, 'id'],
            });
          }
          seen.add(criterion.id);
        });
      }),
    referenceOutput: z.string(),
    baseline: goldenBaselineSchema,
  })
  .strict();

/** Parse + validate a fixture object (e.g. from JSON.parse). Throws on invalid input. */
export function parseFixture(raw: unknown): SkillRegressionFixture {
  return fixtureSchema.parse(raw) as SkillRegressionFixture;
}

/**
 * Serialize a fixture to byte-stable JSON: canonical key order, 2-space indent,
 * trailing newline. A criterion's optional `weight` and the fixture's optional
 * `description` are emitted only when present, so an absent optional never
 * churns the bytes.
 */
export function serializeFixture(fixture: SkillRegressionFixture): string {
  const ordered = {
    schemaVersion: fixture.schemaVersion,
    skill: fixture.skill,
    id: fixture.id,
    ...(fixture.description !== undefined ? { description: fixture.description } : {}),
    input: fixture.input,
    rubric: fixture.rubric.map((c) => ({
      id: c.id,
      criterion: c.criterion,
      ...(c.weight !== undefined ? { weight: c.weight } : {}),
    })),
    referenceOutput: fixture.referenceOutput,
    baseline: {
      score: fixture.baseline.score,
      k: fixture.baseline.k,
      tolerance: fixture.baseline.tolerance,
    },
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}
