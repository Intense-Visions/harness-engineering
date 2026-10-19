import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyValidation, DependencyViolation, Layer } from '../../constraints/types';
import { relativePosix } from '../../shared/fs-utils';
import { getDefaultRegistry } from '../../shared/parsers/registry';
import { defineLayer } from '../../constraints/layers';
import { resolveExcludePatterns } from '../exclude';

function mapLayerViolations(
  layerViolations: DependencyViolation[],
  rootDir: string,
  category: Violation['category']
): Violation[] {
  return layerViolations.map((v) => {
    const relFile = relativePosix(rootDir, v.file);
    const relImport = relativePosix(rootDir, v.imports);
    const detail = `${v.fromLayer} -> ${v.toLayer}: ${relFile} imports ${relImport}`;
    return {
      id: violationId(relFile, category ?? '', detail),
      file: relFile,
      category,
      detail,
      severity: 'error' as const,
    };
  });
}

/**
 * The layer model from the top-level `layers` block of harness.config.json (the
 * one `check-deps` reads), which the CLI injects into the arch config.
 * Validating against `layers: []` resolved no file to a layer, so every edge was
 * skipped and the metric was 0 by construction (issue #2235).
 */
function configuredLayers(config: ArchConfig): Layer[] {
  return (config.layers ?? []).map((l) => defineLayer(l.name, [l.pattern], l.allowedDependencies));
}

/**
 * What the run actually measured. With no layers configured, or none matching a
 * file, a 0 is an abstention rather than a clean result, and this says so.
 */
function denominator(layersConfigured: number, validation: DependencyValidation) {
  return {
    layersConfigured,
    modulesAnalyzed: validation.graph.nodes.length,
    ...(validation.skipped ? { skipped: validation.reason ?? 'skipped' } : {}),
  };
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

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const layers = configuredLayers(config);
    const registry = getDefaultRegistry();
    const parser = registry.getByLanguage('typescript') ?? registry.getByLanguage('javascript');
    const result = await validateDependencies({
      layers,
      rootDir,
      parser: parser as import('../../shared/parsers').LanguageParser,
      fallbackBehavior: 'skip',
      extraIgnore: resolveExcludePatterns(config),
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

    const violations = mapLayerViolations(
      result.value.violations.filter((v: DependencyViolation) => v.reason === 'WRONG_LAYER'),
      rootDir,
      this.category
    );

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
        metadata: denominator(layers.length, result.value),
      },
    ];
  }
}
