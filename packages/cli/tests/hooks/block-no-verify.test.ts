import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/block-no-verify.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  // Pass stdin directly via spawnSync's `input` option (issue 619): the previous
  // `cat <file> | node` pipe intermittently delivered empty/partial stdin under
  // v8 coverage, tripping the hooks' fail-open path. macOS CI is the gate.
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf-8',
    timeout: 60000,
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? '',
  };
}

describe('block-no-verify', () => {
  it('blocks git commit --no-verify', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit --no-verify -m "test"' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--no-verify');
  });

  it('blocks git push --no-verify', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git push --no-verify' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('allows normal git commit', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "normal commit"' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows non-git commands', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('blocks git commit -n (short form of --no-verify)', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -n -m "skip hooks"' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('does not block echo -n (non-git context)', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo -n "hello"' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json at all');
    expect(exitCode).toBe(0);
  });

  it('fails open on missing tool_input', () => {
    const input = JSON.stringify({ tool_name: 'Bash' });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  // Regression: the hook used to treat ANY stdin read failure as "no input" and
  // exit 0, so a transient EAGAIN on the pipe silently disabled the guard while
  // CI stayed green (macOS runner, run 30671939046). A blind guard must block.
  // POSIX-only: both cases need a real pipe/fd shape that Windows shells and
  // fd redirection don't reproduce. The bug manifested on the macOS runner.
  const onPosix = process.platform === 'win32' ? describe.skip : describe;

  onPosix('stdin read failure (fail closed)', () => {
    it('blocks when the stdin read itself fails', () => {
      // A directory opens fine but errors (EISDIR) on read — a read that
      // genuinely failed, unlike /dev/null which reads 0 bytes successfully.
      // Node substitutes /dev/null for a closed fd 0, so closing it won't do.
      const dirFd = openSync(mkdtempSync(join(tmpdir(), 'hook-stdin-')), 'r');
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

    it('still reads the full payload when the writer is slow', () => {
      // Feed stdin from a pipe that delivers late — the shape that produced the
      // spurious EAGAIN. The guard must wait for the payload, not fail open.
      const command = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git push --no-verify' },
      });
      const result = spawnSync(
        'bash',
        [
          '-c',
          `sleep 0.4; printf '%s' ${JSON.stringify(command)} | node ${JSON.stringify(HOOK_PATH)}`,
        ],
        { encoding: 'utf-8', timeout: 60000 }
      );
      expect(result.status).toBe(2);
    });
  });

  describe('argv-token boundary (issue #285)', () => {
    it('allows commit message that mentions --no-verify in single quotes', () => {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: "git commit -m 'docs: --no-verify is bad'" },
      });
      const { exitCode } = runHook(input);
      expect(exitCode).toBe(0);
    });

    it('allows commit message that mentions --no-verify in double quotes', () => {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "blocks --no-verify"' },
      });
      const { exitCode } = runHook(input);
      expect(exitCode).toBe(0);
    });

    it('allows heredoc body that mentions --no-verify', () => {
      const command = [
        `git commit -m "$(cat <<'HEREDOC'`,
        `fix(harness): block-no-verify hook`,
        ``,
        `- blocks attempts to use --no-verify`,
        `HEREDOC`,
        `)"`,
      ].join('\n');
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command },
      });
      const { exitCode } = runHook(input);
      expect(exitCode).toBe(0);
    });

    it('allows shell comment mentioning --no-verify', () => {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git status # --no-verify is bad' },
      });
      const { exitCode } = runHook(input);
      expect(exitCode).toBe(0);
    });

    it('still blocks --no-verify when it appears as a real argv token at end', () => {
      const input = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "msg" --no-verify' },
      });
      const { exitCode } = runHook(input);
      expect(exitCode).toBe(2);
    });
  });
});
