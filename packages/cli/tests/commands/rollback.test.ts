import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRollbackEvaluate } from '../../src/commands/rollback';
import { ROLLBACK_EVENTS_FILE } from '../../src/rollback/breadcrumb';

function fakeIo(
  over: Partial<{
    clean: boolean;
    conflictPaths: string[];
    changedFiles: string[];
    later: { pr: number; changedFiles: string[] }[];
    title: string;
  }> = {}
) {
  return {
    revertDryRun: vi.fn(async () => ({
      clean: over.clean ?? true,
      conflictPaths: over.conflictPaths ?? [],
    })),
    resolveTarget: vi.fn(async () => ({
      mergeSha: 'sha1',
      changedFiles: over.changedFiles ?? ['src/a.ts'],
      title: over.title ?? 'Add A',
    })),
    listLaterMerges: vi.fn(async () => over.later ?? []),
  };
}
function fakeGh(existing: number[] = []) {
  return {
    findOpenRevertPr: vi.fn(async () => (existing.length ? existing[0]! : null)),
    findOpenRevertPrUrl: vi.fn(async () => (existing.length ? 'https://gh/pr/99' : null)),
    openPr: vi.fn(async () => 'https://gh/pr/100'),
  };
}

function withRoot(fn: (root: string) => Promise<void>) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'rb-cmd-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('runRollbackEvaluate', () => {
  it(
    'proposes a PR for a clean, independent target (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('proposed');
      expect(d.prUrl).toBe('https://gh/pr/100');
      expect(gh.openPr).toHaveBeenCalledTimes(1);
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec).toMatchObject({ targetPr: 42, action: 'proposed' });
    })
  );

  it(
    'skips on conflicting revert and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ clean: false, conflictPaths: ['src/a.ts'] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'blocks on a dependent later merge and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ later: [{ pr: 50, changedFiles: ['src/a.ts'] }] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('blocked');
      expect(d.dependentMerges).toContain(50);
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'is idempotent when an open revert PR already exists (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([99]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(d.prUrl).toBe('https://gh/pr/99');
    })
  );

  it(
    'dry-run prints the body, opens no PR, still writes a breadcrumb',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const printed: string[] = [];
      const d = await runRollbackEvaluate(
        { pr: 42, trigger: 'signal', dryRun: true },
        { io, gh, root, print: (s) => printed.push(s) }
      );
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(printed.join('\n')).toContain('#42');
      expect(d.action).toBe('proposed');
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec.targetPr).toBe(42);
    })
  );
});
