import type { SecurityRule } from '../types';

/** How many lines after a `JSON.parse` a schema validation may consume its result. */
const VALIDATION_LOOKAHEAD_LINES = 5;

/** A schema-library parse call (zod-style), never `JSON.parse` itself. */
const SCHEMA_PARSE_CALL = '(?<!JSON)\\.(?:safeParse|parse|safeParseAsync|parseAsync)\\s*\\(\\s*';

const ASSIGNED_FROM_JSON_PARSE =
  /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*JSON\.parse\s*\(/;
const WRAPPED_IN_SCHEMA_PARSE = new RegExp(`${SCHEMA_PARSE_CALL}JSON\\.parse\\s*\\(`);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  if (WRAPPED_IN_SCHEMA_PARSE.test(line)) return true;
  const assigned = ASSIGNED_FROM_JSON_PARSE.exec(line)?.[1];
  if (!assigned) return false;
  const consumes = new RegExp(`${SCHEMA_PARSE_CALL}${escapeRegExp(assigned)}\\s*[,)]`);
  const end = Math.min(lines.length - 1, index + VALIDATION_LOOKAHEAD_LINES);
  for (let i = index + 1; i <= end; i++) {
    if (consumes.test(lines[i] ?? '')) return true;
  }
  return false;
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
