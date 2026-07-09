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
});
