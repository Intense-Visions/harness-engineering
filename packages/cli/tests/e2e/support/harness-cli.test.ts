// Contract tests for the shared `runHarness` spawn helper (#2555).
//
// `spawnSync` blocks the vitest worker's event loop, so the package-level
// `testTimeout` can never interrupt a hung CLI child: the ONLY bound is the
// spawn's own `timeout`. These tests pin that a hang fails fast and loudly.
// They drive tiny stand-in "binaries" through the `bin` override instead of the
// real CLI, so they need no build and cost well under a second each.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runHarness } from './harness-cli';

let dir: string;
let hangBin: string;
let pipeHolderBin: string;
let okBin: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-harness-'));
  hangBin = path.join(dir, 'hang.js');
  // Never exits on its own: the shape of the observed 15-minute gate stall.
  fs.writeFileSync(hangBin, 'setInterval(() => {}, 1000);\n');
  pipeHolderBin = path.join(dir, 'pipe-holder.js');
  // Exits 0 at once, but leaves a detached grandchild holding the inherited
  // stdout/stderr pipes — spawnSync waits on pipe EOF, not just on the child.
  fs.writeFileSync(
    pipeHolderBin,
    [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {",
      "  stdio: 'inherit', detached: true,",
      '}).unref();',
      "process.stdout.write('done\\n');",
    ].join('\n')
  );
  okBin = path.join(dir, 'ok.js');
  fs.writeFileSync(okBin, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
});

afterAll(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the dir briefly.
  }
});

describe('runHarness', () => {
  it('returns status and stdout for a child that exits normally', () => {
    const r = runHarness(['validate', '--json'], { cwd: dir, bin: okBin });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(['validate', '--json']);
  });

  it('disables the background update/freshness probes by default (#2652)', () => {
    const envBin = path.join(dir, 'env.js');
    fs.writeFileSync(
      envBin,
      'process.stdout.write(String(process.env.HARNESS_NO_UPDATE_CHECK));\n'
    );
    expect(runHarness([], { cwd: dir, bin: envBin }).stdout).toBe('1');
    expect(runHarness([], { cwd: dir, bin: envBin, env: { PATH: '' } }).stdout).toBe('1');
    // An explicit caller value wins.
    expect(
      runHarness([], { cwd: dir, bin: envBin, env: { HARNESS_NO_UPDATE_CHECK: '0' } }).stdout
    ).toBe('0');
  });

  it('throws a descriptive error instead of hanging when the CLI never exits', () => {
    const started = Date.now();
    expect(() =>
      runHarness(['validate', '--json'], { cwd: dir, bin: hangBin, timeoutMs: 1_500 })
    ).toThrow(/harness validate --json did not finish within 1500ms/);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  // POSIX-only: it depends on a detached grandchild inheriting the pipe fds,
  // which is not how handle inheritance works for detached children on win32.
  it.skipIf(process.platform === 'win32')(
    'throws rather than reporting status 0 when a grandchild holds the output pipes',
    () => {
      // Without the error check spawnSync reports { status: 0, error: ETIMEDOUT }
      // here, and an `expect(status).toBe(0)` assertion would pass a timed-out run.
      expect(() =>
        runHarness(['init'], { cwd: dir, bin: pipeHolderBin, timeoutMs: 1_500 })
      ).toThrow(/did not finish within 1500ms/);
    }
  );
});
