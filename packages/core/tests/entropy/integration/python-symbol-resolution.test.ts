import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { EntropyAnalyzer } from '../../../src/entropy';

const fixturesRoot = join(__dirname, '../../fixtures/entropy');

// Regression coverage for issue #723 defect #2: the Python export extractor
// only walked top-level `function_definition` / bare `assignment` children, so
// decorated classes (`@dataclass`), class-body members (dataclass fields, enum
// members, methods) and top-level constants were never registered as exports.
// Docs referencing those real symbols were then flagged as api-signature drift.
describe('Python symbol resolution — issue #723 defect #2', () => {
  const root = join(fixturesRoot, 'python-symbol-resolution');
  const config = {
    rootDir: root,
    analyze: { drift: true },
    include: ['**/*.py'],
    exclude: ['node_modules/**'],
    docPaths: ['docs/**/*.md'],
  } as const;

  it('registers decorated classes, class members, and top-level constants as exports', async () => {
    const result = await buildSnapshot(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exportNames = Array.from(result.value.exportMap.byName.keys());

    // Decorated (@dataclass) class — previously missed because its module child
    // is a `decorated_definition`, not a `class_definition`.
    expect(exportNames).toContain('CompanyKnowledge');
    // Dataclass fields (class-body annotated assignments).
    expect(exportNames).toContain('dashboard_url');
    expect(exportNames).toContain('dashboard_token_env');
    // Public method inside the class body.
    expect(exportNames).toContain('refresh');
    // Top-level constant (module child is `expression_statement` > `assignment`).
    expect(exportNames).toContain('TIMEOUT_SECONDS');
    // Enum class and its member names.
    expect(exportNames).toContain('SuiteType');
    expect(exportNames).toContain('E2E_UI');
    expect(exportNames).toContain('PERFORMANCE');

    // Underscore-prefixed members remain private (not exported).
    expect(exportNames).not.toContain('_private_cache');
  });

  it('does not flag documented real symbols as drift, but still flags removed ones', async () => {
    const analyzer = new EntropyAnalyzer(config);
    const result = await analyzer.analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const driftRefs = (result.value.drift?.drifts ?? []).map((d) => d.reference);

    // Genuinely-removed symbol must still be reported.
    expect(driftRefs).toContain('ghost_symbol');

    // Real symbols must NOT be reported as drift.
    for (const symbol of [
      'CompanyKnowledge',
      'dashboard_url',
      'dashboard_token_env',
      'refresh',
      'TIMEOUT_SECONDS',
      'SuiteType',
      'E2E_UI',
      'PERFORMANCE',
    ]) {
      expect(driftRefs).not.toContain(symbol);
    }
  });
});
