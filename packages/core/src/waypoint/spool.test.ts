import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SdlcEvent } from '@harness-engineering/types';
import { FileSpool, mergeSegments, readSpoolSegments } from './spool';
import { createUlidFactory } from './ulid';

const mint = createUlidFactory();

function event(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    specversion: '1.0',
    id: mint(),
    source: 'harness://repo/test',
    type: 'sdlc.claim.opened.v1',
    time: new Date().toISOString(),
    subject: 'item/example',
    actor: { kind: 'human', id: 'user://chad' },
    ...overrides,
  };
}

describe('waypoint/spool FileSpool', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-spool-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one JSONL line per event to sdlc-<id>.jsonl', () => {
    const spool = new FileSpool({ spoolDir: join(dir, 'spool'), segmentId: 'SEG1' });
    expect(spool.append(event()).ok).toBe(true);
    expect(spool.append(event()).ok).toBe(true);
    const raw = readFileSync(join(dir, 'spool', 'sdlc-SEG1.jsonl'), 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    // Every line is a complete envelope any standard JSONL parser consumes.
    for (const line of lines) {
      const parsed = JSON.parse(line) as SdlcEvent;
      expect(parsed.specversion).toBe('1.0');
    }
  });

  it('rejects invalid events with diagnostics and writes nothing', () => {
    const spoolDir = join(dir, 'spool');
    const spool = new FileSpool({ spoolDir, segmentId: 'SEG1' });
    const result = spool.append({ nope: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    expect(existsSync(spoolDir)).toBe(false);
  });

  it('drops the oldest line at the cap and persists the counter', () => {
    const spoolDir = join(dir, 'spool');
    const spool = new FileSpool({ spoolDir, segmentId: 'SEG1', maxEvents: 2 });
    const first = event();
    spool.append(first);
    spool.append(event());
    const third = spool.append(event());
    expect(third).toEqual({ ok: true, dropped: 1, redactions: 0 });
    expect(spool.droppedEvents).toBe(1);
    expect(spool.lines).toHaveLength(2);
    // On-disk window matches the bounded in-memory window.
    const raw = readFileSync(join(spoolDir, 'sdlc-SEG1.jsonl'), 'utf8');
    expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(2);
    expect(raw).not.toContain(first.id as string);
    // Sidecar meta carries the persistent droppedEvents counter.
    const meta = JSON.parse(readFileSync(join(spoolDir, 'sdlc-SEG1.meta.json'), 'utf8')) as {
      droppedEvents: number;
    };
    expect(meta.droppedEvents).toBe(1);
  });

  it('reports I/O failures in the result instead of throwing', () => {
    // Occupy the spool-dir path with a plain FILE so mkdir fails.
    const fileAsDir = join(dir, 'occupied');
    writeFileSync(fileAsDir, 'not a directory\n', 'utf8');
    const spool = new FileSpool({ spoolDir: join(fileAsDir, 'nested'), segmentId: 'SEG1' });
    const result = spool.append(event());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe('spool');
  });

  it('snapshot() exposes segmentId, lines, and droppedEvents', () => {
    const spool = new FileSpool({ spoolDir: join(dir, 'spool'), segmentId: 'SEG9', maxEvents: 1 });
    spool.append(event());
    spool.append(event());
    const snapshot = spool.snapshot();
    expect(snapshot.segmentId).toBe('SEG9');
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.droppedEvents).toBe(1);
  });
});

describe('waypoint/spool readSpoolSegments + mergeSegments', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-spool-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] for an absent spool directory', () => {
    expect(readSpoolSegments(join(dir, 'missing'))).toEqual([]);
  });

  it('round-trips segments written by concurrent writers and merges on ULID order', () => {
    const spoolDir = join(dir, 'spool');
    const a = new FileSpool({ spoolDir, segmentId: 'AAA', maxEvents: 1 });
    const b = new FileSpool({ spoolDir, segmentId: 'BBB' });
    const e1 = event();
    const e2 = event();
    const e3 = event();
    a.append(e1);
    a.append(e2); // drops e1 (cap 1) -> meta droppedEvents: 1
    b.append(e3);

    const segments = readSpoolSegments(spoolDir);
    expect(segments).toHaveLength(2);
    const byId = new Map(segments.map((s) => [s.segmentId, s]));
    expect(byId.get('AAA')?.droppedEvents).toBe(1);
    expect(byId.get('BBB')?.droppedEvents).toBe(0);

    const merged = mergeSegments(segments);
    expect(merged.map((e) => e.id)).toEqual([e2.id, e3.id].sort());
  });
});
