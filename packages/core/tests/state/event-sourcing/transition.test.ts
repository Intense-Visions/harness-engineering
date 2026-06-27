import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerTask, transitionLane } from '../../../src/state/event-sourcing/transition';
import { loadEvents, resetLocalCountersForTests } from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import {
  readSnapshot,
  __resetMaterializeTimersForTests,
} from '../../../src/state/event-sourcing/snapshot';
import { projectLanes } from '../../../src/state/event-sourcing/projections/lanes';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estrans-'));
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

describe('registerTask', () => {
  it('emits task_registered; projectLanes shows the task at planned', async () => {
    const r = await registerTask(dir, 't1', ['t0']);
    expect(r.ok).toBe(true);
    const events = await unwrap(loadEvents(dir));
    const lanes = projectLanes(events);
    expect(lanes.tasks.t1).toMatchObject({ lane: 'planned', dependsOn: ['t0'] });
  });
});

describe('transitionLane', () => {
  it('emits a legal transition; readSnapshot shows the new lane (Truth #7)', async () => {
    await unwrap(registerTask(dir, 't1', []));
    const r = await transitionLane(dir, 't1', 'claimed');
    expect(r.ok).toBe(true);
    const snap = await unwrap(readSnapshot(dir));
    expect(snap.lanes.tasks.t1.lane).toBe('claimed');
  });

  it('rejects an off-table transition without force and emits nothing', async () => {
    await unwrap(registerTask(dir, 't1', []));
    await unwrap(transitionLane(dir, 't1', 'claimed'));
    const before = (await unwrap(loadEvents(dir))).filter(
      (e) => e.type === 'lane_transitioned'
    ).length;
    const r = await transitionLane(dir, 't1', 'done'); // claimed→done is off-table
    expect(r.ok).toBe(false);
    const after = (await unwrap(loadEvents(dir))).filter(
      (e) => e.type === 'lane_transitioned'
    ).length;
    expect(after).toBe(before); // nothing emitted
  });

  it('rejects a transition for an unregistered task', async () => {
    const r = await transitionLane(dir, 'tX', 'claimed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/not registered/);
  });

  it('enforces dependencies entering in_progress, then allows once deps are done', async () => {
    await unwrap(registerTask(dir, 'dep', []));
    await unwrap(registerTask(dir, 't2', ['dep']));
    await unwrap(transitionLane(dir, 't2', 'claimed'));
    // dep is still planned → t2 cannot enter in_progress.
    const blocked = await transitionLane(dir, 't2', 'in_progress');
    expect(blocked.ok).toBe(false);
    // Drive dep through to done (with evidence), then t2 may proceed.
    await unwrap(transitionLane(dir, 'dep', 'claimed'));
    await unwrap(transitionLane(dir, 'dep', 'in_progress'));
    await unwrap(transitionLane(dir, 'dep', 'in_review'));
    await unwrap(transitionLane(dir, 'dep', 'done', { evidence: ['pr#1'] }));
    const ok = await transitionLane(dir, 't2', 'in_progress');
    expect(ok.ok).toBe(true);
    const snap = await unwrap(readSnapshot(dir));
    expect(snap.lanes.tasks.t2.lane).toBe('in_progress');
  });
});
