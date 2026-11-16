import type { SecurityRule } from '../types';

/** How many lines after a `JSON.parse` a schema validation may consume its result. */
const VALIDATION_LOOKAHEAD_LINES = 5;

/** A schema-library parse call (zod-style), never `JSON.parse` itself. */
const SCHEMA_PARSE_CALL = '(?<!JSON)\\.(?:safeParse|parse|safeParseAsync|parseAsync)\\s*\\(\\s*';

const ASSIGNED_FROM_JSON_PARSE =
  /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*JSON\.parse\s*\(/;
const WRAPPED_IN_SCHEMA_PARSE = new RegExp(`${SCHEMA_PARSE_CALL}JSON\\.parse\\s*\\(`);

const JSON_PARSE_CALL = /JSON\.parse\s*\(/g;

/**
 * A `.safeParse(v)` whose result is thrown away (a bare expression statement)
 * validates nothing: unlike `.parse`, it never throws, so `v` flows on unchecked.
 */
const DISCARDED_SAFE_PARSE_PREFIX =
  '^\\s*(?:await\\s+)?[\\w$.]+(?:\\([^)]*\\))?\\.safeParse(?:Async)?\\s*\\(\\s*';
const DISCARDED_SAFE_PARSE_SUFFIX = '\\s*\\)\\s*;?\\s*$';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a later line within the lookahead validates `assigned` (and keeps the result). */
function isValidatedWithinLookahead(
  lines: readonly string[],
  index: number,
  assigned: string
): boolean {
  const name = escapeRegExp(assigned);
  const consumes = new RegExp(`${SCHEMA_PARSE_CALL}${name}\\s*[,)]`);
  const discarded = new RegExp(
    `${DISCARDED_SAFE_PARSE_PREFIX}${name}${DISCARDED_SAFE_PARSE_SUFFIX}`
  );
  const end = Math.min(lines.length - 1, index + VALIDATION_LOOKAHEAD_LINES);
  for (let i = index + 1; i <= end; i++) {
    const candidate = lines[i] ?? '';
    if (consumes.test(candidate) && !discarded.test(candidate)) return true;
  }
  return false;
}

/**
 * True when the value produced by the `JSON.parse` on `lines[index]` is handed
 * to a schema validator: either wrapped directly (`Schema.parse(JSON.parse(x))`)
 * or assigned to a variable that a `.safeParse(v)` / `.parse(v)` call consumes
 * within the next few lines. Deliberately conservative — validating a DIFFERENT
 * variable, or validating too far away to be obviously the same flow, does not
 * count.
 */
export function isJsonParseSchemaValidated(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  // One finding covers the whole line, so validating one parse must not clear
  // a second, unvalidated `JSON.parse` sharing that line.
  if ((line.match(JSON_PARSE_CALL) ?? []).length > 1) return false;
  if (WRAPPED_IN_SCHEMA_PARSE.test(line)) return true;
  const assigned = ASSIGNED_FROM_JSON_PARSE.exec(line)?.[1];
  return assigned !== undefined && isValidatedWithinLookahead(lines, index, assigned);
}

export const deserializationRules: SecurityRule[] = [
  {
    id: 'SEC-DES-001',
    name: 'Unvalidated JSON Parse',
    category: 'deserialization',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /JSON\.parse\s*\(\s*(?:req|request)\.body/,
      /JSON\.parse\s*\(\s*(?:event|data|payload|input|body)\b/,
    ],
    isMitigated: isJsonParseSchemaValidated,
    message: 'JSON.parse on potentially untrusted input without schema validation',
    remediation: 'Validate parsed data with Zod, ajv, or joi before use',
    references: ['CWE-502'],
  },
];
