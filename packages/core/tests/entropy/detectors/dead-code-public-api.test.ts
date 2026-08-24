import { describe, it, expect } from 'vitest';
import { detectDeadCode } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import type { DeadCodeConfig } from '../../../src/entropy/types';
import { join } from 'path';

// Issue #1479: the dead-export detector had a blind spot for exported-but-unused
// public API. A symbol re-exported through the package barrel with zero non-test
// callers was not surfaced as a distinct finding — usage attribution credited the
// barrel's forwarding re-export instead of following it to the defining symbol.
//
// The detector now (a) follows re-export chains when attributing usage, and
// (b) classifies a public-surface export with no workspace callers as the
// advisory `PUBLIC_API_UNUSED` class (wire-or-deprecate, never delete), with an
// opt-out. It must NOT undo the #1409 test-import fix.
describe('detectDeadCode public-API blind spot (issue #1479)', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-public-api');

  async function report(deadCode: boolean | Partial<DeadCodeConfig> = true) {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode },
      include: ['src/**/*.ts'],
      // consumer.ts is a second entry point so its (reachable) import of
      // usedPublic through the barrel keeps that export live.
      entryPoints: ['src/index.ts', 'src/consumer.ts'],
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) throw new Error('snapshot failed');

    // The spec file is excluded from classified files but harvested as a
    // test-import source (the #1409 machinery).
    expect(snapshotResult.value.files.some((f) => f.path.includes('budget.spec.ts'))).toBe(false);
    expect(snapshotResult.value.testImports?.some((t) => t.path.includes('budget.spec.ts'))).toBe(
      true
    );

    const result = await detectDeadCode(snapshotResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('detect failed');
    return result.value;
  }

  it('flags a barrel-re-exported, uninvoked export as PUBLIC_API_UNUSED (not NO_IMPORTERS)', async () => {
    const value = await report();
    const finding = value.deadExports.find((e) => e.name === 'deadPublic');
    expect(finding, 'deadPublic must be surfaced').toBeDefined();
    expect(finding!.reason).toBe('PUBLIC_API_UNUSED');
  });

  it('does NOT flag a public export used through the barrel by a reachable consumer', async () => {
    const value = await report();
    // Re-export following: `import { usedPublic } from './index'` credits the
    // defining symbol, so it is live and never surfaced.
    expect(value.deadExports.some((e) => e.name === 'usedPublic')).toBe(false);
  });

  it('classifies a non-public dead export as deletable NO_IMPORTERS', async () => {
    const value = await report();
    const finding = value.deadExports.find((e) => e.name === 'internalDead');
    expect(finding, 'internalDead must be surfaced').toBeDefined();
    expect(finding!.reason).toBe('NO_IMPORTERS');
  });

  it('exempts a @public-annotated export from the PUBLIC_API_UNUSED finding', async () => {
    const value = await report();
    expect(value.deadExports.some((e) => e.name === 'annotatedPublic')).toBe(false);
  });

  it('preserves the #1409 test-import fix: a test-only public export is live, not flagged', async () => {
    const value = await report();
    expect(value.deadExports.some((e) => e.name === 'testOnlyPublic')).toBe(false);
  });

  it('honors the publicApiAllowlist opt-out for an otherwise-flagged export', async () => {
    const value = await report({ publicApiAllowlist: ['deadPublic'] });
    expect(value.deadExports.some((e) => e.name === 'deadPublic')).toBe(false);
    // The allowlist is surgical: the non-listed public dead export is unaffected.
    const finding = value.deadExports.find((e) => e.name === 'internalDead');
    expect(finding?.reason).toBe('NO_IMPORTERS');
  });
});
