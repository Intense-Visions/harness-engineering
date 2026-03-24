# Plan: Architecture Assertion Framework -- Vitest Matchers (Phase 6)

**Date:** 2026-03-23
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Provide Vitest custom matchers (`archMatchers`) and factory functions (`architecture()`, `archModule()`) so developers can write expressive structural tests that call collectors internally and format failures as human-readable error messages.

## Observable Truths (Acceptance Criteria)

1. When `architecture()` is called, the system shall return a handle object with `{ kind: 'arch-handle', scope: 'project', rootDir: process.cwd() }`.
2. When `archModule('src/services')` is called, the system shall return a handle object with `{ kind: 'arch-handle', scope: 'src/services', rootDir: process.cwd() }`.
3. When `architecture({ rootDir: '/custom' })` is called, the system shall use `/custom` as the rootDir on the returned handle.
4. The `archMatchers` export shall contain these matcher keys: `toHaveNoCircularDeps`, `toHaveNoLayerViolations`, `toMatchBaseline`, `toHaveMaxComplexity`, `toHaveMaxCoupling`, `toHaveMaxFileCount`, `toNotDependOn`, `toHaveMaxDepDepth`.
5. When a matcher detects violations, the system shall return `{ pass: false, message }` where message names the files that exceeded limits and by how much.
6. When a matcher detects no violations, the system shall return `{ pass: true, message }`.
7. Matchers shall call specific individual collectors (not `runAll()`) for performance.
8. `npx vitest run packages/core/tests/architecture/matchers.test.ts` shall pass with all tests green.
9. `archMatchers`, `architecture`, and `archModule` shall be exported from `packages/core/src/architecture/index.ts`.
10. `harness validate` shall pass after all tasks are complete.

## File Map

- CREATE `packages/core/src/architecture/matchers.ts`
- CREATE `packages/core/tests/architecture/matchers.test.ts`
- MODIFY `packages/core/src/architecture/index.ts` (add exports for matchers, architecture, archModule)

## Tasks

### Task 1: Define handle type and factory functions

**Depends on:** none
**Files:** `packages/core/src/architecture/matchers.ts`

1. Create `packages/core/src/architecture/matchers.ts` with the handle type and factory functions:

```typescript
import type { ArchConfig } from './types';

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
```

2. Run: `npx vitest run packages/core/tests/architecture/matchers.test.ts` -- expect failure (test file does not exist yet). That is fine; this is the implementation-first part of the handle, which is a plain data structure with no logic to TDD against.

3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

4. Commit: `feat(architecture): add ArchHandle type and factory functions for matchers`

---

### Task 2: Write tests for factory functions and matcher stubs

**Depends on:** Task 1
**Files:** `packages/core/tests/architecture/matchers.test.ts`

1. Create `packages/core/tests/architecture/matchers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { architecture, archModule } from '../../src/architecture/matchers';

describe('architecture() factory', () => {
  it('returns a handle with scope "project"', () => {
    const handle = architecture();
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('project');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = architecture({ rootDir: '/custom/path' });
    expect(handle.rootDir).toBe('/custom/path');
  });

  it('accepts a config override', () => {
    const handle = architecture({ config: { enabled: false } });
    expect(handle.config).toEqual({ enabled: false });
  });
});

describe('archModule() factory', () => {
  it('returns a handle with the given module scope', () => {
    const handle = archModule('src/services');
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('src/services');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = archModule('src/api', { rootDir: '/other' });
    expect(handle.rootDir).toBe('/other');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/architecture/matchers.test.ts`

3. Observe: all 5 tests pass.

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

5. Commit: `test(architecture): add tests for architecture() and archModule() factories`

---

### Task 3: Implement project-wide matchers (toHaveNoCircularDeps, toHaveNoLayerViolations, toMatchBaseline)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/matchers.ts`, `packages/core/tests/architecture/matchers.test.ts`

1. Add tests to `packages/core/tests/architecture/matchers.test.ts`. These tests mock collectors to avoid filesystem access. Add at the top of the file:

```typescript
import { vi } from 'vitest';
import { archMatchers } from '../../src/architecture/matchers';
import type { MetricResult, ArchBaseline } from '../../src/architecture/types';
```

Add test blocks:

