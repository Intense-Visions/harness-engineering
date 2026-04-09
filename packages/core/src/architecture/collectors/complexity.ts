import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { detectComplexityViolations } from '../../entropy/detectors/complexity';
import type { CodebaseSnapshot } from '../../entropy/types';
import { findFiles, relativePosix } from '../../shared/fs-utils';

function buildSnapshot(files: string[], rootDir: string): CodebaseSnapshot {
  return {
    files: files.map((f) => ({
      path: f,
      ast: { type: 'Program', body: null, language: 'typescript' },
      imports: [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir,
    config: { rootDir, analyze: {} },
    buildTime: 0,
  } as unknown as CodebaseSnapshot;
}

function resolveMaxComplexity(config: ArchConfig): number {
  const threshold = config.thresholds.complexity;
  return typeof threshold === 'number'
    ? threshold
    : ((threshold as Record<string, number>)?.max ?? 15);
}

function mapComplexityViolations(
  complexityViolations: Array<{
    severity: string;
    file: string;
    metric: string;
    function: string;
    value: number;
    threshold: number;
  }>,
  rootDir: string,
  category: Violation['category']
): Violation[] {
  return complexityViolations
    .filter((v) => v.severity === 'error' || v.severity === 'warning')
    .map((v) => {
      const relFile = relativePosix(rootDir, v.file);
      return {
        id: violationId(relFile, category ?? '', `${v.metric}:${v.function}`),
        file: relFile,
        category,
        detail: `${v.metric}=${v.value} in ${v.function} (threshold: ${v.threshold})`,
        severity: v.severity as 'error' | 'warning',
      };
    });
}

export class ComplexityCollector implements Collector {
  readonly category = 'complexity' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'Cyclomatic complexity must stay within thresholds';
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
    const snapshot = buildSnapshot(files, rootDir);
    const maxComplexity = resolveMaxComplexity(_config);
    const complexityConfig = {
      thresholds: {
        cyclomaticComplexity: { error: maxComplexity, warn: Math.floor(maxComplexity * 0.7) },
      },
    };

    const result = await detectComplexityViolations(snapshot, complexityConfig);
    if (!result.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to detect complexity violations' },
        },
      ];
    }

    const { violations: complexityViolations, stats } = result.value;
    const violations = mapComplexityViolations(complexityViolations, rootDir, this.category);

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
        metadata: {
          filesAnalyzed: stats.filesAnalyzed,
          functionsAnalyzed: stats.functionsAnalyzed,
        },
      },
    ];
  }
}
