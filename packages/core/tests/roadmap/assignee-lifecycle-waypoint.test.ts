/**
 * Waypoint emission at the sanctioned roadmap mutators (pnyon/pnyon#124).
 *
 * Two contracts under test:
 * 1. NO SINK CONFIGURED (the PRD Story 1 invariant): the mutators behave
 *    byte-identically to the pre-Waypoint behavior and create no files —
 *    the entire pre-existing assignee-lifecycle suite doubles as proof, and
 *    this file adds the file-system half of the assertion.
 * 2. SINK CONFIGURED: each committed mutation spools exactly one
 *    corresponding sdlc.* event; no-op calls (first-claim-wins rejection,
 *    same-status setStatus) spool nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Roadmap, RoadmapFeature, SdlcEvent } from '@harness-engineering/types';
import { claim, release, setStatus } from '../../src/roadmap/assignee-lifecycle';
import { initWaypointEmitter, resetWaypointEmitterForTests } from '../../src/waypoint/emitter';

function feature(overrides: Partial<RoadmapFeature> & { name: string }): RoadmapFeature {
  return {
    status: 'backlog',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: '',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function roadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-01-01T00:00:00Z',
      lastManualEdit: '2026-01-01T00:00:00Z',
    },
    milestones: [{ name: 'M', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

const DATE = '2026-09-04';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-mutators-'));
  resetWaypointEmitterForTests();
});

afterEach(() => {
  resetWaypointEmitterForTests();
  rmSync(dir, { recursive: true, force: true });
});

function spooledEvents(): SdlcEvent[] {
  const spoolDir = join(dir, '.harness', 'spool');
  if (!existsSync(spoolDir)) return [];
  const events: SdlcEvent[] = [];
  for (const entry of readdirSync(spoolDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(spoolDir, entry), 'utf8').split('\n')) {
      if (line.length > 0) events.push(JSON.parse(line) as SdlcEvent);
    }
  }
  return events;
}

describe('mutators with NO Waypoint sink (non-adopter invariance)', () => {
  it('behave exactly as before and create no files', () => {
    const f = feature({ name: 'A' });
    const r = roadmap([f]);
    claim(r, f, 'chad', DATE);
    expect(f.status).toBe('in-progress');
    expect(f.assignee).toBe('chad');
    release(r, f, DATE);
    expect(f.status).toBe('planned');
    expect(f.assignee).toBeNull();
    setStatus(r, f, 'done', DATE);
    expect(f.status).toBe('done');
    expect(existsSync(join(dir, '.harness'))).toBe(false);
    expect(spooledEvents()).toEqual([]);
  });
});

describe('mutators with a configured Waypoint sink', () => {
  beforeEach(() => {
    initWaypointEmitter({ sink: { transport: 'spool' } }, dir);
  });

  it('claim spools exactly one sdlc.claim.opened.v1', () => {
    const f = feature({ name: 'A' });
    claim(roadmap([f]), f, 'chad', DATE);
    const events = spooledEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('sdlc.claim.opened.v1');
    expect(events[0]?.subject).toBe('item/A');
    expect(events[0]?.data).toMatchObject({ mutator: 'claim', assignee: 'chad' });
  });

  it('a rejected steal (first claim wins) commits nothing and spools nothing', () => {
    const f = feature({ name: 'A', status: 'in-progress', assignee: 'someone-else' });
    claim(roadmap([f]), f, 'chad', DATE);
    expect(f.assignee).toBe('someone-else');
    expect(spooledEvents()).toEqual([]);
  });

  it('an idempotent same-owner re-claim spools nothing', () => {
    const f = feature({ name: 'A', status: 'in-progress', assignee: 'chad' });
    claim(roadmap([f]), f, 'chad', DATE);
    expect(spooledEvents()).toEqual([]);
  });

  it('release spools exactly one sdlc.claim.released.v1 with the prior owner', () => {
    const f = feature({ name: 'A', status: 'in-progress', assignee: 'chad' });
    release(roadmap([f]), f, DATE);
    const events = spooledEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('sdlc.claim.released.v1');
    expect(events[0]?.data).toMatchObject({ mutator: 'release', previousAssignee: 'chad' });
  });

  it('release of an already-unassigned, non-in-progress row spools nothing', () => {
    const f = feature({ name: 'A', status: 'planned' });
    release(roadmap([f]), f, DATE);
    expect(spooledEvents()).toEqual([]);
  });

  it('setStatus spools intent.updated, and intent.closed for done', () => {
    const f = feature({ name: 'A', status: 'planned' });
    const r = roadmap([f]);
    setStatus(r, f, 'in-progress', DATE);
    setStatus(r, f, 'done', DATE);
    const events = spooledEvents();
    expect(events.map((e) => e.type)).toEqual(['sdlc.intent.updated.v1', 'sdlc.intent.closed.v1']);
    expect(events[1]?.data).toMatchObject({ status: 'done', previousStatus: 'in-progress' });
  });

  it('a same-status setStatus commits no change and spools nothing', () => {
    const f = feature({ name: 'A', status: 'planned' });
    setStatus(roadmap([f]), f, 'planned', DATE);
    expect(spooledEvents()).toEqual([]);
  });

  it('a full lifecycle spools one event per committed mutation (exactly-one)', () => {
    const f = feature({ name: 'A' });
    const r = roadmap([f]);
    setStatus(r, f, 'planned', DATE); // 1: intent.updated
    claim(r, f, 'chad', DATE); // 2: claim.opened
    release(r, f, DATE); // 3: claim.released
    setStatus(r, f, 'done', DATE); // 4: intent.closed
    expect(spooledEvents().map((e) => e.type)).toEqual([
      'sdlc.intent.updated.v1',
      'sdlc.claim.opened.v1',
      'sdlc.claim.released.v1',
      'sdlc.intent.closed.v1',
    ]);
  });
});
