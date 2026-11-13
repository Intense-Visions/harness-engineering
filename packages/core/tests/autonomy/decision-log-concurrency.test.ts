import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readAutoDecisions } from '../../src/autonomy/decision-log';

const WORKER = fileURLToPath(new URL('./decision-log-worker.mts', import.meta.url));

function runWorker(project: string, writer: string, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // process.execPath + --import tsx: the .bin/tsx shim is not spawnable on Windows.
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', WORKER, project, 's1', writer, String(count)],
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`worker ${writer} exited ${code}`))
    );
    child.on('error', reject);
  });
}

let project: string;
beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-dlog-conc-'));
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

describe('concurrent appends never interleave partial lines', () => {
  it('4 processes x 40 entries > 4 KiB each: 160 lines, all parse, each (writer, i) once', async () => {
    const N = 4;
    const K = 40;
    const writers = Array.from({ length: N }, (_, i) => `w${i}`);
    await Promise.all(writers.map((w) => runWorker(project, w, K)));
    const r = readAutoDecisions(project, 's1', {
      gitCommonDir: () => undefined,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.invalid).toEqual([]);
    expect(r.value.entries).toHaveLength(N * K);
    // positive control: lines really exceed PIPE_BUF
    const bytes = fs.statSync(r.value.file).size / (N * K);
    expect(bytes).toBeGreaterThan(4096);
    const keys = new Set(r.value.entries.map((e) => e.rationale.split(':').slice(0, 2).join(':')));
    expect(keys.size).toBe(N * K);
  }, 120_000);
});
