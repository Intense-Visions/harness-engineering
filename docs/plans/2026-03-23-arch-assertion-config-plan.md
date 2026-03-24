# Plan: Architecture Assertion Framework — Phase 4: Config Schema

**Date:** 2026-03-23
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Phase:** 4 of 7
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Parse the `architecture` section from `harness.config.json`, resolve project-wide and module-level threshold overrides into a single resolved config for any given scope, and wire it into the CLI config schema.

## Observable Truths (Acceptance Criteria)

1. When `ArchConfigSchema.parse({})` is called, the system shall return defaults: `enabled: true`, `baselinePath: '.harness/arch/baselines.json'`, `thresholds: {}`, `modules: {}`. _(Already true from Phase 1 — retained as regression check.)_
2. When `resolveThresholds('src/api', config)` is called where `config.thresholds` has `complexity: 15` and `config.modules['src/api']` has `complexity: 10`, the system shall return `{ complexity: 10 }` (module override wins).
3. When `resolveThresholds('src/api', config)` is called where only `config.thresholds` has `complexity: 15` and no module override exists for `'src/api'`, the system shall return `{ complexity: 15 }` (project-wide fallback).
4. When `resolveThresholds('src/api', config)` is called where `config.thresholds` has `coupling: { maxFanIn: 10, maxFanOut: 8 }` and `config.modules['src/api']` has `coupling: { maxFanOut: 5 }`, the system shall return `{ coupling: { maxFanIn: 10, maxFanOut: 5 } }` (deep merge — module keys override, project keys preserved).
5. When `resolveThresholds('src/unknown', config)` is called with no matching module, the system shall return the project-wide thresholds unchanged.
6. When `HarnessConfigSchema` parses a config object with an `architecture` key containing valid thresholds, the system shall include the parsed `ArchConfig` in the result.
7. When `HarnessConfigSchema` parses a config object without an `architecture` key, the system shall not fail (field is optional).
8. `npx vitest run packages/core/tests/architecture/config.test.ts` passes with all tests green.
9. `harness validate` passes.

## File Map

- CREATE `packages/core/src/architecture/config.ts`
- CREATE `packages/core/tests/architecture/config.test.ts`
- MODIFY `packages/core/src/architecture/index.ts` (add export for `resolveThresholds`)
- MODIFY `packages/cli/src/config/schema.ts` (add `architecture` field to `HarnessConfigSchema`)

## Tasks

### Task 1: Create config resolution tests (TDD — red)

**Depends on:** none
**Files:** `packages/core/tests/architecture/config.test.ts`

1. Create test file `packages/core/tests/architecture/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveThresholds } from '../../src/architecture/config';
import type { ArchConfig } from '../../src/architecture/types';

function makeConfig(overrides: Partial<ArchConfig> = {}): ArchConfig {
  return {
    enabled: true,
    baselinePath: '.harness/arch/baselines.json',
    thresholds: {},
    modules: {},
    ...overrides,
  };
}

describe('resolveThresholds()', () => {
  it('returns project-wide thresholds when no module match', () => {
    const config = makeConfig({
      thresholds: { complexity: 15, 'circular-deps': 0 },
    });
    const result = resolveThresholds('src/unknown', config);
    expect(result).toEqual({ complexity: 15, 'circular-deps': 0 });
  });

  it('returns empty object when no thresholds configured', () => {
    const config = makeConfig();
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({});
  });

  it('overrides scalar threshold with module-level value', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: 10 });
  });

  it('preserves project thresholds for categories not overridden by module', () => {
    const config = makeConfig({
      thresholds: { complexity: 15, 'circular-deps': 0 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: 10, 'circular-deps': 0 });
  });

  it('deep-merges object thresholds at category level', () => {
    const config = makeConfig({
      thresholds: { coupling: { maxFanIn: 10, maxFanOut: 8 } },
      modules: { 'src/api': { coupling: { maxFanOut: 5 } } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ coupling: { maxFanIn: 10, maxFanOut: 5 } });
  });

  it('module scalar replaces project object entirely', () => {
    const config = makeConfig({
      thresholds: { coupling: { maxFanIn: 10, maxFanOut: 8 } },
      modules: { 'src/api': { coupling: 5 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ coupling: 5 });
  });

  it('module object replaces project scalar entirely', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: { max: 10, warn: 8 } } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: { max: 10, warn: 8 } });
  });

  it('uses "project" scope to return project-wide thresholds only', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('project', config);
    expect(result).toEqual({ complexity: 15 });
  });

  it('handles multiple modules without cross-contamination', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: {
        'src/api': { complexity: 10 },
        'src/services': { complexity: 8 },
      },
    });
    expect(resolveThresholds('src/api', config)).toEqual({ complexity: 10 });
    expect(resolveThresholds('src/services', config)).toEqual({ complexity: 8 });
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/architecture/config.test.ts`
3. Observe failure: `Cannot find module '../../src/architecture/config'`

---

### Task 2: Implement config resolution (TDD — green)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/config.ts`

1. Create implementation `packages/core/src/architecture/config.ts`:

