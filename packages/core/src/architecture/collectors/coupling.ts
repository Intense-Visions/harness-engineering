import { relative } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
import { violationId } from './hash';
import { detectCouplingViolations } from '../../entropy/detectors/coupling';
import type { CodebaseSnapshot } from '../../entropy/types';
import { findFiles } from '../../shared/fs-utils';

export class CouplingCollector implements Collector {
  readonly category = 'coupling' as const;

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const files = await findFiles('**/*.ts', rootDir);
    const snapshot: CodebaseSnapshot = {
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

    const filtered = couplingViolations.filter(
      (v) => v.severity === 'error' || v.severity === 'warning'
    );

    const violations: Violation[] = filtered.map((v) => {
      const relFile = relative(rootDir, v.file);
      const detail = `${v.metric}=${v.value}`;
      return {
        id: violationId(relFile, this.category, detail),
        file: relFile,
        detail: `${v.metric}=${v.value} (threshold: ${v.threshold})`,
        severity: v.severity as 'error' | 'warning',
      };
    });

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
