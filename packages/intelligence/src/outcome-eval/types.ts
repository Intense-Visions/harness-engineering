/**
 * outcome-eval contract types.
 *
 * `authority` is DERIVED in TypeScript from (verdict, confidence) via
 * `deriveAuthority` in `./authority.js`. It is NEVER read from the LLM
 * response — see `verdictSchema` in `./prompts.js`, which omits it.
 */

import type { GuardianAnalysis } from '../guardian/types.js';

export type Verdict = 'SATISFIED' | 'NOT_SATISFIED' | 'INCONCLUSIVE';

export type Confidence = 'low' | 'medium' | 'high';

export type JudgedAgainst = 'success-criteria' | 'user-visible-behavior' | 'overview';

/** Ship authority DERIVED in TS from (verdict, confidence); never from the LLM. */
export type Authority = 'blocking' | 'advisory';

export interface OutcomeEvalInput {
  /** Absolute or repo-relative path to the spec markdown. */
  specPath: string;
  /** Unified diff of the change under judgment. */
  diff: string;
  /** Captured test-runner output. */
  testOutput: string;
  /** Pre-resolved judgment section; otherwise the section-resolver runs. */
  specSection?: string;
  /**
   * Head commit sha of the change under judgment. Persisted onto the
   * `execution_outcome` node's metadata (`commit`) so downstream consumers
   * (e.g. the pre-merge brief) can look the verdict up by sha. Optional and
   * additive: absent leaves the persisted node byte-identical to no-commit
   * wiring.
   */
  commit?: string;
  /**
   * Advisory guardian diff-coverage records read from `.harness/analyses/`
   * (#914). Absent/empty leaves the verdict byte-identical to no guardian
   * wiring; when present, a deterministic one-line signal is appended to the
   * verdict rationale. Never affects ship authority (still TS-derived from
   * verdict + confidence).
   */
  guardian?: GuardianAnalysis[];
  /**
   * Structured canary run outcome (gate exit code + pass/fail/flaky/skipped
   * counts). Absent/empty leaves the verdict byte-identical to no canary
   * wiring; when present, a deterministic one-line signal is appended to the
   * verdict rationale and `canary*` metadata is stamped onto the
   * execution_outcome node. Never affects ship authority. Mirrors `guardian?`.
   */
  canaryRun?: CanaryRunOutcome;
}

/**
 * Structured outcome of a canary test run, folded additively into outcome-eval.
 * `exitCode` is canary's gate exit code: 0 clean / 1 findings / 2 surface /
 * 3 abstained. Absent leaves the verdict byte-identical to no canary wiring;
 * never affects ship authority (still TS-derived from verdict + confidence).
 * This is the minimal structured summary the judge needs — a caller derives it
 * from the adapter's fuller `CanaryRunRecord`, keeping outcome-eval decoupled
 * from the adapter's record schema.
 */
export interface CanaryRunOutcome {
  /** Canary gate exit code: 0 clean, 1 findings, 2 surface, 3 abstained. */
  exitCode: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  /** Optional total case count (passed + failed + flaky + skipped). */
  total?: number;
}

export interface OutcomeVerdict {
  verdict: Verdict;
  confidence: Confidence;
  /** Cites specific met / unmet criteria. */
  rationale: string;
  judgedAgainst: JudgedAgainst;
  /** Empty when SATISFIED. */
  unmetCriteria: string[];
  /** DERIVED in TS from (verdict, confidence); never from the LLM. */
  authority: Authority;
}
