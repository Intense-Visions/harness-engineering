import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
} from '@harness-engineering/core';
import { ConflictError, createTrackerClient } from '@harness-engineering/core';

describe('roadmap/tracker Phase 2 public surface', () => {
  it('exposes RoadmapTrackerClient with the 10 wide methods', () => {
    type Methods = keyof RoadmapTrackerClient;
    expectTypeOf<Methods>().toEqualTypeOf<
      | 'fetchAll'
      | 'fetchById'
      | 'fetchByStatus'
      | 'create'
      | 'update'
      | 'claim'
      | 'release'
      | 'complete'
      | 'appendHistory'
      | 'fetchHistory'
    >();
  });

  it('exposes TrackedFeature with externalId pattern fields', () => {
    expectTypeOf<TrackedFeature>().toHaveProperty('externalId');
    expectTypeOf<TrackedFeature>().toHaveProperty('blockedBy');
    expectTypeOf<TrackedFeature>().toHaveProperty('createdAt');
  });

  it('exposes NewFeatureInput, FeaturePatch, HistoryEvent', () => {
    expectTypeOf<NewFeatureInput>().toHaveProperty('name');
    expectTypeOf<FeaturePatch>().toMatchTypeOf<Partial<TrackedFeature>>();
    expectTypeOf<HistoryEvent>().toHaveProperty('type');
  });

  it('exposes ConflictError as a class', () => {
    expect(typeof ConflictError).toBe('function');
  });

  it('exposes createTrackerClient as a function', () => {
    expect(typeof createTrackerClient).toBe('function');
  });
});
