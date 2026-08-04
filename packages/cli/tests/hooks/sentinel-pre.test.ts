import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/sentinel-pre.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  // Pass stdin directly via spawnSync's `input` option (issue 619): the previous
  // `cat <file> | node` pipe intermittently delivered empty/partial stdin under
  // v8 coverage, tripping the hooks' fail-open path. macOS CI is the gate.
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf-8',
    timeout: 60000,
    // Run outside any tainted session so the baseline cases exercise the
    // allow path rather than a taint block.
    cwd: mkdtempSync(join(tmpdir(), 'sentinel-pre-cwd-')),
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? '',
  };
}

describe('sentinel-pre', () => {
  it('allows a normal tool call when the session is not tainted', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      session_id: 'no-taint-session',
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json at all');
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  // Regression for #993: sentinel-pre used to treat ANY stdin read failure as
  // "no input" and exit 0, so a transient EAGAIN on the pipe silently disabled
  // taint enforcement during a tainted session while the check stayed green. A
  // blind guard must block. POSIX-only: the fd/pipe shape does not reproduce on
  // Windows.
  const onPosix = process.platform === 'win32' ? describe.skip : describe;

  onPosix('stdin read failure (fail closed)', () => {
    it('blocks when the stdin read itself fails', () => {
      // A directory opens fine but errors (EISDIR) on read — a read that
      // genuinely failed, unlike /dev/null which reads 0 bytes successfully.
      // Node substitutes /dev/null for a closed fd 0, so closing it won't do.
      const dirFd = openSync(mkdtempSync(join(tmpdir(), 'sentinel-pre-stdin-')), 'r');
      try {
        const result = spawnSync('node', [HOOK_PATH], {
          stdio: [dirFd, 'pipe', 'pipe'],
          encoding: 'utf-8',
          timeout: 60000,
        });
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('could not read hook input');
      } finally {
        closeSync(dirFd);
      }
    });
  });
});
