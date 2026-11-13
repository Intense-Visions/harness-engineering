import { z } from 'zod';
import type {
  AutonomySessionOverride,
  AutonomySetting,
  AutonomyUserConfig,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

export const AutonomyLevelSchema = z.enum(['supervised', 'trusted']);

/** ~/.harness/config.json. Unknown top-level keys are tolerated (future user-level settings). */
export const UserConfigSchema = z.object({
  autonomy: z
    .object({
      level: AutonomyLevelSchema.optional(),
      audit: z
        .object({ trusted: z.boolean().optional(), supervised: z.boolean().optional() })
        .optional(),
    })
    .optional(),
});

/**
 * A requested change. Strict: every value must be exactly typed (D12). A string "false" for
 * `audit` is not falsy-equivalent to `false` here; it is invalid, never written.
 */
export const AutonomySettingSchema = z
  .object({ level: AutonomyLevelSchema.optional(), audit: z.boolean().optional() })
  .strict();

export const AUTONOMY_INVALID_SETTING = 'AUTONOMY_INVALID_SETTING';

export class AutonomyInvalidSettingError extends Error {
  readonly code = AUTONOMY_INVALID_SETTING;
  constructor(message: string) {
    super(`Invalid autonomy setting: ${message}`);
    this.name = 'AutonomyInvalidSettingError';
  }
}

const OriginSchema = z.enum(['cli', 'mcp']);
const IsoSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'must be an ISO timestamp',
});

export const SessionOverrideFileSchema = z.object({
  level: z
    .object({ value: AutonomyLevelSchema, setAt: IsoSchema, origin: OriginSchema })
    .optional(),
  audit: z.object({ value: z.boolean(), setAt: IsoSchema, origin: OriginSchema }).optional(),
});

function parseJson(raw: string): Result<unknown, Error> {
  try {
    return Ok(JSON.parse(raw) as unknown);
  } catch (err) {
    return Err(new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`));
  }
}

function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
}

export function parseUserConfig(raw: string): Result<AutonomyUserConfig, Error> {
  const json = parseJson(raw);
  if (!json.ok) return json;
  const r = UserConfigSchema.safeParse(json.value);
  if (!r.success) return Err(new Error(describeIssues(r.error.issues)));
  // JSON input never yields explicit `undefined`, so the zod optional output matches the contract.
  return Ok(r.data as AutonomyUserConfig);
}

export function parseSessionOverride(raw: string): Result<AutonomySessionOverride, Error> {
  const json = parseJson(raw);
  if (!json.ok) return json;
  const r = SessionOverrideFileSchema.safeParse(json.value);
  if (!r.success) return Err(new Error(describeIssues(r.error.issues)));
  return Ok(r.data as AutonomySessionOverride);
}

/** Validate an untrusted change (e.g. MCP args) before any policy decision or write. */
export function validateAutonomySetting(change: unknown): Result<AutonomySetting, Error> {
  const r = AutonomySettingSchema.safeParse(change);
  if (!r.success) return Err(new AutonomyInvalidSettingError(describeIssues(r.error.issues)));
  return Ok(r.data as AutonomySetting);
}
