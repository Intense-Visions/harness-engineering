import { describe, it, expect } from 'vitest';
import { applyRoadmapDiff } from '../../../src/roadmap/store/apply-diff';
import type { RoadmapStore } from '../../../src/roadmap/store/roadmap-store';
import type { Roadmap, RoadmapFeature, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

function feature(name: string, status: RoadmapFeature['status'] = 'planned'): RoadmapFeature {
  return {
    name,
    status,
    spec: null,
    plans: [],
    blockedBy: [],
    summary: `${name} summary`,
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
  };
}

function roadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: { version: 1 } as Roadmap['frontmatter'],
    milestones: [{ name: 'MVP Release', isBacklog: false, features }],
  };
}

/** Spy store recording each mutation call (no real IO). */
function spyStore() {
  const calls: { op: string; slug: string }[] = [];
  const store: RoadmapStore = {
    load: async () => Ok(roadmap([])),
    patchFeature: async (slug, mutate) => {
      // exercise the mutation so a faulty thunk surfaces
      mutate(feature(slug));
      calls.push({ op: 'patch', slug });
      return Ok(undefined);
    },
    addFeature: async (input) => {
      calls.push({ op: 'add', slug: input.slug });
      return Ok(undefined);
    },
    removeFeature: async (slug) => {
      calls.push({ op: 'remove', slug });
      return Ok(undefined);
    },
  };
  return { store, calls };
}

describe('applyRoadmapDiff', () => {
  it('emits exactly one patchFeature for a single changed feature', async () => {
    const before = roadmap([feature('Alpha'), feature('Beta')]);
    const after = structuredClone(before);
    after.milestones[0]!.features[0]!.status = 'done';
    const { store, calls } = spyStore();
    const r = await applyRoadmapDiff(store, before, after);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ op: 'patch', slug: 'alpha' }]);
  });

  it('emits one addFeature for an added feature', async () => {
    const before = roadmap([feature('Alpha')]);
    const after = roadmap([feature('Alpha'), feature('Gamma')]);
    const { store, calls } = spyStore();
    const r = await applyRoadmapDiff(store, before, after);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ op: 'add', slug: 'gamma' }]);
  });

  it('emits one removeFeature for a removed feature', async () => {
    const before = roadmap([feature('Alpha'), feature('Beta')]);
    const after = roadmap([feature('Alpha')]);
    const { store, calls } = spyStore();
    const r = await applyRoadmapDiff(store, before, after);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ op: 'remove', slug: 'beta' }]);
  });

  it('emits zero calls when nothing changed', async () => {
    const before = roadmap([feature('Alpha'), feature('Beta')]);
    const after = structuredClone(before);
    const { store, calls } = spyStore();
    const r = await applyRoadmapDiff(store, before, after);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('short-circuits and returns the first Err', async () => {
    const before = roadmap([feature('Alpha')]);
    const after = roadmap([feature('Alpha'), feature('Gamma'), feature('Delta')]);
    const calls: string[] = [];
    const store: RoadmapStore = {
      load: async () => Ok(roadmap([])),
      patchFeature: async () => Ok(undefined),
      addFeature: async (input) => {
        calls.push(input.slug);
        return Err(new Error('boom'));
      },
      removeFeature: async () => Ok(undefined),
    };
    const r = await applyRoadmapDiff(store, before, after);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
