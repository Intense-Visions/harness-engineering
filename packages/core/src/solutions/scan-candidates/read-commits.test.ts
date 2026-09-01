import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readRawCommits } from './read-commits';

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}
function gitInit(cwd: string) {
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 't@t']);
  git(cwd, ['config', 'user.name', 'T']);
}
function commit(cwd: string, files: Record<string, string>, subject: string, body?: string) {
  for (const [f, content] of Object.entries(files)) {
    const abs = join(cwd, f);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  git(cwd, ['add', '-A']);
  const args = ['commit', '-q', '-m', subject];
  if (body !== undefined) args.push('-m', body);
  git(cwd, args);
}

describe('readRawCommits', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'read-commits-'));
    gitInit(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));

  it('returns commits oldest→newest with sha, subject, body, files', async () => {
    commit(tmp, { 'a.ts': 'a' }, 'feat: add a');
    commit(tmp, { 'b.ts': 'b' }, 'fix: correct b', 'Closes #123');

    const commits = await readRawCommits({ since: '30d', cwd: tmp });

    // Oldest → newest ordering is a documented contract of the reader.
    expect(commits.map((c) => c.subject)).toEqual(['feat: add a', 'fix: correct b']);

    const first = commits[0]!;
    const second = commits[1]!;
    expect(first.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(first.files).toEqual(['a.ts']);
    expect(first.body).toBe('');

    expect(second.subject).toBe('fix: correct b');
    expect(second.body).toContain('Closes #123');
    expect(second.files).toEqual(['b.ts']);
  });

  it('does not leak a multi-line commit body into the file list', async () => {
    commit(
      tmp,
      { 'src/x.ts': 'x', 'src/y.ts': 'y' },
      'fix: multi-file fix',
      'Line one of the body\nLine two of the body\nRefs #7'
    );

    const commits = await readRawCommits({ since: '30d', cwd: tmp });
    const c = commits[0]!;

    expect(c.body).toContain('Line one of the body');
    expect(c.body).toContain('Line two of the body');
    expect(c.body).toContain('Refs #7');
    // The multi-line body must not bleed into files — only real paths appear.
    expect(c.files.sort()).toEqual(['src/x.ts', 'src/y.ts']);
    for (const f of c.files) {
      expect(f).not.toContain('Line one');
      expect(f).not.toContain('Refs #7');
    }
  });

  it('returns [] (not throws) on a freshly-init repo with zero commits', async () => {
    const commits = await readRawCommits({ since: '30d', cwd: tmp });
    expect(commits).toEqual([]);
  });

  it('returns [] (not throws) on a non-git directory', async () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'read-commits-nongit-'));
    try {
      const commits = await readRawCommits({ since: '30d', cwd: nonGit });
      expect(commits).toEqual([]);
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});
