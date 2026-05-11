import { describe, it, expectTypeOf } from 'vitest';
import type {
  IssueTrackerClient,
  Issue,
  BlockerRef,
  TrackerConfig,
} from '@harness-engineering/core';

describe('roadmap/tracker public surface', () => {
  it('exposes IssueTrackerClient with the Phase 1 method shape', () => {
    type Methods = keyof IssueTrackerClient;
    // Phase 1 lifts the existing six operations on IssueTrackerClient:
    // fetchCandidateIssues, fetchIssuesByStates, fetchIssueStatesByIds,
    // markIssueComplete, claimIssue, releaseIssue. Phase 2 introduces a
    // separate wide interface RoadmapTrackerClient.
    expectTypeOf<Methods>().toEqualTypeOf<
      | 'fetchCandidateIssues'
      | 'fetchIssuesByStates'
      | 'fetchIssueStatesByIds'
      | 'markIssueComplete'
      | 'claimIssue'
      | 'releaseIssue'
    >();
  });

  it('exposes Issue with required core fields', () => {
    expectTypeOf<Issue>().toHaveProperty('id');
    expectTypeOf<Issue>().toHaveProperty('title');
    expectTypeOf<Issue>().toHaveProperty('state');
    expectTypeOf<Issue>().toHaveProperty('blockedBy');
  });

  it('exposes BlockerRef and TrackerConfig as types', () => {
    expectTypeOf<BlockerRef>().toHaveProperty('id');
    expectTypeOf<TrackerConfig>().toHaveProperty('kind');
    expectTypeOf<TrackerConfig>().toHaveProperty('activeStates');
    expectTypeOf<TrackerConfig>().toHaveProperty('terminalStates');
  });
});
