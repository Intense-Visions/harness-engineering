import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadEvents,
  readTailSeq,
  eventLogPaths,
  emitEvent,
  resetLocalCountersForTests,
} from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslog-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeLines(logPath: string, objs: unknown[]) {
  // The read side never creates dirs (only emitEvent does); fixtures that write the log
  // directly must ensure the resolved state dir exists first.
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
}

describe('loadEvents (ordered read)', () => {
  it('returns [] when no log file exists', async () => {
    const r = await loadEvents(dir);
    expect(r.ok && r.value).toEqual([]);
  });
  it('sorts by (seq asc, writerId asc) regardless of on-disk order', async () => {
    const { logPath } = await eventLogPaths(dir);
    writeLines(logPath, [
      {
        seq: 2,
        writerId: 'b',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P2' },
      },
      {
        seq: 1,
        writerId: 'b',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P1' },
      },
      {
        seq: 2,
        writerId: 'a',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P2a' },
      },
    ]);
    const r = await loadEvents(dir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((e) => [e.seq, e.writerId])).toEqual([
      [1, 'b'],
      [2, 'a'],
      [2, 'b'],
    ]);
  });
  it('skips malformed JSON lines', async () => {
    const { logPath } = await eventLogPaths(dir);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      JSON.stringify({
        seq: 1,
        writerId: 'a',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P' },
      }) + '\n{ not json\n'
    );
    const r = await loadEvents(dir);
    expect(r.ok && r.value.length).toBe(1);
  });
});

describe('readTailSeq', () => {
  it('returns 0 for a missing file', async () => {
    const { logPath } = await eventLogPaths(dir);
    expect(readTailSeq(logPath)).toBe(0);
  });
  it('returns the max seq across all lines', async () => {
    const { logPath } = await eventLogPaths(dir);
    writeLines(logPath, [
      {
        seq: 5,
        writerId: 'a',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P' },
      },
      {
        seq: 3,
        writerId: 'b',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P' },
      },
    ]);
    expect(readTailSeq(logPath)).toBe(5);
  });
});

describe('emitEvent (append, INV-2)', () => {
  beforeEach(() => {
    process.env.HARNESS_EVENT_WRITER_ID = 'w-test';
    __resetWriterIdForTests();
    resetLocalCountersForTests();
  });
  afterEach(() => {
    delete process.env.HARNESS_EVENT_WRITER_ID;
  });

  it('appends one JSONL line per event and round-trips via loadEvents', async () => {
    const r1 = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
    const r2 = await emitEvent(dir, {
      type: 'decision_recorded',
      payload: { id: 'd1', text: 'x' },
    });
    expect(r1.ok && r2.ok).toBe(true);
    const loaded = await loadEvents(dir);
    expect(loaded.ok && loaded.value.length).toBe(2);
    if (loaded.ok) expect(loaded.value.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('stamps writerId and a monotonically increasing seq (max(tailSeq, local)+1)', async () => {
    const r = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
    expect(r.ok && r.value.writerId).toBe('w-test');
    expect(r.ok && r.value.seq).toBe(1);
  });
});
