# Plan: Constraint Sharing Phase 3 -- Merge Engine

**Date:** 2026-03-24
**Spec:** docs/changes/constraint-sharing/proposal.md
**Estimated tasks:** 8
**Estimated time:** 35 minutes

## Goal

Implement `deepMergeConstraints()` in `packages/core` that deep-merges a bundle's constraint sections into a local config with per-section merge semantics, conflict detection, and provenance tracking -- enabling `harness install-constraints` (Phase 5) to merge bundles non-destructively.

## Observable Truths (Acceptance Criteria)

1. When a bundle contains layers with names not present locally, the system shall append them to the merged config and record their names in `contributions.layers`.
2. When a bundle contains a layer whose `name` matches a local layer but has different `pattern` or `allowedDependencies`, the system shall report a conflict with section `"layers"`, key equal to the layer name, and both local and package values.
3. When a bundle contains a layer whose `name` matches a local layer with identical config, the system shall skip it (no duplicate, no conflict).
4. When a bundle contains forbidden imports with `from` patterns not present locally, the system shall append them and record their indices in `contributions.forbiddenImports`.
5. When a bundle contains a forbidden import whose `from` matches a local rule but has different `disallow`, the system shall report a conflict.
6. When a bundle contains a forbidden import identical to a local rule, the system shall skip it.
7. When a bundle contains boundaries with `requireSchema` entries, the system shall union them with local entries, deduplicate, and record new entries in `contributions.boundaries`.
8. When a bundle contains architecture thresholds for categories not present locally, the system shall add them and record category names in `contributions['architecture.thresholds']`.
9. When a bundle contains an architecture threshold for a category that exists locally with a different value, the system shall report a conflict.
10. When a bundle contains architecture module overrides, the system shall merge per-module per-category with the same conflict strategy, recording `"module:category"` keys in `contributions['architecture.modules']`.
11. When a bundle contains security rules with IDs not present locally, the system shall add them and record IDs in `contributions['security.rules']`.
12. When a bundle contains a security rule ID that exists locally with a different severity, the system shall report a conflict.
13. When a bundle contains a security rule ID identical to local, the system shall skip it.
14. When all bundle sections are empty or undefined, the system shall return the local config unchanged with empty contributions and no conflicts.
15. `npx vitest run tests/constraints/sharing/merge.test.ts` passes with all tests green.
16. `harness validate` passes after all tasks are complete.

## File Map

```
CREATE packages/core/src/constraints/sharing/merge.ts
CREATE packages/core/tests/constraints/sharing/merge.test.ts
MODIFY packages/core/src/constraints/sharing/index.ts (add merge exports)
```

## Tasks

### Task 1: Define ConflictReport type and MergeResult type, stub deepMergeConstraints

**Depends on:** none
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Create `packages/core/src/constraints/sharing/merge.ts` with types and a stubbed function:

```typescript
import type { BundleConstraints, Contributions } from './types';

export interface ConflictReport {
  section: string;
  key: string;
  localValue: unknown;
  packageValue: unknown;
  description: string;
}

export interface MergeResult {
  config: Record<string, unknown>;
  contributions: Contributions;
  conflicts: ConflictReport[];
}

/**
 * Deep-merge bundle constraints into a local config.
 *
 * Each constraint section has its own merge semantics:
 * - Layers: match by name, append new, conflict on different config
 * - Forbidden imports: match by `from`, append new, conflict on different `disallow`
 * - Boundaries: union requireSchema arrays, deduplicate
 * - Architecture thresholds: per-category merge, conflict on different values
 * - Architecture modules: per-module per-category merge, same conflict strategy
 * - Security rules: per-rule-ID merge, conflict on different severity
 */
export function deepMergeConstraints(
  localConfig: Record<string, unknown>,
  bundleConstraints: BundleConstraints,
  _existingContributions?: Contributions
): MergeResult {
  return {
    config: { ...localConfig },
    contributions: {},
    conflicts: [],
  };
}
```