```typescript
import type { ArchConfig, ThresholdConfig } from './types';

/**
 * Resolve effective thresholds for a given scope.
 *
 * When scope is 'project' or has no matching module entry, returns
 * project-wide thresholds. Otherwise, merges project thresholds
 * with module-level overrides (module wins per-category).
 *
 * For object-valued thresholds (e.g. coupling: { maxFanIn, maxFanOut }),
 * performs a shallow merge at the category level:
 *   project { maxFanIn: 10, maxFanOut: 8 } + module { maxFanOut: 5 }
 *   => { maxFanIn: 10, maxFanOut: 5 }
 *
 * When either side is a scalar, the module value replaces the project
 * value entirely (no merge across scalar/object boundaries).
 */
export function resolveThresholds(scope: string, config: ArchConfig): ThresholdConfig {
  const projectThresholds = { ...config.thresholds };

  // 'project' scope or no module match — return project-wide thresholds
  if (scope === 'project') {
    return projectThresholds;
  }

  const moduleOverrides = config.modules[scope];
  if (!moduleOverrides) {
    return projectThresholds;
  }

  // Merge: module overrides win per-category
  const merged: ThresholdConfig = { ...projectThresholds };

  for (const [category, moduleValue] of Object.entries(moduleOverrides)) {
    const projectValue = projectThresholds[category as keyof ThresholdConfig];

    // Deep merge only when both sides are objects
    if (
      projectValue !== undefined &&
      typeof projectValue === 'object' &&
      !Array.isArray(projectValue) &&
      typeof moduleValue === 'object' &&
      !Array.isArray(moduleValue)
    ) {
      merged[category as keyof ThresholdConfig] = {
        ...(projectValue as Record<string, number>),
        ...(moduleValue as Record<string, number>),
      };
    } else {
      merged[category as keyof ThresholdConfig] = moduleValue;
    }
  }

  return merged;
}
```

2. Run test: `cd packages/core && npx vitest run tests/architecture/config.test.ts`
3. Observe: all 9 tests pass.
4. Run: `harness validate`
5. Commit: `feat(architecture): add resolveThresholds for config resolution with module overrides`

---

### Task 3: Export resolveThresholds from barrel and wire into CLI schema

**Depends on:** Task 2
**Files:** `packages/core/src/architecture/index.ts`, `packages/cli/src/config/schema.ts`

1. Add export to `packages/core/src/architecture/index.ts` — append after the `diff` export:

```typescript
export { resolveThresholds } from './config';
```

2. Add `architecture` field to `HarnessConfigSchema` in `packages/cli/src/config/schema.ts`:

   a. Add import at top of file:

   ```typescript
   import { ArchConfigSchema } from '@harness-engineering/core';
   ```

   b. Add field to `HarnessConfigSchema` object, after the `review` field:

   ```typescript
   architecture: ArchConfigSchema.optional(),
   ```

   c. Add type export:

   ```typescript
   export type ArchConfigZod = z.infer<typeof ArchConfigSchema>;
   ```

3. Run: `cd packages/core && npx vitest run tests/architecture/` (verify no regressions)
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Commit: `feat(architecture): wire ArchConfig into HarnessConfigSchema and export resolveThresholds`

---

### Task 4: Add CLI schema integration test

**Depends on:** Task 3
**Files:** `packages/core/tests/architecture/config.test.ts`

1. Append to `packages/core/tests/architecture/config.test.ts` — a new describe block that validates the schema integration works end-to-end with raw JSON input:

```typescript
import { ArchConfigSchema } from '../../src/architecture/types';

describe('ArchConfigSchema integration', () => {
  it('parses a full architecture config from raw JSON', () => {
    const raw = {
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {
        'circular-deps': 0,
        'layer-violations': 0,
        complexity: 15,
        coupling: { maxFanIn: 10, maxFanOut: 8 },
        'forbidden-imports': 0,
        'module-size': { maxFiles: 30, maxLoc: 3000 },
        'dependency-depth': 7,
      },
      modules: {
        'src/services': { complexity: 10 },
        'src/api': { coupling: { maxFanOut: 5 } },
      },
    };
    const result = ArchConfigSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.thresholds['coupling']).toEqual({ maxFanIn: 10, maxFanOut: 8 });
      expect(result.data.modules['src/api']).toEqual({ coupling: { maxFanOut: 5 } });
    }
  });

  it('resolveThresholds works with schema-parsed config', () => {
    const raw = {
      thresholds: {
        complexity: 15,
        coupling: { maxFanIn: 10, maxFanOut: 8 },
      },
      modules: {
        'src/api': { complexity: 10, coupling: { maxFanOut: 5 } },
      },
    };
    const config = ArchConfigSchema.parse(raw);
    const resolved = resolveThresholds('src/api', config);
    expect(resolved).toEqual({
      complexity: 10,
      coupling: { maxFanIn: 10, maxFanOut: 5 },
    });
  });

  it('defaults are applied when minimal config is parsed then resolved', () => {
    const config = ArchConfigSchema.parse({});
    const resolved = resolveThresholds('src/anything', config);
    expect(resolved).toEqual({});
    expect(config.enabled).toBe(true);
    expect(config.baselinePath).toBe('.harness/arch/baselines.json');
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/architecture/config.test.ts`
3. Observe: all 12 tests pass.
4. Run: `harness validate`
5. Commit: `test(architecture): add schema integration tests for config resolution`

## Traceability

| Observable Truth                                 | Delivered By                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1. ArchConfigSchema defaults                     | Task 4 (regression check in integration tests)                                 |
| 2. Module override wins                          | Task 1 + Task 2 (test: "overrides scalar threshold")                           |
| 3. Project-wide fallback                         | Task 1 + Task 2 (test: "returns project-wide thresholds when no module match") |
| 4. Deep merge object thresholds                  | Task 1 + Task 2 (test: "deep-merges object thresholds")                        |
| 5. No matching module returns project thresholds | Task 1 + Task 2 (test: "returns project-wide thresholds when no module match") |
| 6. HarnessConfigSchema includes architecture     | Task 3                                                                         |
| 7. architecture key is optional                  | Task 3 (field added with `.optional()`)                                        |
| 8. All tests pass                                | Task 4                                                                         |
| 9. harness validate passes                       | Every task                                                                     |
