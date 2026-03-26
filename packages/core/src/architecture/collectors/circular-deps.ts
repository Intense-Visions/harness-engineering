import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { buildDependencyGraph } from '../../constraints/dependencies';
import { detectCircularDeps } from '../../constraints/circular-deps';
import { findFiles, relativePosix } from '../../shared/fs-utils';

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

  async collect(_config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const files = await findFiles('**/*.ts', rootDir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub parser; real wiring in Phase 4
    const stubParser: any = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parseFile: async () => ({ ok: false, error: { code: 'PARSE_ERROR', message: 'not needed' } }),
      extractImports: () => ({
        ok: false,
        error: { code: 'EXTRACT_ERROR', message: 'not needed' },
      }),
      extractExports: () => ({
        ok: false,
        error: { code: 'EXTRACT_ERROR', message: 'not needed' },
      }),
      health: async () => ({ ok: true, value: { available: true } }),
    };
    const graphResult = await buildDependencyGraph(files, stubParser);

    if (!graphResult.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to build dependency graph' },
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
    const violations: Violation[] = cycles.map((cycle) => {
      const cyclePath = cycle.cycle.map((f) => relativePosix(rootDir, f)).join(' -> ');
      const firstFile = relativePosix(rootDir, cycle.cycle[0]!);
      return {
        id: violationId(firstFile, this.category, cyclePath),
        file: firstFile,
        detail: `Circular dependency: ${cyclePath}`,
        severity: cycle.severity,
      };
    });

    return [
      {
        category: this.category,
        scope: 'project',
        value: cycles.length,
        violations,
        metadata: { largestCycle, cycleCount: cycles.length },
      },
    ];
  }
}
