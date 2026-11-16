import { describe, it, expect } from 'vitest';
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

/**
 * Regression for issue #2189 (D2): the dead-code detector resolved relative
 * specifiers and tsconfig `paths` aliases but dropped every bare specifier, so
 * in a monorepo a symbol exported by one workspace package and imported by
 * another BY PACKAGE NAME (`@probe/lib`, `@probe/lib/util`) was reported dead.
 *
 * The fixture is a two-package pnpm workspace. `@probe/lib` declares its
 * exports against `dist/`, so resolution must also map build output back to
 * `src/`. `@probe/app` (the entry point) imports one symbol relatively, one via
 * the package root and one via a subpath export, plus the external `zod`.
 * Snapshot keys use the platform separator, so paths compare as POSIX.
 */
describe('dead-code — workspace package specifier resolution (#2189)', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-workspace-samples');
  const toPosix = (p: string): string => p.replaceAll('\\', '/');

  async function buildWorkspaceSnapshot() {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      entryPoints: ['packages/app/src/main.ts'],
      include: ['packages/*/src/**/*.ts'],
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) throw new Error('snapshot build failed');
    return snapshotResult.value;
  }

  it('reaches files imported only by workspace package name (root and subpath)', async () => {
    const snapshot = await buildWorkspaceSnapshot();
    const reachability = buildReachabilityMap(snapshot);
    const util = snapshot.files.find((f) => toPosix(f.path).endsWith('lib/src/util.ts'));
    expect(util).toBeDefined();
    expect(reachability.get(util!.path)).toBe(true);
  });

  it('credits exports imported by package name and still reports the unimported ones', async () => {
    const snapshot = await buildWorkspaceSnapshot();
    const result = await detectDeadCode(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dead = result.value.deadExports.map((e) => e.name).sort();
    // Live: imported relatively (control), by package root, by subpath export.
    expect(dead).not.toContain('usedByRelative');
    expect(dead).not.toContain('usedByBare');
    expect(dead).not.toContain('usedBySubpath');
    // Positive control: nothing imports these, so they stay dead.
    expect(dead).toEqual(['neverImported', 'utilNeverImported']);

    const deadFiles = result.value.deadFiles.map((f) => toPosix(f.path));
    expect(deadFiles.some((p) => p.endsWith('lib/src/util.ts'))).toBe(false);
  });

  it('leaves an external (non-workspace) package unresolved', async () => {
    const snapshot = await buildWorkspaceSnapshot();
    const specifiers = snapshot.workspaceSpecifiers ?? {};
    expect(Object.keys(specifiers).sort()).toEqual(['@probe/lib', '@probe/lib/util']);
    expect(specifiers).not.toHaveProperty('zod');
    expect(toPosix(specifiers['@probe/lib']!)).toMatch(/packages\/lib\/src\/index\.ts$/);
    expect(toPosix(specifiers['@probe/lib/util']!)).toMatch(/packages\/lib\/src\/util\.ts$/);
  });
});
