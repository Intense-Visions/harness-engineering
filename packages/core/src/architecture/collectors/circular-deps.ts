import { relative } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
import { violationId } from './hash';
import { buildDependencyGraph } from '../../constraints/dependencies';
import { detectCircularDeps } from '../../constraints/circular-deps';
import { findFiles } from '../../shared/fs-utils';

export class CircularDepsCollector implements Collector {
  readonly category = 'circular-deps' as const;

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const files = await findFiles('**/*.ts', rootDir);
    const graphResult = await buildDependencyGraph(files, {
      name: 'typescript',
      parseFile: async () =>
        ({ ok: false, error: { code: 'PARSE_ERROR', message: 'not needed' } }) as any,
      extractImports: () =>
        ({ ok: false, error: { code: 'EXTRACT_ERROR', message: 'not needed' } }) as any,
      health: async () => ({ ok: true, value: { available: true } }) as any,
    });

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
      const cyclePath = cycle.cycle.map((f) => relative(rootDir, f)).join(' -> ');
      const firstFile = relative(rootDir, cycle.cycle[0]!);
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
