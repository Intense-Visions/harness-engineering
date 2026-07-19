/**
 * Zod validation for the {@link GuardianAnalysis} contract. Used by the tolerant
 * reader to accept only well-formed guardian diff-coverage records and skip
 * everything else (foreign shapes, malformed JSON, intelligence records).
 */

import { z } from 'zod';
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION } from './types.js';

/** `[startLine, endLine]` inclusive uncovered range. */
const regionSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

const fileCoverageSchema = z.object({
  file: z.string().min(1),
  uncoveredLines: z.array(z.number().int().nonnegative()),
  uncoveredRegions: z.array(regionSchema).optional(),
});

/**
 * Strict-enough schema for a guardian diff-coverage record. The `schema` and
 * `version` literals are the discriminator — a record failing them is not a
 * guardian record and is silently skipped by the reader. Unknown extra keys are
 * stripped (not rejected) so a forward-compatible producer that adds fields does
 * not get dropped wholesale.
 */
export const guardianAnalysisSchema = z.object({
  schema: z.literal(GUARDIAN_ANALYSIS_SCHEMA),
  version: z.literal(GUARDIAN_ANALYSIS_VERSION),
  generatedAt: z.string().min(1),
  verdict: z.enum(['pass', 'fail']),
  severity: z.enum(['info', 'warn', 'error']),
  coverageDelta: z.number(),
  files: z.array(fileCoverageSchema),
  summary: z.string().optional(),
});
