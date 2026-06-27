import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { loadEvents } from '../../../src/state/event-sourcing/log';

const WORKER = fileURLToPath(new URL('./concurrency-worker.mts', import.meta.url));
const TSX = fileURLToPath(new URL('../../../../../node_modules/.bin/tsx', import.meta.url));

function runWorker(projectDir: string, writerId: string, count: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [WORKER, projectDir, String(count)], {
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
});
