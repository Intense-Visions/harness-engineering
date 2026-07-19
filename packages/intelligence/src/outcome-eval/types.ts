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
   * Advisory guardian diff-coverage records read from `.harness/analyses/`
   * (#914). Absent/empty leaves the verdict byte-identical to no guardian
   * wiring; when present, a deterministic one-line signal is appended to the
   * verdict rationale. Never affects ship authority (still TS-derived from
   * verdict + confidence).
   */
  guardian?: GuardianAnalysis[];
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
