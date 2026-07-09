import { describe, it, expect, vi } from 'vitest';
import { computeRevertDryRun, type GitSeam } from '../../src/rollback/io';

/**
 * Build a fake GitSeam. `parents` is the list of parent shas returned by
 * `rev-list --parents -n 1 <sha>` (the commit's own sha is prepended by git,
 * which the fake mimics). `mergeTree` returns the {status, stdout} of the
 * `merge-tree --write-tree` probe.
 */
function fakeGit(over: {
  parents?: string[];
  mergeTree?: { status: number; stdout: string };
  revListThrows?: boolean;
}): GitSeam {
  const commitSha = 'M';
  return {
    run: vi.fn((args: string[]) => {
      if (args[0] === 'rev-list') {
        if (over.revListThrows) {
          const e = new Error('fatal: bad object') as Error & { status: number };
          e.status = 128;
          throw e;
        }
        // git prints "<commit> <parent1> <parent2> ..." on one line
        return [commitSha, ...(over.parents ?? ['P1'])].join(' ');
      }
      throw new Error(`unexpected git run: ${args.join(' ')}`);
    }),
    tryMergeTree: vi.fn(() => over.mergeTree ?? { status: 0, stdout: 'treeoid' }),
  };
}

describe('computeRevertDryRun', () => {
  it('reports clean on merge-tree exit 0 (two-parent merge, uses parent 1)', async () => {
    const git = fakeGit({ parents: ['P1', 'P2'], mergeTree: { status: 0, stdout: 'tree' } });
    const res = await computeRevertDryRun('M', git);
    expect(res).toEqual({ clean: true, conflictPaths: [] });
    // theirs must be the FIRST parent for a real merge commit
    const call = (git.tryMergeTree as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    expect(call).toContain('P1');
    expect(call).not.toContain('P2');
  });

  it('reports conflict with parsed paths on merge-tree exit 1', async () => {
    const conflictStdout = [
      'treeoid',
      '100644 aaa 1\tsrc/a.ts',
      '100644 bbb 2\tsrc/a.ts',
      '100644 ccc 3\tsrc/a.ts',
      '',
      'CONFLICT (content): Merge conflict in src/a.ts',
    ].join('\n');
    const git = fakeGit({ parents: ['P1'], mergeTree: { status: 1, stdout: conflictStdout } });
    const res = await computeRevertDryRun('M', git);
    expect(res.clean).toBe(false);
    expect(res.conflictPaths).toEqual(['src/a.ts']);
  });

  it('RE-THROWS on a non-1 non-zero exit (bad SHA / missing object => exit 128) (#1)', async () => {
    // A transient/real error (exit 128) must NOT be silently reported as a
    // conflict. It must propagate so the caller surfaces a real error.
    const git = fakeGit({
      parents: ['P1'],
      mergeTree: { status: 128, stdout: 'fatal: not a valid object name' },
    });
    await expect(computeRevertDryRun('M', git)).rejects.toThrow(/merge-tree|128|object/i);
  });

  it('selects the SOLE parent for a single-parent (squash/rebase) merge (#3b)', async () => {
    // A squash/rebase merge has ONE parent; `^1` still resolves it, but we compute
    // the parent explicitly from rev-list and must pass it as `theirs`.
    const git = fakeGit({ parents: ['SOLE'], mergeTree: { status: 0, stdout: 'tree' } });
    const res = await computeRevertDryRun('M', git);
    expect(res.clean).toBe(true);
    const call = (git.tryMergeTree as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    expect(call).toContain('SOLE');
  });

  it('re-throws when the commit cannot be resolved (rev-list exit 128)', async () => {
    const git = fakeGit({ revListThrows: true });
    await expect(computeRevertDryRun('BAD', git)).rejects.toThrow(/bad object|128/i);
  });
});
