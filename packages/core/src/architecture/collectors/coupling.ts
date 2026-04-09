import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { detectCouplingViolations } from '../../entropy/detectors/coupling';
import type { CodebaseSnapshot } from '../../entropy/types';
import { findFiles, relativePosix } from '../../shared/fs-utils';

function buildCouplingSnapshot(files: string[], rootDir: string): CodebaseSnapshot {
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

  async collect(_config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const files = await findFiles('**/*.ts', rootDir);
    const snapshot = buildCouplingSnapshot(files, rootDir);

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
        metadata: { filesAnalyzed: stats.filesAnalyzed },
      },
    ];
  }
}
