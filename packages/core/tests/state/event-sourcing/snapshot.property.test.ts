import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  reduce,
  materialize,
  readSnapshot,
  __resetMaterializeTimersForTests,
} from '../../../src/state/event-sourcing/snapshot';
import {
  emitEvent,
  loadEvents,
  resetLocalCountersForTests,
} from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import type { EventInput } from '../../../src/state/event-sourcing/events';

/**
 * SC2 — the spec's central invariant: reduce(loadEvents(scope)) deep-equals
 * readSnapshot(scope) over arbitrary core-state event sequences, on BOTH the
 * computed (stale/missing) path and the materialized fresh-hit path.
 *
 * No fast-check dependency (DP5): a seeded mulberry32 PRNG generates many randomized
 * valid sequences across several writerIds. A failing seed is a real reducer/snapshot
 * bug to fix — not a test to weaken.
 */

/** Deterministic seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_POOL = ['x', 'y', 'z']; // small pool → forces union + scalar contention
const TASK_POOL = ['T1', 'T2', 'T3'];
const STATUSES = ['pending', 'in_progress', 'complete'] as const;
const TYPES = [
  'position_set',
  'decision_recorded',
  'blocker_opened',
  'blocker_resolved',
  'progress_set',
  'session_summarized',
] as const;

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomEventInput(rng: () => number): EventInput {
  const type = pick(rng, TYPES);
  switch (type) {
    case 'position_set': {
      const p: { phase?: string; task?: string } = {};
      if (rng() < 0.8) p.phase = pick(rng, ['plan', 'execute', 'verify']);
      if (rng() < 0.6) p.task = pick(rng, TASK_POOL);
      return { type, payload: p };
    }
    case 'decision_recorded': {
      const payload: { id: string; text: string; context?: string } = {
        id: pick(rng, ID_POOL),
        text: `decision-${Math.floor(rng() * 1000)}`,
      };
      if (rng() < 0.5) payload.context = `ctx-${Math.floor(rng() * 1000)}`;
      return { type, payload };
    }
    case 'blocker_opened':
      return {
        type,
        payload: { id: pick(rng, ID_POOL), description: `desc-${Math.floor(rng() * 1000)}` },
      };
    case 'blocker_resolved':
      return { type, payload: { id: pick(rng, ID_POOL) } };
    case 'progress_set':
      return { type, payload: { task: pick(rng, TASK_POOL), status: pick(rng, STATUSES) } };
    case 'session_summarized': {
      const payload: { summary: string; lastSkill?: string; pendingTasks?: string[] } = {
        summary: `summary-${Math.floor(rng() * 1000)}`,
      };
      if (rng() < 0.5) payload.lastSkill = pick(rng, ['exec', 'plan']);
      if (rng() < 0.5)
        payload.pendingTasks = TASK_POOL.slice(0, Math.floor(rng() * TASK_POOL.length));
      return { type, payload };
    }
  }
}

const tmpDirs: string[] = [];
afterEach(() => {
  __resetMaterializeTimersForTests();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.HARNESS_EVENT_WRITER_ID;
  __resetWriterIdForTests();
});

async function buildLog(rng: () => number, dir: string): Promise<void> {
  const writerCount = 1 + Math.floor(rng() * 3); // 1-3 alternating writers
  const writers = ['wa', 'wb', 'wc'].slice(0, writerCount);
  const eventCount = Math.floor(rng() * 31); // 0-30
  for (let i = 0; i < eventCount; i++) {
    // Switch writerId by overriding the env + resetting the cached id.
    process.env.HARNESS_EVENT_WRITER_ID = pick(rng, writers);
    __resetWriterIdForTests();
    const input = randomEventInput(rng);
    const r = await emitEvent(dir, input);
    expect(r.ok).toBe(true);
  }
}

describe('SC2 — reduce(events) === readSnapshot() (property)', () => {
  it('holds over 200 randomized seeds on both the computed and fresh-hit paths', async () => {
    const SEEDS = 200;
    for (let seed = 1; seed <= SEEDS; seed++) {
      resetLocalCountersForTests();
      __resetMaterializeTimersForTests();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `esprop-${seed}-`));
      tmpDirs.push(dir);
      const rng = mulberry32(seed);

      await buildLog(rng, dir);

      const eventsResult = await loadEvents(dir);
      expect(eventsResult.ok).toBe(true);
      if (!eventsResult.ok) return;
      const expected = reduce(eventsResult.value);

      // (a) Computed path: no snapshot on disk yet → readSnapshot returns reduce(loadEvents).
      const computed = await readSnapshot(dir);
      expect(computed.ok, `seed ${seed} computed path errored`).toBe(true);
      if (!computed.ok) return;
      expect(computed.value, `seed ${seed} computed path mismatch`).toEqual(expected);

      // Cancel the background materialize the read just scheduled, then write explicitly.
      __resetMaterializeTimersForTests();
      const mat = await materialize(dir);
      expect(mat.ok, `seed ${seed} materialize errored`).toBe(true);

      // (b) Fresh-hit path: an up-to-date snapshot on disk still deep-equals reduce(loadEvents).
      const fresh = await readSnapshot(dir);
      expect(fresh.ok, `seed ${seed} fresh-hit path errored`).toBe(true);
      if (!fresh.ok) return;
      expect(fresh.value, `seed ${seed} fresh-hit path mismatch`).toEqual(expected);
    }
  });
});
