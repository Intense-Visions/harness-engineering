/**
 * acceptance-eval contract types — the upstream twin of outcome-eval.
 *
 * `authority` is DERIVED in TypeScript from (measurability, confidence) via
 * `deriveAcceptanceAuthority` in `./authority.js`. It is NEVER read from the
 * LLM response — see `acceptanceVerdictSchema` in `./prompts.js`, which omits
 * it. `Confidence`, `JudgedAgainst`, and `Authority` are REUSED from the
 * outcome-eval module — not forked — consistent with the imported section-resolver.
 */
import type { Confidence, JudgedAgainst, Authority } from '../outcome-eval/types.js';

export type { Confidence, JudgedAgainst, Authority };

// Legend: (a) criteria quality · (b) test coverage · (c) measurability gate.

/** (c) the measurability gate dimension. */
export type Measurability = 'MEASURABLE' | 'NOT_MEASURABLE' | 'INCONCLUSIVE';

/** A single advisory observation about one criterion or behavior. */
export interface Finding {
  /** The specific criterion or user-visible behavior this finding references. */
  target: string;
  /** The advisory observation (e.g. 'not observable', 'no covering test'). */
  message: string;
}

export interface AcceptanceEvalInput {
  /** Absolute or repo-relative path to the spec markdown. */
  specPath: string;
  /** Pre-resolved judgment section; otherwise the section-resolver runs. */
  specSection?: string;
  /**
   * Located test snippets for coverage responsibility (b). Optional: absence
   * degrades (b) coverageFindings to advisory-empty and never affects the
   * (c) measurability gate.
   */
  testContent?: string;
}

export interface AcceptanceVerdict {
  measurability: Measurability; // (c)
  confidence: Confidence;
  /** DERIVED in TS from (measurability, confidence); never from the LLM. */
  authority: Authority;
  /** Which spec section resolved. */
  judgedAgainst: JudgedAgainst;
  /** (a) advisory — observability / testability / completeness critique. */
  criteriaFindings: Finding[];
  /** (b) advisory — user-visible behaviors with no covering test. */
  coverageFindings: Finding[];
  rationale: string;
}
