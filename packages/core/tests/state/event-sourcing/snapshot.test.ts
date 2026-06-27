import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  reduce,
  materialize,
  readSnapshot,
  isStale,
  __resetMaterializeTimersForTests,
  __flushMaterializeForTests,
} from '../../../src/state/event-sourcing/snapshot';
import {
  emitEvent,
  loadEvents,
  eventLogPaths,
  resetLocalCountersForTests,
} from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import { projectCoreState } from '../../../src/state/event-sourcing/projections/core-state';
import { projectLanes } from '../../../src/state/event-sourcing/projections/lanes';
import { projectAudit } from '../../../src/state/event-sourcing/projections/audit';
import { SNAPSHOT_FILE } from '../../../src/state/event-sourcing/constants';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'essnap-'));
  resetLocalCountersForTests();
  __resetWriterIdForTests();
  __resetMaterializeTimersForTests();
});
afterEach(() => {
  __resetMaterializeTimersForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function unwrap<T>(p: Promise<{ ok: boolean; value?: T; error?: Error }>): Promise<T> {
  const r = (await p) as { ok: boolean; value: T; error: Error };
  if (!r.ok) throw r.error;
  return r.value;
}

async function seedEvents(): Promise<void> {
  await emitEvent(dir, { type: 'position_set', payload: { phase: 'execute', task: 'Task 1' } });
  await emitEvent(dir, { type: 'decision_recorded', payload: { id: 'd1', text: 'use zod' } });
  await emitEvent(dir, { type: 'progress_set', payload: { task: 'Task 1', status: 'complete' } });
}

describe('reduce', () => {
  it('composes coreState + placeholder lanes/audit + meta.lastSeq', async () => {
    await seedEvents();
    const events = await unwrap(loadEvents(dir));
    const snap = reduce(events);
    expect(snap.schemaVersion).toBe(2);
    expect(snap.coreState).toEqual(projectCoreState(events));
    // Phase 4: lanes is now the real (empty-for-core-state-only) projection.
    expect(snap.lanes).toEqual({ tasks: {} });
    // Phase 5: audit is now the real (empty-for-no-audit-events) projection.
    expect(snap.audit).toEqual({ entries: [] });
    expect(snap.meta.lastSeq).toBe(Math.max(...events.map((e) => e.seq)));
  });

  it('materializes audit via projectAudit (additive — coreState/lanes byte-identical)', async () => {
    await seedEvents();
    const baseline = await unwrap(loadEvents(dir));
    const baselineCore = JSON.stringify(reduce(baseline).coreState);
    const baselineLanes = JSON.stringify(reduce(baseline).lanes);

    await emitEvent(dir, {
      type: 'user_input_captured',
      payload: { text: 'go ahead', interactionId: 'i1' },
    });
    await emitEvent(dir, {
      type: 'approval_requested',
      payload: { interactionId: 'i1', kind: 'confirmation', prompt: 'continue?' },
    });
    await emitEvent(dir, {
      type: 'approval_resolved',
      payload: { interactionId: 'i1', response: 'yes' },
    });
    const events = await unwrap(loadEvents(dir));
    const snap = reduce(events);
    // audit equals the standalone projection...
    expect(snap.audit).toEqual(projectAudit(events));
    expect((snap.audit as ReturnType<typeof projectAudit>).entries).toHaveLength(3);
    // ...and coreState/lanes are byte-identical to the pre-audit behavior (additivity).
    expect(JSON.stringify(snap.coreState)).toBe(baselineCore);
    expect(JSON.stringify(snap.lanes)).toBe(baselineLanes);
  });

  it('reduces an empty event list to lastSeq 0 and a default coreState', () => {
    const snap = reduce([]);
    expect(snap.meta.lastSeq).toBe(0);
    expect(snap.coreState).toEqual({ position: {}, decisions: [], blockers: [], progress: {} });
  });

  it('materializes lanes via projectLanes (additive — coreState unchanged)', async () => {
    await seedEvents();
    await emitEvent(dir, { type: 'task_registered', payload: { taskId: 't1', dependsOn: [] } });
    await emitEvent(dir, {
      type: 'lane_transitioned',
      payload: { taskId: 't1', from: 'planned', to: 'claimed' },
    });
    const events = await unwrap(loadEvents(dir));
    const snap = reduce(events);
    // lanes equals the standalone projection...
    expect(snap.lanes).toEqual(projectLanes(events));
    expect((snap.lanes as ReturnType<typeof projectLanes>).tasks.t1.lane).toBe('claimed');
    // ...and coreState is byte-identical to the pre-Phase-4 behavior.
    expect(snap.coreState).toEqual(projectCoreState(events));
  });
});

describe('materialize', () => {
  it('writes the snapshot atomically (no leftover tmp) and equals reduce(loadEvents)', async () => {
    await seedEvents();
    await unwrap(materialize(dir));
    const { dir: stateDir } = await eventLogPaths(dir);
    const snapPath = path.join(stateDir, SNAPSHOT_FILE);
    expect(fs.existsSync(snapPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    expect(onDisk).toEqual(reduce(await unwrap(loadEvents(dir))));
    // No torn temp sibling left behind.
    const siblings = fs.readdirSync(stateDir).filter((f) => f.includes('.tmp'));
    expect(siblings).toEqual([]);
  });

  it('materializes an empty log to a default snapshot with lastSeq 0', async () => {
    await unwrap(materialize(dir));
    const { dir: stateDir } = await eventLogPaths(dir);
    const onDisk = JSON.parse(fs.readFileSync(path.join(stateDir, SNAPSHOT_FILE), 'utf-8'));
    expect(onDisk.meta.lastSeq).toBe(0);
    expect(onDisk.coreState).toEqual({ position: {}, decisions: [], blockers: [], progress: {} });
  });
});

describe('isStale', () => {
  it('is stale when the snapshot is absent', () => {
    expect(isStale(null, 0)).toBe(true);
  });
  it('is stale when the tail has advanced past lastSeq', () => {
    expect(isStale(reduce([]), 1)).toBe(true);
  });
  it('is fresh when lastSeq covers the tail', () => {
    const snap = reduce([]);
    snap.meta.lastSeq = 5;
    expect(isStale(snap, 5)).toBe(false);
  });
});

describe('readSnapshot — fresh hit (does not recompute)', () => {
  it('returns the stored snapshot verbatim when up to date', async () => {
    await seedEvents();
    await unwrap(materialize(dir));
    const { dir: stateDir, logPath } = await eventLogPaths(dir);
    const snapPath = path.join(stateDir, SNAPSHOT_FILE);
    // Tamper the stored coreState to a sentinel, keeping meta.lastSeq === tailSeq.
    const stored = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    stored.coreState = { sentinel: 'STORED-NOT-RECOMPUTED' };
    const { readTailSeq } = await import('../../../src/state/event-sourcing/log');
    stored.meta.lastSeq = readTailSeq(logPath);
    fs.writeFileSync(snapPath, JSON.stringify(stored, null, 2));

    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Proves the read path returned the stored value, not a fresh reduce().
    expect((result.value.coreState as unknown as { sentinel: string }).sentinel).toBe(
      'STORED-NOT-RECOMPUTED'
    );
  });
});

describe('readSnapshot — staleness recompute, never writes on the read path (truth #6)', () => {
  it('returns a fresh reduce() and leaves the on-disk file unchanged immediately after the read', async () => {
    await seedEvents();
    await unwrap(materialize(dir));
    const { dir: stateDir } = await eventLogPaths(dir);
    const snapPath = path.join(stateDir, SNAPSHOT_FILE);
    const before = fs.readFileSync(snapPath, 'utf-8');

    // Advance the tail so the snapshot is now stale.
    await emitEvent(dir, { type: 'progress_set', payload: { task: 'Task 2', status: 'complete' } });

    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fresh = reduce(await unwrap(loadEvents(dir)));
    expect(result.value).toEqual(fresh);
    // The read path must NOT have mutated the file synchronously.
    expect(fs.readFileSync(snapPath, 'utf-8')).toBe(before);
  });
});

describe('readSnapshot — fallbacks (never throws)', () => {
  it('falls back to reduce() on a corrupt snapshot file', async () => {
    await seedEvents();
    const { dir: stateDir } = await eventLogPaths(dir);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, SNAPSHOT_FILE), '{ not json');

    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(reduce(await unwrap(loadEvents(dir))));
  });

  it('falls back to reduce() when no snapshot file exists', async () => {
    await seedEvents();
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(reduce(await unwrap(loadEvents(dir))));
  });
});

describe('readStoredSnapshot — structural validation (carry-forward, truth #6)', () => {
  // Tamper a fresh snapshot so it is NOT stale (meta.lastSeq === tailSeq) but is
  // structurally invalid; the hardened reader must treat it as a cache miss and
  // recompute from the log rather than returning the stale/skewed stored object.
  async function tamperFreshSnapshot(
    mutate: (snap: Record<string, unknown>) => void
  ): Promise<void> {
    await seedEvents();
    await unwrap(materialize(dir));
    const { dir: stateDir, logPath } = await eventLogPaths(dir);
    const snapPath = path.join(stateDir, SNAPSHOT_FILE);
    const stored = JSON.parse(fs.readFileSync(snapPath, 'utf-8')) as Record<string, unknown>;
    const { readTailSeq } = await import('../../../src/state/event-sourcing/log');
    (stored.meta as { lastSeq: number }).lastSeq = readTailSeq(logPath); // keep it fresh
    mutate(stored);
    fs.writeFileSync(snapPath, JSON.stringify(stored, null, 2));
  }

  it('recomputes when schemaVersion !== 2 (version skew)', async () => {
    await tamperFreshSnapshot((s) => {
      s.schemaVersion = 1;
      s.coreState = { sentinel: 'STALE-SKEWED' };
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(reduce(await unwrap(loadEvents(dir))));
  });

  it('recomputes when coreState is null', async () => {
    await tamperFreshSnapshot((s) => {
      s.coreState = null;
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(reduce(await unwrap(loadEvents(dir))));
  });

  it('recomputes when coreState is a non-object', async () => {
    await tamperFreshSnapshot((s) => {
      s.coreState = 'not-an-object';
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(reduce(await unwrap(loadEvents(dir))));
  });
});

describe('readSnapshot — debounced schedule eventually materializes', () => {
  it('does not write during the read, but a flushed timer materializes the fresh snapshot', async () => {
    vi.useFakeTimers();
    try {
      await seedEvents();
      await unwrap(materialize(dir));
      const { dir: stateDir } = await eventLogPaths(dir);
      const snapPath = path.join(stateDir, SNAPSHOT_FILE);

      // Make the snapshot stale.
      await emitEvent(dir, {
        type: 'progress_set',
        payload: { task: 'Task 9', status: 'complete' },
      });
      const stale = fs.readFileSync(snapPath, 'utf-8');

      await readSnapshot(dir);
      // Immediately after the read, the file is still the stale one (read never writes).
      expect(fs.readFileSync(snapPath, 'utf-8')).toBe(stale);

      // Fire the debounced timer and await the flushed materialize.
      vi.runAllTimers();
      await __flushMaterializeForTests();

      const onDisk = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
      expect(onDisk).toEqual(reduce(await unwrap(loadEvents(dir))));
    } finally {
      vi.useRealTimers();
    }
  });
});
