import { describe, it, expect } from 'vitest';
import {
  REVIEW_MOMENTS,
  REVIEW_TIERS,
  REVIEW_TIER_DEMOTIONS,
  REVIEW_BACKENDS,
  REVIEW_BASE_SOURCES,
  FULL_TIER_REVIEWER_IDS,
  CONDITIONAL_REVIEWER_IDS,
  LIGHT_TIER_REVIEWER_ID,
  PIPELINE_DOMAINS_OUTSIDE_RECEIPT,
  ESCAPED_FROM_STAGES,
  FINDING_CLASSES,
} from '../src/index';
import type { ReviewReceipt } from '../src/index';

describe('pipeline receipt contract', () => {
  it('pins the review vocabularies', () => {
    expect(REVIEW_MOMENTS).toEqual(['phase', 'final', 'standalone']);
    expect(REVIEW_TIERS).toEqual(['light', 'full']);
    expect(REVIEW_TIER_DEMOTIONS).toEqual(['no-subagent-tool']);
    expect(REVIEW_BACKENDS).toEqual(['agent', 'pipeline']);
    expect(REVIEW_BASE_SOURCES).toEqual(['merge-base', 'starting-commit']);
  });
  it('names the four full-tier reviewers, the three conditional ones and the light one', () => {
    expect(FULL_TIER_REVIEWER_IDS).toEqual(['compliance', 'bug', 'security', 'architecture']);
    expect(CONDITIONAL_REVIEWER_IDS).toEqual([
      'adversarial',
      'typescript-strict',
      'frontend-races',
    ]);
    expect(LIGHT_TIER_REVIEWER_ID).toBe('compliance-bug');
  });
  it('names the pipeline review domains that are no receipt reviewer', () => {
    expect(PIPELINE_DOMAINS_OUTSIDE_RECEIPT).toEqual(['learnings']);
  });
  it('pins the attribution taxonomy shared by all four phases of the spec', () => {
    expect(ESCAPED_FROM_STAGES).toEqual(['spec', 'plan', 'execution', 'verification', 'none']);
    expect(FINDING_CLASSES).toEqual([
      'stale-claim',
      'edge-case',
      'weak-test',
      'collateral',
      'design',
      'other',
    ]);
  });
  it('types a receipt', () => {
    const receipt: ReviewReceipt = {
      schemaVersion: 1,
      moment: 'final',
      tier: 'full',
      backend: 'agent',
      diff: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      coldContext: true,
      priorFindingsSupplied: false,
      reviewers: [{ id: 'bug', required: true, ran: true, findingsPath: 'bug.json' }],
      blocking: 0,
      advisory: 0,
    };
    expect(receipt.reviewers.map((r) => r.id)).toEqual(['bug']);
  });
});
