/**
 * Shape gate for the machine-readable provenance commit trailer (#1777).
 *
 * {@link parseProvenanceTrailer} is deliberately lenient: it defaults an absent
 * or unparseable `Harness-Provenance-Version`, and its `Map` silently keeps the
 * last of a repeated key. That leniency is right for a *reader* — a consumer
 * should get the best available answer — and wrong for a *gate*, whose job is to
 * notice that a trailer is something the emitter could never have produced
 * (hand-edited, mangled by a rebase, or written by a drifted second emitter).
 *
 * This module is the strict counterpart. It shares one grammar with the emitter
 * and the parser via `collectProvenanceTrailerEntries` — there is no second
 * parser here, only a second set of questions asked of the same scan.
 *
 * PRESENCE IS NOT SHAPE. A message with no `Harness-Run` key is `absent`, never
 * `malformed`. Whether a given commit *ought* to carry a trailer is a policy
 * question about what counts as an agent-authored commit; it is deliberately
 * unanswered here (see #1777), which is why the result is a three-state
 * discriminant rather than a `valid: boolean` a caller could invert into an
 * accidental presence gate.
 */

import {
  PROVENANCE_TRAILER_KEYS,
  PROVENANCE_TRAILER_VERSION,
  collectProvenanceTrailerEntries,
  parseProvenanceTrailer,
  type ProvenanceTrailer,
} from './commit-trailer';

/** Conditions that make a present trailer malformed. */
export type ProvenanceShapeIssueCode =
  /** The same `Harness-*` key appears more than once. */
  | 'duplicate-key'
  /** `Harness-Provenance-Version` is absent (the parser defaults it; a gate must not). */
  | 'missing-version'
  /** `Harness-Provenance-Version` is present but not a base-10 integer. */
  | 'invalid-version'
  /** The schema version is outside the range this build knows how to check. */
  | 'unknown-version'
  /** `Harness-Run` carries no skill name left of the final `@`. */
  | 'empty-skill'
  /** `Harness-Run` has no `@`, or nothing after it. */
  | 'missing-skill-version';

/** Conditions worth reporting that do NOT make a trailer malformed. */
export type ProvenanceShapeWarningCode =
  /** A `Harness-*` key outside the governed set — tolerated for forward compatibility. */
  | 'unknown-key'
  /** A governed optional key present with an empty value (the formatter omits empties). */
  | 'empty-value';

/** One reported condition, naming the key it was found on. */
export interface ProvenanceShapeFinding {
  code: ProvenanceShapeIssueCode | ProvenanceShapeWarningCode;
  key: string;
  detail: string;
}

/** The outcome of shape-checking one commit or PR-body message. */
export interface ProvenanceShapeResult {
  /**
   * `absent` — no `Harness-Run` key: the commit is unclaimed, which is a
   * deliberate non-assertion and NOT a failure.
   * `valid` — a trailer is present and well-formed.
   * `malformed` — a trailer is present and `issues` is non-empty.
   */
  status: 'absent' | 'valid' | 'malformed';
  /** The lenient parse, for reporting. `null` exactly when `status` is `absent`. */
  trailer: ProvenanceTrailer | null;
  /** Non-empty exactly when `status` is `malformed`. */
  issues: ProvenanceShapeFinding[];
  /** Advisory only; never affects `status`. */
  warnings: ProvenanceShapeFinding[];
}

/** The governed key set, as a lookup for the `unknown-key` warning. */
const GOVERNED_KEYS: ReadonlySet<string> = new Set(Object.values(PROVENANCE_TRAILER_KEYS));

/** Report every `Harness-*` key that occurs more than once in the scan. */
function findDuplicateKeys(entries: ReadonlyArray<[string, string]>): ProvenanceShapeFinding[] {
  const counts = new Map<string, number>();
  for (const [key] of entries) counts.set(key, (counts.get(key) ?? 0) + 1);
  const findings: ProvenanceShapeFinding[] = [];
  for (const [key, count] of counts) {
    if (count > 1) {
      findings.push({
        code: 'duplicate-key',
        key,
        detail: `appears ${count} times; the parser silently keeps only the last`,
      });
    }
  }
  return findings;
}

/** Validate `Harness-Provenance-Version`: present, integral, and a version we know. */
function checkSchemaVersion(raw: string | undefined): ProvenanceShapeFinding[] {
  const key = PROVENANCE_TRAILER_KEYS.version;
  if (raw === undefined || raw === '') {
    return [{ code: 'missing-version', key, detail: 'required key is absent' }];
  }
  if (!/^\d+$/.test(raw)) {
    return [{ code: 'invalid-version', key, detail: `expected an integer, got ${raw}` }];
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed < 1 || parsed > PROVENANCE_TRAILER_VERSION) {
    return [
      {
        code: 'unknown-version',
        key,
        detail: `schema version ${parsed} is outside the known range 1..${PROVENANCE_TRAILER_VERSION}`,
      },
    ];
  }
  return [];
}

/** Validate the `Harness-Run` value's `<skill>@<version>` grammar. */
function checkRunValue(raw: string): ProvenanceShapeFinding[] {
  const key = PROVENANCE_TRAILER_KEYS.run;
  const atIndex = raw.lastIndexOf('@');
  if (atIndex < 0) {
    return [
      { code: 'missing-skill-version', key, detail: `expected <skill>@<version>, got ${raw}` },
    ];
  }
  const findings: ProvenanceShapeFinding[] = [];
  if (raw.slice(0, atIndex).trim() === '') {
    findings.push({ code: 'empty-skill', key, detail: 'no skill name before the final "@"' });
  }
  if (raw.slice(atIndex + 1).trim() === '') {
    findings.push({ code: 'missing-skill-version', key, detail: 'no version after the final "@"' });
  }
  return findings;
}

/** Advisory findings: ungoverned keys, and governed keys present with no value. */
function collectWarnings(entries: ReadonlyArray<[string, string]>): ProvenanceShapeFinding[] {
  const warnings: ProvenanceShapeFinding[] = [];
  for (const [key, value] of entries) {
    if (!GOVERNED_KEYS.has(key)) {
      warnings.push({ code: 'unknown-key', key, detail: 'not part of the governed key set' });
      continue;
    }
    if (value === '') {
      warnings.push({
        code: 'empty-value',
        key,
        detail: 'present but empty; emitters omit empties',
      });
    }
  }
  return warnings;
}

/**
 * Shape-check the provenance trailer carried by a commit or PR-body message.
 *
 * Returns `status: 'absent'` — with no issues — when the message carries no
 * `Harness-Run` key. Callers gating on this MUST branch on `status`, not on
 * `issues.length`, or they will turn an unclaimed commit into a failure.
 */
export function validateProvenanceTrailer(message: string): ProvenanceShapeResult {
  const entries = collectProvenanceTrailerEntries(message);
  const trailer = parseProvenanceTrailer(message);
  if (trailer === null) return { status: 'absent', trailer: null, issues: [], warnings: [] };

  const values = new Map(entries);
  const issues: ProvenanceShapeFinding[] = [
    ...findDuplicateKeys(entries),
    ...checkSchemaVersion(values.get(PROVENANCE_TRAILER_KEYS.version)),
    ...checkRunValue(values.get(PROVENANCE_TRAILER_KEYS.run) ?? ''),
  ];

  return {
    status: issues.length === 0 ? 'valid' : 'malformed',
    trailer,
    issues,
    warnings: collectWarnings(entries),
  };
}