```typescript
describe('archMatchers', () => {
  describe('toHaveNoCircularDeps', () => {
    it('passes when no circular deps found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'circular-deps', scope: 'project', value: 0, violations: [] },
      ];

      // We test the matcher function directly
      const matcher = archMatchers.toHaveNoCircularDeps;
      // Mock the collector by providing a handle with a _collectorOverride
      // Instead, we test the formatter logic by calling the internal helper
      // The real integration will call collectors; unit tests verify message formatting
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when circular deps found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'circular-deps',
          scope: 'project',
          value: 2,
          violations: [
            {
              id: 'cd-1',
              file: 'src/a.ts',
              detail: 'Circular: src/a.ts -> src/b.ts -> src/a.ts',
              severity: 'error',
            },
            {
              id: 'cd-2',
              file: 'src/c.ts',
              detail: 'Circular: src/c.ts -> src/d.ts -> src/c.ts',
              severity: 'error',
            },
          ],
        },
      ];

      const matcher = archMatchers.toHaveNoCircularDeps;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('2 circular');
      expect(result.message()).toContain('src/a.ts');
    });
  });

  describe('toHaveNoLayerViolations', () => {
    it('passes when no layer violations found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'layer-violations', scope: 'project', value: 0, violations: [] },
      ];
      const matcher = archMatchers.toHaveNoLayerViolations;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when layer violations found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'layer-violations',
          scope: 'project',
          value: 1,
          violations: [
            {
              id: 'lv-1',
              file: 'src/ui/button.ts',
              detail: 'ui -> data: src/ui/button.ts imports src/data/db.ts',
              severity: 'error',
            },
          ],
        },
      ];
      const matcher = archMatchers.toHaveNoLayerViolations;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('1 layer violation');
      expect(result.message()).toContain('src/ui/button.ts');
    });
  });

  describe('toMatchBaseline', () => {
    it('passes when diff shows no regressions', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: true,
        newViolations: [],
        resolvedViolations: [],
        preExisting: [],
        regressions: [],
      };
      const matcher = archMatchers.toMatchBaseline;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any
      );
      expect(result.pass).toBe(true);
    });

    it('fails with readable message when regressions found', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: false,
        newViolations: [
          { id: 'nv-1', file: 'src/new.ts', detail: 'New violation', severity: 'error' as const },
        ],
        resolvedViolations: [],
        preExisting: [],
        regressions: [
          { category: 'complexity' as const, baselineValue: 10, currentValue: 15, delta: 5 },
        ],
      };
      const matcher = archMatchers.toMatchBaseline;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('1 new violation');
      expect(result.message()).toContain('src/new.ts');
      expect(result.message()).toContain('complexity');
    });

    it('respects tolerance option', async () => {
      const handle = architecture({ rootDir: '/fake' });
      const mockDiff = {
        passed: false,
        newViolations: [
          { id: 'nv-1', file: 'src/new.ts', detail: 'New violation', severity: 'error' as const },
        ],
        resolvedViolations: [],
        preExisting: [],
        regressions: [],
      };
      const matcher = archMatchers.toMatchBaseline;
      // With tolerance: 2, 1 new violation should pass
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockDiff: mockDiff } as any,
        { tolerance: 2 }
      );
      expect(result.pass).toBe(true);
    });
  });
});
```

2. Run tests -- observe failures (matchers not yet implemented).

3. Implement matchers in `packages/core/src/architecture/matchers.ts`. Add after the factory functions:

```typescript
import { ArchConfigSchema } from './types';
import type { MetricResult, Violation, ArchDiffResult } from './types';
import { CircularDepsCollector } from './collectors/circular-deps';
import { LayerViolationCollector } from './collectors/layer-violations';
import { ArchBaselineManager } from './baseline-manager';
import { diff } from './diff';
import { runAll } from './collectors/index';

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
```

