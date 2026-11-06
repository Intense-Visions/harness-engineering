import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { buildDependencyGraph } from '../../constraints/dependencies';
import { detectCircularDeps } from '../../constraints/circular-deps';
import { findFiles, relativePosix } from '../../shared/fs-utils';
import { resolveExcludePatterns } from '../exclude';
import { getDefaultRegistry } from '../../shared/parsers/registry';

/**
 * Every JS/TS extension the default parser registry parses. Globbing only
 * `**\/*.ts` (the pre-#2235 behavior) left `.tsx`, `.mts`, `.cts`, `.js`,
 * `.jsx`, `.mjs` and `.cjs` out of the graph entirely, so a cycle through any of
 * them could never be seen. The import resolver in `buildDependencyGraph` only
 * follows relative JS/TS specifiers, so other registry languages are left out
 * rather than counted as nodes that can never carry an edge.
 */
const JS_TS_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

function mapCycleViolations(
  cycles: Array<{ cycle: string[]; severity: 'error' | 'warning' }>,
  rootDir: string,
  category: string
): Violation[] {
  return cycles.map((cycle) => {
    const cyclePath = cycle.cycle.map((f) => relativePosix(rootDir, f)).join(' -> ');
    const firstFile = relativePosix(rootDir, cycle.cycle[0]!);
    return {
      id: violationId(firstFile, category, cyclePath),
      file: firstFile,
      detail: `Circular dependency: ${cyclePath}`,
      severity: cycle.severity,
    };
  });
}

export class CircularDepsCollector implements Collector {
  readonly category = 'circular-deps' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'No circular dependencies allowed';
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
    const files = await findFiles(JS_TS_GLOB, rootDir, resolveExcludePatterns(config));
    // The real registry, not a stub: a parser that never parses yields a graph
    // with nodes and zero edges, where no cycle can exist (issue #2235).
    const graphResult = await buildDependencyGraph(files, getDefaultRegistry());

    if (!graphResult.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          // Carry the cause: once the graph build fails closed on an
          // unavailable parser (#2267) this is the only place check-arch can
          // say WHY the cycle measurement is missing.
          metadata: { error: `Failed to build dependency graph: ${graphResult.error.message}` },
        },
      ];
    }

    const result = detectCircularDeps(graphResult.value);
    if (!result.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to detect circular deps' },
        },
      ];
    }

    const { cycles, largestCycle } = result.value;
    const violations = mapCycleViolations(cycles, rootDir, this.category);
    return [
      {
        category: this.category,
        scope: 'project',
        value: cycles.length,
        violations,
        // filesAnalyzed / edgeCount are the denominator: a 0 over a graph with
        // no edges means "measured nothing", not "no cycles".
        metadata: {
          largestCycle,
          cycleCount: cycles.length,
          filesAnalyzed: graphResult.value.nodes.length,
          edgeCount: graphResult.value.edges.length,
        },
      },
    ];
  }
}
