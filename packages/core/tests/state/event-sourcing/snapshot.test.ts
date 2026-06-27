import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reduce, materialize } from '../../../src/state/event-sourcing/snapshot';
import {
  emitEvent,
  loadEvents,
  eventLogPaths,
  resetLocalCountersForTests,
} from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import { projectCoreState } from '../../../src/state/event-sourcing/projections/core-state';
import { SNAPSHOT_FILE } from '../../../src/state/event-sourcing/constants';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'essnap-'));
  resetLocalCountersForTests();
  __resetWriterIdForTests();
});
afterEach(() => {
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
    expect(snap.lanes).toEqual({});
    expect(snap.audit).toEqual({});
    expect(snap.meta.lastSeq).toBe(Math.max(...events.map((e) => e.seq)));
  });

  it('reduces an empty event list to lastSeq 0 and a default coreState', () => {
    const snap = reduce([]);
    expect(snap.meta.lastSeq).toBe(0);
    expect(snap.coreState).toEqual({ position: {}, decisions: [], blockers: [], progress: {} });
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
