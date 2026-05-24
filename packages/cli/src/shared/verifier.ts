/**
 * Verifier<F, Cat, Meta> — formal interface for harness check-design's
 * composed verifier shape. Extracted at the 4th-verifier threshold
 * (audit-brand-compliance) per the convention note in check-design.ts.
 *
 * Each verifier (audit-anatomy, design-craft critique, detect-design-drift,
 * audit-brand-compliance) declares conformance via a type alias rather than
 * implementing the interface — TypeScript's structural typing lets existing
 * verifiers satisfy this shape without a refactor.
 *
 * Future verifiers must satisfy Verifier<F> or the type-check in check-design
 * fails. That's the contract: adding a 5th verifier costs only a type-alias
 * declaration, not a re-shaping of the verifier's output.
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Technical Design → Verifier interface extraction).
 */

export type VerifierSeverity = 'error' | 'warn' | 'info';

export interface VerifierSummary {
  totalFiles: number;
  durationMs: number;
  bySeverity: Record<VerifierSeverity, number>;
  byCode: Record<string, number>;
}

/**
 * The Verifier shape. Every check-design composer member returns this.
 * - F: the verifier's finding type
 * - Cat: optional catalog (rules/conventions/exemplars applied this run)
 * - Meta: optional run metadata (mode, resolver-loaded flags, etc.)
 */
export interface Verifier<F, Cat = Record<string, unknown>, Meta = Record<string, unknown>> {
  findings: F[];
  summary: VerifierSummary;
  catalog: Cat;
  meta: Meta;
}
