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

// One small builder per event type; randomEventInput just dispatches. Keeps each
// builder (and the dispatcher) well under the cyclomatic-complexity threshold.
const BUILDERS: Record<(typeof TYPES)[number], (rng: () => number) => EventInput> = {
  position_set: (rng) => {
    const payload: { phase?: string; task?: string } = {};
    if (rng() < 0.8) payload.phase = pick(rng, ['plan', 'execute', 'verify']);
    if (rng() < 0.6) payload.task = pick(rng, TASK_POOL);
    return { type: 'position_set', payload };
  },
  decision_recorded: (rng) => {
    const payload: { id: string; text: string; context?: string } = {
      id: pick(rng, ID_POOL),
      text: `decision-${Math.floor(rng() * 1000)}`,
    };
    if (rng() < 0.5) payload.context = `ctx-${Math.floor(rng() * 1000)}`;
    return { type: 'decision_recorded', payload };
  },
  blocker_opened: (rng) => ({
    type: 'blocker_opened',
    payload: { id: pick(rng, ID_POOL), description: `desc-${Math.floor(rng() * 1000)}` },
  }),
  blocker_resolved: (rng) => ({ type: 'blocker_resolved', payload: { id: pick(rng, ID_POOL) } }),
  progress_set: (rng) => ({
    type: 'progress_set',
    payload: { task: pick(rng, TASK_POOL), status: pick(rng, STATUSES) },
  }),
  session_summarized: (rng) => {
    const payload: { summary: string; lastSkill?: string; pendingTasks?: string[] } = {
      summary: `summary-${Math.floor(rng() * 1000)}`,
    };
    if (rng() < 0.5) payload.lastSkill = pick(rng, ['exec', 'plan']);
    if (rng() < 0.5)
      payload.pendingTasks = TASK_POOL.slice(0, Math.floor(rng() * TASK_POOL.length));
    return { type: 'session_summarized', payload };
  },
};

function randomEventInput(rng: () => number): EventInput {
  return BUILDERS[pick(rng, TYPES)](rng);
}

/**
 * Narrow a Result to its value, failing the case loudly if it is an Err.
 *
 * Deliberately throws rather than `return`ing. Inside a per-seed case an early
 * `return` would end that case GREEN having asserted nothing — a seed silently
 * skipped while the suite reports success. Throwing removes that path by
 * construction, and surfaces the underlying error message instead of a bare
 * `expected false to be true`.
 */
function expectOk<T>(
  result: { ok: true; value: T } | { ok: false; error: Error },
  what: string
): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.message}`);
  return result.value;
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

/** Seeds 1..200 — the full property space, one vitest case each. */
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('SC2 — reduce(events) === readSnapshot() (property)', () => {
  /**
   * One case PER SEED rather than one case looping all 200.
   *
   * vitest budgets timeouts per test, not per unit of work. Aggregating every
   * seed under a single `it()` therefore turned the suite's total wall-clock
   * into an implicit, machine-speed-dependent assertion: the same deterministic
   * seeds passed on ubuntu/macOS but blew the 60s budget on windows-latest
   * (66925ms), where each of this file's ~18k filesystem syscalls costs ~3.7ms.
   * The seeds never disagreed — only the clock did.
   *
   * Splitting gives each seed its own budget, so no single test's runtime is
   * load-bearing; `afterEach` reclaims that seed's temp dir immediately instead
   * of holding 200 live at once; and a failure names the seed that broke. All
   * 200 seeds still run on every OS — the reporter shows 200 named cases, which
   * makes that visible rather than merely claimed.
   *
   * Cases stay SEQUENTIAL (vitest's default within a file). `it.concurrent`
   * would be unsound here: `buildLog` mutates `process.env.HARNESS_EVENT_WRITER_ID`
   * and the module-level writer-id cache, so concurrent seeds would clobber each
   * other's writer identity.
   */
  it.each(SEEDS)(
    'holds on both the computed and fresh-hit paths — seed %i',
    async (seed: number) => {
      resetLocalCountersForTests();
      __resetMaterializeTimersForTests();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `esprop-${seed}-`));
      tmpDirs.push(dir);
      const rng = mulberry32(seed);

      await buildLog(rng, dir);

      const events = expectOk(await loadEvents(dir), `seed ${seed} loadEvents errored`);
      const expected = reduce(events);

      // (a) Computed path: no snapshot on disk yet → readSnapshot returns reduce(loadEvents).
      const computed = expectOk(await readSnapshot(dir), `seed ${seed} computed path errored`);
      expect(computed, `seed ${seed} computed path mismatch`).toEqual(expected);

      // Cancel the background materialize the read just scheduled, then write explicitly.
      __resetMaterializeTimersForTests();
      expectOk(await materialize(dir), `seed ${seed} materialize errored`);

      // (b) Fresh-hit path: an up-to-date snapshot on disk still deep-equals reduce(loadEvents).
      const fresh = expectOk(await readSnapshot(dir), `seed ${seed} fresh-hit path errored`);
      expect(fresh, `seed ${seed} fresh-hit path mismatch`).toEqual(expected);
    }
  );
});
