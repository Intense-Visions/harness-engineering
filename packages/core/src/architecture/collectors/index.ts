import type { Collector, ArchConfig, MetricResult } from '../types';
import { CircularDepsCollector } from './circular-deps';
import { LayerViolationCollector } from './layer-violations';
import { ComplexityCollector } from './complexity';
import { CouplingCollector } from './coupling';
import { ForbiddenImportCollector } from './forbidden-imports';
import { ModuleSizeCollector } from './module-size';
import { DepDepthCollector } from './dep-depth';
import { createCollectorRunContext } from './run-context';

export const defaultCollectors: Collector[] = [
  new CircularDepsCollector(),
  new LayerViolationCollector(),
  new ComplexityCollector(),
  new CouplingCollector(),
  new ForbiddenImportCollector(),
  new ModuleSizeCollector(),
  new DepDepthCollector(),
];

/**
 * Run all collectors in parallel and return a flat array of MetricResults.
 *
 * Every collector receives the same run-scoped context, so a file read by
 * several dependency collectors is parsed once per call rather than once per
 * collector (#2270). The context lives only as long as this call.
 */
export async function runAll(
  config: ArchConfig,
  rootDir: string,
  collectors: Collector[] = defaultCollectors
): Promise<MetricResult[]> {
  const context = createCollectorRunContext();
  const results = await Promise.allSettled(
    collectors.map((c) => c.collect(config, rootDir, context))
  );
  const allResults: MetricResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      allResults.push({
        category: collectors[i]!.category,
        scope: 'project',
        value: 0,
        violations: [],
        metadata: { error: String(result.reason) },
      });
    }
  }
  return allResults;
}

export { CircularDepsCollector } from './circular-deps';
export { LayerViolationCollector } from './layer-violations';
export { ComplexityCollector } from './complexity';
export { CouplingCollector } from './coupling';
export { ForbiddenImportCollector } from './forbidden-imports';
export { ModuleSizeCollector } from './module-size';
export { DepDepthCollector } from './dep-depth';
export { violationId, constraintRuleId } from './hash';
export type { CollectorRunContext } from './run-context';
