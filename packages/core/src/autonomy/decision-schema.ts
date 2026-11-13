import { z } from 'zod';
import {
  AUTO_DECISION_PAUSE_CLASSES,
  AUTONOMY_SOURCES,
  type AutoDecision,
  type AutoDecisionInput,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/** Per-field caps. Typical entries stay far below MAX_AUTO_DECISION_LINE_BYTES (decision-log). */
export const AUTO_DECISION_LIMITS = {
  name: 100,
  option: 300,
  options: 10,
  question: 2000,
  rationale: 4000,
  objection: 1000,
} as const;

export const AUTO_DECISION_INVALID = 'AUTO_DECISION_INVALID';

export class AutoDecisionInvalidError extends Error {
  readonly code = AUTO_DECISION_INVALID;
  /** Offending top-level fields, deduplicated, in issue order ('(root)' for a non-object). */
  readonly fields: string[];
  constructor(message: string, fields: string[] = []) {
    super(`Invalid auto-decision: ${message}`);
    this.name = 'AutoDecisionInvalidError';
    this.fields = fields;
  }
}

/**
 * Bidi controls (U+200E/F, U+202A-E, U+2066-9, ARABIC LETTER MARK U+061C), invisible characters
 * (ZERO WIDTH SPACE / NON-JOINER / JOINER U+200B-D, BOM U+FEFF) and LINE / PARAGRAPH SEPARATOR
 * (U+2028/9, which some renderers treat as a line break). Review S6. Note: rejecting U+200D also
 * rejects emoji ZWJ sequences in log text.
 */
const INVISIBLE_OR_BIDI = new Set([
  0x061c, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d,
  0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
]);

/**
 * A code point that could rewrite or hide terminal output when the log is rendered for a human:
 * C0/C1 controls (including ESC), bidi controls, invisible characters and Unicode line separators.
 * Tab and newline are allowed when multiline.
 */
export function isUnsafeLogChar(code: number, multiline: boolean): boolean {
  if (multiline && (code === 0x09 || code === 0x0a)) return false;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || INVISIBLE_OR_BIDI.has(code);
}

/** Replace every unsafe character with a visible `\uXXXX` escape (for diagnostics we echo). */
export function escapeUnsafeLogText(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += isUnsafeLogChar(code, false) ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
  }
  return out;
}

function hasUnsafeChars(s: string, multiline: boolean): boolean {
  for (const ch of s) if (isUnsafeLogChar(ch.codePointAt(0) ?? 0, multiline)) return true;
  return false;
}

function text(max: number, multiline = false) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s.trim() !== '', { message: 'must not be blank' })
    .refine((s) => !hasUnsafeChars(s, multiline), {
      message: multiline
        ? 'must not contain control or bidi characters (tab and newline are allowed)'
        : 'must be one line with no control or bidi characters',
    });
}

const L = AUTO_DECISION_LIMITS;

export const AutoDecisionAuditSchema = z.union([
  z.strictObject({
    status: z.literal('agreed'),
    blindPick: text(L.option),
    objection: z
      .strictObject({ severity: z.literal('non-blocking'), text: text(L.objection, true) })
      .optional(),
  }),
  z.strictObject({
    status: z.literal('escalated'),
    blindPick: text(L.option),
    objection: z
      .strictObject({
        severity: z.enum(['blocking', 'non-blocking']),
        text: text(L.objection, true),
      })
      .optional(),
    humanChoice: text(L.option),
  }),
  z.strictObject({ status: z.enum(['unavailable', 'off']) }),
]);

const inputShape = {
  skill: text(L.name),
  phase: text(L.name),
  pauseClass: z.enum(AUTO_DECISION_PAUSE_CLASSES),
  question: text(L.question, true),
  options: z.array(text(L.option)).min(1).max(L.options),
  chosen: text(L.option),
  rationale: text(L.rationale, true),
  audit: AutoDecisionAuditSchema.optional(),
};
const InputObject = z.strictObject(inputShape);
type InputOut = z.output<typeof InputObject>;

const IsoTimestamp = z.string().refine(
  (s) => {
    const t = Date.parse(s);
    return !Number.isNaN(t) && new Date(t).toISOString() === s;
  },
  { message: 'must be an ISO-8601 UTC timestamp (Date#toISOString)' }
);

type IssueSink = {
  addIssue: (i: { code: 'custom'; path: PropertyKey[]; message: string }) => void;
};

/** Rules that make audited N/M and the agreement rate trustworthy (SC9, D7, D8). */
function crossFieldIssues(d: InputOut, ctx: IssueSink): void {
  const issue = (path: PropertyKey[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  if (new Set(d.options).size !== d.options.length) issue(['options'], 'options must be distinct');
  if (d.pauseClass === 'ceremony' && d.audit !== undefined) {
    issue(['audit'], 'ceremony decisions are never audited (D1); omit audit');
  }
  if (d.pauseClass === 'judgment') {
    if (d.audit === undefined) {
      issue(
        ['audit'],
        'a judgment decision must record its audit status (agreed | escalated | unavailable | off) so audited N/M counts it (SC9)'
      );
    }
    if (d.options.length < 2) issue(['options'], 'a judgment fork needs at least two options');
  }
  if (d.audit?.status === 'escalated') {
    if (d.chosen !== d.audit.humanChoice) {
      issue(
        ['chosen'],
        'an escalated decision records the human choice: chosen must equal audit.humanChoice'
      );
    }
  } else if (!d.options.includes(d.chosen)) {
    issue(['chosen'], 'chosen must be one of options');
  }
  if (d.audit?.status === 'agreed' && d.audit.blindPick !== d.chosen) {
    issue(
      ['audit', 'blindPick'],
      'agreed means the blind pick matched: blindPick must equal chosen (D7)'
    );
  }
}

/**
 * Caller input (MCP args). Strict: `ts` and `autonomySource` are stamped by the writer, so
 * supplying either is an error, never a spoof.
 */
export const AutoDecisionInputSchema = InputObject.superRefine(crossFieldIssues);

/** One stored line: the same rules plus the writer-stamped fields. */
export const AutoDecisionSchema = z
  .strictObject({ ts: IsoTimestamp, ...inputShape, autonomySource: z.enum(AUTONOMY_SOURCES) })
  .superRefine(crossFieldIssues);

type ZodIssueLike = { code: string; path: PropertyKey[]; message: string; keys?: string[] };

function describeIssues(issues: readonly ZodIssueLike[]): string {
  return issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
}

function issueFields(issues: readonly ZodIssueLike[]): string[] {
  return [
    ...new Set(
      issues.flatMap((i) =>
        i.code === 'unrecognized_keys' && i.keys ? i.keys : [String(i.path[0] ?? '(root)')]
      )
    ),
  ];
}

/** Validate untrusted input (e.g. MCP args) before any policy decision or write. */
export function validateAutoDecisionInput(
  raw: unknown
): Result<AutoDecisionInput, AutoDecisionInvalidError> {
  const r = AutoDecisionInputSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues as unknown as ZodIssueLike[];
    return Err(new AutoDecisionInvalidError(describeIssues(issues), issueFields(issues)));
  }
  // JSON input never yields explicit `undefined`, so the zod output matches the contract.
  return Ok(r.data as AutoDecisionInput);
}

/** Parse one stored log line. */
export function parseAutoDecisionLine(line: string): Result<AutoDecision, Error> {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch (err) {
    return Err(new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`));
  }
  const r = AutoDecisionSchema.safeParse(json);
  if (!r.success)
    return Err(new Error(describeIssues(r.error.issues as unknown as ZodIssueLike[])));
  return Ok(r.data as AutoDecision);
}
