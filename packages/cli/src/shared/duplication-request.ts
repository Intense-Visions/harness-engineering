// packages/cli/src/shared/duplication-request.ts
import type { DuplicationConfig } from '@harness-engineering/core';

/**
 * The shape of an `EntropyReport.analysisErrors` entry, as much of it as this
 * module reads.
 *
 * Core's own `AnalysisError` is NOT exported from `@harness-engineering/core`'s
 * barrel (verified against `packages/core/dist/index.d.ts`'s export list;
 * `DuplicationConfig`, `DuplicationReport`, `CloneClass` and `EntropyReport`
 * all are). Widening the barrel means editing
 * `scripts/generate-core-barrel.mjs`'s curated allowlist, which Phase 3 does
 * not own (plan decision P13: no barrel work). A structural supertype reads
 * the real `AnalysisError[]` without that, and keeps this module honest about
 * the only two fields it uses.
 */
export interface DuplicationAnalysisErrorLike {
  analyzer: string;
  error: { message: string; suggestions: readonly string[] };
}

/**
 * The entropy issue types BOTH surfaces accept, in the order they are
 * advertised.
 *
 * One list, so `harness cleanup -t <type>` and `detect_entropy`'s `type` enum
 * cannot drift — and, more importantly, so neither surface can accept a value
 * it does not understand. Measured before this list existed:
 * `harness cleanup -t duplicaiton` (a one-character typo) printed
 * "Entropy issues: not checked" and exited 0, `-t bogus --findings-json`
 * published `{"findings":0,...}` on the #691 contract and exited 0, and
 * `detect_entropy { type: "duplicaiton" }` returned
 * `{"mode":"summary","totalIssues":0}` with no error — the JSON-schema enum is
 * DECORATIVE, the SDK does not enforce it. Every unknown value fell through
 * `runCleanup`'s switch with every analyzer off, which is the #1760
 * report-a-pass-over-a-check-that-never-ran failure in a new place.
 */
export const ENTROPY_ISSUE_TYPES = [
  'drift',
  'dead-code',
  'patterns',
  'duplication',
  'all',
] as const;

export type EntropyIssueType = (typeof ENTROPY_ISSUE_TYPES)[number];

/** Whether a caller-supplied string is one of {@link ENTROPY_ISSUE_TYPES}. */
export function isEntropyIssueType(type: string): type is EntropyIssueType {
  return (ENTROPY_ISSUE_TYPES as readonly string[]).includes(type);
}

/**
 * The refusal for a type neither surface understands.
 *
 * Shared so both refuse with the same words and the same list.
 */
export function describeUnknownIssueType(type: string): string {
  return (
    `Unknown issue type "${type}". Allowed: ${ENTROPY_ISSUE_TYPES.join(', ')}. ` +
    'Refusing to report a pass: an unrecognized type runs NO analyzer, which would ' +
    'otherwise come back as zero issues and a clean exit (#1760).'
  );
}

/**
 * Whether a run should execute the duplication detector, and with what.
 *
 * Shared by BOTH surfaces (`harness cleanup -t duplication` and the
 * `detect_entropy` MCP tool) deliberately: they must agree on the opt-in
 * rule and on the refusal wording, and a copy in each would be two members
 * — below `minInstances`, where this project's own clone detector could
 * never report the drift.
 */
export type DuplicationRequest =
  | { kind: 'run'; analyze: true | Partial<DuplicationConfig> }
  | { kind: 'skip' }
  | { kind: 'refuse'; message: string };

/**
 * Resolve the request from the requested issue type and the project's
 * `entropy.duplication` config.
 *
 * - An explicit request (`duplication`) runs on the shipped defaults even
 *   with no config — `DEFAULT_DUPLICATION_CONFIG` is complete.
 * - `all` runs the detector ONLY when the project configured it. This is the
 *   `patterns` rule (`commands/cleanup.ts:88`): `all` runs a detector when
 *   the project gave it something to do. Duplication adds a clone scan to
 *   every cleanup run otherwise, and D4 makes it advisory, so opting in is
 *   the project's call.
 * - `false` disables it. An explicit request then REFUSES: a check that did
 *   not run must not print a pass (#1760).
 */
export function resolveDuplicationRequest(
  type: string,
  configured: boolean | Partial<DuplicationConfig> | undefined
): DuplicationRequest {
  const explicit = type === 'duplication';
  if (!explicit && type !== 'all') return { kind: 'skip' };

  if (configured === false) {
    if (!explicit) return { kind: 'skip' };
    return {
      kind: 'refuse',
      message:
        'Duplication detection is disabled (`entropy.duplication: false` in harness.config.json), ' +
        'so there is nothing to report. Remove that setting or set it to `true` (or to an object of ' +
        'tuning overrides) to run the detector. Refusing to report a clean scan that never ran.',
    };
  }

  if (configured === undefined) {
    // `all` on an unconfigured project: skip. Explicit: run on defaults.
    return explicit ? { kind: 'run', analyze: true } : { kind: 'skip' };
  }

  return { kind: 'run', analyze: configured === true ? true : configured };
}

/**
 * Render "the detector did not run" using the analyzer's OWN reason.
 *
 * `EntropyAnalyzer` leaves `EntropyReport.duplication` undefined and pushes
 * an `AnalysisError` when duplication cannot execute — `reason:
 * 'snapshot-bypassed'` on a graph-fed run, `'zero-files-discovered'` or
 * `'invalid-ignore-pattern'` on a config problem. A caller that reads only
 * `report.duplication` sees `undefined` and renders "no duplication found",
 * which is the opposite of the truth (spec Phase 3 forward note 3).
 */
export function describeDuplicationNotRun(
  analysisErrors: readonly DuplicationAnalysisErrorLike[]
): string {
  const failure = analysisErrors.find((entry) => entry.analyzer === 'duplication');
  if (!failure) {
    return 'Duplication analysis produced no report and recorded no error. This is a defect: the detector was requested and neither ran nor explained itself.';
  }
  return [failure.error.message, ...failure.error.suggestions.map((s) => `  - ${s}`)].join('\n');
}
