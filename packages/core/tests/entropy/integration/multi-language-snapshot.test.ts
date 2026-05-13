import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { EntropyAnalyzer } from '../../../src/entropy';

const fixturesRoot = join(__dirname, '../../fixtures/entropy');

describe('buildSnapshot — multi-language source parsing', () => {
  it('parses Python source and registers top-level exports', async () => {
    const root = join(fixturesRoot, 'python-drift-sample');
    const result = await buildSnapshot({
      rootDir: root,
      analyze: { drift: true },
      include: ['**/*.py'],
      exclude: ['node_modules/**'],
      docPaths: ['docs/**/*.md'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exportNames = Array.from(result.value.exportMap.byName.keys());
    expect(exportNames).toContain('my_function');
    expect(exportNames).toContain('MyClass');

    const apiFile = result.value.files.find((f) => f.path.endsWith('api.py'));
    expect(apiFile).toBeDefined();
    expect(apiFile?.ast.language).toBe('python');
  });

  it('lets EntropyAnalyzer flag drift against Python source exports', async () => {
    const root = join(fixturesRoot, 'python-drift-sample');
    const analyzer = new EntropyAnalyzer({
      rootDir: root,
      analyze: { drift: true },
      include: ['**/*.py'],
      exclude: ['node_modules/**'],
      docPaths: ['docs/**/*.md'],
    });

    const result = await analyzer.analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const driftRefs = (result.value.drift?.drifts ?? []).map((d) => d.reference);
    // Drifts are reported for references that don't resolve to an export.
    // `missing_function` is referenced in docs but absent in source.
    expect(driftRefs).toContain('missing_function');
    // `my_function` and `MyClass` resolve to exports — must NOT appear as drift.
    expect(driftRefs).not.toContain('my_function');
    expect(driftRefs).not.toContain('MyClass');
  });

  it('uses default include patterns that pick up non-TS source', async () => {
    const root = join(fixturesRoot, 'python-drift-sample');
    const result = await buildSnapshot({
      rootDir: root,
      analyze: { drift: true },
      docPaths: ['docs/**/*.md'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.some((f) => f.path.endsWith('.py'))).toBe(true);
  });
});
