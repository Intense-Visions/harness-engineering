import { describe, it, expect } from 'vitest';
import { MonolithStore } from '../../../src/roadmap/store/monolith-store';
import type { FileIO } from '../../../src/roadmap/store/monolith-store';
import { parseRoadmap } from '../../../src/roadmap/parse';
import { MONOLITH_ROADMAP, MONOLITH_ROADMAP_MD } from './fixtures';

const ROADMAP_PATH = '/repo/docs/roadmap.md';

/** Build an in-memory FileIO seeded with the roadmap fixture. */
function makeIO(seed: Record<string, string> = { [ROADMAP_PATH]: MONOLITH_ROADMAP_MD }) {
  const files = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  const io: FileIO = {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
      writes.push(p);
    },
  };
  return { io, files, writes };
}

describe('MonolithStore', () => {
  it('load() returns a Roadmap deep-equal to parseRoadmap(md)', async () => {
    const { io } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.load();
    expect(r.ok).toBe(true);
    if (r.ok) {
      const expected = parseRoadmap(MONOLITH_ROADMAP_MD);
      if (!expected.ok) throw expected.error;
      expect(r.value).toEqual(expected.value);
      expect(r.value).toEqual(MONOLITH_ROADMAP);
    }
  });

  it('patchFeature() mutates the resolved feature and writes it back', async () => {
    const { io, files } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.patchFeature('a-feature', (f) => ({ ...f, status: 'done' }));
    expect(r.ok).toBe(true);

    const written = parseRoadmap(files.get(ROADMAP_PATH)!);
    if (!written.ok) throw written.error;
    const a = written.value.milestones[0]!.features.find((f) => f.name === 'A feature');
    expect(a?.status).toBe('done');
  });

  it('patchFeature() errors when the slug resolves to no feature', async () => {
    const { io } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.patchFeature('does-not-exist', (f) => f);
    expect(r.ok).toBe(false);
  });

  it('addFeature() appends to the target milestone and writes', async () => {
    const { io, files } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.addFeature({
      slug: 'c-feature',
      milestone: 'MVP Release',
      order: 30,
      feature: {
        name: 'C feature',
        status: 'planned',
        spec: null,
        plans: [],
        blockedBy: [],
        summary: 'A new feature',
        assignee: null,
        priority: null,
        externalId: null,
        updatedAt: null,
      },
    });
    expect(r.ok).toBe(true);

    const written = parseRoadmap(files.get(ROADMAP_PATH)!);
    if (!written.ok) throw written.error;
    const mvp = written.value.milestones.find((m) => m.name === 'MVP Release');
    expect(mvp?.features.map((f) => f.name)).toContain('C feature');
  });

  it('patchFrontmatter() mutates frontmatter via a whole-file rewrite', async () => {
    const { io, files, writes } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.patchFrontmatter((fm) => ({ ...fm, lastManualEdit: '2099-12-31' }));
    expect(r.ok).toBe(true);
    expect(writes).toEqual([ROADMAP_PATH]);
    const written = parseRoadmap(files.get(ROADMAP_PATH)!);
    if (!written.ok) throw written.error;
    expect(written.value.frontmatter.lastManualEdit).toBe('2099-12-31');
  });

  it('patchAssignmentHistory() persists roadmap-level audit log via whole-file rewrite', async () => {
    const { io, files, writes } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const history = [
      { feature: 'A feature', action: 'assigned' as const, assignee: '@alice', date: '2026-01-02' },
    ];
    const r = await store.patchAssignmentHistory(history);
    expect(r.ok).toBe(true);
    expect(writes).toEqual([ROADMAP_PATH]);
    const written = parseRoadmap(files.get(ROADMAP_PATH)!);
    if (!written.ok) throw written.error;
    expect(written.value.assignmentHistory).toEqual(history);
  });

  it('removeFeature() splices the resolved feature and writes back', async () => {
    const { io, files, writes } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.removeFeature('a-feature');
    expect(r.ok).toBe(true);
    expect(writes).toEqual([ROADMAP_PATH]);

    const written = parseRoadmap(files.get(ROADMAP_PATH)!);
    if (!written.ok) throw written.error;
    const allNames = written.value.milestones.flatMap((m) => m.features.map((f) => f.name));
    expect(allNames).not.toContain('A feature');
  });

  it('removeFeature() returns Err when the slug resolves to no feature', async () => {
    const { io, writes } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.removeFeature('does-not-exist');
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });

  // Guard: addFeature must not silently overwrite/duplicate an existing row when
  // its slug already resolves to a feature (Phase 4 data loss).
  it('addFeature() returns Err when the slug already resolves to a feature', async () => {
    const { io, writes } = makeIO();
    const store = new MonolithStore({ roadmapPath: ROADMAP_PATH, io });
    const r = await store.addFeature({
      slug: 'a-feature', // slugifyFeatureName('A feature') -> already present
      milestone: 'MVP Release',
      order: 1,
      feature: {
        name: 'A feature',
        status: 'planned',
        spec: null,
        plans: [],
        blockedBy: [],
        summary: 'Should not duplicate',
        assignee: null,
        priority: null,
        externalId: null,
        updatedAt: null,
      },
    });
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
});
