import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Roadmap, RoadmapFeature, AssignmentRecord } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { reconcileDoneFromClosedIssues } from '../../src/roadmap/reconcile';
import type { RoadmapStore } from '../../src/roadmap/store/roadmap-store';
import { slugifyFeatureName } from '../../src/roadmap/store/monolith-store';
import { resolveRoadmapStoreForFile } from '../../src/roadmap/store/factory';
import { serializeShard } from '../../src/roadmap/store/shard';
import { serializeMeta } from '../../src/roadmap/store/meta';

function feature(
  name: string,
  status: RoadmapFeature['status'] = 'planned',
  extra: Partial<RoadmapFeature> = {}
): RoadmapFeature {
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
    ...extra,
  };
}

function roadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: { version: 1 } as Roadmap['frontmatter'],
    milestones: [{ name: 'MVP Release', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

/**
 * In-memory store that actually applies mutations to a held `Roadmap` (so a
 * second reconcile pass sees the persisted state) and records each op so tests
 * can assert single-shard-per-issue write scope without an fs mock.
 */
function inMemoryStore(initial: Roadmap) {
  let current = structuredClone(initial);
  const calls = {
    patchFeature: [] as string[],
    addFeature: [] as string[],
    removeFeature: [] as string[],
    patchFrontmatter: 0,
    patchAssignmentHistory: [] as AssignmentRecord[][],
  };
  const store: RoadmapStore = {
    load: async () => Ok(structuredClone(current)),
    patchFeature: async (slug, mutate) => {
      for (const m of current.milestones) {
        const idx = m.features.findIndex((f) => slugifyFeatureName(f.name) === slug);
        if (idx >= 0) {
          m.features[idx] = mutate(m.features[idx]!);
          break;
        }
      }
      calls.patchFeature.push(slug);
      return Ok(undefined);
    },
    addFeature: async (input) => {
      calls.addFeature.push(input.slug);
      return Ok(undefined);
    },
    removeFeature: async (slug) => {
      calls.removeFeature.push(slug);
      return Ok(undefined);
    },
    patchFrontmatter: async (mutate) => {
      current.frontmatter = mutate(current.frontmatter);
      calls.patchFrontmatter += 1;
      return Ok(undefined);
    },
    patchAssignmentHistory: async (history) => {
      current.assignmentHistory = structuredClone(history);
      calls.patchAssignmentHistory.push(structuredClone(history));
      return Ok(undefined);
    },
  };
  return {
    store,
    calls,
    get current() {
      return current;
    },
  };
}

describe('reconcileDoneFromClosedIssues', () => {
  it('marks a single matched non-done row done and patches exactly its shard (Truth 1)', async () => {
    const mem = inMemoryStore(
      roadmap([
        feature('Alpha', 'planned', { externalId: 'github:o/r#1' }),
        feature('Beta', 'planned', { externalId: 'github:o/r#2' }),
      ])
    );
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.markedDone).toEqual(['Alpha']);
    expect(r.value.alreadyDone).toEqual([]);
    expect(r.value.unmatched).toEqual([]);
    expect(mem.calls.patchFeature).toEqual(['alpha']);
  });

  it('after reconcile the matched row status is done', async () => {
    const mem = inMemoryStore(
      roadmap([feature('Alpha', 'planned', { externalId: 'github:o/r#1' })])
    );
    await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], { date: '2026-06-27' });
    expect(mem.current.milestones[0]!.features[0]!.status).toBe('done');
  });

  it('N closed ids → N distinct shards patched (Truth 2)', async () => {
    const mem = inMemoryStore(
      roadmap([
        feature('Alpha', 'planned', { externalId: 'github:o/r#1' }),
        feature('Beta', 'planned', { externalId: 'github:o/r#2' }),
        feature('Gamma', 'planned', { externalId: 'github:o/r#3' }),
      ])
    );
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1', 'github:o/r#2'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.markedDone.sort()).toEqual(['Alpha', 'Beta']);
    expect(mem.calls.patchFeature.sort()).toEqual(['alpha', 'beta']);
  });

  it('is idempotent: an already-done row in the closed set produces zero writes (Truth 3)', async () => {
    const mem = inMemoryStore(roadmap([feature('Alpha', 'done', { externalId: 'github:o/r#1' })]));
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.alreadyDone).toEqual(['Alpha']);
    expect(r.value.markedDone).toEqual([]);
    expect(mem.calls.patchFeature).toEqual([]);
    expect(mem.calls.patchAssignmentHistory).toEqual([]);
  });

  it('double-invocation: second pass over a now-done row writes nothing (Truth 3)', async () => {
    const mem = inMemoryStore(
      roadmap([feature('Alpha', 'planned', { externalId: 'github:o/r#1' })])
    );
    await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], { date: '2026-06-27' });
    const firstPassPatches = mem.calls.patchFeature.length;
    const r2 = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], {
      date: '2026-06-27',
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.alreadyDone).toEqual(['Alpha']);
    expect(mem.calls.patchFeature.length).toBe(firstPassPatches); // no new patch
  });

  it('clears the assignee and appends one unassigned record on in-progress→done (Truth 4)', async () => {
    const mem = inMemoryStore(
      roadmap([feature('Alpha', 'in-progress', { externalId: 'github:o/r#1', assignee: '@dev' })])
    );
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    const f = mem.current.milestones[0]!.features[0]!;
    expect(f.status).toBe('done');
    expect(f.assignee).toBeNull();
    // exactly one new unassigned record persisted via patchAssignmentHistory
    const lastHistory = mem.calls.patchAssignmentHistory.at(-1)!;
    const unassigned = lastHistory.filter((h) => h.action === 'unassigned');
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]).toMatchObject({
      feature: 'Alpha',
      assignee: '@dev',
      action: 'unassigned',
    });
  });

  it('reports an unmatched closed id and writes nothing for it (Truth 5)', async () => {
    const mem = inMemoryStore(
      roadmap([feature('Alpha', 'planned', { externalId: 'github:o/r#1' })])
    );
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#42'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unmatched).toEqual(['github:o/r#42']);
    expect(r.value.markedDone).toEqual([]);
    expect(mem.calls.patchFeature).toEqual([]);
    expect(mem.calls.addFeature).toEqual([]);
    expect(mem.calls.removeFeature).toEqual([]);
    expect(mem.calls.patchAssignmentHistory).toEqual([]);
  });

  it('only ever transitions a matched row to done — never another status (Truth 5)', async () => {
    const mem = inMemoryStore(
      roadmap([feature('Alpha', 'blocked', { externalId: 'github:o/r#1' })])
    );
    const r = await reconcileDoneFromClosedIssues(mem.store, ['github:o/r#1'], {
      date: '2026-06-27',
    });
    expect(r.ok).toBe(true);
    expect(mem.current.milestones[0]!.features[0]!.status).toBe('done');
  });

  describe('mode parity: real temp-dir ShardStore (Truth 6)', () => {
    it('patches only the matched shard file on disk', async () => {
      const root = mkdtempSync(join(tmpdir(), 'reconcile-shard-'));
      const shardDir = join(root, 'docs', 'roadmap.d');
      mkdirSync(shardDir, { recursive: true });

      const alpha = feature('Alpha', 'planned', { externalId: 'github:o/r#1' });
      const beta = feature('Beta', 'planned', { externalId: 'github:o/r#2' });
      writeFileSync(
        join(shardDir, 'alpha.md'),
        serializeShard({ slug: 'alpha', milestone: 'MVP Release', order: 0, feature: alpha })
      );
      writeFileSync(
        join(shardDir, 'beta.md'),
        serializeShard({ slug: 'beta', milestone: 'MVP Release', order: 1, feature: beta })
      );
      writeFileSync(
        join(shardDir, '_meta.md'),
        serializeMeta({
          frontmatter: {
            project: 'p',
            version: 1,
            lastSynced: '2026-06-27T00:00:00.000Z',
            lastManualEdit: '2026-06-27T00:00:00.000Z',
          },
          milestones: ['MVP Release'],
        })
      );

      const betaBefore = readFileSync(join(shardDir, 'beta.md'), 'utf8');
      const store = resolveRoadmapStoreForFile({ roadmapPath: join(root, 'docs', 'roadmap.md') });

      const r = await reconcileDoneFromClosedIssues(store, ['github:o/r#1'], {
        date: '2026-06-27',
      });
      expect(r.ok).toBe(true);

      const alphaAfter = readFileSync(join(shardDir, 'alpha.md'), 'utf8');
      const betaAfter = readFileSync(join(shardDir, 'beta.md'), 'utf8');
      expect(alphaAfter).toContain('done');
      expect(betaAfter).toBe(betaBefore); // unmatched shard untouched byte-for-byte
    });
  });
});
