import { describe, it, expect } from 'vitest';
import { buildReachabilityMap } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('buildReachabilityMap', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should mark entry points as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Entry point should be reachable
    const indexFile = snapshotResult.value.entryPoints[0];
    expect(reachability.get(indexFile)).toBe(true);
  });

  it('should mark transitively imported files as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Files imported from entry point should be reachable
    const usedFile = snapshotResult.value.files.find(f => f.path.includes('used.ts'));
    const helperFile = snapshotResult.value.files.find(f => f.path.includes('helper.ts'));

    expect(usedFile).toBeDefined();
    expect(helperFile).toBeDefined();
    expect(reachability.get(usedFile!.path)).toBe(true);
    expect(reachability.get(helperFile!.path)).toBe(true);
  });

  it('should mark orphan files as unreachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // unused.ts is not imported by anything
    const unusedFile = snapshotResult.value.files.find(f => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(reachability.get(unusedFile!.path)).toBe(false);
  });
});
