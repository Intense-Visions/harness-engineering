import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...a: unknown[]) => execFileSync(...a),
}));

import { computeRevertDryRun, createNodeRollbackIO, type GitSeam } from '../../src/rollback/io';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseConflictPaths edge branches via computeRevertDryRun (cov544b)', () => {
  it('skips lines without a tab and dedupes conflicted paths', async () => {
    // Line 1 has no tab (continue branch); a repeated path is deduped; a
    // tab-line whose path is empty after trim is dropped.
    const stdout = [
      'treeoid',
      'this-line-has-no-tab-so-it-is-skipped',
      '100644 aaa 1\tsrc/dup.ts',
      '100644 bbb 2\tsrc/dup.ts',
      '100644 ccc 3\t   ',
      '100644 ddd 1\tsrc/other.ts',
      '',
      'CONFLICT (content): ...',
    ].join('\n');
    const seam: GitSeam = {
      run: () => 'M P1',
      tryMergeTree: () => ({ status: 1, stdout }),
    };
    const res = await computeRevertDryRun('M', seam);
    expect(res.clean).toBe(false);
    expect(res.conflictPaths.sort()).toEqual(['src/dup.ts', 'src/other.ts']);
  });

  it('throws on a zero-parent (root) commit', async () => {
    const seam: GitSeam = {
      run: () => 'ROOTONLY',
      tryMergeTree: () => ({ status: 0, stdout: '' }),
    };
    await expect(computeRevertDryRun('ROOTONLY', seam)).rejects.toThrow(/no parent|root commit/i);
  });
});

describe('createNodeRollbackIO (cov544b)', () => {
  it('revertDryRun uses the real execFileSync git seam and reports clean', async () => {
    execFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args[0] === 'rev-list') return Buffer.from('M P1 P2\n');
      if (args[0] === 'merge-tree') return Buffer.from('treeoid\n');
      throw new Error(`unexpected: ${args.join(' ')}`);
    });
    const io = createNodeRollbackIO();
    const res = await io.revertDryRun('M');
    expect(res).toEqual({ clean: true, conflictPaths: [] });
  });

  it('revertDryRun maps a non-zero merge-tree exit into a conflict', async () => {
    execFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args[0] === 'rev-list') return Buffer.from('M P1\n');
      if (args[0] === 'merge-tree') {
        const e = new Error('conflict') as Error & { status: number; stdout: Buffer };
        e.status = 1;
        e.stdout = Buffer.from('treeoid\n100644 aaa 1\tsrc/z.ts\n\nCONFLICT');
        throw e;
      }
      throw new Error('unexpected');
    });
    const io = createNodeRollbackIO();
    const res = await io.revertDryRun('M');
    expect(res.clean).toBe(false);
    expect(res.conflictPaths).toEqual(['src/z.ts']);
  });

  it('resolveTarget parses gh JSON (merge sha, files, title)', async () => {
    execFileSync.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          mergeCommit: { oid: 'deadbeef' },
          files: [{ path: 'a.ts' }, { path: 'b.ts' }],
          title: 'My PR',
        })
      )
    );
    const io = createNodeRollbackIO();
    const t = await io.resolveTarget(42);
    expect(t.mergeSha).toBe('deadbeef');
    expect(t.changedFiles).toEqual(['a.ts', 'b.ts']);
    expect(t.title).toBe('My PR');
  });

  it('resolveTarget falls back for a null mergeCommit / missing fields', async () => {
    execFileSync.mockReturnValue(
      Buffer.from(JSON.stringify({ mergeCommit: null, files: null, title: null }))
    );
    const io = createNodeRollbackIO();
    const t = await io.resolveTarget(7);
    expect(t.mergeSha).toBe('');
    expect(t.changedFiles).toEqual([]);
    expect(t.title).toBe('PR #7');
  });

  it('listLaterMerges returns [] when the target has no mergedAt', async () => {
    execFileSync.mockImplementation((_bin: string, args: string[]) => {
      // pr view <n> --json mergedAt
      if (args.includes('mergedAt')) return Buffer.from(JSON.stringify({ mergedAt: null }));
      throw new Error('should not fetch the list');
    });
    const io = createNodeRollbackIO();
    expect(await io.listLaterMerges(10)).toEqual([]);
  });

  it('listLaterMerges filters out the target and earlier merges', async () => {
    execFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args[1] === 'view') {
        return Buffer.from(JSON.stringify({ mergedAt: '2026-05-01T00:00:00Z' }));
      }
      if (args[1] === 'list') {
        return Buffer.from(
          JSON.stringify([
            { number: 10, files: [{ path: 'self.ts' }], mergedAt: '2026-06-01T00:00:00Z' },
            { number: 11, files: [{ path: 'later.ts' }], mergedAt: '2026-06-01T00:00:00Z' },
            { number: 12, files: null, mergedAt: '2026-04-01T00:00:00Z' },
          ])
        );
      }
      throw new Error('unexpected');
    });
    const io = createNodeRollbackIO();
    const later = await io.listLaterMerges(10);
    expect(later).toEqual([{ pr: 11, changedFiles: ['later.ts'] }]);
  });
});
