import { describe, it, expect } from 'vitest';
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

/**
 * Regression for issue #1759: the dead-code detector resolved relative imports
 * but not tsconfig `paths` aliases, so any file reached only through an alias
 * import (e.g. `@lib/aliased`) was falsely reported dead.
 *
 * The fixture's entry point imports library modules via a relative path, a plain
 * `@lib/*` alias, and a nested `@lib/nested/deep` alias (whose wildcard capture
 * contains a `/`). All must be live. Snapshot file keys use the platform
 * separator (backslash on Windows), so every path comparison here normalizes to
 * `/` — the nested case in particular guards against the capture-vs-native
 * separator defect that only surfaces on Windows.
 */
describe('dead-code — tsconfig paths alias resolution (#1759)', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-alias-samples');

  /** Normalize to POSIX separators so assertions match on Windows too. */
  const toPosix = (p: string): string => p.replaceAll('\\', '/');

  async function buildAliasSnapshot() {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      entryPoints: ['src/main.ts'],
      include: ['src/**/*.ts'],
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) throw new Error('snapshot build failed');
    return snapshotResult.value;
  }

  it('marks alias-reached files (plain and nested) as reachable', async () => {
    const snapshot = await buildAliasSnapshot();
    const reachability = buildReachabilityMap(snapshot);

    const findBySuffix = (suffix: string) =>
      snapshot.files.find((f) => toPosix(f.path).endsWith(suffix));

    const aliasedFile = findBySuffix('lib/aliased.ts');
    const nestedFile = findBySuffix('lib/nested/deep.ts');
    const relativeFile = findBySuffix('lib/relative.ts');
    expect(aliasedFile).toBeDefined();
    expect(nestedFile).toBeDefined();
    expect(relativeFile).toBeDefined();

    // The relative import already resolves; the alias imports must too.
    expect(reachability.get(relativeFile!.path)).toBe(true);
    expect(reachability.get(aliasedFile!.path)).toBe(true);
    expect(reachability.get(nestedFile!.path)).toBe(true);
  });

  it('does not report alias-reached files or their exports as dead', async () => {
    const snapshot = await buildAliasSnapshot();
    const result = await detectDeadCode(snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deadFilePaths = result.value.deadFiles.map((f) => toPosix(f.path));
    expect(deadFilePaths.some((p) => p.endsWith('lib/aliased.ts'))).toBe(false);
    expect(deadFilePaths.some((p) => p.endsWith('lib/nested/deep.ts'))).toBe(false);

    const deadExportNames = result.value.deadExports.map((e) => e.name);
    expect(deadExportNames).not.toContain('reachedViaAlias');
    expect(deadExportNames).not.toContain('reachedViaNestedAlias');
  });
});