2. Create `packages/core/tests/constraints/sharing/merge.test.ts` with a basic smoke test:

```typescript
import { describe, it, expect } from 'vitest';
import { deepMergeConstraints } from '../../../src/constraints/sharing/merge';
import type { BundleConstraints } from '../../../src/constraints/sharing/types';

describe('deepMergeConstraints', () => {
  it('should return local config unchanged when bundle is empty', () => {
    const localConfig = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const bundle: BundleConstraints = {};

    const result = deepMergeConstraints(localConfig, bundle);

    expect(result.config).toEqual(localConfig);
    expect(result.contributions).toEqual({});
    expect(result.conflicts).toEqual([]);
  });
});
```

3. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts`
4. Observe: test passes (stub returns local config for empty bundle)
5. Run: `harness validate`
6. Commit: `feat(constraints): stub deepMergeConstraints with ConflictReport and MergeResult types`

---

### Task 2: Implement layers merge with tests

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests to `merge.test.ts` in a `describe('layers merge')` block:

```typescript
describe('layers merge', () => {
  const localConfig = {
    layers: [
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
      { name: 'api', pattern: 'src/api/**', allowedDependencies: ['domain'] },
    ],
  };

  it('should append new layers from bundle', () => {
    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(3);
    expect(layers[2].name).toBe('infra');
    expect(result.contributions.layers).toEqual(['infra']);
    expect(result.conflicts).toEqual([]);
  });

  it('should skip layers that are identical in local and bundle', () => {
    const bundle: BundleConstraints = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(2);
    expect(result.contributions.layers).toBeUndefined();
    expect(result.conflicts).toEqual([]);
  });

  it('should report conflict when same name has different config', () => {
    const bundle: BundleConstraints = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['utils'] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(2); // local unchanged
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('layers');
    expect(result.conflicts[0].key).toBe('domain');
    expect(result.conflicts[0].description).toContain('domain');
  });

  it('should handle bundle layers when local has no layers', () => {
    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
    };
    const result = deepMergeConstraints({}, bundle);
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('infra');
    expect(result.contributions.layers).toEqual(['infra']);
  });

  it('should handle mixed: some new, some identical, some conflicting', () => {
    const bundle: BundleConstraints = {
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }, // identical
        { name: 'api', pattern: 'src/api/**', allowedDependencies: [] }, // conflict (different deps)
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }, // new
      ],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(3); // 2 local + 1 new
    expect(result.contributions.layers).toEqual(['infra']);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].key).toBe('api');
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Implement layers merge logic in `deepMergeConstraints` in `merge.ts`:

```typescript
// Inside deepMergeConstraints, add a helper and layers section:

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

// In the function body, after initializing result:
if (bundleConstraints.layers && bundleConstraints.layers.length > 0) {
  const localLayers = (Array.isArray(localConfig.layers) ? localConfig.layers : []) as Array<{
    name: string;
    pattern: string;
    allowedDependencies: string[];
  }>;
  const mergedLayers = [...localLayers];
  const contributedLayerNames: string[] = [];

  for (const bundleLayer of bundleConstraints.layers) {
    const existing = localLayers.find((l) => l.name === bundleLayer.name);
    if (!existing) {
      mergedLayers.push(bundleLayer);
      contributedLayerNames.push(bundleLayer.name);
    } else {
      const same =
        existing.pattern === bundleLayer.pattern &&
        arraysEqual(existing.allowedDependencies, bundleLayer.allowedDependencies);
      if (!same) {
        conflicts.push({
          section: 'layers',
          key: bundleLayer.name,
          localValue: existing,
          packageValue: bundleLayer,
          description: `Layer '${bundleLayer.name}' already exists locally with different configuration`,
        });
      }
      // identical → skip
    }
  }

  config.layers = mergedLayers;
  if (contributedLayerNames.length > 0) {
    contributions.layers = contributedLayerNames;
  }
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all layers tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement layers merge with conflict detection`

