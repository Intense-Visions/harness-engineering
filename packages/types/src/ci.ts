/**
 * Names of standard CI checks.
 */
export type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch'
  | 'traceability';

/**
 * Status of a CI check.
 */
export type CICheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * A specific issue found during a CI check.
 */
export interface CICheckIssue {
  /** Severity level */
  severity: 'error' | 'warning';
  /** Descriptive message */
  message: string;
  /** Path to the affected file */
  file?: string;
  /** Line number in the affected file */
  line?: number;
  /**
   * Originating rule identifier, when the check attributes issues to rules
   * (e.g. the security scanner's `SEC-XXX-NNN`). Used to attribute a failing
   * finding to the constraint pack(s) whose rule prefixes cover it.
   */
  ruleId?: string;
}

/**
 * Which side of `target` a thresholded gate's passing region is on
 * (Taguchi continuous-loss, issue #1673):
 * - `upper` — the target is a ceiling; `measured` must stay `<= target`
 *   (complexity, latency, size, cost).
 * - `lower` — the target is a floor; `measured` must stay `>= target`
 *   (coverage, pass-rate, score).
 */
export type GateBound = 'upper' | 'lower';

/**
 * The continuous measurement underneath a binary gate verdict — the leading
 * indicator the pass/fail decision discards (issue #1673). A gate that thresholds
 * a numeric metric emits one of these ALONGSIDE its verdict so "passed barely"
 * and "passed comfortably" are distinguishable. Recording it is emission only and
 * never changes the gate's admission decision.
 *
 * The derived quadratic loss is computed downstream (core `gate-loss`); this
 * envelope carries only the raw facts a consumer needs to reconstruct it.
 */
export interface GateMeasurement {
  /**
   * Stable identifier of the gate/metric this measurement is for, e.g.
   * `traceability.coverage:auth` or `perf.complexity`. Used to bucket accumulated
   * loss per gate.
   */
  gate: string;
  /** The continuous value the gate compared against its threshold. */
  measured: number;
  /** The threshold/limit the gate compared `measured` against. */
  target: number;
  /** Whether `target` is an upper limit or a lower floor. */
  bound: GateBound;
  /** Optional unit label for display (e.g. `'%'`, `'ms'`). */
  unit?: string;
}

/**
 * Result of a single CI check execution.
 */
export interface CICheckResult {
  /** Name of the check */
  name: CICheckName;
  /** Final status of the check */
  status: CICheckStatus;
  /** List of issues discovered */
  issues: CICheckIssue[];
  /** Execution time in milliseconds */
  durationMs: number;
  /**
   * Continuous distance-to-threshold measurements this check took, emitted
   * alongside the binary `status` (Taguchi continuous-loss, issue #1673). Present
   * only for thresholded checks that expose a numeric metric and its target;
   * absent for checks with no meaningful continuous measurement. Emission only —
   * these never influence `status`.
   */
  measurements?: GateMeasurement[];
}

/**
 * Summary counts for a set of CI checks.
 */
export interface CICheckSummary {
  /** Total number of checks run */
  total: number;
  /** Number of passing checks */
  passed: number;
  /** Number of failing checks */
  failed: number;
  /** Number of checks with warnings */
  warnings: number;
  /** Number of skipped checks */
  skipped: number;
}

/**
 * Lifecycle stage at which a constraint pack is enforced. Packs opt a project
 * into blocking rules per stage rather than all-at-once:
 * - `pre-commit`  — cheap checks a developer runs before committing
 * - `pre-merge`   — checks a pull request must pass before it lands
 * - `pre-release` — the strictest gate, run before cutting a release
 */
export type ConstraintStage = 'pre-commit' | 'pre-merge' | 'pre-release';

/**
 * Compliance verdict for one constraint pack at one lifecycle stage.
 * - `compliant`     — the pack's rules were evaluated and none were violated
 * - `non-compliant` — at least one of the pack's rules was violated (blocking)
 * - `n/a`           — the pack does not apply at the stage that was run, or the
 *                     governing check was skipped, so no verdict was produced
 */
export type ConstraintPackComplianceStatus = 'compliant' | 'non-compliant' | 'n/a';

/**
 * Compliance verdict for a single (pack, stage) pair.
 */
export interface ConstraintPackStageCompliance {
  /** Lifecycle stage this verdict is for. */
  stage: ConstraintStage;
  /** Whether the pack's rules held at this stage. */
  status: ConstraintPackComplianceStatus;
}

/**
 * Per-stage compliance summary for one opted-in constraint pack.
 */
export interface ConstraintPackCompliance {
  /** Name of the resolved constraint pack. */
  pack: string;
  /** One verdict per stage the pack declares. */
  stages: ConstraintPackStageCompliance[];
}

/**
 * Outcome of a single check's cache lookup during a memoized CI run
 * (content-addressed gate memoization, issue #1639).
 */
export interface VerdictCacheEntry {
  /** The check this lookup was for. */
  check: CICheckName;
  /** Whether the check's verdict was served from cache (`hit`) or computed (`miss`). */
  outcome: 'hit' | 'miss';
  /** The content-addressed cache key the check hashed to (sha256 hex). */
  key: string;
}

/**
 * Hit/miss telemetry for a memoized CI run (content-addressed gate memoization,
 * issue #1639). Present on a {@link CICheckReport} only when the verdict cache
 * is opted in; absent otherwise so the default report shape stays byte-identical.
 * Emission only — never influences any check's status or the run exit code.
 */
export interface VerdictCacheStats {
  /** Whether the verdict cache was enabled for this run (always true when present). */
  enabled: boolean;
  /** Number of checks whose verdict was served from cache. */
  hits: number;
  /** Number of checks that were computed and recorded. */
  misses: number;
  /** Per-check lookup outcomes, in the order the checks resolved. */
  entries: VerdictCacheEntry[];
}

/**
 * Final report for a CI run.
 */
export interface CICheckReport {
  /** Schema version */
  version: 1;
  /** Name of the project */
  project: string;
  /** ISO timestamp of the run */
  timestamp: string;
  /** Detailed results for each check */
  checks: CICheckResult[];
  /** Aggregated summary */
  summary: CICheckSummary;
  /** Process exit code suggested for the CI runner */
  exitCode: 0 | 1 | 2;
  /**
   * Per-pack, per-stage compliance summary for opted-in constraint packs.
   * Absent when the project has opted into no packs (default behavior).
   */
  constraintPacks?: ConstraintPackCompliance[];
  /**
   * Names listed in `constraintPacks` that matched no known built-in pack.
   * Absent when every configured name resolved.
   */
  unknownConstraintPacks?: string[];
  /**
   * Content-addressed verdict-cache hit/miss telemetry (issue #1639). Present
   * only when the verdict cache is opted in; absent for the default (cache-off)
   * path so the serialized report shape is byte-identical to before. Emission
   * only — never affects `exitCode` or any check's `status`.
   */
  cacheStats?: VerdictCacheStats;
}

/**
 * Severity level that should trigger a CI failure.
 */
export type CIFailOnSeverity = 'error' | 'warning';

/**
 * Configuration options for the CI command.
 */
export interface CICheckOptions {
  /** Checks to skip */
  skip?: CICheckName[];
  /** Severity level that causes failure */
  failOn?: CIFailOnSeverity;
  /** Custom config file path */
  configPath?: string;
}

/**
 * Supported CI platforms.
 */
export type CIPlatform = 'github' | 'gitlab' | 'generic';

/**
 * Options for initializing CI configuration.
 */
export interface CIInitOptions {
  /** Target CI platform */
  platform?: CIPlatform;
  /** Checks to enable */
  checks?: CICheckName[];
}
