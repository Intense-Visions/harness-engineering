/**
 * ADR 0116 §3 (alternative provider) / #1689 — the opt-in, token-gated CI
 * **refresh** gate.
 *
 * ADR 0116 makes `main` the single writer of the SEMANTIC half and chooses the
 * MAINTAINER-LOCAL provider as the default (§3): a human periodically runs
 * `harness comprehend --all` and commits the semantic pass. #1689 is the recorded
 * ALTERNATIVE provider — an automated, keyed CI runner that performs the same
 * single-writer main-pass on `main` post-merge and commits the refreshed units via
 * a bot. It is **off by default** and only acts when a team has opted in AND
 * supplied an LLM credential as a CI secret, so a default adopter (no secret,
 * `ci: verify`) sees zero new behavior and CI stays token-free (the ADR-0109
 * invariant).
 *
 * This module is the pure, injectable decision seam that answers a single
 * question — "may THIS invocation perform the automated CI refresh?" — from three
 * orthogonal signals, so the CLI surface (`comprehend --refresh`) and the CI
 * workflow stay thin and the policy is unit-tested disk/git/network-free. The
 * three signals are AND-ed in order of cheapness so the reported reason is the
 * first missing prerequisite an operator must fix:
 *
 *  1. `ci: refresh` is configured (`ciMode`) — the opt-in switch. Anything else
 *     (`verify` default / `off`) means the automated refresh is not enabled.
 *  2. this is the single-writer main-pass (`isMainPass`, from
 *     {@link ../comprehension/policy!committedSemanticAllowed}) — committed
 *     semantic belongs to `main` only; a PR/branch context must never refresh.
 *  3. a provider credential actually resolves (`credentialPresent`) — the
 *     token gate. Provider-NEUTRAL: `credentialPresent` is whatever
 *     `resolveAnalysisProvider` resolves (Anthropic key, a config-declared
 *     OpenAI-compatible endpoint, or the claude CLI), never a forced Claude model.
 *
 * The gate NEVER decides pass/fail of a build — an inactive gate is always a
 * clean no-op (the refresh is remediation, not a correctness signal). The
 * credential-absent case (`ci: refresh` set but no secret) degrades to a
 * token-free no-op with an ACTIONABLE explanation rather than an error, so a
 * misconfigured adopter never reds `main` on merge.
 */

import type { ComprehensionConfig } from '../config/schema';

/** The resolved `comprehension.ci` mode (`'verify' | 'refresh' | 'off'`). */
export type ComprehensionCiMode = ComprehensionConfig['ci'];

/** The three orthogonal inputs the refresh gate AND-s together. */
export interface RefreshJobGateDeps {
  /** The configured `comprehension.ci` mode — only `'refresh'` opts in. */
  ciMode: ComprehensionCiMode;
  /** Whether this is the single-writer main-pass (committed semantic allowed). */
  isMainPass: boolean;
  /** Whether an analysis provider (any vendor) actually resolved — the token gate. */
  credentialPresent: boolean;
}

/**
 * Why the automated refresh did NOT run — the FIRST missing prerequisite, so the
 * message names exactly what an operator must set to activate it.
 */
export type RefreshJobGateReason = 'not-enabled' | 'not-main-pass' | 'no-credential';

/** The gate verdict: active (run the refresh) or inactive (clean no-op + reason). */
export type RefreshJobGate = { active: true } | { active: false; reason: RefreshJobGateReason };

/**
 * Resolve whether the opt-in token-gated CI refresh should run. Pure — all three
 * signals are supplied by the caller. AND-ed cheapest-first so the reason is the
 * first prerequisite to fix. Off-by-default is structural: the only `active`
 * branch requires `ciMode === 'refresh'`, so an unconfigured adopter can never
 * activate it.
 */
export function resolveRefreshJobGate(deps: RefreshJobGateDeps): RefreshJobGate {
  if (deps.ciMode !== 'refresh') return { active: false, reason: 'not-enabled' };
  if (!deps.isMainPass) return { active: false, reason: 'not-main-pass' };
  if (!deps.credentialPresent) return { active: false, reason: 'no-credential' };
  return { active: true };
}

/**
 * An actionable, single-line explanation for an inactive gate — what the operator
 * would change to activate the automated refresh. Used for the job-log message and
 * (for `no-credential`, the only misconfiguration worth surfacing loudly) a GitHub
 * `::warning::` annotation. Never an error: an inactive gate is a clean no-op.
 */
export function explainInactiveRefreshGate(reason: RefreshJobGateReason): string {
  switch (reason) {
    case 'not-enabled':
      return (
        "comprehension.ci is not 'refresh' — the opt-in automated CI refresh is OFF " +
        '(default). Set `comprehension.ci: refresh` to enable it (ADR 0116 §3 / #1689). No-op.'
      );
    case 'not-main-pass':
      return (
        'comprehension.ci: refresh requested off the main-pass — committed semantic is ' +
        'written only on `main` (single writer, ADR 0116). This runner must be the ' +
        'post-merge `main` job (HARNESS_COMPREHENSION_MAIN_PASS=1). No-op.'
      );
    case 'no-credential':
      return (
        'comprehension.ci: refresh is enabled but NO analysis provider credential resolved. ' +
        'Supply an LLM credential as a CI secret — either ANTHROPIC_API_KEY, or ' +
        'HARNESS_ANALYSIS_BASE_URL (+ optional HARNESS_ANALYSIS_API_KEY / ' +
        '`comprehension.analysisBaseUrl`) for any OpenAI-compatible vendor. CI stays ' +
        'token-free without it; semantic is left to the maintainer-local pass. No-op.'
      );
  }
}
