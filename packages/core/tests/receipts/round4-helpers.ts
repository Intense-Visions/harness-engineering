import type { ReviewMoment } from '@harness-engineering/types';
import { validateReviewReceipt, type ReviewGateContext } from '../../src/receipts/review-gate';

/** Shared fixtures for the round 4 gate tests. Real receipt and findings shapes. */
export const BASE = 'a'.repeat(40);
export const HEAD = 'b'.repeat(40);
export const OTHER = 'c'.repeat(40);
export const START = 'd'.repeat(40);
export const FULL = ['compliance', 'bug', 'security', 'architecture'];
export const record = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  required: true,
  ran: true,
  findingsPath: `${id}.json`,
  ...over,
});
export const receipt = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'full',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: FULL.map((id) => record(id)),
  blocking: 0,
  advisory: 0,
  ...over,
});
export const findingsText = (id: string, findings: unknown[] = [], base = BASE) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: id,
    base,
    head: HEAD,
    examinedFiles: ['src/a.ts'],
    findings,
  });
export const finding = (id: string, severity = 'important') => ({
  id,
  file: 'src/a.ts',
  lineRange: [1, 1],
  severity,
  title: id,
  findingClass: 'edge-case',
  escapedFrom: 'plan',
});
export const ctx = (
  over: Partial<ReviewGateContext> = {},
  moment: ReviewMoment = 'phase'
): ReviewGateContext => ({
  head: HEAD,
  diffFiles: ['src/a.ts'],
  readFindings: (p) => findingsText(p.replace(/\.json$/, '')),
  expectedMoment: { status: 'known', moment },
  baseIsAncestor: true,
  worktreeClean: true,
  phaseBase: { status: 'resolved', base: BASE, source: 'starting-commit' },
  mergeBase: BASE,
  ...over,
});
export const codesOf = (r: ReturnType<typeof validateReviewReceipt>) =>
  r.failures.map((f) => f.code);
