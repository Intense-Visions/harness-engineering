import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * #2218: two writers spilling the SAME content-addressed blob both pass the
 * `existsSync` check, then both rename onto the destination. POSIX rename
 * replaces silently; Windows throws EPERM for the loser. This file reproduces the
 * loser's path on every platform with a Windows-semantics `renameSync` (throws
 * EPERM when the target exists) and an `existsSync` that misses the blob once —
 * the peer's rename landing inside the check-then-act window.
 */
const race = vi.hoisted(() => ({ active: false, hidden: false }));

vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>();
  const isBlob = (p: fs.PathLike) => String(p).includes('state.events.blobs');
  return {
    ...real,
    existsSync: (p: fs.PathLike) => {
      if (race.active && !race.hidden && isBlob(p) && String(p).endsWith('.json')) {
        race.hidden = true;
        return false;
      }
      return real.existsSync(p);
    },
    renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      if (race.active && real.existsSync(to)) {
        throw Object.assign(new Error(`EPERM: operation not permitted, rename '${from}'`), {
          code: 'EPERM',
        });
      }
      return real.renameSync(from, to);
    },
  };
});

const { emitEvent, eventLogPaths, loadEvents, resetLocalCountersForTests } =
  await import('../../../src/state/event-sourcing/log');
const { __resetWriterIdForTests } = await import('../../../src/state/event-sourcing/writer-id');
const { MAX_LINE_BYTES } = await import('../../../src/state/event-sourcing/constants');

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslog-race-'));
  process.env.HARNESS_EVENT_WRITER_ID = 'w-race';
  __resetWriterIdForTests();
  resetLocalCountersForTests();
});
afterEach(() => {
  race.active = false;
  race.hidden = false;
  delete process.env.HARNESS_EVENT_WRITER_ID;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('blob spill — losing a concurrent same-content race (#2218)', () => {
  it('succeeds, keeps the existing blob, and leaves no .tmp behind', async () => {
    const payload = { legacyState: 'r'.repeat(MAX_LINE_BYTES * 2) };
    const first = await emitEvent(dir, { type: 'state_imported', payload });
    expect(first.ok).toBe(true);

    race.active = true;
    const second = await emitEvent(dir, { type: 'state_imported', payload });
    expect(race.hidden).toBe(true); // the race window was actually exercised
    expect(second.ok).toBe(true);

    const { blobsDir } = await eventLogPaths(dir);
    expect(fs.readdirSync(blobsDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(fs.readdirSync(blobsDir)).toHaveLength(1);

    const loaded = await loadEvents(dir);
    expect(loaded.ok && loaded.value).toHaveLength(2);
  });
});