---

### Task 3: Implement forbidden imports merge with tests

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests to `merge.test.ts` in a `describe('forbiddenImports merge')` block:

```typescript
describe('forbiddenImports merge', () => {
  const localConfig = {
    forbiddenImports: [
      { from: 'src/domain/**', disallow: ['src/api/**'], message: 'domain cannot import api' },
      { from: 'src/types/**', disallow: ['src/core/**'] },
    ],
  };

  it('should append new forbidden imports from bundle', () => {
    const bundle: BundleConstraints = {
      forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const fi = result.config.forbiddenImports as Array<{ from: string }>;
    expect(fi).toHaveLength(3);
    expect(fi[2].from).toBe('src/infra/**');
    expect(result.contributions.forbiddenImports).toEqual([2]); // index in merged array
    expect(result.conflicts).toEqual([]);
  });

  it('should skip identical forbidden imports', () => {
    const bundle: BundleConstraints = {
      forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const fi = result.config.forbiddenImports as Array<{ from: string }>;
    expect(fi).toHaveLength(2);
    expect(result.contributions.forbiddenImports).toBeUndefined();
    expect(result.conflicts).toEqual([]);
  });

  it('should report conflict when same from has different disallow', () => {
    const bundle: BundleConstraints = {
      forbiddenImports: [{ from: 'src/domain/**', disallow: ['src/ui/**'] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('forbiddenImports');
    expect(result.conflicts[0].key).toBe('src/domain/**');
  });

  it('should handle bundle forbidden imports when local has none', () => {
    const bundle: BundleConstraints = {
      forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
    };
    const result = deepMergeConstraints({}, bundle);
    const fi = result.config.forbiddenImports as Array<{ from: string }>;
    expect(fi).toHaveLength(1);
    expect(result.contributions.forbiddenImports).toEqual([0]);
  });

  it('should handle mixed: new, identical, and conflicting', () => {
    const bundle: BundleConstraints = {
      forbiddenImports: [
        { from: 'src/types/**', disallow: ['src/core/**'] }, // identical
        { from: 'src/domain/**', disallow: ['src/ui/**'] }, // conflict
        { from: 'src/new/**', disallow: ['src/other/**'] }, // new
      ],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const fi = result.config.forbiddenImports as Array<{ from: string }>;
    expect(fi).toHaveLength(3); // 2 local + 1 new
    expect(result.contributions.forbiddenImports).toEqual([2]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].key).toBe('src/domain/**');
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Implement forbidden imports merge in `merge.ts`:

```typescript
if (bundleConstraints.forbiddenImports && bundleConstraints.forbiddenImports.length > 0) {
  const localFI = (
    Array.isArray(localConfig.forbiddenImports) ? localConfig.forbiddenImports : []
  ) as Array<{
    from: string;
    disallow: string[];
    message?: string;
  }>;
  const mergedFI = [...localFI];
  const contributedIndices: number[] = [];

  for (const bundleRule of bundleConstraints.forbiddenImports) {
    const existing = localFI.find((r) => r.from === bundleRule.from);
    if (!existing) {
      const newIndex = mergedFI.length;
      mergedFI.push(bundleRule);
      contributedIndices.push(newIndex);
    } else {
      const same = arraysEqual(existing.disallow, bundleRule.disallow);
      if (!same) {
        conflicts.push({
          section: 'forbiddenImports',
          key: bundleRule.from,
          localValue: existing,
          packageValue: bundleRule,
          description: `Forbidden import rule for '${bundleRule.from}' already exists locally with different disallow list`,
        });
      }
    }
  }

  config.forbiddenImports = mergedFI;
  if (contributedIndices.length > 0) {
    contributions.forbiddenImports = contributedIndices;
  }
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all forbidden imports tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement forbidden imports merge with conflict detection`

---

### Task 4: Implement boundaries merge with tests

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests to `merge.test.ts` in a `describe('boundaries merge')` block:

```typescript
describe('boundaries merge', () => {
  it('should union requireSchema arrays and deduplicate', () => {
    const localConfig = {
      boundaries: { requireSchema: ['src/api/**', 'src/types/**'] },
    };
    const bundle: BundleConstraints = {
      boundaries: { requireSchema: ['src/types/**', 'src/models/**'] },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const boundaries = result.config.boundaries as { requireSchema: string[] };
    expect(boundaries.requireSchema).toEqual(['src/api/**', 'src/types/**', 'src/models/**']);
    expect(result.contributions.boundaries).toEqual(['src/models/**']);
    expect(result.conflicts).toEqual([]);
  });

  it('should handle bundle boundaries when local has none', () => {
    const bundle: BundleConstraints = {
      boundaries: { requireSchema: ['src/api/**'] },
    };
    const result = deepMergeConstraints({}, bundle);
    const boundaries = result.config.boundaries as { requireSchema: string[] };
    expect(boundaries.requireSchema).toEqual(['src/api/**']);
    expect(result.contributions.boundaries).toEqual(['src/api/**']);
  });

  it('should handle all duplicates (nothing new)', () => {
    const localConfig = {
      boundaries: { requireSchema: ['src/api/**'] },
    };
    const bundle: BundleConstraints = {
      boundaries: { requireSchema: ['src/api/**'] },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const boundaries = result.config.boundaries as { requireSchema: string[] };
    expect(boundaries.requireSchema).toEqual(['src/api/**']);
    expect(result.contributions.boundaries).toBeUndefined();
  });

  it('should handle empty requireSchema in bundle', () => {
    const localConfig = {
      boundaries: { requireSchema: ['src/api/**'] },
    };
    const bundle: BundleConstraints = {
      boundaries: { requireSchema: [] },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const boundaries = result.config.boundaries as { requireSchema: string[] };
    expect(boundaries.requireSchema).toEqual(['src/api/**']);
    expect(result.contributions.boundaries).toBeUndefined();
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Implement boundaries merge in `merge.ts`:

```typescript
if (bundleConstraints.boundaries) {
  const localBoundaries = (localConfig.boundaries ?? { requireSchema: [] }) as {
    requireSchema: string[];
  };
  const localSchemas = new Set(localBoundaries.requireSchema ?? []);
  const bundleSchemas = bundleConstraints.boundaries.requireSchema ?? [];
  const newSchemas: string[] = [];

  for (const schema of bundleSchemas) {
    if (!localSchemas.has(schema)) {
      newSchemas.push(schema);
      localSchemas.add(schema);
    }
  }

  config.boundaries = {
    requireSchema: [...(localBoundaries.requireSchema ?? []), ...newSchemas],
  };

  if (newSchemas.length > 0) {
    contributions.boundaries = newSchemas;
  }
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all boundaries tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement boundaries merge with deduplication`

---

### Task 5: Implement architecture thresholds merge with tests

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests in a `describe('architecture thresholds merge')` block:

```typescript
describe('architecture thresholds merge', () => {
  it('should add new threshold categories from bundle', () => {
    const localConfig = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 0 },
        modules: {},
      },
    };
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { complexity: 10 },
        modules: {},
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const arch = result.config.architecture as { thresholds: Record<string, unknown> };
    expect(arch.thresholds['circular-deps']).toBe(0);
    expect(arch.thresholds['complexity']).toBe(10);
    expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
  });

  it('should skip identical threshold values', () => {
    const localConfig = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 0 },
        modules: {},
      },
    };
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 0 },
        modules: {},
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.contributions['architecture.thresholds']).toBeUndefined();
    expect(result.conflicts).toEqual([]);
  });

  it('should report conflict for same category with different value', () => {
    const localConfig = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 0 },
        modules: {},
      },
    };
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 5 },
        modules: {},
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('architecture.thresholds');
    expect(result.conflicts[0].key).toBe('circular-deps');
    expect(result.conflicts[0].localValue).toBe(0);
    expect(result.conflicts[0].packageValue).toBe(5);
  });

  it('should handle bundle architecture when local has none', () => {
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { complexity: 10 },
        modules: {},
      },
    };
    const result = deepMergeConstraints({}, bundle);
    const arch = result.config.architecture as { thresholds: Record<string, unknown> };
    expect(arch.thresholds['complexity']).toBe(10);
    expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
  });

  it('should handle thresholds with nested record values (per-subcategory)', () => {
    const localConfig = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { complexity: { 'src/api': 5 } },
        modules: {},
      },
    };
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { complexity: { 'src/api': 10 } },
        modules: {},
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('architecture.thresholds');
    expect(result.conflicts[0].key).toBe('complexity');
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Implement architecture thresholds merge in `merge.ts`. Use deep equality comparison for threshold values (which can be numbers or Record<string, number>):

```typescript
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

// In the function body:
if (bundleConstraints.architecture) {
  const localArch = (localConfig.architecture ?? {
    enabled: true,
    baselinePath: '.harness/arch/baselines.json',
    thresholds: {},
    modules: {},
  }) as {
    enabled: boolean;
    baselinePath: string;
    thresholds: Record<string, unknown>;
    modules: Record<string, Record<string, unknown>>;
  };

  const mergedThresholds = { ...localArch.thresholds };
  const contributedThresholdKeys: string[] = [];

  const bundleThresholds = bundleConstraints.architecture.thresholds ?? {};
  for (const [category, value] of Object.entries(bundleThresholds)) {
    if (!(category in mergedThresholds)) {
      mergedThresholds[category] = value;
      contributedThresholdKeys.push(category);
    } else if (!deepEqual(mergedThresholds[category], value)) {
      conflicts.push({
        section: 'architecture.thresholds',
        key: category,
        localValue: mergedThresholds[category],
        packageValue: value,
        description: `Architecture threshold '${category}' already exists locally with a different value`,
      });
    }
  }

  // ... modules merge handled in Task 6 ...

  config.architecture = {
    ...localArch,
    thresholds: mergedThresholds,
    modules: localArch.modules, // updated in Task 6
  };

  if (contributedThresholdKeys.length > 0) {
    contributions['architecture.thresholds'] = contributedThresholdKeys;
  }
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all architecture threshold tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement architecture thresholds merge with conflict detection`

---

### Task 6: Implement architecture modules merge with tests

**Depends on:** Task 5
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests in a `describe('architecture modules merge')` block:

```typescript
describe('architecture modules merge', () => {
  const makeArch = (
    thresholds: Record<string, unknown>,
    modules: Record<string, Record<string, unknown>>
  ) => ({
    architecture: {
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds,
      modules,
    },
  });

  it('should add new module overrides from bundle', () => {
    const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: {},
        modules: { 'src/lib': { complexity: 15 } },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const arch = result.config.architecture as { modules: Record<string, Record<string, unknown>> };
    expect(arch.modules['src/api']).toEqual({ complexity: 5 });
    expect(arch.modules['src/lib']).toEqual({ complexity: 15 });
    expect(result.contributions['architecture.modules']).toEqual(['src/lib:complexity']);
  });

  it('should add new categories to existing module', () => {
    const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: {},
        modules: { 'src/api': { coupling: 3 } },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const arch = result.config.architecture as { modules: Record<string, Record<string, unknown>> };
    expect(arch.modules['src/api']).toEqual({ complexity: 5, coupling: 3 });
    expect(result.contributions['architecture.modules']).toEqual(['src/api:coupling']);
  });

  it('should report conflict for same module + same category with different value', () => {
    const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: {},
        modules: { 'src/api': { complexity: 20 } },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('architecture.modules');
    expect(result.conflicts[0].key).toBe('src/api:complexity');
    expect(result.conflicts[0].localValue).toBe(5);
    expect(result.conflicts[0].packageValue).toBe(20);
  });

  it('should skip identical module + category values', () => {
    const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: {},
        modules: { 'src/api': { complexity: 5 } },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.contributions['architecture.modules']).toBeUndefined();
    expect(result.conflicts).toEqual([]);
  });

  it('should handle modules when local has no architecture', () => {
    const bundle: BundleConstraints = {
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: {},
        modules: { 'src/lib': { coupling: 3 } },
      },
    };
    const result = deepMergeConstraints({}, bundle);
    const arch = result.config.architecture as { modules: Record<string, Record<string, unknown>> };
    expect(arch.modules['src/lib']).toEqual({ coupling: 3 });
    expect(result.contributions['architecture.modules']).toEqual(['src/lib:coupling']);
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Complete the architecture merge in `merge.ts` by adding module merge logic inside the existing `if (bundleConstraints.architecture)` block:

```typescript
const mergedModules = { ...localArch.modules };
const contributedModuleKeys: string[] = [];

const bundleModules = bundleConstraints.architecture.modules ?? {};
for (const [modulePath, bundleCategoryMap] of Object.entries(bundleModules)) {
  if (!(modulePath in mergedModules)) {
    mergedModules[modulePath] = bundleCategoryMap;
    for (const cat of Object.keys(bundleCategoryMap)) {
      contributedModuleKeys.push(`${modulePath}:${cat}`);
    }
  } else {
    const localCategoryMap = mergedModules[modulePath];
    const mergedCategoryMap = { ...localCategoryMap };
    for (const [category, value] of Object.entries(bundleCategoryMap)) {
      if (!(category in mergedCategoryMap)) {
        mergedCategoryMap[category] = value;
        contributedModuleKeys.push(`${modulePath}:${category}`);
      } else if (!deepEqual(mergedCategoryMap[category], value)) {
        conflicts.push({
          section: 'architecture.modules',
          key: `${modulePath}:${category}`,
          localValue: mergedCategoryMap[category],
          packageValue: value,
          description: `Architecture module override '${modulePath}' category '${category}' already exists locally with a different value`,
        });
      }
    }
    mergedModules[modulePath] = mergedCategoryMap;
  }
}

config.architecture = {
  ...localArch,
  thresholds: mergedThresholds,
  modules: mergedModules,
};

// Update contributions (thresholds already set above)
if (contributedModuleKeys.length > 0) {
  contributions['architecture.modules'] = contributedModuleKeys;
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all architecture module tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement architecture modules merge with per-category conflict detection`

---

### Task 7: Implement security rules merge with tests

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/merge.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Add tests in a `describe('security rules merge')` block:

```typescript
describe('security rules merge', () => {
  const localConfig = {
    security: {
      rules: {
        'SEC-CRY-001': 'error' as const,
        'SEC-INJ-002': 'warning' as const,
      },
    },
  };

  it('should add new security rules from bundle', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: { 'SEC-XSS-003': 'error' },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const security = result.config.security as { rules: Record<string, string> };
    expect(security.rules['SEC-CRY-001']).toBe('error');
    expect(security.rules['SEC-XSS-003']).toBe('error');
    expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);
  });

  it('should skip identical security rules', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: { 'SEC-CRY-001': 'error' },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.contributions['security.rules']).toBeUndefined();
    expect(result.conflicts).toEqual([]);
  });

  it('should report conflict for same rule ID with different severity', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: { 'SEC-CRY-001': 'warning' },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].section).toBe('security.rules');
    expect(result.conflicts[0].key).toBe('SEC-CRY-001');
    expect(result.conflicts[0].localValue).toBe('error');
    expect(result.conflicts[0].packageValue).toBe('warning');
  });

  it('should handle bundle security rules when local has none', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: { 'SEC-CRY-001': 'error' },
      },
    };
    const result = deepMergeConstraints({}, bundle);
    const security = result.config.security as { rules: Record<string, string> };
    expect(security.rules['SEC-CRY-001']).toBe('error');
    expect(result.contributions['security.rules']).toEqual(['SEC-CRY-001']);
  });

  it('should handle mixed: new, identical, and conflicting rules', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: {
          'SEC-CRY-001': 'error', // identical
          'SEC-INJ-002': 'error', // conflict (was warning)
          'SEC-XSS-003': 'info', // new
        },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const security = result.config.security as { rules: Record<string, string> };
    expect(security.rules['SEC-XSS-003']).toBe('info');
    expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].key).toBe('SEC-INJ-002');
  });

  it('should handle bundle security with undefined rules', () => {
    const bundle: BundleConstraints = {
      security: {},
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.config).toEqual(localConfig);
    expect(result.contributions['security.rules']).toBeUndefined();
  });

  it('should handle security rules with off severity', () => {
    const bundle: BundleConstraints = {
      security: {
        rules: { 'SEC-NEW-001': 'off' },
      },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    const security = result.config.security as { rules: Record<string, string> };
    expect(security.rules['SEC-NEW-001']).toBe('off');
    expect(result.contributions['security.rules']).toEqual(['SEC-NEW-001']);
  });
});
```

2. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe failures
3. Implement security rules merge in `merge.ts`:

```typescript
if (bundleConstraints.security?.rules) {
  const localSecurity = (localConfig.security ?? { rules: {} }) as {
    rules?: Record<string, string>;
  };
  const localRules = localSecurity.rules ?? {};
  const mergedRules = { ...localRules };
  const contributedRuleIds: string[] = [];

  for (const [ruleId, severity] of Object.entries(bundleConstraints.security.rules)) {
    if (!(ruleId in mergedRules)) {
      mergedRules[ruleId] = severity;
      contributedRuleIds.push(ruleId);
    } else if (mergedRules[ruleId] !== severity) {
      conflicts.push({
        section: 'security.rules',
        key: ruleId,
        localValue: mergedRules[ruleId],
        packageValue: severity,
        description: `Security rule '${ruleId}' already exists locally with severity '${mergedRules[ruleId]}', bundle has '${severity}'`,
      });
    }
  }

  config.security = { ...localSecurity, rules: mergedRules };

  if (contributedRuleIds.length > 0) {
    contributions['security.rules'] = contributedRuleIds;
  }
}
```

4. Run test: `npx vitest run tests/constraints/sharing/merge.test.ts` -- observe all security rules tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): implement security rules merge with conflict detection`

---

### Task 8: Wire merge into barrel export, add cross-section integration tests

**Depends on:** Tasks 2, 3, 4, 5, 6, 7
**Files:** `packages/core/src/constraints/sharing/index.ts`, `packages/core/tests/constraints/sharing/merge.test.ts`

1. Update `packages/core/src/constraints/sharing/index.ts` to add merge exports:

```typescript
// At the end of the file, add:
export { deepMergeConstraints } from './merge';
export type { ConflictReport, MergeResult } from './merge';
```

2. Add integration tests to `merge.test.ts` in a `describe('cross-section integration')` block:

```typescript
describe('cross-section integration', () => {
  it('should merge all sections at once from a realistic bundle', () => {
    const localConfig = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      forbiddenImports: [{ from: 'src/domain/**', disallow: ['src/api/**'] }],
      boundaries: { requireSchema: ['src/api/**'] },
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { 'circular-deps': 0 },
        modules: {},
      },
      security: { rules: { 'SEC-CRY-001': 'error' } },
    };

    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] }],
      forbiddenImports: [
        { from: 'src/infra/**', disallow: ['src/ui/**'], message: 'infra cannot import ui' },
      ],
      boundaries: { requireSchema: ['src/models/**'] },
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds: { complexity: 10 },
        modules: { 'src/api': { coupling: 3 } },
      },
      security: { rules: { 'SEC-XSS-003': 'warning' } },
    };

    const result = deepMergeConstraints(localConfig, bundle);

    // Layers
    const layers = result.config.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(2);
    expect(layers[1].name).toBe('infra');
    expect(result.contributions.layers).toEqual(['infra']);

    // Forbidden imports
    const fi = result.config.forbiddenImports as Array<{ from: string }>;
    expect(fi).toHaveLength(2);
    expect(fi[1].from).toBe('src/infra/**');
    expect(result.contributions.forbiddenImports).toEqual([1]);

    // Boundaries
    const boundaries = result.config.boundaries as { requireSchema: string[] };
    expect(boundaries.requireSchema).toEqual(['src/api/**', 'src/models/**']);
    expect(result.contributions.boundaries).toEqual(['src/models/**']);

    // Architecture
    const arch = result.config.architecture as {
      thresholds: Record<string, unknown>;
      modules: Record<string, Record<string, unknown>>;
    };
    expect(arch.thresholds['circular-deps']).toBe(0);
    expect(arch.thresholds['complexity']).toBe(10);
    expect(arch.modules['src/api']).toEqual({ coupling: 3 });
    expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
    expect(result.contributions['architecture.modules']).toEqual(['src/api:coupling']);

    // Security
    const security = result.config.security as { rules: Record<string, string> };
    expect(security.rules['SEC-CRY-001']).toBe('error');
    expect(security.rules['SEC-XSS-003']).toBe('warning');
    expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);

    // No conflicts
    expect(result.conflicts).toEqual([]);
  });

  it('should collect conflicts across multiple sections', () => {
    const localConfig = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      security: { rules: { 'SEC-CRY-001': 'error' } },
    };
    const bundle: BundleConstraints = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['utils'] }],
      security: { rules: { 'SEC-CRY-001': 'off' } },
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.map((c) => c.section).sort()).toEqual(['layers', 'security.rules']);
  });

  it('should preserve non-constraint config keys untouched', () => {
    const localConfig = {
      projectName: 'my-project',
      version: '1.0.0',
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
    };
    const result = deepMergeConstraints(localConfig, bundle);
    expect((result.config as Record<string, unknown>).projectName).toBe('my-project');
    expect((result.config as Record<string, unknown>).version).toBe('1.0.0');
  });

  it('should handle completely empty local config with a full bundle', () => {
    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
      forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
      boundaries: { requireSchema: ['src/api/**'] },
      security: { rules: { 'SEC-CRY-001': 'error' } },
    };
    const result = deepMergeConstraints({}, bundle);
    expect(result.conflicts).toEqual([]);
    expect(result.contributions.layers).toEqual(['infra']);
    expect(result.contributions.forbiddenImports).toEqual([0]);
    expect(result.contributions.boundaries).toEqual(['src/api/**']);
    expect(result.contributions['security.rules']).toEqual(['SEC-CRY-001']);
  });

  it('should be idempotent: merging the same bundle twice yields no new contributions', () => {
    const localConfig = {};
    const bundle: BundleConstraints = {
      layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
      security: { rules: { 'SEC-CRY-001': 'error' } },
    };

    // First merge
    const first = deepMergeConstraints(localConfig, bundle);
    expect(first.contributions.layers).toEqual(['infra']);

    // Second merge into the result of the first
    const second = deepMergeConstraints(first.config, bundle);
    expect(second.contributions.layers).toBeUndefined();
    expect(second.contributions['security.rules']).toBeUndefined();
    expect(second.conflicts).toEqual([]);
    expect(second.config).toEqual(first.config);
  });
});
```

3. Run full test suite: `npx vitest run tests/constraints/sharing/merge.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(constraints): wire merge into barrel export, add cross-section integration tests`
