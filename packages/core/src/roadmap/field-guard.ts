/**
 * Guard against line-break injection through roadmap field values (#2623).
 *
 * The roadmap grammar is line-oriented: `serializeFeature` emits a `### <name>`
 * heading and one `- **Field:** value` bullet per line, and the readers take
 * each field back with a per-line `m`-flag regex. A value that carries a line
 * break therefore becomes a NEW line on write — a forged `- **Status:** done`
 * bullet flips the row, a forged `### ` heading makes the roadmap unparseable.
 *
 * "Line break" is what the READERS treat as one, which is wider than LF:
 *  - CR — `parseRoadmap` normalizes a lone CR to LF before parsing;
 *  - U+2028 / U+2029 — JS `^` / `$` under the `m` flag break on them, and `.`
 *    does not match them.
 *
 * Two layers use this module:
 *  - {@link validateRoadmapFeatureFields} is the API-boundary check. It is
 *    stricter: it also refuses every other C0 control character and DEL, which
 *    no roadmap field has a use for, so a caller gets a clear error naming the
 *    field and nothing is written.
 *  - {@link assertSerializableFeature} runs inside the serializer and refuses
 *    only the line breaks, so every writer (monolith, shard store, aggregate
 *    regen) is protected without bricking a roadmap that already holds some
 *    other control character it parsed from disk.
 *
 * `summary` is the one multi-line field: LF and CR are escaped by the summary
 * codec and round-trip (#1756), so only the Unicode separators (which that codec
 * does not escape) and the other control characters are refused there.
 */
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

/** Characters any roadmap reader treats as a line break. */
const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** Line breaks the summary codec does NOT escape (it escapes LF and CR). */
const SUMMARY_LINE_BREAK = /[\u2028\u2029]/;
/** Every C0 control except TAB, plus DEL and the Unicode line/paragraph separators. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000A-\u001F\u007F\u2028\u2029]/;
/** As {@link CONTROL}, minus the LF / CR the summary codec escapes. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const SUMMARY_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/;

/**
 * The writable roadmap fields, keyed by the name used in error messages. All are
 * optional so a partial update can be checked with only the fields it sets.
 */
export interface RoadmapFieldValues {
  name?: string | null | undefined;
  status?: string | null | undefined;
  spec?: string | null | undefined;
  summary?: string | null | undefined;
  plans?: readonly string[] | null | undefined;
  blockedBy?: readonly string[] | null | undefined;
  assignee?: string | null | undefined;
  priority?: string | null | undefined;
  externalId?: string | null | undefined;
  updatedAt?: string | null | undefined;
  milestone?: string | null | undefined;
}

const SINGLE_LINE_KEYS = [
  'name',
  'status',
  'spec',
  'assignee',
  'priority',
  'externalId',
  'updatedAt',
  'milestone',
] as const;

const LIST_KEYS = ['plans', 'blockedBy'] as const;

function codePoint(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Each `[fieldLabel, value, multiLine]` a writer would emit for these fields. */
function* fieldEntries(fields: RoadmapFieldValues): Generator<[string, string, boolean]> {
  for (const key of SINGLE_LINE_KEYS) {
    const value = fields[key];
    if (typeof value === 'string') yield [key, value, false];
  }
  for (const key of LIST_KEYS) {
    const items = fields[key];
    if (!Array.isArray(items)) continue;
    for (const [i, item] of items.entries()) {
      if (typeof item === 'string') yield [`${key}[${i}]`, item, false];
    }
  }
  if (typeof fields.summary === 'string') yield ['summary', fields.summary, true];
}

/**
 * API-boundary check: refuse any field value containing a line break or other
 * control character (TAB is allowed; `summary` may also hold LF / CR). Returns an
 * `Err` naming the field and the code point, so the caller can report it and
 * write nothing.
 */
export function validateRoadmapFeatureFields(fields: RoadmapFieldValues): Result<void> {
  for (const [label, value, multiLine] of fieldEntries(fields)) {
    const hit = (multiLine ? SUMMARY_CONTROL : CONTROL).exec(value);
    if (hit) {
      const allowed = multiLine
        ? 'it may span lines with LF, but not other control characters or line breaks'
        : 'it must be a single line with no control characters or line breaks';
      return Err(
        new Error(
          `Roadmap field "${label}" contains control character ${codePoint(hit[0])}; ${allowed}`
        )
      );
    }
  }
  return Ok(undefined);
}

/**
 * Serializer-side check: throw if emitting these fields would write a line the
 * reader takes as a separate bullet or heading. Narrower than
 * {@link validateRoadmapFeatureFields} on purpose (see the module comment).
 */
export function assertSerializableFeature(fields: RoadmapFieldValues): void {
  for (const [label, value, multiLine] of fieldEntries(fields)) {
    const hit = (multiLine ? SUMMARY_LINE_BREAK : LINE_BREAK).exec(value);
    if (hit) {
      throw new Error(
        `Refusing to serialize roadmap field "${label}": it contains line break ` +
          `${codePoint(hit[0])}, which would inject a new line into the roadmap (#2623)`
      );
    }
  }
}
