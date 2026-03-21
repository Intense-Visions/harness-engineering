import type { PrMetadata, EligibilityResult } from './types';

/**
 * Phase 1: Eligibility Gate
 *
 * Pure function that checks whether a PR should be reviewed.
 * In CI mode (`ciMode: true`), checks PR state, draft status,
 * trivial changes, and prior reviews. When `ciMode` is false
 * (manual invocation), always returns eligible.
 *
 * @param pr - PR metadata (state, draft status, files, commit range, prior reviews)
 * @param ciMode - Whether the review was invoked with --ci flag
 * @returns Eligibility result with optional skip reason
 */
export function checkEligibility(pr: PrMetadata, ciMode: boolean): EligibilityResult {
  // Manual invocation always runs
  if (!ciMode) {
    return { eligible: true };
  }

  // Check 1: PR state
  if (pr.state === 'closed') {
    return { eligible: false, reason: 'PR is closed' };
  }
  if (pr.state === 'merged') {
    return { eligible: false, reason: 'PR is merged' };
  }

  // Check 2: Draft status
  if (pr.isDraft) {
    return { eligible: false, reason: 'PR is a draft' };
  }

  // Check 3: Trivial change (all files are .md)
  if (pr.changedFiles.length > 0 && pr.changedFiles.every((f) => f.endsWith('.md'))) {
    return { eligible: false, reason: 'Trivial change: documentation only' };
  }

  // Check 4: Already reviewed this exact commit
  const priorMatch = pr.priorReviews.find((r) => r.headSha === pr.headSha);
  if (priorMatch) {
    return { eligible: false, reason: `Already reviewed at ${priorMatch.headSha}` };
  }

  return { eligible: true };
}
