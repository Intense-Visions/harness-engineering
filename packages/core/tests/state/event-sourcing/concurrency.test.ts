import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { loadEvents, eventLogPaths } from '../../../src/state/event-sourcing/log';
import { MAX_LINE_BYTES } from '../../../src/state/event-sourcing/constants';

const WORKER = fileURLToPath(new URL('./concurrency-worker.mts', import.meta.url));
const TSX = fileURLToPath(new URL('../../../../../node_modules/.bin/tsx', import.meta.url));

function runWorker(
  projectDir: string,
  writerId: string,
  count: number,
  mode?: 'big'
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [WORKER, projectDir, String(count)];
    if (mode) args.push(mode);
    const child = spawn(TSX, args, {
      env: { ...process.env, HARNESS_EVENT_WRITER_ID: writerId },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('exit', (code) =>
      code === 0 ? resolve(0) : reject(new Error(`worker ${writerId} exited ${code}`))
    );
    child.on('error', reject);
  });
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esconc-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SC3 concurrency (INV-1/INV-2)', () => {
  it('N processes with distinct writerIds lose zero events and never repeat (seq, writerId)', async () => {
    const N = 8;
    const K = 50;
    const writerIds = Array.from({ length: N }, (_, i) => `writer-${i}`);
    await Promise.all(writerIds.map((w) => runWorker(dir, w, K)));

    const loaded = await loadEvents(dir);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // Zero lost events.
    expect(loaded.value.length).toBe(N * K);
    // No repeated (seq, writerId) pair.
    const keys = new Set(loaded.value.map((e) => `${e.seq}|${e.writerId}`));
    expect(keys.size).toBe(N * K);
    // Each writer contributed exactly K events.
    for (const w of writerIds) {
      expect(loaded.value.filter((e) => e.writerId === w).length).toBe(K);
    }
  }, 30_000);

  it('N processes spilling oversized payloads lose zero events and all blobs rehydrate (I5)', async () => {
    // Stresses the real edge the design hinges on: blob spill firing UNDER concurrent
    // multi-process writers (payloads cross MAX_LINE_BYTES), including an identical
    // first-event payload across all writers to race the content-addressed idempotent blob.
    const N = 6;
    const K = 20;
    const writerIds = Array.from({ length: N }, (_, i) => `bigwriter-${i}`);
    await Promise.all(writerIds.map((w) => runWorker(dir, w, K, 'big')));

    const loaded = await loadEvents(dir);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // Zero lost events + unique (seq, writerId) + exact per-writer counts.
    expect(loaded.value.length).toBe(N * K);
    const keys = new Set(loaded.value.map((e) => `${e.seq}|${e.writerId}`));
    expect(keys.size).toBe(N * K);
    for (const w of writerIds) {
      expect(loaded.value.filter((e) => e.writerId === w).length).toBe(K);
    }

    // Every event rehydrated correctly from its blob (no corruption under concurrent spill).
    for (const e of loaded.value) {
      expect(e.type).toBe('state_imported');
      if (e.type === 'state_imported') {
        const ls = e.payload.legacyState as { filler: string };
        expect(ls.filler).toBe('x'.repeat(5000));
      }
    }

    // Spill actually fired: every on-disk line references a blob and stays under the atomic
    // single-write() bound, and the identical shared payload collapsed to one blob.
    const { logPath, blobsDir } = await eventLogPaths(dir);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(N * K);
    for (const ln of lines) {
      expect(Buffer.byteLength(ln + '\n', 'utf-8')).toBeLessThan(MAX_LINE_BYTES);
      expect(ln).toContain('$blob');
    }
    // N writers each emitted the SAME i===0 payload → content-addressing yields a single
    // shared blob for it, so total distinct blobs is (unique payloads) + 1, well under N*K.
    const blobCount = fs.readdirSync(blobsDir).length;
    expect(blobCount).toBe(N * (K - 1) + 1);
  }, 30_000);
});
