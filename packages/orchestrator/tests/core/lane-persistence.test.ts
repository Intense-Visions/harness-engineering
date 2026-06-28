import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { eventSourcing } from '@harness-engineering/core';
import {
  mapOrchestratorLane,
  persistLane,
  type OrchestratorLaneSignal,
} from '../../src/core/lane-persistence';

let dir: string;
beforeEach(() => {
  // A fresh tmp dir per test -> a fresh per-path INV-2 counter (seq starts at 1),
  // so no cross-test interference even though the counter is process-global.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-persist-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function laneOf(projectPath: string, issueId: string): Promise<string | undefined> {
  const loaded = await eventSourcing.loadEvents(projectPath);
  if (!loaded.ok) throw loaded.error;
  // Recompute lanes from the durable log only -- no in-memory state -- to prove
  // the lane survives across processes (Truth #9).
  return eventSourcing.projectLanes(loaded.value).tasks[issueId]?.lane;
}

describe('mapOrchestratorLane', () => {
  it('maps each orchestrator signal to its on-table lane (DLane-5)', () => {
    expect(mapOrchestratorLane('claim')).toBe('claimed');
    expect(mapOrchestratorLane('dispatch')).toBe('in_progress');
    expect(mapOrchestratorLane('success')).toBe('in_review');
    expect(mapOrchestratorLane('failure')).toBe('blocked');
    expect(mapOrchestratorLane('abandon')).toBe('canceled');
  });
});

describe('persistLane', () => {
  it('registers then transitions; the lane is emitted to the durable log', async () => {
    const r = await persistLane(dir, 'issue-1', 'claim');
    expect(r.ok).toBe(true);
    expect(await laneOf(dir, 'issue-1')).toBe('claimed');
  });

  it('lane state survives a reload (fresh projectLanes over loadEvents)', async () => {
    await persistLane(dir, 'issue-1', 'claim');
    await persistLane(dir, 'issue-1', 'dispatch');
    // Simulate a new process: read straight from the log with no in-memory state.
    expect(await laneOf(dir, 'issue-1')).toBe('in_progress');
  });

  it('runs the claim->dispatch->success sequence with no force (all on-table)', async () => {
    for (const signal of ['claim', 'dispatch', 'success'] as OrchestratorLaneSignal[]) {
      const r = await persistLane(dir, 'issue-2', signal);
      expect(r.ok).toBe(true);
    }
    expect(await laneOf(dir, 'issue-2')).toBe('in_review');
  });

  it('NEVER throws: an off-table transition returns an Err Result, not a throw', async () => {
    const reg = await persistLane(dir, 'issue-3', 'claim'); // planned -> claimed
    expect(reg.ok).toBe(true);
    // Now force an off-table jump: claimed -> in_review (skips in_progress).
    const r = await persistLane(dir, 'issue-3', 'success');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(Error);
    // The failed attempt emitted nothing new -- the task stays at claimed.
    expect(await laneOf(dir, 'issue-3')).toBe('claimed');
  });

  it('NEVER throws: a failing core log path is caught and returned as Err', async () => {
    // Point at a path under a regular file so the log layer cannot create its
    // directory; persistLane must swallow the failure and return Err (no throw).
    const filePath = path.join(dir, 'not-a-dir');
    fs.writeFileSync(filePath, 'x');
    const badPath = path.join(filePath, 'nested');
    const r = await persistLane(badPath, 'issue-4', 'claim');
    expect(r.ok).toBe(false);
  });
});
