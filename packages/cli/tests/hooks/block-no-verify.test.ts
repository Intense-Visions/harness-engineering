import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/block-no-verify.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  const stdinFile = join(mkdtempSync(join(tmpdir(), 'bnv-')), 'stdin.json');
  writeFileSync(stdinFile, stdinData);
  const result = spawnSync('sh', ['-c', `cat "${stdinFile}" | node "${HOOK_PATH}"`], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  try {
    rmSync(stdinFile, { force: true });
  } catch {
    /* ignore */
  }
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