4. Run tests: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/architecture/matchers.test.ts`

5. Observe: all project-wide matcher tests pass.

6. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

7. Commit: `feat(architecture): implement project-wide vitest matchers`

---

### Task 4: Implement module-scoped matchers (toHaveMaxComplexity, toHaveMaxCoupling, toHaveMaxFileCount, toNotDependOn, toHaveMaxDepDepth)

**Depends on:** Task 3
**Files:** `packages/core/src/architecture/matchers.ts`, `packages/core/tests/architecture/matchers.test.ts`

1. Add tests to `packages/core/tests/architecture/matchers.test.ts`:

```typescript
describe('module-scoped matchers', () => {
  describe('toHaveMaxComplexity', () => {
    it('passes when complexity is within limit', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'complexity', scope: 'src/services', value: 10, violations: [] },
      ];
      const matcher = archMatchers.toHaveMaxComplexity;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        15
      );
      expect(result.pass).toBe(true);
    });

    it('fails when complexity exceeds limit', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'complexity',
          scope: 'src/services',
          value: 20,
          violations: [
            {
              id: 'cx-1',
              file: 'src/services/heavy.ts',
              detail: 'cyclomatic=20 in processData (threshold: 15)',
              severity: 'warning',
            },
          ],
        },
      ];
      const matcher = archMatchers.toHaveMaxComplexity;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        15
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('src/services/heavy.ts');
      expect(result.message()).toContain('complexity');
    });
  });

  describe('toHaveMaxCoupling', () => {
    it('passes when coupling is within limits', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'coupling', scope: 'src/services', value: 0, violations: [] },
      ];
      const matcher = archMatchers.toHaveMaxCoupling;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        { fanIn: 10, fanOut: 8 }
      );
      expect(result.pass).toBe(true);
    });

    it('fails when coupling exceeds limits', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'coupling',
          scope: 'src/services',
          value: 2,
          violations: [
            {
              id: 'cp-1',
              file: 'src/services/hub.ts',
              detail: 'fanOut=12 (threshold: 8)',
              severity: 'warning',
            },
          ],
        },
      ];
      const matcher = archMatchers.toHaveMaxCoupling;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        { fanIn: 10, fanOut: 8 }
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('src/services/hub.ts');
    });
  });

  describe('toHaveMaxFileCount', () => {
    it('passes when file count is within limit', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'module-size',
          scope: 'src/services',
          value: 100,
          violations: [],
          metadata: { fileCount: 10, totalLoc: 100 },
        },
      ];
      const matcher = archMatchers.toHaveMaxFileCount;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        30
      );
      expect(result.pass).toBe(true);
    });

    it('fails when file count exceeds limit', async () => {
      const handle = archModule('src/services', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'module-size',
          scope: 'src/services',
          value: 5000,
          violations: [],
          metadata: { fileCount: 35, totalLoc: 5000 },
        },
      ];
      const matcher = archMatchers.toHaveMaxFileCount;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        30
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('35');
      expect(result.message()).toContain('30');
    });
  });

  describe('toNotDependOn', () => {
    it('passes when no forbidden imports found', async () => {
      const handle = archModule('src/api', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        { category: 'forbidden-imports', scope: 'project', value: 0, violations: [] },
      ];
      const matcher = archMatchers.toNotDependOn;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        'src/types'
      );
      expect(result.pass).toBe(true);
    });

    it('fails when forbidden imports found targeting the specified module', async () => {
      const handle = archModule('src/api', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'forbidden-imports',
          scope: 'project',
          value: 1,
          violations: [
            {
              id: 'fi-1',
              file: 'src/api/handler.ts',
              detail: 'forbidden import: src/api/handler.ts -> src/types/internal.ts',
              severity: 'error',
            },
          ],
        },
      ];
      const matcher = archMatchers.toNotDependOn;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        'src/types'
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('src/api/handler.ts');
      expect(result.message()).toContain('src/types');
    });
  });

  describe('toHaveMaxDepDepth', () => {
    it('passes when dependency depth is within limit', async () => {
      const handle = archModule('src/api', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'dependency-depth',
          scope: 'src/api',
          value: 3,
          violations: [],
          metadata: { longestChain: 3 },
        },
      ];
      const matcher = archMatchers.toHaveMaxDepDepth;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        5
      );
      expect(result.pass).toBe(true);
    });

    it('fails when dependency depth exceeds limit', async () => {
      const handle = archModule('src/api', { rootDir: '/fake' });
      const mockResults: MetricResult[] = [
        {
          category: 'dependency-depth',
          scope: 'src/api',
          value: 8,
          violations: [
            {
              id: 'dd-1',
              file: 'src/api',
              detail: 'Import chain depth is 8 (threshold: 5)',
              severity: 'warning',
            },
          ],
          metadata: { longestChain: 8 },
        },
      ];
      const matcher = archMatchers.toHaveMaxDepDepth;
      const result = await matcher.call(
        { isNot: false, equals: Object.is, utils: {} as any } as any,
        { ...handle, _mockResults: mockResults } as any,
        5
      );
      expect(result.pass).toBe(false);
      expect(result.message()).toContain('8');
      expect(result.message()).toContain('5');
    });
  });
});
```

2. Run tests -- observe failures for unimplemented matchers.

3. Add module-scoped matchers to `packages/core/src/architecture/matchers.ts`:

```typescript
import { ComplexityCollector } from './collectors/complexity';
import { CouplingCollector } from './collectors/coupling';
import { ModuleSizeCollector } from './collectors/module-size';
import { ForbiddenImportCollector } from './collectors/forbidden-imports';
import { DepDepthCollector } from './collectors/dep-depth';

function filterByScope(results: MetricResult[], scope: string): MetricResult[] {
  // For module-scoped matchers, include results whose scope matches or starts with the module path.
  // Also include project-scope results (some collectors only return project scope).
  return results.filter(
    (r) => r.scope === scope || r.scope.startsWith(scope + '/') || r.scope === 'project'
  );
}

