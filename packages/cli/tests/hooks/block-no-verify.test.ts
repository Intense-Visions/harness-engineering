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
  // Issue #2147: the `-n` check used to run past shell separators (so a `-n`
  // owned by a later command blocked a legitimate commit) and only matched a
  // standalone `-n` (so aggregated short options like `-nm` slipped through).
  describe('git commit -n parsing (issue #2147)', () => {
    const cases: Array<{ command: string; expected: 0 | 2 }> = [
      // The seven cases from the issue table.
      { command: 'git commit -m "msg"; echo -n done', expected: 0 },
      { command: 'git commit -m x && git log --oneline | head -n 3', expected: 0 },
      { command: 'git commit -m x; grep -n TODO README.md', expected: 0 },
      { command: 'git commit -n -m x', expected: 2 },
      { command: 'git commit --no-verify -m x', expected: 2 },
      { command: 'git commit -m x', expected: 0 },
      { command: 'git commit -nm x', expected: 2 },
      // Aggregated clusters containing n.
      { command: 'git commit -an -m x', expected: 2 },
      { command: 'git commit -anm x', expected: 2 },
      { command: 'git commit -m "msg" -an', expected: 2 },
      // A value-taking option consumes the rest of its cluster: message "n".
      { command: 'git commit -mn x', expected: 0 },
      { command: 'git commit -am fix', expected: 0 },
      // -n in a non-commit git subcommand is not a hook bypass.
      { command: 'git log -n 3 && git commit -m x', expected: 0 },
      { command: 'git log -n 3', expected: 0 },
      // A later commit in the chain that does bypass is still caught.
      { command: 'git commit -m x && git commit -n -m y', expected: 2 },
      { command: 'git commit -m x || git commit -nm y', expected: 2 },
      // Global git options before the subcommand, and line continuations.
      { command: 'git -C /tmp/repo commit -n -m x', expected: 2 },
      { command: 'git commit -m x \\\n  -n', expected: 2 },
      // Redirections are not separators.
      { command: 'git commit -m x 2>&1 -n', expected: 2 },
      { command: 'git commit -m x &>/dev/null -n', expected: 2 },
      { command: 'git commit -m x &>>log -n', expected: 2 },
      { command: 'git commit -m x &>/dev/null; echo -n done', expected: 0 },
      // A background `&` is still a separator.
      { command: 'git commit -m x & echo -n done', expected: 0 },
      // Everything after `--` is a pathspec.
      { command: 'git commit -m x -- -n', expected: 0 },
    ];

    it.each(cases)('$command -> exit $expected', ({ command, expected }) => {
      const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
      expect(runHook(input).exitCode).toBe(expected);
    });
  });

  // Issue #2389: spellings of the git command and of the bypass that git
  // honours but the hook did not recognise.
  describe('git spelling and hooksPath bypasses (issue #2389)', () => {
    const cases: Array<{ command: string; expected: 0 | 2 }> = [
      // The four rows from the issue table.
      { command: '\\git commit -n -m x', expected: 2 },
      { command: 'git.exe commit -n -m x', expected: 2 },
      { command: 'git commit --no-verif -m x', expected: 2 },
      { command: 'git -c core.hooksPath=/dev/null commit -m x', expected: 2 },
      // Command-name normalisation.
      { command: '/usr/bin/git commit -n -m x', expected: 2 },
      { command: 'C:\\Git\\cmd\\git.exe commit -n -m x', expected: 2 },
      { command: 'GIT.EXE commit -nm x', expected: 2 },
      { command: '\\git commit -m x', expected: 0 },
      { command: 'git.exe commit -m x', expected: 0 },
      { command: 'gitk --all', expected: 0 },
      // Abbreviations of --no-verify, down to --no-v, on any git subcommand.
      { command: 'git commit --no-v -m x', expected: 2 },
      { command: 'git commit --no-veri -m x', expected: 2 },
      { command: 'git push --no-verif', expected: 2 },
      { command: 'git commit --no-edit -m x', expected: 0 },
      { command: 'git commit --no- -m x', expected: 0 },
      { command: 'git commit --verify -m x', expected: 0 },
      { command: 'git commit -m x -- --no-verif', expected: 0 },
      // Relocating the hooks directory on a hook-running subcommand.
      { command: 'git -c core.hookspath=/tmp/empty commit -m x', expected: 2 },
      { command: 'git -c core.hooksPath= push', expected: 2 },
      { command: 'git --config-env core.hooksPath=EMPTY commit -m x', expected: 2 },
      { command: 'git --config-env=core.hooksPath=EMPTY merge main', expected: 2 },
      { command: 'git -C /tmp/repo -c core.hooksPath=/dev/null rebase main', expected: 2 },
      { command: 'git -c user.name=bot commit -m x', expected: 0 },
      { command: 'git -c core.hooksPath=/dev/null log --oneline', expected: 0 },
      // A redirection written `>&` is not a separator either.
      { command: 'git commit -m x >&/dev/null -n', expected: 2 },
    ];

    it.each(cases)('$command -> exit $expected', ({ command, expected }) => {
      const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
      expect(runHook(input).exitCode).toBe(expected);
    });
  });

  // Issue #2147 (comment): the shell strips quotes before git sees an
  // argument, so a quoted flag is still a flag; and git also reads config —
  // including core.hooksPath — from environment variables.
  describe('quoted flags and env-var hooksPath (issue #2147 follow-up)', () => {
    const cases: Array<{ command: string; expected: 0 | 2 }> = [
      // Quoted flags are real argv tokens once the shell unquotes them.
      { command: 'git commit "-n" -m x', expected: 2 },
      { command: "git commit '-n' -m x", expected: 2 },
      { command: "git commit '--no-verify' -m x", expected: 2 },
      { command: 'git commit "--no-verify" -m x', expected: 2 },
      { command: 'git push "--no-verif"', expected: 2 },
      { command: "git commit -m x '-an'", expected: 2 },
      { command: 'git commit -m x "-nm" y', expected: 2 },
      { command: 'git commit -m x -"n"', expected: 2 },
      { command: 'git -c "core.hooksPath=/dev/null" commit -m x', expected: 2 },
      { command: "git -c 'core.hooksPath'=/dev/null commit -m x", expected: 2 },
      // A quoted string that is a VALUE (commit message) is not a flag.
      { command: 'git commit -m "use -n here"', expected: 0 },
      { command: 'git commit -m "--no-verify mentioned"', expected: 0 },
      { command: 'git commit -m "-n"', expected: 0 },
      { command: "git commit -m '-n flag removed' -a", expected: 0 },
      { command: 'git commit -am "-n is gone"', expected: 0 },
      { command: 'git commit -F "-n"', expected: 0 },
      // Heredoc commit messages stay inert.
      {
        command: [
          `git commit -m "$(cat <<'EOF2'`,
          `fix: stop using -n and --no-verify`,
          ``,
          `git commit -n was bad`,
          `EOF2`,
          `)"`,
        ].join('\n'),
        expected: 0,
      },
      // Separators inside quotes do not split a command.
      { command: 'git commit -m "a; b && c" -n', expected: 2 },
      { command: 'git commit -m "x; echo -n y"', expected: 0 },
      // Non-regressions from the original issue.
      { command: 'git commit -m x && grep -n foo file', expected: 0 },
      { command: 'git log -n 5', expected: 0 },
      { command: 'echo "-n"', expected: 0 },
      { command: 'grep -rn "git commit -n" docs', expected: 0 },
      // core.hooksPath through GIT_CONFIG_COUNT / KEY / VALUE.
      {
        command:
          'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
        expected: 2,
      },
      {
        command:
          'GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=bot GIT_CONFIG_KEY_1=CORE.HOOKSPATH GIT_CONFIG_VALUE_1= git push',
        expected: 2,
      },
      {
        command:
          'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/x; git commit -m x',
        expected: 2,
      },
      {
        command:
          'env GIT_CONFIG_COUNT=1 "GIT_CONFIG_KEY_0=core.hooksPath" GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
        expected: 2,
      },
      // core.hooksPath through GIT_CONFIG_PARAMETERS.
      {
        command: `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/dev/null'" git commit -m x`,
        expected: 2,
      },
      {
        command: `export GIT_CONFIG_PARAMETERS="'core.hookspath=/dev/null'" && git merge main`,
        expected: 2,
      },
      // Env config that does not touch hooksPath, or no hook-running git.
      {
        command:
          'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=bot git commit -m x',
        expected: 0,
      },
      { command: `GIT_CONFIG_PARAMETERS="'user.name'='bot'" git commit -m x`, expected: 0 },
      {
        command:
          'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git log',
        expected: 0,
      },
      { command: 'echo "GIT_CONFIG_KEY_0=core.hooksPath" > notes.txt', expected: 0 },
    ];

    it.each(cases)('$command -> exit $expected', ({ command, expected }) => {
      const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
      expect(runHook(input).exitCode).toBe(expected);
    });
  });
});
