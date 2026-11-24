import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHarness } from '../e2e/support/harness-cli';

/**
 * Round 4, fix 9: the reviewer self-check is the built CLI, run from the REPOSITORY ROOT (where
 * the old `require` probe printed "parser unavailable"), and from a throwaway repository with a
 * range, against real git.
 */
const CLI = path.join(__dirname, '../../dist/bin/harness.js');
const REPO_ROOT = path.resolve(__dirname, '../../../..');
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
let base: string;
let head: string;
const write = (name: string, body: unknown) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};
const file = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  reviewerId: 'bug',
  head,
  examinedFiles: ['src/b.ts'],
  findings: [],
  ...over,
});

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-selfcheck-')));
  g('init', '-q');
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.ts'), 'a\n');
  g('add', '.');
  g('commit', '-q', '--no-verify', '-m', 'a');
  base = g('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(tmp, 'src', 'b.ts'), 'b\n');
  g('add', '.');
  g('commit', '-q', '--no-verify', '-m', 'b');
  head = g('rev-parse', 'HEAD');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('harness check-review-receipt --findings (built CLI)', () => {
  it('from the repository root: a valid file passes with exit 0 (no "parser unavailable")', () => {
    const f = write('ok.json', file());
    const r = runHarness(['check-review-receipt', '--findings', f], { cwd: REPO_ROOT, bin: CLI });
    expect(r.stderr).not.toMatch(/parser unavailable/);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/findings file check: PASS/);
  });
  it('from the repository root: an invalid file exits 1 and names the code', () => {
    const f = write('bad.json', { ...file(), findings: [{ id: 'x' }] });
    const r = runHarness(['check-review-receipt', '--findings', f], { cwd: REPO_ROOT, bin: CLI });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/FINDINGS_FILE_INVALID/);
  });
  const rows: Array<[string, () => Record<string, unknown>, number, string | undefined]> = [
    ['in range, head equal', () => ({}), 0, undefined],
    [
      'a file outside the diff',
      () => ({ examinedFiles: ['src/a.ts'] }),
      1,
      'EXAMINED_OUTSIDE_DIFF',
    ],
    // Lazy: the commits exist only after beforeAll.
    ['another head', () => ({ head: base }), 1, 'FINDINGS_HEAD_MISMATCH'],
  ];
  it.each(rows)('with --base/--head in a repository: %s', (_n, over, status, code) => {
    const f = write('r.json', file(over()));
    const r = runHarness(
      ['--json', 'check-review-receipt', '--findings', f, '--base', base, '--head', 'HEAD'],
      { cwd: tmp, bin: CLI }
    );
    expect(r.status).toBe(status);
    const out = JSON.parse(r.stdout);
    expect(out.pass).toBe(status === 0);
    if (code !== undefined)
      expect(out.failures.map((x: { code: string }) => x.code)).toContain(code);
  });
  it('--base without --head exits 1', () => {
    const f = write('r.json', file());
    const r = runHarness(['check-review-receipt', '--findings', f, '--base', base], {
      cwd: tmp,
      bin: CLI,
    });
    expect(r.status).toBe(1);
  });
});
