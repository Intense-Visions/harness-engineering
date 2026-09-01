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
 * The fixture's entry point imports one library module via a relative path and
 * an equivalent module via a `@lib/*` alias. Both must be live.
 */
describe('dead-code — tsconfig paths alias resolution (#1759)', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-alias-samples');

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

  it('marks an alias-reached file as reachable', async () => {
    const snapshot = await buildAliasSnapshot();
    const reachability = buildReachabilityMap(snapshot);

    const aliasedFile = snapshot.files.find((f) => f.path.includes('lib/aliased.ts'));
    const relativeFile = snapshot.files.find((f) => f.path.includes('lib/relative.ts'));
    expect(aliasedFile).toBeDefined();
    expect(relativeFile).toBeDefined();

    // The relative import already resolves; the alias import must too.
    expect(reachability.get(relativeFile!.path)).toBe(true);
    expect(reachability.get(aliasedFile!.path)).toBe(true);
  });

  it('does not report an alias-reached file or its export as dead', async () => {
    const snapshot = await buildAliasSnapshot();
    const result = await detectDeadCode(snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deadFiles.some((f) => f.path.includes('lib/aliased.ts'))).toBe(false);
    expect(result.value.deadExports.some((e) => e.name === 'reachedViaAlias')).toBe(false);
  });
});
