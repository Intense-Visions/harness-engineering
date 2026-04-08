import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyViolation } from '../../constraints/types';
import { relativePosix } from '../../shared/fs-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub parser; real wiring deferred
function makeLayerStubParser(): any {
  return {
    name: 'typescript',
    extensions: ['.ts', '.tsx'],
    parseFile: async () => ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }),
    extractImports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }),
    extractExports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }),
    health: async () => ({ ok: true, value: { available: true } }),
  };
}

function mapLayerViolations(
  layerViolations: DependencyViolation[],
  rootDir: string,
  category: Violation['category']
): Violation[] {
  return layerViolations.map((v) => {
    const relFile = relativePosix(rootDir, v.file);
    const relImport = relativePosix(rootDir, v.imports);
    const detail = `${v.fromLayer} -> ${v.toLayer}: ${relFile} imports ${relImport}`;
    return { id: violationId(relFile, category ?? '', detail), file: relFile, category, detail, severity: 'error' as const };
  });
}

export class LayerViolationCollector implements Collector {
  readonly category = 'layer-violations' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'No layer boundary violations allowed';
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
    const result = await validateDependencies({
      layers: [],
      rootDir,
      parser: makeLayerStubParser(),
      fallbackBehavior: 'skip',
    });

    if (!result.ok) {
      return [{ category: this.category, scope: 'project', value: 0, violations: [], metadata: { error: 'Failed to validate dependencies' } }];
    }

    const violations = mapLayerViolations(
      result.value.violations.filter((v: DependencyViolation) => v.reason === 'WRONG_LAYER'),
      rootDir,
      this.category
    );

    return [{ category: this.category, scope: 'project', value: violations.length, violations }];
  }
}
