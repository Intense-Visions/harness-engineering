import type { Collector, ArchConfig, MetricResult } from '../types';
import { CircularDepsCollector } from './circular-deps';
import { LayerViolationCollector } from './layer-violations';
import { ComplexityCollector } from './complexity';
import { CouplingCollector } from './coupling';
import { ForbiddenImportCollector } from './forbidden-imports';
import { ModuleSizeCollector } from './module-size';
import { DepDepthCollector } from './dep-depth';

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
 */
export async function runAll(
  config: ArchConfig,
  rootDir: string,
  collectors: Collector[] = defaultCollectors
): Promise<MetricResult[]> {
  const promises = collectors.map((c) => c.collect(config, rootDir));
  const nested = await Promise.all(promises);
  return nested.flat();
}

export { CircularDepsCollector } from './circular-deps';
export { LayerViolationCollector } from './layer-violations';
export { ComplexityCollector } from './complexity';
export { CouplingCollector } from './coupling';
export { ForbiddenImportCollector } from './forbidden-imports';
export { ModuleSizeCollector } from './module-size';
export { DepDepthCollector } from './dep-depth';
export { violationId } from './hash';
