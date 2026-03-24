import { ArchConfigSchema } from './types';
import type { ArchConfig, MetricResult, Violation, ArchDiffResult } from './types';
import { CircularDepsCollector } from './collectors/circular-deps';
import { LayerViolationCollector } from './collectors/layer-violations';
import { ArchBaselineManager } from './baseline-manager';
import { diff } from './diff';
import { runAll } from './collectors/index';
import { ComplexityCollector } from './collectors/complexity';
import { CouplingCollector } from './collectors/coupling';
import { ModuleSizeCollector } from './collectors/module-size';
import { ForbiddenImportCollector } from './collectors/forbidden-imports';
import { DepDepthCollector } from './collectors/dep-depth';

// Vitest matcher context type — minimal interface to avoid direct vitest dependency in core
interface MatcherContext {
  isNot: boolean;
  equals: (a: unknown, b: unknown) => boolean;
}

// --- Handle ---

export interface ArchHandle {
  readonly kind: 'arch-handle';
  readonly scope: string; // 'project' or module path like 'src/services'
  readonly rootDir: string;
  readonly config?: Partial<ArchConfig> | undefined;
}

export interface ArchitectureOptions {
  rootDir?: string;
  config?: Partial<ArchConfig> | undefined;
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
  this: MatcherContext,
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
  this: MatcherContext,
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
  this: MatcherContext,
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

// --- Module-scoped matchers ---

function filterByScope(results: MetricResult[], scope: string): MetricResult[] {
  // For module-scoped matchers, include results whose scope matches or starts with the module path.
  // Also include project-scope results (some collectors only return project scope).
  return results.filter(
    (r) => r.scope === scope || r.scope.startsWith(scope + '/') || r.scope === 'project'
  );
}

async function toHaveMaxComplexity(
  this: MatcherContext,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  maxComplexity: number
) {
  const results = await collectCategory(received, new ComplexityCollector());
  const scoped = filterByScope(results, received.scope);
  const violations = scoped.flatMap((r) => r.violations);
  const totalValue = scoped.reduce((sum, r) => sum + r.value, 0);
  const pass = totalValue <= maxComplexity && violations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected complexity to exceed ${maxComplexity} but it was within limits`
        : `Module '${received.scope}' has complexity violations (${violations.length} violation${violations.length === 1 ? '' : 's'}):\n${formatViolationList(violations)}`,
  };
}

async function toHaveMaxCoupling(
  this: MatcherContext,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  limits: { fanIn?: number; fanOut?: number }
) {
  // Wire the provided limits into the config so the collector respects them
  const config = resolveConfig(received);
  if (limits.fanIn !== undefined || limits.fanOut !== undefined) {
    config.thresholds.coupling = {
      ...(typeof config.thresholds.coupling === 'object' ? config.thresholds.coupling : {}),
      ...(limits.fanIn !== undefined ? { maxFanIn: limits.fanIn } : {}),
      ...(limits.fanOut !== undefined ? { maxFanOut: limits.fanOut } : {}),
    };
  }
  const collector = new CouplingCollector();
  const results =
    '_mockResults' in received && received._mockResults
      ? received._mockResults
      : await collector.collect(config, received.rootDir);
  const scoped = filterByScope(results, received.scope);
  const violations = scoped.flatMap((r) => r.violations);
  const pass = violations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected coupling violations in '${received.scope}' but found none`
        : `Module '${received.scope}' has ${violations.length} coupling violation${violations.length === 1 ? '' : 's'} (fanIn limit: ${limits.fanIn ?? 'none'}, fanOut limit: ${limits.fanOut ?? 'none'}):\n${formatViolationList(violations)}`,
  };
}

async function toHaveMaxFileCount(
  this: MatcherContext,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  maxFiles: number
) {
  const results = await collectCategory(received, new ModuleSizeCollector());
  const scoped = filterByScope(results, received.scope);
  const fileCount = scoped.reduce((max, r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    const fc = typeof meta?.fileCount === 'number' ? meta.fileCount : 0;
    return fc > max ? fc : max;
  }, 0);
  const pass = fileCount <= maxFiles;

  return {
    pass,
    message: () =>
      pass
        ? `Expected file count in '${received.scope}' to exceed ${maxFiles} but it was ${fileCount}`
        : `Module '${received.scope}' has ${fileCount} files (limit: ${maxFiles})`,
  };
}

async function toNotDependOn(
  this: MatcherContext,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  forbiddenModule: string
) {
  const results = await collectCategory(received, new ForbiddenImportCollector());
  // Filter: violations in the source module that import from the forbidden module
  const allViolations = results.flatMap((r) => r.violations);
  const scopePrefix = received.scope.replace(/\/+$/, '');
  const forbiddenPrefix = forbiddenModule.replace(/\/+$/, '');
  const relevantViolations = allViolations.filter(
    (v) =>
      (v.file === scopePrefix || v.file.startsWith(scopePrefix + '/')) &&
      (v.detail.includes(forbiddenPrefix + '/') || v.detail.endsWith(forbiddenPrefix))
  );
  const pass = relevantViolations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected '${received.scope}' to depend on '${forbiddenModule}' but no such imports found`
        : `Module '${received.scope}' depends on '${forbiddenModule}' (${relevantViolations.length} import${relevantViolations.length === 1 ? '' : 's'}):\n${formatViolationList(relevantViolations)}`,
  };
}

async function toHaveMaxDepDepth(
  this: MatcherContext,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  maxDepth: number
) {
  const results = await collectCategory(received, new DepDepthCollector());
  const scoped = filterByScope(results, received.scope);
  const maxActual = scoped.reduce((max, r) => (r.value > max ? r.value : max), 0);
  const pass = maxActual <= maxDepth;

  return {
    pass,
    message: () =>
      pass
        ? `Expected dependency depth in '${received.scope}' to exceed ${maxDepth} but it was ${maxActual}`
        : `Module '${received.scope}' has dependency depth ${maxActual} (limit: ${maxDepth})`,
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
  toHaveMaxComplexity,
  toHaveMaxCoupling,
  toHaveMaxFileCount,
  toNotDependOn,
  toHaveMaxDepDepth,
};
