import { describe, it, expect } from 'vitest';
import {
  moduleFromShardPath,
  runComprehensionMergeDriver,
  type MergeDriverIO,
} from './comprehension-merge-driver';
import type { ComprehensionSourceFile, ExtractStatic } from '@harness-engineering/core';

const SRC: ComprehensionSourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];
const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});

function io(overrides: Partial<MergeDriverIO> = {}): { io: MergeDriverIO; written: string[] } {
  const written: string[] = [];
  return {
    written,
    io: {
      readModuleSource: async () => SRC,
      makeExtractStatic: () => extractStatic,
      writeOurs: (content) => written.push(content),
      ...overrides,
    },
  };
}

describe('moduleFromShardPath', () => {
  it('derives the module directory from a shard path', () => {
    expect(moduleFromShardPath('.harness/comprehension/packages/core/src/pricing/_module.md')).toBe(
      'packages/core/src/pricing'
    );
  });

  it('normalizes backslashes', () => {
    expect(moduleFromShardPath('.harness\\comprehension\\pkg\\a\\_module.md')).toBe('pkg/a');
  });

  it('returns null for a non-shard path', () => {
    expect(moduleFromShardPath('packages/core/src/pricing/index.ts')).toBeNull();
    expect(moduleFromShardPath('.harness/comprehension/_module.md')).toBeNull(); // no module segment
  });
});

describe('runComprehensionMergeDriver', () => {
  it('regenerates the shard from source and writes it to the ours path', async () => {
    const { io: deps, written } = io();
    const res = await runComprehensionMergeDriver(
      { oursPath: '/tmp/ours', shardPath: '.harness/comprehension/pkg/a/_module.md' },
      deps
    );
    expect(res.resolved).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('module: "pkg/a"'); // serializeUnit emits double quotes
    expect(written[0]).toContain('semantic: absent'); // static-only at merge time
  });

  it('falls back to ours (no write) for a non-shard path', async () => {
    const { io: deps, written } = io();
    const res = await runComprehensionMergeDriver(
      { oursPath: '/tmp/ours', shardPath: 'src/index.ts' },
      deps
    );
    expect(res.resolved).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('falls back to ours when the module has no source', async () => {
    const { io: deps, written } = io({ readModuleSource: async () => null });
    const res = await runComprehensionMergeDriver(
      { oursPath: '/tmp/ours', shardPath: '.harness/comprehension/pkg/gone/_module.md' },
      deps
    );
    expect(res.resolved).toBe(false);
    expect(res.reason).toMatch(/no source/);
    expect(written).toHaveLength(0);
  });

  it('never throws — a reader error falls back to ours', async () => {
    const { io: deps, written } = io({
      readModuleSource: async () => {
        throw new Error('git exploded');
      },
    });
    const res = await runComprehensionMergeDriver(
      { oursPath: '/tmp/ours', shardPath: '.harness/comprehension/pkg/a/_module.md' },
      deps
    );
    expect(res.resolved).toBe(false);
    expect(written).toHaveLength(0);
  });
});
