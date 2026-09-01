import { describe, it, expect } from 'vitest';
import { createGitPort, createFsPort, runReleaseInventory, type RunGit } from './release-inventory';
import type { ReleaseInventoryFsPort } from '@harness-engineering/core';

/**
 * Command-layer contract for `harness release-inventory`. The threshold/compute
 * logic is covered by the core engine suites; here we pin the git-seam parsing
 * (tag/log/added-date) and the end-to-end orchestration with injected IO so no
 * real subprocess runs.
 */

const TAB = '	';

/** Build a fake `runGit` from an argv-join → output map; throws for unmapped calls. */
function fakeGit(responses: Record<string, string | (() => string)>): RunGit {
  return (args: string[]) => {
    const key = args.join(' ');
    const hit = responses[key];
    if (hit === undefined) throw new Error(`unmapped git call: ${key}`);
    return typeof hit === 'function' ? hit() : hit;
  };
}

function fakeFs(files: Record<string, string>): ReleaseInventoryFsPort {
  return {
    listDir: (dir) =>
      dir === '.changeset'
        ? Object.keys(files)
            .filter((f) => f.startsWith('.changeset/'))
            .map((f) => f.slice('.changeset/'.length))
        : [],
    readFile: (p) => files[p] ?? null,
  };
}

describe('createGitPort', () => {
  it('parses tab-separated tags into name/date, newest first', () => {
    const runGit = fakeGit({
      [`tag --list v* --sort=-creatordate --format=%(refname:short)${TAB}%(creatordate:iso-strict)`]: `v2.0.0${TAB}2026-08-30T00:00:00Z\nv1.0.0${TAB}2026-08-01T00:00:00Z`,
    });
    const tags = createGitPort(runGit).listReleaseTags('v*');
    expect(tags).toEqual([
      { name: 'v2.0.0', date: '2026-08-30T00:00:00Z' },
      { name: 'v1.0.0', date: '2026-08-01T00:00:00Z' },
    ]);
  });

  it('detects merge commits by parent count and parses subjects with tabs safely', () => {
    const runGit = fakeGit({
      [`log v1.0.0..HEAD --format=%H${TAB}%cI${TAB}%P${TAB}%s`]:
        `sha1${TAB}2026-08-20T00:00:00Z${TAB}p1 p2${TAB}Merge pull request #5\n` +
        `sha2${TAB}2026-08-19T00:00:00Z${TAB}p1${TAB}fix: single parent`,
    });
    const commits = createGitPort(runGit).commitsSince('v1.0.0');
    expect(commits[0]).toEqual({
      sha: 'sha1',
      date: '2026-08-20T00:00:00Z',
      isMerge: true,
      subject: 'Merge pull request #5',
    });
    expect(commits[1]?.isMerge).toBe(false);
  });

  it('uses the whole history (HEAD) when there is no tag boundary', () => {
    const runGit = fakeGit({
      [`log HEAD --format=%H${TAB}%cI${TAB}%P${TAB}%s`]: `sha1${TAB}2026-08-20T00:00:00Z${TAB}${TAB}root`,
    });
    const commits = createGitPort(runGit).commitsSince(null);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.isMerge).toBe(false);
  });

  it('returns the oldest (last) add date for a file', () => {
    const runGit = fakeGit({
      'log --diff-filter=A --follow --format=%cI -- .changeset/x.md':
        '2026-08-25T00:00:00Z\n2026-08-10T00:00:00Z',
    });
    expect(createGitPort(runGit).fileAddedDate('.changeset/x.md')).toBe('2026-08-10T00:00:00Z');
  });

  it('degrades to empty/null when git throws', () => {
    const throwing = fakeGit({});
    // fakeGit throws on unmapped calls — the port must swallow it.
    expect(throwing).toBeDefined();
    const port = createGitPort(() => {
      throw new Error('not a git repo');
    });
    expect(port.listReleaseTags('v*')).toEqual([]);
    expect(port.commitsSince(null)).toEqual([]);
    expect(port.fileAddedDate('x')).toBeNull();
  });
});

describe('createFsPort', () => {
  it('returns [] / null for missing dirs and files', () => {
    const port = createFsPort('/nonexistent-root-xyz');
    expect(port.listDir('.changeset')).toEqual([]);
    expect(port.readFile('.changeset/x.md')).toBeNull();
  });
});

describe('runReleaseInventory (end to end with injected IO)', () => {
  const now = new Date('2026-08-31T00:00:00Z');

  it('reports ok within thresholds and carries the denominator (SC2/SC4)', async () => {
    const runGit = fakeGit({
      [`tag --list v* --sort=-creatordate --format=%(refname:short)${TAB}%(creatordate:iso-strict)`]: `v1.0.0${TAB}2026-08-25T00:00:00Z`,
      [`log v1.0.0..HEAD --format=%H${TAB}%cI${TAB}%P${TAB}%s`]: `sha1${TAB}2026-08-28T00:00:00Z${TAB}p1 p2${TAB}Merge PR`,
    });
    const res = await runReleaseInventory({
      runGit,
      fsPort: fakeFs({}),
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('ok');
    expect(res.value.breached).toBe(false);
    expect(res.value.inventory.shippedDefinition).toBe('git tags matching "v*"');
    expect(res.value.inventory.unreleasedMergeCount).toBe(1);
  });

  it('fires threshold as unbounded on a zero-release repo with pending changesets (AC1/AC3)', async () => {
    const runGit = fakeGit({
      [`tag --list v* --sort=-creatordate --format=%(refname:short)${TAB}%(creatordate:iso-strict)`]:
        '',
      [`log HEAD --format=%H${TAB}%cI${TAB}%P${TAB}%s`]: `sha1${TAB}2026-08-20T00:00:00Z${TAB}p1 p2${TAB}Merge PR`,
      'log --diff-filter=A --follow --format=%cI -- .changeset/pending.md': '2026-08-15T00:00:00Z',
    });
    const res = await runReleaseInventory({
      runGit,
      fsPort: fakeFs({ '.changeset/pending.md': "---\n'pkg': minor\n---\nbody" }),
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('unbounded');
    expect(res.value.breached).toBe(true);
    expect(res.value.inventory.lastRelease).toBeNull();
    expect(res.value.inventory.pendingChangesetCount).toBe(1);
  });
});
