import { describe, it, expect } from 'vitest';
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code';
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
    const usedFile = snapshotResult.value.files.find((f) => f.path.includes('used.ts'));
    const helperFile = snapshotResult.value.files.find((f) => f.path.includes('helper.ts'));

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
    const unusedFile = snapshotResult.value.files.find((f) => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(reachability.get(unusedFile!.path)).toBe(false);
  });
});

describe('detectDeadCode', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should detect dead exports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unusedHelper in helper.ts is exported but never imported
      expect(result.value.deadExports.some((e) => e.name === 'unusedHelper')).toBe(true);

      // Functions in unused.ts are dead
      expect(result.value.deadExports.some((e) => e.name === 'unusedFunction')).toBe(true);
    }
  });

  it('should detect dead files', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unused.ts is a dead file
      expect(result.value.deadFiles.some((f) => f.path.includes('unused.ts'))).toBe(true);
    }
  });

  it('should detect unused imports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // with-unused-import.ts imports anotherHelper but doesn't use it
      const unusedImport = result.value.unusedImports.find((i) =>
        i.file.includes('with-unused-import.ts')
      );
      expect(unusedImport).toBeDefined();
      expect(unusedImport?.specifiers).toContain('anotherHelper');
    }
  });
});
