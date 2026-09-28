import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Ok, Err, type Result } from '../shared/result';
import type { SupplyChainSnapshot } from './security-timeline-types';

/**
 * An externally-measured supply-chain audit, supplied to the security timeline
 * instead of the all-zero default.
 *
 * Every field is validated strictly because the whole point of supplying a
 * measurement is to replace a false green: a typo'd key, a negative count, or a
 * `total` that disagrees with its own severities must fail loudly rather than be
 * coerced into something that scores as clean.
 */
const count = z.number().int().nonnegative();

export const SupplyChainMeasurementSchema = z
  .object({
    critical: count,
    high: count,
    moderate: count,
    low: count,
    info: count,
    total: count,
    // A measurement that audited zero packages did not measure anything — it
    // abstained. Accepting it would record the exact all-zero false green this
    // input exists to replace, so it is rejected rather than stored.
    packagesScanned: z
      .number()
      .int()
      .min(
        1,
        'packagesScanned must be at least 1 — an audit that covered no packages abstained, it did not measure'
      )
      .optional(),
  })
  .strict()
  .refine((m) => m.total === m.critical + m.high + m.moderate + m.low + m.info, {
    message: 'total must equal critical + high + moderate + low + info',
    path: ['total'],
  });

export type SupplyChainMeasurement = z.infer<typeof SupplyChainMeasurementSchema>;

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

/** Validate an already-parsed supply-chain measurement. */
export function parseSupplyChainMeasurement(
  data: unknown,
  source = 'supply-chain measurement'
): Result<SupplyChainSnapshot, Error> {
  const parsed = SupplyChainMeasurementSchema.safeParse(data);
  if (!parsed.success) {
    return Err(new Error(`Invalid ${source}: ${describeIssues(parsed.error)}`));
  }
  return Ok(parsed.data);
}

/**
 * Read and validate a supply-chain measurement JSON file. Never falls back to an
 * empty snapshot: an unreadable, unparseable, or invalid file is an error, because
 * silently substituting zeros is indistinguishable from a clean audit.
 */
export function readSupplyChainMeasurement(filePath: string): Result<SupplyChainSnapshot, Error> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Err(new Error(`Cannot read supply-chain measurement ${filePath}: ${reason}`));
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Err(new Error(`Supply-chain measurement ${filePath} is not valid JSON: ${reason}`));
  }
  return parseSupplyChainMeasurement(data, `supply-chain measurement ${filePath}`);
}
