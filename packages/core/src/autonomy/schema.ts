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
  /** Top-level field names that failed validation, in issue order, deduplicated. */
  readonly fields: string[];
  constructor(message: string, fields: string[] = []) {
    super(`Invalid autonomy setting: ${message}`);
    this.name = 'AutonomyInvalidSettingError';
    this.fields = fields;
  }
}

const OriginSchema = z.enum(['cli', 'mcp']);
const IsoSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'must be an ISO timestamp',
});

const LevelFieldSchema = z.object({
  value: AutonomyLevelSchema,
  setAt: IsoSchema,
  origin: OriginSchema,
  expiresAt: IsoSchema.optional(),
});
const AuditFieldSchema = z.object({
  value: z.boolean(),
  setAt: IsoSchema,
  origin: OriginSchema,
  expiresAt: IsoSchema.optional(),
});

export const SessionOverrideFileSchema = z.object({
  level: LevelFieldSchema.optional(),
  audit: AuditFieldSchema.optional(),
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

/** True when a level value raises autonomy (anything but exactly `supervised`; fails closed). */
export function levelRaises(level: unknown): boolean {
  return level !== undefined && level !== 'supervised';
}

/** True when an audit value raises autonomy (anything but exactly `true`; fails closed). */
export function auditRaises(audit: unknown): boolean {
  return audit !== undefined && audit !== true;
}

/**
 * Value-based (D12): any write of `trusted` or audit=off counts as raising, even when it
 * equals the current value, because pinning it in the session tier would outrank a later
 * user-config lowering. Fails closed: any present value other than exactly `supervised` /
 * `true` (e.g. a mistyped "false") counts as raising, so the predicate cannot be type-confused.
 */
export function isRaisingChange(change: AutonomySetting): boolean {
  return levelRaises(change.level) || auditRaises(change.audit);
}

/** Validate an untrusted change (e.g. MCP args) before any policy decision or write. */
export function validateAutonomySetting(change: unknown): Result<AutonomySetting, Error> {
  const r = AutonomySettingSchema.safeParse(change);
  if (!r.success) {
    const fields = [...new Set(r.error.issues.map((i) => String(i.path[0] ?? '(root)')))];
    return Err(new AutonomyInvalidSettingError(describeIssues(r.error.issues), fields));
  }
  return Ok(r.data as AutonomySetting);
}

/**
 * setAt for a fail-closed field: the latest instant a JS Date can hold, so the lowered value
 * outranks any invocation flag until a real write replaces it.
 */
export const FAIL_CLOSED_SET_AT = new Date(8.64e15).toISOString();

type OverrideFieldName = 'level' | 'audit';

export interface ParsedOverrideFields {
  /** Null only when the document has neither field. */
  override: AutonomySessionOverride | null;
  /** One message per corrupt field (or one for a corrupt document). */
  invalid: string[];
  /** Fields that were present but corrupt and now hold their fail-closed value. */
  recovered: OverrideFieldName[];
}

const FAIL_CLOSED: Required<AutonomySessionOverride> = {
  level: { value: 'supervised', setAt: FAIL_CLOSED_SET_AT, origin: 'cli' },
  audit: { value: true, setAt: FAIL_CLOSED_SET_AT, origin: 'cli' },
};

const FIELD_SCHEMAS = { level: LevelFieldSchema, audit: AuditFieldSchema } as const;

function parseField(
  name: OverrideFieldName,
  raw: unknown,
  out: ParsedOverrideFields & { override: AutonomySessionOverride }
): void {
  if (raw === undefined) return;
  const r = FIELD_SCHEMAS[name].safeParse(raw);
  if (r.success) {
    (out.override as Record<string, unknown>)[name] = r.data;
    return;
  }
  (out.override as Record<string, unknown>)[name] = { ...FAIL_CLOSED[name] };
  out.invalid.push(
    `${name}: ${describeIssues(r.error.issues)} (fail-closed: treated as ${name === 'level' ? 'supervised' : 'audit on'})`
  );
  out.recovered.push(name);
}

/**
 * Per-field parse, failing CLOSED (I4). A present-but-corrupt field reads as its lowest-autonomy
 * value (level → supervised, audit → on), never as absent: absence would fall through to a lower
 * tier such as a trusted user config, a raise by corruption. A corrupt or non-object document
 * reads as both fail-closed values. Valid siblings are kept. Always Ok.
 */
export function parseSessionOverrideFields(raw: string): Result<ParsedOverrideFields, Error> {
  const json = parseJson(raw);
  const doc = json.ok ? json.value : undefined;
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    const reason = json.ok ? '(root): expected an object' : json.error.message;
    return Ok({
      override: { level: { ...FAIL_CLOSED.level }, audit: { ...FAIL_CLOSED.audit } },
      invalid: [`${reason} (fail-closed: treated as supervised, audit on)`],
      recovered: ['level', 'audit'],
    });
  }
  const record = doc as Record<string, unknown>;
  const out = { override: {} as AutonomySessionOverride, invalid: [], recovered: [] };
  parseField('level', record.level, out);
  parseField('audit', record.audit, out);
  const empty = out.override.level === undefined && out.override.audit === undefined;
  return Ok({ ...out, override: empty ? null : out.override });
}
