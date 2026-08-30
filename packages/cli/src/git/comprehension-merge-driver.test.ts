import { describe, it, expect } from 'vitest';
import {
  moduleFromShardPath,
  runComprehensionMergeDriver,
  type MergeDriverIO,
} from './comprehension-merge-driver';
import {
  compileModule,
  serializeUnit,
  type ComprehensionSourceFile,
  type ExtractStatic,
  type GenerateSemantic,
} from '@harness-engineering/core';

const MODULE = 'pkg/a';
const SRC: ComprehensionSourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];
const SHARD = `.harness/comprehension/${MODULE}/_module.md`;
const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});
const withSemantic: GenerateSemantic = () => ({
  summary: 'Manages the thing.',
  invariants: ['must stay sorted'],
  model: 'test',
});

/** Serialize a shard for MODULE compiled from `files` (semantic when `gen` given). */
async function shardFor(files: ComprehensionSourceFile[], gen?: GenerateSemantic): Promise<string> {
  const unit = await compileModule(MODULE, files, {
    extractStatic,
    ...(gen ? { generateSemantic: gen } : {}),
  });
  return serializeUnit(unit);
}

function io(overrides: Partial<MergeDriverIO> = {}): { io: MergeDriverIO; written: string[] } {
  const written: string[] = [];
  return {
    written,
    io: {
      readOursShard: () => null,
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
  it('returns null for a non-shard or module-less path', () => {
    expect(moduleFromShardPath('packages/core/src/pricing/index.ts')).toBeNull();
    expect(moduleFromShardPath('.harness/comprehension/_module.md')).toBeNull();
  });
});

describe('runComprehensionMergeDriver', () => {
  it('KEEPS ours when it is source-fresh — preserving its semantic, no write', async () => {
    const oursSemantic = await shardFor(SRC, withSemantic); // fresh + semantic:present
    const { io: deps, written } = io({ readOursShard: () => oursSemantic });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res).toEqual({ resolved: true, kept: 'ours' });
    expect(written).toHaveLength(0); // ours kept verbatim ⇒ semantic content survives
  });

  it('RECOMPILES static when ours is source-stale (hash mismatch)', async () => {
    // Ours was compiled from DIFFERENT source ⇒ its sourceHash won't match SRC.
    const oursStale = await shardFor(
      [{ path: 'a.ts', content: 'export const a = 999;' }],
      withSemantic
    );
    const { io: deps, written } = io({ readOursShard: () => oursStale });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res).toEqual({ resolved: true, kept: 'recompiled-static' });
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('semantic: absent'); // static-only fallback
  });

  it('RECOMPILES static when ours is missing', async () => {
    const { io: deps, written } = io({ readOursShard: () => null });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res).toEqual({ resolved: true, kept: 'recompiled-static' });
    expect(written).toHaveLength(1);
  });

  it('RECOMPILES static when ours is unparseable', async () => {
    const { io: deps, written } = io({ readOursShard: () => 'not a shard at all' });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res).toEqual({ resolved: true, kept: 'recompiled-static' });
    expect(written).toHaveLength(1);
  });

  it('falls back to ours (no write) for a non-shard path', async () => {
    const { io: deps, written } = io();
    const res = await runComprehensionMergeDriver('src/index.ts', deps);
    expect(res).toEqual({ resolved: false, reason: 'not a comprehension shard path' });
    expect(written).toHaveLength(0);
  });

  it('falls back to ours when the module has no source', async () => {
    const { io: deps, written } = io({ readModuleSource: async () => null });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res.resolved).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('never throws — a reader error falls back to ours', async () => {
    const { io: deps, written } = io({
      readModuleSource: async () => {
        throw new Error('git exploded');
      },
    });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res.resolved).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('never throws — a readOursShard error still resolves (recompiles)', async () => {
    const { io: deps, written } = io({
      readOursShard: () => {
        throw new Error('temp file gone');
      },
    });
    const res = await runComprehensionMergeDriver(SHARD, deps);
    expect(res).toEqual({ resolved: true, kept: 'recompiled-static' });
    expect(written).toHaveLength(1);
  });
});
