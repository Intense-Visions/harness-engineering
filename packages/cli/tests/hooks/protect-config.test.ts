import { afterEach, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/protect-config.js');

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

describe('protect-config', () => {
  const protectedFiles = [
    '.eslintrc.json',
    '.eslintrc.js',
    'eslint.config.mjs',
    '.prettierrc',
    '.prettierrc.json',
    'prettier.config.js',
    'biome.json',
    'biome.jsonc',
    '.ruff.toml',
    'ruff.toml',
    '.stylelintrc.json',
    '.markdownlint.json',
    'deno.json',
    'config-overrides.json',
  ];

  for (const file of protectedFiles) {
    it(`blocks write to ${file}`, () => {
      const input = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: file, content: '{}' },
      });
      const { exitCode, stderr } = runHook(input);
      expect(exitCode).toBe(2);
      expect(stderr).toContain('protected');
    });
  }

  it('blocks Edit to protected config', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '.eslintrc.json', old_string: 'a', new_string: 'b' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('allows write to normal source file', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'code' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows write to tsconfig.json (not protected)', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'tsconfig.json', content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows write to pyproject.toml (not protected)', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'pyproject.toml', content: '' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json');
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  it('fails closed on missing file_path', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { content: '{}' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('could not verify the edit target');
  });

  it('fails closed on null file_path', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: null, content: '{}' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('could not verify the edit target');
  });

  it('fails closed on numeric file_path', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 123, content: '{}' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('could not verify the edit target');
  });

  it('fails closed on empty-string file_path', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '', content: '{}' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('could not verify the edit target');
  });

  it('handles nested paths correctly', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'config/.eslintrc.json', content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  // Override ledger (#2336): a recorded human decision in
  // .harness/config-overrides.json is the only way past the block. Each test
  // builds a throwaway repo (a `.git` dir marks the root the hook resolves).
  describe('override ledger', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const isoDay = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

    const validEntry = (overrides: Record<string, unknown> = {}) => ({
      file: 'eslint.config.mjs',
      reason: 'turn off a rule whose hits are the behaviour under test',
      decision: 'https://example.com/decisions/42',
      approvedBy: 'repo-owner',
      expires: isoDay(30),
      ...overrides,
    });

    const repos: string[] = [];
    afterEach(() => {
      for (const root of repos.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    function makeRepo(ledger?: unknown): string {
      const root = mkdtempSync(join(tmpdir(), 'protect-config-ledger-'));
      repos.push(root);
      mkdirSync(join(root, '.git'));
      if (ledger !== undefined) {
        mkdirSync(join(root, '.harness'));
        writeFileSync(
          join(root, '.harness', 'config-overrides.json'),
          typeof ledger === 'string' ? ledger : JSON.stringify(ledger)
        );
      }
      return root;
    }

    function editIn(root: string, relPath: string) {
      return runHook(
        JSON.stringify({
          tool_name: 'Edit',
          cwd: root,
          tool_input: { file_path: join(root, relPath), old_string: 'a', new_string: 'b' },
        })
      );
    }

    it('allows a protected edit with a valid, unexpired entry and names it on stderr', () => {
      const root = makeRepo({ overrides: [validEntry()] });
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(0);
      expect(stderr).toContain('Override allowed for eslint.config.mjs');
      expect(stderr).toContain('https://example.com/decisions/42');
      expect(stderr).toContain('repo-owner');
    });

    it('allows an entry that expires today (inclusive)', () => {
      const today = new Date().toISOString().slice(0, 10);
      const root = makeRepo({ overrides: [validEntry({ expires: today })] });
      expect(editIn(root, 'eslint.config.mjs').exitCode).toBe(0);
    });

    it('resolves a relative file_path against the request cwd', () => {
      const root = makeRepo({ overrides: [validEntry()] });
      const { exitCode } = runHook(
        JSON.stringify({
          tool_name: 'Write',
          cwd: root,
          tool_input: { file_path: 'eslint.config.mjs', content: '' },
        })
      );
      expect(exitCode).toBe(0);
    });

    it('matches by repo-relative path, not basename', () => {
      const root = makeRepo({ overrides: [validEntry({ file: 'packages/a/eslint.config.mjs' })] });
      expect(editIn(root, 'packages/a/eslint.config.mjs').exitCode).toBe(0);
      const other = editIn(root, 'packages/b/eslint.config.mjs');
      expect(other.exitCode).toBe(2);
      expect(other.stderr).toContain('no entry for "packages/b/eslint.config.mjs"');
      expect(editIn(root, 'eslint.config.mjs').exitCode).toBe(2);
    });

    it('blocks when the entry has expired, and says so', () => {
      const root = makeRepo({ overrides: [validEntry({ expires: isoDay(-1) })] });
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('protected config file');
      expect(stderr).toContain(`expired on ${isoDay(-1)}`);
    });

    it('blocks when expires is not a real date', () => {
      const root = makeRepo({ overrides: [validEntry({ expires: '2099-02-30' })] });
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('is not a YYYY-MM-DD date');
    });

    for (const field of ['reason', 'decision', 'approvedBy', 'expires']) {
      it(`blocks when ${field} is missing`, () => {
        const entry: Record<string, unknown> = validEntry();
        delete entry[field];
        const root = makeRepo({ overrides: [entry] });
        const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
        expect(exitCode).toBe(2);
        expect(stderr).toContain(`missing or empty field(s): ${field}`);
      });
    }

    it('blocks when a field is blank', () => {
      const root = makeRepo({ overrides: [validEntry({ approvedBy: '   ' })] });
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('missing or empty field(s): approvedBy');
    });

    it('blocks when the only entry is for another file', () => {
      const root = makeRepo({ overrides: [validEntry({ file: '.prettierrc' })] });
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('no entry for "eslint.config.mjs"');
    });

    it('blocks when the ledger is not valid JSON', () => {
      const root = makeRepo('{ "overrides": [');
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('could not be read as JSON');
    });

    it('blocks when the ledger has no overrides array', () => {
      const root = makeRepo([validEntry()]);
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('no "overrides" array');
    });

    it('blocks when there is no ledger, and names the ledger as the way through', () => {
      const root = makeRepo();
      const { exitCode, stderr } = editIn(root, 'eslint.config.mjs');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('.harness/config-overrides.json');
      expect(stderr).toContain('no .harness/config-overrides.json in this repo');
    });

    it('blocks edits to the ledger itself, even with a matching entry', () => {
      const root = makeRepo({
        overrides: [validEntry({ file: '.harness/config-overrides.json' })],
      });
      const { exitCode, stderr } = editIn(root, '.harness/config-overrides.json');
      expect(exitCode).toBe(2);
      expect(stderr).toContain('config override ledger');
    });

    it('still allows unprotected files when a ledger exists', () => {
      const root = makeRepo({ overrides: [validEntry()] });
      expect(editIn(root, 'src/app.ts').exitCode).toBe(0);
    });
  });

  // Regression for #993: the hook used to treat ANY stdin read failure as "no
  // input" and exit 0, so a transient EAGAIN on the pipe silently waved a
  // protected-config edit through while the check stayed green. A blind guard
  // must block. POSIX-only: the fd/pipe shape does not reproduce on Windows.
  const onPosix = process.platform === 'win32' ? describe.skip : describe;

  onPosix('stdin read failure (fail closed)', () => {
    it('blocks when the stdin read itself fails', () => {
      // A directory opens fine but errors (EISDIR) on read — a read that
      // genuinely failed, unlike /dev/null which reads 0 bytes successfully.
      // Node substitutes /dev/null for a closed fd 0, so closing it won't do.
      const dirFd = openSync(mkdtempSync(join(tmpdir(), 'protect-config-stdin-')), 'r');
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
