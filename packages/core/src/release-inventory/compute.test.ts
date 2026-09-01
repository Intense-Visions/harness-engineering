import { describe, it, expect } from 'vitest';
import { computeReleaseInventory, describeChannel } from './compute';
import { diffInWholeDays } from './dates';
import type {
  ReleaseChannel,
  ReleaseInventoryFsPort,
  ReleaseInventoryGitPort,
  ReleaseTag,
  UnreleasedCommit,
} from './types';

const NOW = new Date('2026-08-31T00:00:00Z');
const CHANNEL: ReleaseChannel = { kind: 'git-tag', pattern: 'v*' };

function fakeGit(opts: {
  tags?: ReleaseTag[];
  commits?: UnreleasedCommit[];
  addedDates?: Record<string, string | null>;
}): ReleaseInventoryGitPort {
  return {
    listReleaseTags: () => opts.tags ?? [],
    commitsSince: () => opts.commits ?? [],
    fileAddedDate: (p) => opts.addedDates?.[p] ?? null,
  };
}

function fakeFs(files: Record<string, string>): ReleaseInventoryFsPort {
  return {
    listDir: (dir) => {
      if (dir !== '.changeset') return [];
      return Object.keys(files)
        .filter((f) => f.startsWith('.changeset/'))
        .map((f) => f.slice('.changeset/'.length));
    },
    readFile: (p) => files[p] ?? null,
  };
}

describe('diffInWholeDays', () => {
  it('computes whole days and clamps negatives to 0', () => {
    expect(diffInWholeDays(new Date('2026-08-31'), new Date('2026-08-21'))).toBe(10);
    expect(diffInWholeDays(new Date('2026-08-21'), new Date('2026-08-31'))).toBe(0);
  });
  it('returns 0 for unparseable dates', () => {
    expect(diffInWholeDays(new Date('nope'), new Date('2026-08-21'))).toBe(0);
  });
});

describe('describeChannel', () => {
  it('names the denominator (AC2)', () => {
    expect(describeChannel(CHANNEL)).toBe('git tags matching "v*"');
  });
});

describe('computeReleaseInventory', () => {
  it('computes counts and ages against the latest tag boundary (SC1)', () => {
    const commits: UnreleasedCommit[] = [
      { sha: 'a', date: '2026-08-29T00:00:00Z', isMerge: true, subject: 'Merge PR #2' },
      { sha: 'b', date: '2026-08-20T00:00:00Z', isMerge: false, subject: 'fix: thing' },
      { sha: 'c', date: '2026-08-10T00:00:00Z', isMerge: true, subject: 'Merge PR #1' },
    ];
    const git = fakeGit({
      tags: [{ name: 'v1.2.0', date: '2026-08-05T00:00:00Z' }],
      commits,
      addedDates: { '.changeset/brave-lions.md': '2026-08-15T00:00:00Z' },
    });
    const fs = fakeFs({ '.changeset/brave-lions.md': "---\n'@scope/pkg': minor\n---\nhi" });

    const inv = computeReleaseInventory(git, fs, CHANNEL, NOW);

    expect(inv.unbounded).toBe(false);
    expect(inv.lastRelease?.name).toBe('v1.2.0');
    expect(inv.unreleasedCommitCount).toBe(3);
    expect(inv.unreleasedMergeCount).toBe(2);
    expect(inv.oldestUnreleasedAgeDays).toBe(21); // Aug 10 → Aug 31
    expect(inv.pendingChangesetCount).toBe(1);
    expect(inv.oldestChangesetAgeDays).toBe(16); // Aug 15 → Aug 31
    expect(inv.shippedDefinition).toBe('git tags matching "v*"');
  });

  it('reports unbounded for a zero-release repo, never omitting the metric (AC3)', () => {
    const commits: UnreleasedCommit[] = [
      { sha: 'a', date: '2026-08-29T00:00:00Z', isMerge: true, subject: 'Merge PR #2' },
    ];
    const git = fakeGit({ tags: [], commits });
    const fs = fakeFs({ '.changeset/x.md': "---\n'@scope/pkg': patch\n---\nx" });

    const inv = computeReleaseInventory(git, fs, CHANNEL, NOW);

    expect(inv.unbounded).toBe(true);
    expect(inv.lastRelease).toBeNull();
    expect(inv.unreleasedCommitCount).toBe(1);
    expect(inv.pendingChangesetCount).toBe(1);
    // Metric is present with its denominator, not omitted.
    expect(inv.channel.pattern).toBe('v*');
    expect(inv.shippedDefinition).toContain('v*');
  });

  it('reports an empty inventory when nothing is pending', () => {
    const git = fakeGit({ tags: [{ name: 'v2.0.0', date: '2026-08-30T00:00:00Z' }], commits: [] });
    const fs = fakeFs({ '.changeset/README.md': 'readme', '.changeset/config.json': '{}' });

    const inv = computeReleaseInventory(git, fs, CHANNEL, NOW);

    expect(inv.unbounded).toBe(false);
    expect(inv.unreleasedCommitCount).toBe(0);
    expect(inv.pendingChangesetCount).toBe(0); // README/config excluded
    expect(inv.oldestUnreleasedAgeDays).toBeNull();
    expect(inv.oldestChangesetAgeDays).toBeNull();
  });
});
