import { readFile } from 'node:fs/promises';
import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { detectCouplingViolations } from '../../entropy/detectors/coupling';
import { parseSourceFiles, buildExportMap } from '../../entropy/snapshot';
import type { CodebaseSnapshot } from '../../entropy/types';
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type { EntropyError } from '../../shared/errors';
import { buildDependencyGraphFromParsed } from '../../constraints/dependencies';
import { findFiles, relativePosix } from '../../shared/fs-utils';
import { getDefaultRegistry } from '../../shared/parsers/registry';
import { resolveExcludePatterns } from '../exclude';

/**
 * Lexical twin of what `TypeScriptParser.extractImports` counts: a static
 * `import` declaration (value, `type`, or side-effect) at the start of a line,
 * and a dynamic `import('literal')`. Deliberately NOT `export ... from`,
 * `require(...)` or `import x = require(...)` — the parser does not count
 * those, so counting them here would make a pure re-export barrel or a
 * declaration-only package look like a hollow parse and abstain falsely.
 */
const STATIC_IMPORT = /^[ \t]*import\s*(?:type\s+)?(?:[\w$*{][^;'"]*?\bfrom\s*)?['"]/gm;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]/g;

/**
 * Count import statements in the analysed files by text, independently of the
 * parser. Only called when the parse produced zero import edges, so the normal
 * path pays nothing for it.
 *
 * It exists because `importEdges: 0` alone is ambiguous: a declaration-only or
 * import-free package really has no import edges (measured: a `.d.ts`-only
 * fixture, a re-export barrel and a types-only `.ts` package all report
 * `importEdges: 0` over real files), while a hollow parse (#2284, or
 * `extractImports` failing and `parseSourceFiles` substituting `[]`) also
 * reports 0. The text tells them apart: no import syntax means nothing to
 * couple; import syntax with no parsed edges means the parse came back empty.
 * A file that cannot be read contributes 0 — it cannot corroborate anything.
 */
async function countImportStatements(paths: string[]): Promise<number> {
  let count = 0;
  for (const p of paths) {
    let text: string;
    try {
      text = await readFile(p, 'utf-8');
    } catch {
      continue;
    }
    count += (text.match(STATIC_IMPORT)?.length ?? 0) + (text.match(DYNAMIC_IMPORT)?.length ?? 0);
  }
  return count;
}

/**
 * Test files stay out of the coupling measurement.
 *
 * The entropy snapshot documents the same intent on `TestImportSource`: the
 * classification detectors (dead-file, pattern, complexity, coupling) must never
 * flag test code. A test file legitimately imports a dozen helpers plus its
 * subject, so counting it as fan-out measures the test convention, not the
 * production graph.
 */
const TEST_FILE_EXCLUDES = ['**/*.test.ts', '**/*.spec.ts'] as const;

/**
 * Build the snapshot the coupling detector actually needs.
 *
 * This used to hand `detectCouplingViolations` a structurally empty shell —
 * `imports: []`, `exports: []`, an empty `dependencyGraph` — laundered past the
 * type checker with `as unknown as CodebaseSnapshot`. The detector derives
 * `fanOut` from `file.imports.length` and `fanIn` from the same edges, so every
 * metric came out 0, every `value <= threshold` check passed, and the collector
 * could not emit a violation under any input. `filesAnalyzed` was honest the
 * whole time, which is exactly why #2238's abstention channel read the result as
 * `measured`: the gate reported, with a real denominator, that it had measured
 * coupling and found none (#2284).
 *
 * The imports and exports now come from `parseSourceFiles` — the same parse loop
 * `buildSnapshot` uses, extracted rather than duplicated — and the dependency
 * graph from `buildDependencyGraphFromParsed`, which is the edge-construction
 * half of the `buildDependencyGraph` the circular-deps collector calls.
 * `buildSnapshot` itself is deliberately NOT called: it resolves entry points
 * first and fails closed with `ENTRY_POINT_NOT_FOUND` on any repo without a
 * manifest entry point (this monorepo's own root included), and an architecture
 * gate that runs in `pre-commit` must not abstain over a field coupling never
 * reads.
 *
 * `docs`, `codeReferences` and `entryPoints` are empty because the coupling
 * detector consumes none of them — empty is the truthful value here, not a
 * stand-in, and the result satisfies `CodebaseSnapshot` without a cast.
 */
async function buildCouplingSnapshot(
  files: string[],
  rootDir: string
): Promise<Result<CodebaseSnapshot, EntropyError>> {
  const registry = getDefaultRegistry();
  const parsed = await parseSourceFiles(files, (f) => registry.getForFile(f));
  if (!parsed.ok) return parsed;
  const sourceFiles = parsed.value;
  // From the ALREADY-parsed files: `buildDependencyGraph` would re-parse the
  // whole tree, doubling the cost of a gate that runs in `.husky/pre-commit`.
  const dependencyGraph = await buildDependencyGraphFromParsed(files, sourceFiles);

  return Ok({
    files: sourceFiles,
    dependencyGraph,
    exportMap: buildExportMap(sourceFiles),
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir,
    config: { rootDir, analyze: { coupling: true } },
    buildTime: 0,
  });
}

function mapCouplingViolations(
  couplingViolations: Array<{
    severity: string;
    file: string;
    metric: string;
    value: number;
    threshold: number;
  }>,
  rootDir: string,
  category: Violation['category']
): Violation[] {
  return couplingViolations
    .filter((v) => v.severity === 'error' || v.severity === 'warning')
    .map((v) => {
      const relFile = relativePosix(rootDir, v.file);
      return {
        id: violationId(relFile, category ?? '', v.metric),
        file: relFile,
        category,
        detail: `${v.metric}=${v.value} (threshold: ${v.threshold})`,
        severity: v.severity as 'error' | 'warning',
      };
    });
}

export class CouplingCollector implements Collector {
  readonly category = 'coupling' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'Coupling metrics must stay within thresholds';
    return [
      {
        id: constraintRuleId(this.category, 'project', description),
        category: this.category,
        description,
        scope: 'project',
      },
    ];
  }

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const files = await findFiles('**/*.ts', rootDir, [
      ...TEST_FILE_EXCLUDES,
      ...resolveExcludePatterns(config),
    ]);
    const snapshotResult = await buildCouplingSnapshot(files, rootDir);
    if (!snapshotResult.ok) {
      // The parser could not run (#2267). Abstain with the cause rather than
      // measure an empty file set as zero coupling.
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: snapshotResult.error.message },
        },
      ];
    }
    const snapshot = snapshotResult.value;

    const result = await detectCouplingViolations(snapshot);
    if (!result.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to detect coupling violations' },
        },
      ];
    }

    const { violations: couplingViolations, stats } = result.value;
    const violations = mapCouplingViolations(couplingViolations, rootDir, this.category);
    const importEdges = snapshot.files.reduce((n, f) => n + f.imports.length, 0);

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
        // `importEdges` is the denominator `filesAnalyzed` could not supply:
        // every coupling metric is derived from import edges (#2284). A 0 is
        // ambiguous on its own — an import-free package has none either — so
        // when it is 0 the collector also reports `importStatements`, the
        // lexical count of import syntax in the same files. The CLI abstains
        // only when that count is non-zero: imports were written but none were
        // parsed (#2304).
        metadata: {
          filesAnalyzed: stats.filesAnalyzed,
          importEdges,
          ...(importEdges === 0
            ? { importStatements: await countImportStatements(snapshot.files.map((f) => f.path)) }
            : {}),
        },
      },
    ];
  }
}
