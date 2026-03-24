import { ArchConfigSchema } from './types';
import type { ArchConfig, MetricResult, Violation, ArchDiffResult } from './types';
import { CircularDepsCollector } from './collectors/circular-deps';
import { LayerViolationCollector } from './collectors/layer-violations';
import { ArchBaselineManager } from './baseline-manager';
import { diff } from './diff';
import { runAll } from './collectors/index';

// --- Handle ---

export interface ArchHandle {
  readonly kind: 'arch-handle';
  readonly scope: string; // 'project' or module path like 'src/services'
  readonly rootDir: string;
  readonly config?: Partial<ArchConfig>;
}

export interface ArchitectureOptions {
  rootDir?: string;
  config?: Partial<ArchConfig>;
}

/**
 * Factory for project-wide architecture handle.
 * Returns a handle (not a promise) that matchers consume.
 */
export function architecture(options?: ArchitectureOptions): ArchHandle {
  return {
    kind: 'arch-handle',
    scope: 'project',
    rootDir: options?.rootDir ?? process.cwd(),
    config: options?.config,
  };
}

/**
 * Factory for module-scoped architecture handle.
 * Named `archModule` to avoid conflict with the `module` reserved word
 * in certain strict-mode contexts.
 */
export function archModule(modulePath: string, options?: ArchitectureOptions): ArchHandle {
  return {
    kind: 'arch-handle',
    scope: modulePath,
    rootDir: options?.rootDir ?? process.cwd(),
    config: options?.config,
  };
}

// --- Internal helpers ---

function resolveConfig(handle: ArchHandle): import('./types').ArchConfig {
  return ArchConfigSchema.parse(handle.config ?? {});
}

async function collectCategory(
  handle: ArchHandle & { _mockResults?: MetricResult[] },
  collector: import('./types').Collector
): Promise<MetricResult[]> {
  if ('_mockResults' in handle && handle._mockResults) {
    return handle._mockResults;
  }
  const config = resolveConfig(handle);
  return collector.collect(config, handle.rootDir);
}

function formatViolationList(violations: Violation[], limit = 10): string {
  const lines = violations.slice(0, limit).map((v) => `  - ${v.file}: ${v.detail}`);
  if (violations.length > limit) {
    lines.push(`  ... and ${violations.length - limit} more`);
  }
  return lines.join('\n');
}

// --- Project-wide matchers ---

async function toHaveNoCircularDeps(
  this: any,
  received: ArchHandle & { _mockResults?: MetricResult[] }
) {
  const results = await collectCategory(received, new CircularDepsCollector());
  const violations = results.flatMap((r) => r.violations);
  const pass = violations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? 'Expected circular dependencies but found none'
        : `Found ${violations.length} circular dependenc${violations.length === 1 ? 'y' : 'ies'}:\n${formatViolationList(violations)}`,
  };
}

async function toHaveNoLayerViolations(
  this: any,
  received: ArchHandle & { _mockResults?: MetricResult[] }
) {
  const results = await collectCategory(received, new LayerViolationCollector());
  const violations = results.flatMap((r) => r.violations);
  const pass = violations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? 'Expected layer violations but found none'
        : `Found ${violations.length} layer violation${violations.length === 1 ? '' : 's'}:\n${formatViolationList(violations)}`,
  };
}

async function toMatchBaseline(
  this: any,
  received: ArchHandle & { _mockDiff?: ArchDiffResult },
  options?: { tolerance?: number }
) {
  let diffResult: ArchDiffResult;

  if ('_mockDiff' in received && received._mockDiff) {
    diffResult = received._mockDiff;
  } else {
    const config = resolveConfig(received);
    const results = await runAll(config, received.rootDir);
    const manager = new ArchBaselineManager(received.rootDir, config.baselinePath);
    const baseline = manager.load();
    if (!baseline) {
      return {
        pass: false,
        message: () =>
          'No baseline found. Run `harness check-arch --update-baseline` to create one.',
      };
    }
    diffResult = diff(results, baseline);
  }

  const tolerance = options?.tolerance ?? 0;
  const effectiveNewCount = Math.max(0, diffResult.newViolations.length - tolerance);
  const pass = effectiveNewCount === 0 && diffResult.regressions.length === 0;

  return {
    pass,
    message: () => {
      if (pass) {
        return 'Expected baseline regression but architecture matches baseline';
      }
      const parts: string[] = [];
      if (diffResult.newViolations.length > 0) {
        parts.push(
          `${diffResult.newViolations.length} new violation${diffResult.newViolations.length === 1 ? '' : 's'}${tolerance > 0 ? ` (tolerance: ${tolerance})` : ''}:\n${formatViolationList(diffResult.newViolations)}`
        );
      }
      if (diffResult.regressions.length > 0) {
        const regLines = diffResult.regressions.map(
          (r) => `  - ${r.category}: ${r.baselineValue} -> ${r.currentValue} (+${r.delta})`
        );
        parts.push(`Regressions:\n${regLines.join('\n')}`);
      }
      return `Baseline check failed:\n${parts.join('\n\n')}`;
    },
  };
}

/**
 * Vitest custom matchers for architecture assertions.
 * Usage: expect.extend(archMatchers) in vitest.setup.ts
 */
export const archMatchers = {
  toHaveNoCircularDeps,
  toHaveNoLayerViolations,
  toMatchBaseline,
};
