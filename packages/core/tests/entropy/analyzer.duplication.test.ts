import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import { TypeScriptParser } from '../../src/shared/parsers';

const PLANTED = join(__dirname, '../fixtures/duplication/planted-clones');

/**
 * `buildSnapshot` returns `Err ENTRY_POINT_NOT_FOUND` over this fixture
 * without explicit entry points — it has no `src/index.ts` (planning decision
 * P9). Measured, not guessed.
 */
const ENTRY_POINTS = ['src/alpha.ts'];

function analyzerFor(analyze: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return new EntropyAnalyzer({
    rootDir: PLANTED,
    parser: new TypeScriptParser(),
    entryPoints: ENTRY_POINTS,
    include: ['src/**/*.ts'],
    analyze,
    ...extra,
  } as never);
}

function memberSets(classes: { members: { file: string }[] }[]): string[] {
  return classes
    .map((c) =>
      c.members
        .map((m) => m.file)
        .sort()
        .join(',')
    )
    .sort();
}

const CLASS_A = 'src/alpha.ts,src/beta.ts,src/gamma.ts';
const CLASS_D = 'src/generated/gen-a.ts,src/generated/gen-b.ts,src/generated/gen-c.ts';

describe('EntropyAnalyzer duplication wiring', () => {
  it('publishes EntropyReport.duplication when analyze.duplication is an object config', async () => {
    const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplication).toBeDefined();
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A, CLASS_D].sort());
    expect(result.value.analysisErrors).toEqual([]);
  });

  it('runs with `duplication: true` at the shipped defaults', async () => {
    const result = await analyzerFor({ duplication: true }).analyze();
    if (!result.ok) throw new Error('expected ok');
    // The defaults ignore `**/generated/**`, so Class D is filtered and only
    // Class A survives. The two filters compose; neither is the other.
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
  });

  it('drops a class when EntropyConfig.exclude removes its files (criterion 15)', async () => {
    // The duplication filter is EMPTY here, so the only thing that can drop
    // Class D is `EntropyConfig.exclude` — i.e. discovery is driven solely by
    // include/exclude, and no path in the detector assumes a layout.
    const result = await analyzerFor(
      { duplication: { ignorePatterns: [] } },
      { exclude: ['**/generated/**'] }
    ).analyze();
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
    expect(result.value.snapshot.files).toHaveLength(9);
  });
});
