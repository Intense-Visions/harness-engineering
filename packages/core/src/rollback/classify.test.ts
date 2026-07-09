import { describe, it, expect } from 'vitest';
import { classifyRevert } from './classify';
import type { RollbackIO } from './io';
import type { ClassifyInput } from './types';

function fakeIo(clean: boolean, conflictPaths: string[] = []): RollbackIO {
  return { revertDryRun: async () => ({ clean, conflictPaths }) };
}

const base: ClassifyInput = {
  targetPr: 100,
  trigger: 'signal',
  mergeSha: 'abc123',
  changedFiles: ['src/foo.ts'],
  laterMerges: [],
};

describe('classifyRevert', () => {
  it('clean revert with no dependents is revert-ready and proposed', async () => {
    const d = await classifyRevert(base, fakeIo(true));
    expect(d.cleanRevert).toBe(true);
    expect(d.revertReady).toBe(true);
    expect(d.action).toBe('proposed');
    expect(d.dependentMerges).toEqual([]);
    expect(d.migrationWarnings).toEqual([]);
  });

  it('conflicting revert is not ready and skipped', async () => {
    const d = await classifyRevert(base, fakeIo(false, ['src/foo.ts']));
    expect(d.cleanRevert).toBe(false);
    expect(d.revertReady).toBe(false);
    expect(d.action).toBe('skipped');
    expect(d.reasons.join(' ')).toMatch(/conflict/i);
  });

  it('dependent later merge blocks a clean revert', async () => {
    const input: ClassifyInput = {
      ...base,
      laterMerges: [{ pr: 101, changedFiles: ['src/foo.ts', 'src/bar.ts'] }],
    };
    const d = await classifyRevert(input, fakeIo(true));
    expect(d.cleanRevert).toBe(true);
    expect(d.dependentMerges).toEqual([101]);
    expect(d.revertReady).toBe(false);
    expect(d.action).toBe('blocked');
  });

  it('non-intersecting later merge does not block', async () => {
    const input: ClassifyInput = {
      ...base,
      laterMerges: [{ pr: 102, changedFiles: ['src/unrelated.ts'] }],
    };
    const d = await classifyRevert(input, fakeIo(true));
    expect(d.dependentMerges).toEqual([]);
    expect(d.revertReady).toBe(true);
  });

  it('migration paths emit warnings as context without gating', async () => {
    const input: ClassifyInput = {
      ...base,
      changedFiles: [
        'db/migrations/0007_add_users.ts',
        'schema/orders.sql',
        'prisma/schema.prisma',
        'src/foo.ts',
      ],
    };
    const d = await classifyRevert(input, fakeIo(true));
    expect(d.migrationWarnings.length).toBeGreaterThan(0);
    // context only — clean + no dependents stays revert-ready
    expect(d.revertReady).toBe(true);
    expect(d.action).toBe('proposed');
  });

  it('blastRadius is passed through as context only', async () => {
    const d = await classifyRevert({ ...base, blastRadius: 42 }, fakeIo(true));
    expect(d.blastRadius).toBe(42);
    expect(d.revertReady).toBe(true);
  });

  it('classifies an empty changedFiles set as skipped, not proposed (#2)', async () => {
    const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
    const decision = await classifyRevert(
      { targetPr: 10, trigger: 'signal', mergeSha: 'abc', changedFiles: [], laterMerges: [] },
      io
    );
    expect(decision.action).toBe('skipped');
    expect(decision.revertReady).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/no changed files/i);
  });

  it('excludes the target PR itself from dependent-merge detection (#3)', async () => {
    const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
    const decision = await classifyRevert(
      {
        targetPr: 42,
        trigger: 'signal',
        mergeSha: 'abc',
        changedFiles: ['src/a.ts'],
        laterMerges: [{ pr: 42, changedFiles: ['src/a.ts'] }],
      },
      io
    );
    expect(decision.dependentMerges).toEqual([]);
    expect(decision.action).toBe('proposed');
  });

  it('emits the exact migration-warning count for multiple migration files (#6)', async () => {
    const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
    const decision = await classifyRevert(
      {
        targetPr: 7,
        trigger: 'signal',
        mergeSha: 'abc',
        changedFiles: ['db/migrations/001.SQL', 'prisma/schema.prisma', 'src/x.ts'],
        laterMerges: [],
      },
      io
    );
    expect(decision.migrationWarnings).toHaveLength(2); // .SQL (case-insensitive) + schema.prisma
  });

  it('uses "unknown" conflict fallback when conflictPaths is empty (#6/#4)', async () => {
    const io = { revertDryRun: async () => ({ clean: false, conflictPaths: [] }) };
    const decision = await classifyRevert(
      {
        targetPr: 9,
        trigger: 'signal',
        mergeSha: 'abc',
        changedFiles: ['src/a.ts'],
        laterMerges: [],
      },
      io
    );
    expect(decision.action).toBe('skipped');
    expect(decision.reasons.join(' ')).toMatch(/conflicting paths unavailable|unknown/i);
  });
});
