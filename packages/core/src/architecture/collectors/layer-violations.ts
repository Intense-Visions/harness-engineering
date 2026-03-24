import { relative } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyViolation } from '../../constraints/types';

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
    // LayerViolationCollector requires layer config to be passed through ArchConfig.
    // For now, use an empty layer set — the real layer config will come from harness.config.json
    // wiring in Phase 4 (config schema). This collector is invoked with the right LayerConfig
    // at that point.
    const result = await validateDependencies({
      layers: [],
      rootDir,
      parser: {
        name: 'typescript',
        extensions: ['.ts', '.tsx'],
        parseFile: async () => ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }) as any,
        extractImports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
        extractExports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
        health: async () => ({ ok: true, value: { available: true } }) as any,
      },
      fallbackBehavior: 'skip',
    });

    if (!result.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to validate dependencies' },
        },
      ];
    }

    const layerViolations = result.value.violations.filter(
      (v: DependencyViolation) => v.reason === 'WRONG_LAYER'
    );

    const violations: Violation[] = layerViolations.map((v: DependencyViolation) => {
      const relFile = relative(rootDir, v.file);
      const relImport = relative(rootDir, v.imports);
      const detail = `${v.fromLayer} -> ${v.toLayer}: ${relFile} imports ${relImport}`;
      return {
        id: violationId(relFile, this.category, detail),
        file: relFile,
        detail,
        severity: 'error' as const,
      };
    });

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
      },
    ];
  }
}
