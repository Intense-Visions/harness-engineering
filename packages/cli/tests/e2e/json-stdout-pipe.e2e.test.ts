// #2254 — `--json` output piped to another process was cut at one pipe buffer.
//
// Writes to a PIPE are asynchronous on POSIX: a large `console.log` lands the
// first pipe-buffer's worth (64 KiB on macOS, ~68 KiB on Linux) and queues the
// rest, and the command's `process.exit()` then terminates before the queue
// drains. Redirecting to a FILE is synchronous, which is why the bug never
// showed at a terminal or under `> f.json` and always showed in CI, where
// stdout is a pipe. The report itself was complete all along.
//
// The condition no other test exercised is exactly this one: the REAL built
// CLI, stdout attached to a PIPE (spawnSync's default stdio), and a JSON
// payload larger than one pipe buffer. The file-redirect run is the control —
// the piped bytes must equal it, not merely parse.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_BIN, scaffoldProject, cleanup, skipUnlessBin } from './support';

// Enough undocumented files that the JSON is well past one pipe buffer
// (~87 KB > 64 KiB / 68 KiB) so the pre-fix truncation is deterministic.
const FILE_COUNT = 1500;
const PIPE_BUFFER_BYTES = 64 * 1024;

function buildProject(): Record<string, string> {
  const files: Record<string, string> = {
    'harness.config.json': JSON.stringify({
      version: 1,
      name: 'json-pipe',
      rootDir: 'src',
      docsDir: 'docs',
    }),
    'AGENTS.md': '# Agents\n',
    'docs/README.md': '# Docs\n',
  };
  for (let i = 0; i < FILE_COUNT; i++) {
    files[`src/undocumented-module-with-a-fairly-long-name-${i}.ts`] =
      `export const x${i} = ${i};\n`;
  }
  return files;
}

describe.skipIf(skipUnlessBin)('harness --json output through a pipe (#2254)', () => {
  let proj: string;
  let fileBytes: string;

  beforeAll(() => {
    proj = scaffoldProject(buildProject(), 'e2e-json-pipe-');
    // Control: stdout redirected to a FILE (synchronous writes, never truncated).
    const outPath = path.join(proj, 'out.json');
    const fd = openSync(outPath, 'w');
    try {
      spawnSync(process.execPath, [HARNESS_BIN, '--json', 'check-docs'], {
        cwd: proj,
        stdio: ['ignore', fd, 'pipe'],
        timeout: 120_000,
      });
    } finally {
      closeSync(fd);
    }
    fileBytes = readFileSync(outPath, 'utf8');
  }, 180_000);

  afterAll(() => cleanup(proj));

  it('the control run produced a payload larger than one pipe buffer', () => {
    // Guards the test against going vacuous: below 64 KiB a pipe never truncates.
    expect(Buffer.byteLength(fileBytes)).toBeGreaterThan(PIPE_BUFFER_BYTES);
    expect(JSON.parse(fileBytes).undocumented).toHaveLength(FILE_COUNT);
  });

  it('emits the complete, parseable JSON when stdout is a pipe', () => {
    const res = spawnSync(process.execPath, [HARNESS_BIN, '--json', 'check-docs'], {
      cwd: proj,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    // Coverage is 0% over 1500 files: verified and failed, not an error/abstain.
    expect(res.status).toBe(1);
    // Pre-fix: exactly 65536 bytes, ending mid-string.
    expect(Buffer.byteLength(res.stdout)).toBe(Buffer.byteLength(fileBytes));
    const parsed = JSON.parse(res.stdout) as Record<string, unknown>;
    expect(parsed.undocumented).toHaveLength(FILE_COUNT);
    expect(parsed.valid).toBe(false);
  }, 180_000);

  it('serializes the actionable undocumented queue ahead of the documented list', () => {
    const keys = Object.keys(JSON.parse(fileBytes) as Record<string, unknown>);
    expect(keys.indexOf('undocumented')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('undocumented')).toBeLessThan(keys.indexOf('documented'));
  });
});
