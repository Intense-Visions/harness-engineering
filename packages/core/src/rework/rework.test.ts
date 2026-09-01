import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { computeRework, classifyRework, plannedIssuesFromExternalIds } from './rework';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();
}
function gitInit(cwd: string) {
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 't@t']);
  git(cwd, ['config', 'user.name', 'T']);
}
function commit(cwd: string, files: string[], subject: string, body?: string): string {
  for (const f of files) {
    const abs = join(cwd, f);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${f}:${subject}`);
  }
  git(cwd, ['add', '-A']);
  const args = ['commit', '-q', '-m', subject];
  if (body !== undefined) args.push('-m', body);
  git(cwd, args);
  return git(cwd, ['rev-parse', 'HEAD']);
}
function surface(report: Awaited<ReturnType<typeof computeRework>>, path: string) {
  return report.surfaces.find((s) => s.path === path);
}

describe('classifyRework', () => {
  it('is planned when a parsed ref is in the planned set', () => {
    expect(classifyRework('fix: correct foo', 'Refs #42', new Set([42]))).toBe('planned');
  });
  it('is unplanned when no parsed ref is in the planned set', () => {
    expect(classifyRework('fix: correct foo', 'Refs #99', new Set([42]))).toBe('unplanned');
  });
  it('is unplanned when there are no refs at all', () => {
    expect(classifyRework('fix: correct foo', '', new Set([42]))).toBe('unplanned');
  });
});

describe('plannedIssuesFromExternalIds', () => {
  it('maps External-IDs to a set of issue numbers, dropping malformed ones', () => {
    const set = plannedIssuesFromExternalIds([
      'github:o/r#42',
      'github:o/r#7',
      'not-an-external-id',
    ]);
    expect(set).toEqual(new Set([42, 7]));
  });
});

describe('computeRework', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rework-'));
    gitInit(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));

  it('AC1 planned: fix sharing a planned issue ref is planned rework', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo (#42)');
    commit(tmp, ['src/foo.ts'], 'fix: correct foo', 'Refs #42');

    const report = await computeRework({ since: '30d', cwd: tmp, plannedIssues: new Set([42]) });
    const foo = surface(report, 'src/foo.ts')!;
    expect(foo.totalCommits).toBe(2);
    expect(foo.reworkCommits).toBe(1);
    expect(foo.plannedReworkCommits).toBe(1);
    expect(foo.unplannedReworkCommits).toBe(0);
    expect(foo.unplannedReworkRate).toBe(0);
  });

  it('AC1 unplanned: fix with a non-planned ref is unplanned rework', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo (#42)');
    const bSha = commit(tmp, ['src/foo.ts'], 'fix: correct foo', 'Refs #99');

    const report = await computeRework({ since: '30d', cwd: tmp, plannedIssues: new Set([42]) });
    const foo = surface(report, 'src/foo.ts')!;
    expect(foo.unplannedReworkCommits).toBe(1);
    expect(foo.plannedReworkCommits).toBe(0);
    expect(foo.unplannedReworkRate).toBeCloseTo(0.5, 10);
    expect(foo.reworkingShas).toContain(bSha);
  });

  it('not rework when no strictly-earlier commit touched the surface (rule 3b)', async () => {
    // The fix is the FIRST commit to touch foo — no earlier touch, so not rework.
    commit(tmp, ['src/foo.ts'], 'fix: premature fix');
    commit(tmp, ['src/foo.ts'], 'chore: follow up on foo');

    const report = await computeRework({ since: '30d', cwd: tmp });
    const foo = surface(report, 'src/foo.ts')!;
    expect(foo.totalCommits).toBe(2);
    expect(foo.reworkCommits).toBe(0);
  });

  it('not rework when the re-touching commit is not a fix/revert subject (rule 3a)', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo');
    commit(tmp, ['src/foo.ts'], 'chore: refactor foo');

    const report = await computeRework({ since: '30d', cwd: tmp });
    const foo = surface(report, 'src/foo.ts')!;
    expect(foo.totalCommits).toBe(2);
    expect(foo.reworkCommits).toBe(0);
  });

  it('counts both revert: and Revert "…" subjects as rework', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo');
    commit(tmp, ['src/foo.ts'], 'revert: undo foo change');
    commit(tmp, ['src/bar.ts'], 'feat: add bar');
    commit(tmp, ['src/bar.ts'], 'Revert "feat: add bar"');

    const report = await computeRework({ since: '30d', cwd: tmp });
    expect(surface(report, 'src/foo.ts')!.reworkCommits).toBe(1);
    expect(surface(report, 'src/bar.ts')!.reworkCommits).toBe(1);
  });

  it('excludes surfaces below the minCommits threshold', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo');
    commit(tmp, ['src/foo.ts'], 'fix: correct foo');
    commit(tmp, ['src/bar.ts'], 'feat: add bar only once');

    const report = await computeRework({ since: '30d', cwd: tmp, minCommits: 2 });
    expect(surface(report, 'src/foo.ts')).toBeDefined();
    expect(surface(report, 'src/bar.ts')).toBeUndefined();
  });

  it('uses a per-surface denominator (commits touching THAT surface, not global)', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: foo 1');
    commit(tmp, ['src/foo.ts'], 'chore: foo 2');
    commit(tmp, ['src/foo.ts'], 'fix: foo 3');
    commit(tmp, ['src/bar.ts'], 'feat: bar 1');
    commit(tmp, ['src/bar.ts'], 'fix: bar 2');

    const report = await computeRework({ since: '30d', cwd: tmp });
    expect(surface(report, 'src/foo.ts')!.totalCommits).toBe(3);
    expect(surface(report, 'src/bar.ts')!.totalCommits).toBe(2);
    expect(report.totalCommitsScanned).toBe(5);
  });

  it('declares the resolved window and denominator label (AC2)', async () => {
    commit(tmp, ['src/foo.ts'], 'feat: add foo');
    commit(tmp, ['src/foo.ts'], 'fix: correct foo');
    const report = await computeRework({ since: '30d', cwd: tmp });
    expect(report.resolvedWindow).toBe('30 days ago');
    expect(report.denominatorLabel).toBe('commits touching the surface within the window');
  });

  it('sorts surfaces by unplanned rework rate descending', async () => {
    // low: foo has a planned fix (rate 0). high: bar has an unplanned fix (rate 0.5).
    commit(tmp, ['src/foo.ts'], 'feat: add foo (#42)');
    commit(tmp, ['src/foo.ts'], 'fix: correct foo', 'Refs #42');
    commit(tmp, ['src/bar.ts'], 'feat: add bar');
    commit(tmp, ['src/bar.ts'], 'fix: correct bar');

    const report = await computeRework({ since: '30d', cwd: tmp, plannedIssues: new Set([42]) });
    expect(report.surfaces[0]!.path).toBe('src/bar.ts');
  });

  it('degrade-safe: empty repo yields an empty report and no throw', async () => {
    const report = await computeRework({ since: '30d', cwd: tmp });
    expect(report.surfaces).toEqual([]);
    expect(report.totalCommitsScanned).toBe(0);
  });

  it('degrade-safe: non-git directory yields an empty report and no throw', async () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'rework-nongit-'));
    try {
      const report = await computeRework({ since: '30d', cwd: nonGit });
      expect(report.surfaces).toEqual([]);
      expect(report.totalCommitsScanned).toBe(0);
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});
