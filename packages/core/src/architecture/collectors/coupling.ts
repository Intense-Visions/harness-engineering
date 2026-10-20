import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { detectCouplingViolations } from '../../entropy/detectors/coupling';
import { parseSourceFiles, buildExportMap } from '../../entropy/snapshot';
import type { CodebaseSnapshot } from '../../entropy/types';
import { buildDependencyGraphFromParsed } from '../../constraints/dependencies';
import { findFiles, relativePosix } from '../../shared/fs-utils';
import { getDefaultRegistry } from '../../shared/parsers/registry';
import { resolveExcludePatterns } from '../exclude';

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
async function buildCouplingSnapshot(files: string[], rootDir: string): Promise<CodebaseSnapshot> {
  const registry = getDefaultRegistry();
  const sourceFiles = await parseSourceFiles(files, (f) => registry.getForFile(f));
  // From the ALREADY-parsed files: `buildDependencyGraph` would re-parse the
  // whole tree, doubling the cost of a gate that runs in `.husky/pre-commit`.
  const dependencyGraph = await buildDependencyGraphFromParsed(files, sourceFiles);

  return {
    files: sourceFiles,
    dependencyGraph,
    exportMap: buildExportMap(sourceFiles),
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir,
    config: { rootDir, analyze: { coupling: true } },
    buildTime: 0,
  };
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
    const snapshot = await buildCouplingSnapshot(files, rootDir);

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

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
        // `importEdges` is the denominator `filesAnalyzed` could not supply:
        // every coupling metric is derived from import edges, so a 0 here means
        // the snapshot carried none and the `value: 0` above is "never looked",
        // not "no coupling" (#2284). Reported, not yet enforced — the CLI's
        // `WORK_DENOMINATORS` does not include it.
        metadata: {
          filesAnalyzed: stats.filesAnalyzed,
          importEdges: snapshot.files.reduce((n, f) => n + f.imports.length, 0),
        },
      },
    ];
  }
}
