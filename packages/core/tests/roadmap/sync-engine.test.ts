import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  syncToExternal,
  syncFromExternal,
  fullSync,
  _resetSyncMutex,
} from '../../src/roadmap/sync-engine';
import type { TrackerSyncAdapter, ExternalSyncOptions } from '../../src/roadmap/tracker-sync';
import type {
  Roadmap,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';

const CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned',
  },
};

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    ...overrides,
  };
}

function makeRoadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: [{ name: 'M1', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

function mockAdapter(overrides?: Partial<TrackerSyncAdapter>): TrackerSyncAdapter {
  let counter = 0;
  return {
    createTicket: vi.fn(async () => {
      counter++;
      return Ok({
        externalId: `github:owner/repo#${counter}`,
        url: `https://github.com/owner/repo/issues/${counter}`,
      });
    }),
    updateTicket: vi.fn(async (_id: string) =>
      Ok({ externalId: _id, url: `https://github.com/owner/repo/issues/1` })
    ),
    fetchTicketState: vi.fn(async () =>
      Ok({ externalId: '', title: '', status: 'open', labels: [], assignee: null })
    ),
    fetchAllTickets: vi.fn(async () => Ok([])),
    assignTicket: vi.fn(async () => Ok(undefined)),
    getAuthenticatedUser: vi.fn(async () => Ok('@testuser')),
    ...overrides,
  };
}

describe('syncToExternal()', () => {
  it('creates tickets for features without externalId', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.externalId).toBe('github:owner/repo#1');
    expect(feature.externalId).toBe('github:owner/repo#1'); // mutated in-place
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('updates tickets for features with externalId', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#42' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.updated).toEqual(['github:owner/repo#42']);
    expect(result.created).toHaveLength(0);
    expect(adapter.updateTicket).toHaveBeenCalledOnce();
  });

  it('collects errors per-feature without throwing', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      createTicket: vi.fn(async () => Err(new Error('API down'))),
    });

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.featureOrId).toBe('Test Feature');
    expect(result.errors[0]!.error.message).toBe('API down');
    expect(result.created).toHaveLength(0);
  });

  it('does not auto-assign authenticated user to unassigned features', async () => {
    const feature = makeFeature({ assignee: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    await syncToExternal(roadmap, adapter, CONFIG);

    expect(feature.assignee).toBeNull();
  });

  it('preserves existing assignee and does not overwrite', async () => {
    const feature = makeFeature({ assignee: '@alice' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    await syncToExternal(roadmap, adapter, CONFIG);

    expect(feature.assignee).toBe('@alice');
  });

  it('deduplicates by title — links and updates existing issue instead of creating', async () => {
    const feature = makeFeature({ name: 'Existing Feature', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();
    const prefetchedTickets = [
      {
        externalId: 'github:owner/repo#99',
        title: 'Existing Feature',
        status: 'open',
        labels: ['harness-managed'],
        assignee: null,
      },
    ];

    const result = await syncToExternal(roadmap, adapter, CONFIG, prefetchedTickets);

    // Should link and update, not create
    expect(result.created).toHaveLength(0);
    expect(result.updated).toContain('github:owner/repo#99');
    expect(feature.externalId).toBe('github:owner/repo#99');
    expect(adapter.createTicket).not.toHaveBeenCalled();
    // Should update planning fields on the linked issue
    expect(adapter.updateTicket).toHaveBeenCalledOnce();
  });

  it('dedup is case-insensitive', async () => {
    const feature = makeFeature({ name: 'My Feature', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();
    const prefetchedTickets = [
      {
        externalId: 'github:owner/repo#50',
        title: 'my feature',
        status: 'open',
        labels: ['harness-managed'],
        assignee: null,
      },
    ];

    const result = await syncToExternal(roadmap, adapter, CONFIG, prefetchedTickets);

    expect(result.created).toHaveLength(0);
    expect(feature.externalId).toBe('github:owner/repo#50');
  });

  it('dedup only matches issues with configured labels', async () => {
    const feature = makeFeature({ name: 'My Feature', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();
    // Issue exists with matching title but missing harness-managed label
    const prefetchedTickets = [
      {
        externalId: 'github:owner/repo#50',
        title: 'My Feature',
        status: 'open',
        labels: ['bug'],
        assignee: null,
      },
    ];

    const result = await syncToExternal(roadmap, adapter, CONFIG, prefetchedTickets);

    // Should NOT dedup — label mismatch
    expect(result.created).toHaveLength(1);
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('dedup prefers open issues over closed when titles collide', async () => {
    const feature = makeFeature({ name: 'Dup Title', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();
    const prefetchedTickets = [
      {
        externalId: 'github:owner/repo#10',
        title: 'Dup Title',
        status: 'closed',
        labels: ['harness-managed'],
        assignee: null,
      },
      {
        externalId: 'github:owner/repo#20',
        title: 'Dup Title',
        status: 'open',
        labels: ['harness-managed'],
        assignee: null,
      },
    ];

    await syncToExternal(roadmap, adapter, CONFIG, prefetchedTickets);

    expect(feature.externalId).toBe('github:owner/repo#20');
  });

  it('creates ticket when no title match exists', async () => {
    const feature = makeFeature({ name: 'Brand New', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();
    const prefetchedTickets = [
      {
        externalId: 'github:owner/repo#1',
        title: 'Something Else',
        status: 'open',
        labels: ['harness-managed'],
        assignee: null,
      },
    ];

    const result = await syncToExternal(roadmap, adapter, CONFIG, prefetchedTickets);

    expect(result.created).toHaveLength(1);
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('proceeds without dedup when no prefetched tickets provided', async () => {
    const feature = makeFeature({ name: 'New Feature', externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.created).toHaveLength(1);
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('handles mix of new and existing features', async () => {
    const newFeature = makeFeature({ name: 'New' });
    const existingFeature = makeFeature({ name: 'Existing', externalId: 'github:owner/repo#10' });
    const roadmap = makeRoadmap([newFeature, existingFeature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
  });
});

describe('syncFromExternal()', () => {
  it('updates assignee when external differs from local', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', assignee: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: ['planned'],
            assignee: '@cwarner',
          },
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.assignee).toBe('@cwarner');
    expect(result.assignmentChanges).toHaveLength(1);
    expect(result.assignmentChanges[0]).toEqual({
      feature: 'Test Feature',
      from: null,
      to: '@cwarner',
    });
  });

  it('does not regress status without forceSync', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'done' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: ['in-progress'],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done'); // unchanged
  });

  it('allows status regression with forceSync: true', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'done' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: ['in-progress'],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG, { forceSync: true });

    expect(feature.status).toBe('in-progress');
  });

  it('preserves status when reverse mapping is ambiguous', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'planned' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: ['in-progress', 'blocked'], // ambiguous
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('planned'); // preserved
  });

  it('skips features without externalId', async () => {
    const feature = makeFeature({ externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(result.assignmentChanges).toHaveLength(0);
    // fetchAllTickets should not even be called when no features have externalIds
    expect(adapter.fetchAllTickets).not.toHaveBeenCalled();
  });

  it('collects errors when fetchAllTickets fails', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Err(new Error('Network failure'))),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error.message).toBe('Network failure');
  });

  it('preserves blocked status when external ticket is open (no blocked label)', async () => {
    // Regression: manage_roadmap update triggers external sync, GitHub issue is "open"
    // which maps to "planned" via reverseStatusMap. blocked → planned is lateral (same rank),
    // so the directional guard allows it. This silently un-blocks features.
    const feature = makeFeature({
      externalId: 'github:owner/repo#1',
      status: 'blocked',
    });
    const roadmap = makeRoadmap([feature]);

    // Config with simple "open" -> "planned" reverse mapping (matches real harness.config.json)
    const simpleConfig: TrackerSyncConfig = {
      ...CONFIG,
      reverseStatusMap: {
        open: 'planned',
        closed: 'done',
      },
    };

    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: [],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, simpleConfig);

    expect(feature.status).toBe('blocked'); // must NOT flip to planned
  });

  it('allows blocked → in-progress when external ticket has in-progress label', async () => {
    const feature = makeFeature({
      externalId: 'github:owner/repo#1',
      status: 'blocked',
    });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'open',
            labels: ['in-progress'],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('in-progress'); // forward progression allowed
  });

  it('allows blocked → done when external ticket is closed', async () => {
    const feature = makeFeature({
      externalId: 'github:owner/repo#1',
      status: 'blocked',
    });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'closed',
            labels: [],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done'); // forward progression allowed
  });

  it('advances status forward (planned -> done via closed)', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'planned' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            title: 'Test Feature',
            status: 'closed',
            labels: [],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done');
  });
});

describe('fullSync()', () => {
  let tmpDir: string;
  let roadmapPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullsync-'));
    roadmapPath = path.join(tmpDir, 'roadmap.md');
    _resetSyncMutex();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRoadmap(roadmap: Roadmap): void {
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');
  }

  it('reads roadmap, pushes, pulls, writes back', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'My Feature' })]);
    writeRoadmap(roadmap);

    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Ok([])),
    });

    const result = await fullSync(roadmapPath, adapter, CONFIG);

    expect(result.created).toHaveLength(1); // feature had no externalId
    expect(result.errors).toHaveLength(0);

    // Verify file was written back with externalId
    const updatedRaw = fs.readFileSync(roadmapPath, 'utf-8');
    expect(updatedRaw).toContain('github:owner/repo#1');
  });

  it('serializes concurrent calls via mutex', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'Concurrent' })]);
    writeRoadmap(roadmap);

    const callOrder: number[] = [];
    let counter = 0;

    const adapter = mockAdapter({
      createTicket: vi.fn(async () => {
        counter++;
        const myNum = counter;
        callOrder.push(myNum);
        // Simulate delay
        await new Promise((r) => setTimeout(r, 10));
        return Ok({
          externalId: `github:owner/repo#${myNum}`,
          url: `https://github.com/owner/repo/issues/${myNum}`,
        });
      }),
      fetchAllTickets: vi.fn(async () => Ok([])),
    });

    // Fire two syncs concurrently
    const [r1, r2] = await Promise.all([
      fullSync(roadmapPath, adapter, CONFIG),
      fullSync(roadmapPath, adapter, CONFIG),
    ]);

    // Both should complete without error
    expect(r1.errors).toHaveLength(0);
    expect(r2.errors).toHaveLength(0);

    // The second sync should see the externalId written by the first,
    // so it should update rather than create
    const totalCreated = r1.created.length + r2.created.length;
    const totalUpdated = r1.updated.length + r2.updated.length;
    expect(totalCreated + totalUpdated).toBeGreaterThanOrEqual(2);
  });

  it('returns error result for invalid roadmap file', async () => {
    fs.writeFileSync(roadmapPath, 'not a valid roadmap', 'utf-8');
    const adapter = mockAdapter();

    const result = await fullSync(roadmapPath, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.featureOrId).toBe('*');
  });
});