async function toHaveMaxComplexity(
  this: any,
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
  this: any,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  limits: { fanIn?: number; fanOut?: number }
) {
  const results = await collectCategory(received, new CouplingCollector());
  const scoped = filterByScope(results, received.scope);
  const violations = scoped.flatMap((r) => r.violations);
  const pass = violations.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected coupling violations in '${received.scope}' but found none`
        : `Module '${received.scope}' has coupling violations (fanIn limit: ${limits.fanIn ?? 'none'}, fanOut limit: ${limits.fanOut ?? 'none'}):\n${formatViolationList(violations)}`,
  };
}

async function toHaveMaxFileCount(
  this: any,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  maxFiles: number
) {
  const results = await collectCategory(received, new ModuleSizeCollector());
  const scoped = filterByScope(results, received.scope);
  const fileCount = scoped.reduce((max, r) => {
    const fc = (r.metadata as any)?.fileCount ?? 0;
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
  this: any,
  received: ArchHandle & { _mockResults?: MetricResult[] },
  forbiddenModule: string
) {
  const results = await collectCategory(received, new ForbiddenImportCollector());
  // Filter: violations in the source module that import from the forbidden module
  const allViolations = results.flatMap((r) => r.violations);
  const relevantViolations = allViolations.filter(
    (v) => v.file.startsWith(received.scope) && v.detail.includes(forbiddenModule)
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
  this: any,
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
```

4. Run tests: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/architecture/matchers.test.ts`

5. Observe: all module-scoped matcher tests pass.

6. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

7. Commit: `feat(architecture): implement module-scoped vitest matchers`

---

### Task 5: Export archMatchers object and wire into architecture/index.ts

**Depends on:** Task 4
**Files:** `packages/core/src/architecture/matchers.ts`, `packages/core/src/architecture/index.ts`

1. Add the `archMatchers` export object at the bottom of `packages/core/src/architecture/matchers.ts`:

```typescript
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
```

2. Add exports to `packages/core/src/architecture/index.ts`. Append:

```typescript
export { archMatchers, architecture, archModule } from './matchers';
export type { ArchHandle, ArchitectureOptions } from './matchers';
```

3. Add a test to verify the re-export works. Add to `packages/core/tests/architecture/matchers.test.ts`:

```typescript
describe('exports', () => {
  it('archMatchers contains all expected matcher keys', () => {
    const expectedKeys = [
      'toHaveNoCircularDeps',
      'toHaveNoLayerViolations',
      'toMatchBaseline',
      'toHaveMaxComplexity',
      'toHaveMaxCoupling',
      'toHaveMaxFileCount',
      'toNotDependOn',
      'toHaveMaxDepDepth',
    ];
    for (const key of expectedKeys) {
      expect(archMatchers).toHaveProperty(key);
      expect(typeof (archMatchers as any)[key]).toBe('function');
    }
  });
});
```

4. Run tests: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/architecture/matchers.test.ts`

5. Observe: all tests pass including export verification.

6. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

7. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness check-deps`

8. Commit: `feat(architecture): export archMatchers, architecture, archModule from architecture index`

---

### Task 6: Add subpath export for @harness-engineering/core/architecture/matchers

[checkpoint:decision] -- The spec shows `import { archMatchers } from '@harness-engineering/core/architecture/matchers'`. This requires a subpath export in package.json and a second tsup entry point. Decide whether to:
A) Add subpath export now (requires modifying package.json exports and build script)
B) Defer subpath export -- users import from `@harness-engineering/core` for now

If A is chosen:

**Depends on:** Task 5
**Files:** `packages/core/package.json`

1. Modify `packages/core/package.json` exports field to add the subpath:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.js"
  },
  "./architecture/matchers": {
    "types": "./dist/architecture/matchers.d.ts",
    "import": "./dist/architecture/matchers.mjs",
    "require": "./dist/architecture/matchers.js"
  }
}
```

2. Modify the `build` script in `packages/core/package.json` to include the second entry point:

```json
"build": "tsup src/index.ts src/architecture/matchers.ts --format cjs,esm --dts --tsconfig tsconfig.build.json"
```

3. Verify the build works: `cd /Users/cwarner/Projects/harness-engineering/packages/core && npm run build`

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

5. Commit: `feat(architecture): add subpath export for architecture/matchers`

## Traceability

| Observable Truth                                      | Delivered by               |
| ----------------------------------------------------- | -------------------------- |
| 1. `architecture()` returns handle with project scope | Task 1, verified in Task 2 |
| 2. `archModule()` returns handle with module scope    | Task 1, verified in Task 2 |
| 3. `archMatchers` contains all 8 matcher functions    | Task 5                     |
| 4. Failure messages are human-readable                | Tasks 3, 4                 |
| 5. Matchers call specific collectors                  | Tasks 3, 4                 |
| 6. Tests pass                                         | Tasks 2, 3, 4, 5           |
| 7. Exports from architecture/index.ts                 | Task 5                     |
| 8. `harness validate` passes                          | All tasks                  |
| 9. `architecture()` accepts rootDir override          | Task 1, verified in Task 2 |
| 10. Subpath export works                              | Task 6                     |
