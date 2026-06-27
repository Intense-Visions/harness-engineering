import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { MAX_LINE_BYTES } from '../../../src/state/event-sourcing/constants';

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
  it('skips an event whose blob is missing/corrupt without aborting the whole load (C1)', async () => {
    // A valid inline event + an event whose payload spilled to a blob that we then delete.
    // loadEvents must return the valid event and drop only the blob-broken one.
    const { logPath, blobsDir } = await eventLogPaths(dir);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const validLine = JSON.stringify({
      seq: 1,
      writerId: 'a',
      timestamp: 't',
      scope: {},
      type: 'position_set',
      payload: { position: 'GOOD' },
    });
    const blobLine = JSON.stringify({
      seq: 2,
      writerId: 'a',
      timestamp: 't',
      scope: {},
      type: 'state_imported',
      payload: { $blob: 'deadbeef' },
    });
    fs.writeFileSync(logPath, validLine + '\n' + blobLine + '\n');
    // The referenced blob never exists (simulates corruption / orphan-vs-dangling crash window).
    expect(fs.existsSync(path.join(blobsDir, 'deadbeef.json'))).toBe(false);

    const r = await loadEvents(dir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0]?.seq).toBe(1);
    if (r.value[0]?.type === 'position_set') {
      expect(r.value[0].payload.position).toBe('GOOD');
    }
  });

  it('skips an event whose blob holds corrupt (non-JSON) content (C1)', async () => {
    const { logPath, blobsDir } = await eventLogPaths(dir);
    fs.mkdirSync(blobsDir, { recursive: true });
    const validLine = JSON.stringify({
      seq: 1,
      writerId: 'a',
      timestamp: 't',
      scope: {},
      type: 'position_set',
      payload: { position: 'GOOD' },
    });
    const blobLine = JSON.stringify({
      seq: 2,
      writerId: 'a',
      timestamp: 't',
      scope: {},
      type: 'state_imported',
      payload: { $blob: 'corrupt' },
    });
    fs.writeFileSync(logPath, validLine + '\n' + blobLine + '\n');
    fs.writeFileSync(path.join(blobsDir, 'corrupt.json'), '{ not valid json');

    const r = await loadEvents(dir);
    expect(r.ok && r.value.length).toBe(1);
    if (r.ok) expect(r.value[0]?.seq).toBe(1);
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

  it('surfaces dropped lines via a console.warn diagnostic (I1)', async () => {
    const { logPath } = await eventLogPaths(dir);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const valid = JSON.stringify({
      seq: 1,
      writerId: 'a',
      timestamp: 't',
      scope: {},
      type: 'position_set',
      payload: { position: 'P' },
    });
    // One torn line + one valid-JSON-but-schema-invalid line (missing required fields).
    const schemaInvalid = JSON.stringify({ seq: 2, not: 'an envelope' });
    fs.writeFileSync(logPath, valid + '\n{ not json\n' + schemaInvalid + '\n');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = await loadEvents(dir);
      expect(r.ok && r.value.length).toBe(1); // valid event still returned
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = String(warn.mock.calls[0]?.[0]);
      expect(msg).toContain('[event-log]');
      expect(msg).toContain('dropped 2 event line(s)');
      expect(msg).toContain('malformed-json=1');
      expect(msg).toContain('schema-invalid=1');
    } finally {
      warn.mockRestore();
    }
  });

  it('emits no diagnostic when every line is valid (I1)', async () => {
    const { logPath } = await eventLogPaths(dir);
    writeLines(logPath, [
      {
        seq: 1,
        writerId: 'a',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'P' },
      },
    ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await loadEvents(dir);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
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

describe('blob spill', () => {
  beforeEach(() => {
    process.env.HARNESS_EVENT_WRITER_ID = 'w-blob';
    __resetWriterIdForTests();
    resetLocalCountersForTests();
  });
  afterEach(() => {
    delete process.env.HARNESS_EVENT_WRITER_ID;
  });

  it('keeps the stored line under MAX_LINE_BYTES and rehydrates the payload on read', async () => {
    const big = 'x'.repeat(MAX_LINE_BYTES * 2);
    const r = await emitEvent(dir, {
      type: 'state_imported',
      payload: { legacyState: { big } },
    });
    expect(r.ok).toBe(true);

    const { logPath, blobsDir } = await eventLogPaths(dir);
    const onDiskLine = fs.readFileSync(logPath, 'utf-8').trim();
    expect(Buffer.byteLength(onDiskLine + '\n', 'utf-8')).toBeLessThan(MAX_LINE_BYTES);
    expect(onDiskLine).toContain('$blob');

    const blobs = fs.readdirSync(blobsDir);
    expect(blobs.length).toBe(1);

    const loaded = await loadEvents(dir);
    expect(loaded.ok).toBe(true);
    if (loaded.ok && loaded.value[0]?.type === 'state_imported') {
      expect((loaded.value[0].payload.legacyState as { big: string }).big).toBe(big);
    } else {
      throw new Error('expected rehydrated state_imported event');
    }
  });

  it('emitted spilled event degrades to a dropped event (never a fatal load) when its blob is later lost (crash-resilience, I4)', async () => {
    // Real end-to-end resilience assertion (replaces the prior tautological "both files
    // exist on the happy path" check). Drive the actual emit->spill->append path, then
    // remove the spilled blob to simulate the orphan-vs-dangling crash window / GC. The
    // dangling reference must skip ONLY that event, with a valid sibling still loading and
    // the loss surfaced — proving the documented "tolerated on read, not data loss" contract.
    const small = await emitEvent(dir, { type: 'position_set', payload: { position: 'KEEP' } });
    expect(small.ok).toBe(true);

    const big = 'z'.repeat(MAX_LINE_BYTES * 2);
    const spilled = await emitEvent(dir, { type: 'state_imported', payload: { legacyState: big } });
    expect(spilled.ok).toBe(true);

    const { logPath, blobsDir } = await eventLogPaths(dir);
    // Confirm the second event really spilled (the property under test depends on it).
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const spilledLine = JSON.parse(lines[1] as string) as { payload?: { $blob?: string } };
    const hash = spilledLine.payload?.$blob;
    expect(hash).toBeDefined();
    expect(fs.existsSync(path.join(blobsDir, `${hash}.json`))).toBe(true);

    // Simulate the blob being lost AFTER its line was appended (dangling reference).
    fs.rmSync(path.join(blobsDir, `${hash}.json`));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = await loadEvents(dir);
      expect(r.ok).toBe(true); // NOT fatal for the whole scope
      if (!r.ok) return;
      expect(r.value.length).toBe(1); // the valid sibling survives
      expect(r.value[0]?.seq).toBe(1);
      // The dangling reference is surfaced, not silently swallowed.
      expect(String(warn.mock.calls[0]?.[0])).toContain('blob-unreadable=1');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('INV-2: seq re-derived from live tail, never a stale local max', () => {
  beforeEach(() => {
    process.env.HARNESS_EVENT_WRITER_ID = 'w-inv2';
    __resetWriterIdForTests();
    resetLocalCountersForTests();
  });
  afterEach(() => {
    delete process.env.HARNESS_EVENT_WRITER_ID;
  });

  it('jumps ahead of an externally-bumped tail rather than reusing a cached max', async () => {
    const first = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
    expect(first.ok && first.value.seq).toBe(1);

    // Simulate a *different* writer appending a higher seq directly to the live log.
    const { logPath } = await eventLogPaths(dir);
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        seq: 50,
        writerId: 'other',
        timestamp: 't',
        scope: {},
        type: 'position_set',
        payload: { position: 'Z' },
      }) + '\n'
    );

    // Our next append must read the live tail (50) and emit 51, NOT 2 from a cached max.
    const next = await emitEvent(dir, { type: 'position_set', payload: { position: 'B' } });
    expect(next.ok && next.value.seq).toBe(51);
  });
});
