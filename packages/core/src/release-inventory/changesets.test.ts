import { describe, it, expect } from 'vitest';
import { parseChangesetBumps, readPendingChangesets } from './changesets';
import type { ReleaseInventoryFsPort, ReleaseInventoryGitPort } from './types';

const NOW = new Date('2026-08-31T00:00:00Z');

describe('parseChangesetBumps', () => {
  it('parses quoted package → level frontmatter', () => {
    const content =
      "---\n'@harness-engineering/core': minor\n'@harness-engineering/cli': patch\n---\nbody";
    expect(parseChangesetBumps(content)).toEqual([
      { package: '@harness-engineering/core', level: 'minor' },
      { package: '@harness-engineering/cli', level: 'patch' },
    ]);
  });
  it('returns [] when there is no frontmatter', () => {
    expect(parseChangesetBumps('just a body, no fences')).toEqual([]);
  });
  it('stops at the closing fence', () => {
    const content = "---\n'pkg': major\n---\n'not-a-pkg': minor\n";
    expect(parseChangesetBumps(content)).toEqual([{ package: 'pkg', level: 'major' }]);
  });
});

describe('readPendingChangesets', () => {
  function fs(files: Record<string, string>): ReleaseInventoryFsPort {
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
  function git(dates: Record<string, string | null>): ReleaseInventoryGitPort {
    return {
      listReleaseTags: () => [],
      commitsSince: () => [],
      fileAddedDate: (p) => dates[p] ?? null,
    };
  }

  it('excludes README.md and config.json, ages the rest, oldest first', () => {
    const files = {
      '.changeset/README.md': 'readme',
      '.changeset/config.json': '{}',
      '.changeset/new-one.md': "---\n'pkg': patch\n---\nx",
      '.changeset/old-one.md': "---\n'pkg': minor\n---\ny",
    };
    const dates = {
      '.changeset/new-one.md': '2026-08-25T00:00:00Z', // 6d
      '.changeset/old-one.md': '2026-08-01T00:00:00Z', // 30d
    };
    const result = readPendingChangesets(fs(files), git(dates), NOW);
    expect(result.map((c) => c.file)).toEqual(['.changeset/old-one.md', '.changeset/new-one.md']);
    expect(result[0]?.ageDays).toBe(30);
    expect(result[1]?.ageDays).toBe(6);
    expect(result[0]?.bumps).toEqual([{ package: 'pkg', level: 'minor' }]);
  });

  it('returns [] when there is no .changeset directory', () => {
    expect(readPendingChangesets(fs({}), git({}), NOW)).toEqual([]);
  });

  it('tolerates an uncommitted changeset (null addedAt → null age)', () => {
    const files = { '.changeset/wip.md': "---\n'pkg': patch\n---\nx" };
    const result = readPendingChangesets(fs(files), git({}), NOW);
    expect(result[0]?.addedAt).toBeNull();
    expect(result[0]?.ageDays).toBeNull();
  });
});
