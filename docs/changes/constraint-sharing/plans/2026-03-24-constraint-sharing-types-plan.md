# Plan: Constraint Sharing Phase 1 -- Types, Schemas, and writeConfig

**Date:** 2026-03-24
**Spec:** docs/changes/constraint-sharing/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Define Zod schemas for constraint-sharing manifest, bundle, and lockfile formats, plus an atomic `writeConfig()` utility, so that all subsequent phases (bundle extraction, merge engine, lockfile, CLI commands) have a validated type foundation to build on.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/constraints/sharing/types.ts` exists and exports `ManifestSchema`, `BundleSchema`, `LockfileSchema`, and their inferred TypeScript types (`Manifest`, `Bundle`, `Lockfile`).
2. When valid manifest data is passed to `ManifestSchema.parse()`, the system shall return a typed object with `name`, `version`, `description`, `minHarnessVersion`, `keywords`, and `include` fields.
3. When manifest data is missing required fields (`name`, `version`, `include`), `ManifestSchema.safeParse()` shall return `{ success: false }` with descriptive error messages.
4. When valid bundle data is passed to `BundleSchema.parse()`, the system shall return a typed object with metadata fields and a `constraints` object containing optional `layers`, `forbiddenImports`, `boundaries`, `architecture`, and `security` sections -- reusing existing Zod schemas from `packages/cli/src/config/schema.ts` for the constraint sub-schemas.
5. When valid lockfile data is passed to `LockfileSchema.parse()`, the system shall return a typed object with `version: 1` and a `packages` record mapping package names to `{ version, source, installedAt, contributions }`.
6. `packages/core/src/constraints/sharing/write-config.ts` exists and exports `writeConfig(configPath: string, config: unknown): Promise<void>` that writes JSON atomically (temp file + rename).
7. When `writeConfig()` is called with a valid path and object, the system shall write formatted JSON (`JSON.stringify(config, null, 2)`) to a temp file in the same directory, then atomically rename it to the target path.
8. If the target directory does not exist, `writeConfig()` shall throw an error (it does not create directories).
9. `npx vitest run packages/core/tests/constraints/sharing/` passes with all tests green.
10. `harness validate` passes after all tasks are complete.

## File Map

```
CREATE packages/core/src/constraints/sharing/types.ts
CREATE packages/core/src/constraints/sharing/write-config.ts
CREATE packages/core/src/constraints/sharing/index.ts
MODIFY packages/core/src/constraints/index.ts (add sharing re-export)
CREATE packages/core/tests/constraints/sharing/types.test.ts
CREATE packages/core/tests/constraints/sharing/write-config.test.ts
```

## Tasks

### Task 1: Create ManifestSchema, BundleSchema, and LockfileSchema

**Depends on:** none
**Files:** `packages/core/src/constraints/sharing/types.ts`

1. Create directory `packages/core/src/constraints/sharing/`.
2. Create `packages/core/src/constraints/sharing/types.ts` with the following content:

```typescript
import { z } from 'zod';
import {
  LayerSchema,
  ForbiddenImportSchema,
  BoundaryConfigSchema,
  SecurityConfigSchema,
} from '../../../cli/src/config/schema';
import { ArchConfigSchema } from '../../architecture/types';

// --- Manifest: constraints.yaml ---

export const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  minHarnessVersion: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
  include: z.array(z.string().min(1)).min(1, 'At least one include path is required'),
});

export type Manifest = z.infer<typeof ManifestSchema>;

// --- Bundle: .harness-constraints.json ---

export const BundleConstraintsSchema = z.object({
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),
  architecture: ArchConfigSchema.optional(),
  security: z
    .object({
      rules: z.record(z.string(), z.enum(['off', 'error', 'warning', 'info'])).optional(),
    })
    .optional(),
});

export type BundleConstraints = z.infer<typeof BundleConstraintsSchema>;

export const BundleSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  minHarnessVersion: z.string().optional(),
  description: z.string().optional(),
  constraints: BundleConstraintsSchema,
});

export type Bundle = z.infer<typeof BundleSchema>;

// --- Lockfile: .harness/constraints.lock.json ---

export const ContributionsSchema = z.object({
  layers: z.array(z.string()).optional(),
  forbiddenImports: z.array(z.number().int().nonnegative()).optional(),
  boundaries: z.array(z.string()).optional(),
  'architecture.thresholds': z.array(z.string()).optional(),
  'architecture.modules': z.array(z.string()).optional(),
  'security.rules': z.array(z.string()).optional(),
});

export type Contributions = z.infer<typeof ContributionsSchema>;

export const LockfilePackageSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  installedAt: z.string().datetime(),
  contributions: ContributionsSchema,
});

export type LockfilePackage = z.infer<typeof LockfilePackageSchema>;

export const LockfileSchema = z.object({
  version: z.literal(1),
  packages: z.record(z.string(), LockfilePackageSchema),
});

export type Lockfile = z.infer<typeof LockfileSchema>;
```

**Important:** The import of `LayerSchema`, `ForbiddenImportSchema`, `BoundaryConfigSchema`, and `SecurityConfigSchema` from `packages/cli/src/config/schema.ts` crosses a package boundary (core importing from cli). This is architecturally wrong -- core should not depend on cli. These schemas need to either:

- (a) Already exist in core or types package, or
- (b) Be duplicated/redefined locally.

Checking the codebase: `ArchConfigSchema` is already in `packages/core/src/architecture/types.ts`. The other schemas (`LayerSchema`, `ForbiddenImportSchema`, `BoundaryConfigSchema`, `SecurityConfigSchema`) are defined in `packages/cli/src/config/schema.ts` and are NOT available in core.

**Resolution:** Define the constraint sub-schemas inline in `types.ts` rather than importing from cli. They are small and self-contained. This avoids a cross-package dependency violation.

Corrected content for `packages/core/src/constraints/sharing/types.ts`:

```typescript
import { z } from 'zod';
import { ArchConfigSchema } from '../../architecture/types';

// --- Constraint sub-schemas (self-contained, no cli dependency) ---

export const SharableLayerSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  allowedDependencies: z.array(z.string()),
});

export const SharableForbiddenImportSchema = z.object({
  from: z.string(),
  disallow: z.array(z.string()),
  message: z.string().optional(),
});

export const SharableBoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),
});

export const SharableSecurityRulesSchema = z.object({
  rules: z.record(z.string(), z.enum(['off', 'error', 'warning', 'info'])).optional(),
});

// --- Manifest: constraints.yaml ---

export const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  minHarnessVersion: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  include: z.array(z.string().min(1)).min(1, 'At least one include path is required'),
});

export type Manifest = z.infer<typeof ManifestSchema>;

// --- Bundle: .harness-constraints.json ---

export const BundleConstraintsSchema = z.object({
  layers: z.array(SharableLayerSchema).optional(),
  forbiddenImports: z.array(SharableForbiddenImportSchema).optional(),
  boundaries: SharableBoundaryConfigSchema.optional(),
  architecture: ArchConfigSchema.optional(),
  security: SharableSecurityRulesSchema.optional(),
});

export type BundleConstraints = z.infer<typeof BundleConstraintsSchema>;

export const BundleSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  minHarnessVersion: z.string().optional(),
  description: z.string().optional(),
  constraints: BundleConstraintsSchema,
});

export type Bundle = z.infer<typeof BundleSchema>;

// --- Lockfile: .harness/constraints.lock.json ---

export const ContributionsSchema = z.object({
  layers: z.array(z.string()).optional(),
  forbiddenImports: z.array(z.number().int().nonnegative()).optional(),
  boundaries: z.array(z.string()).optional(),
  'architecture.thresholds': z.array(z.string()).optional(),
  'architecture.modules': z.array(z.string()).optional(),
  'security.rules': z.array(z.string()).optional(),
});

export type Contributions = z.infer<typeof ContributionsSchema>;

export const LockfilePackageSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  installedAt: z.string().datetime(),
  contributions: ContributionsSchema,
});

export type LockfilePackage = z.infer<typeof LockfilePackageSchema>;

export const LockfileSchema = z.object({
  version: z.literal(1),
  packages: z.record(z.string(), LockfilePackageSchema),
});

export type Lockfile = z.infer<typeof LockfileSchema>;
```

3. Run: `harness validate`
4. Commit: `feat(constraints): add Zod schemas for manifest, bundle, and lockfile`

---

### Task 2: Create types test file with schema validation tests

**Depends on:** Task 1
**Files:** `packages/core/tests/constraints/sharing/types.test.ts`

1. Create directory `packages/core/tests/constraints/sharing/`.
2. Create `packages/core/tests/constraints/sharing/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ManifestSchema,
  BundleSchema,
  LockfileSchema,
  ContributionsSchema,
  LockfilePackageSchema,
  BundleConstraintsSchema,
} from '../../../src/constraints/sharing/types';

describe('ManifestSchema', () => {
  it('should parse a valid manifest', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      description: 'Strict API constraints',
      minHarnessVersion: '1.0.0',
      keywords: ['api', 'strict'],
      include: ['layers', 'forbiddenImports', 'security.rules'],
    };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('strict-api');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.include).toHaveLength(3);
    }
  });

  it('should apply defaults for optional fields', () => {
    const input = {
      name: 'minimal',
      version: '0.1.0',
      include: ['layers'],
    };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toEqual([]);
      expect(result.data.description).toBeUndefined();
      expect(result.data.minHarnessVersion).toBeUndefined();
    }
  });

  it('should reject manifest without name', () => {
    const input = { version: '1.0.0', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest without version', () => {
    const input = { name: 'test', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest with empty include array', () => {
    const input = { name: 'test', version: '1.0.0', include: [] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest without include', () => {
    const input = { name: 'test', version: '1.0.0' };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const input = { name: '', version: '1.0.0', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('BundleConstraintsSchema', () => {
  it('should parse empty constraints', () => {
    const result = BundleConstraintsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse constraints with layers', () => {
    const input = {
      layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layers).toHaveLength(1);
      expect(result.data.layers![0].name).toBe('types');
    }
  });

  it('should parse constraints with forbiddenImports', () => {
    const input = {
      forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'], message: 'No' }],
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should parse constraints with security rules', () => {
    const input = {
      security: {
        rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
      },
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('BundleSchema', () => {
  it('should parse a valid bundle', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      minHarnessVersion: '1.0.0',
      description: 'Strict API constraints',
      constraints: {
        layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
        forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
        security: { rules: { 'SEC-CRY-001': 'error' } },
      },
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('strict-api');
      expect(result.data.constraints.layers).toHaveLength(1);
    }
  });

  it('should reject bundle without name', () => {
    const input = {
      version: '1.0.0',
      constraints: {},
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject bundle without constraints', () => {
    const input = { name: 'test', version: '1.0.0' };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should parse bundle with empty constraints', () => {
    const input = {
      name: 'empty',
      version: '1.0.0',
      constraints: {},
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('ContributionsSchema', () => {
  it('should parse valid contributions', () => {
    const input = {
      layers: ['types', 'core'],
      forbiddenImports: [0, 1, 2],
      'security.rules': ['SEC-CRY-001'],
    };
    const result = ContributionsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should parse empty contributions', () => {
    const result = ContributionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject negative forbiddenImports indices', () => {
    const input = { forbiddenImports: [-1] };
    const result = ContributionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('LockfileSchema', () => {
  it('should parse a valid lockfile', () => {
    const input = {
      version: 1,
      packages: {
        'strict-api': {
          version: '1.0.0',
          source: './shared/strict-api.harness-constraints.json',
          installedAt: '2026-03-24T12:00:00Z',
          contributions: {
            layers: ['types', 'core'],
            forbiddenImports: [0, 1],
            'security.rules': ['SEC-CRY-001'],
          },
        },
      },
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.packages['strict-api'].version).toBe('1.0.0');
    }
  });

  it('should reject lockfile with wrong version', () => {
    const input = { version: 2, packages: {} };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should parse empty lockfile (no packages)', () => {
    const input = { version: 1, packages: {} };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject package with invalid installedAt', () => {
    const input = {
      version: 1,
      packages: {
        test: {
          version: '1.0.0',
          source: './test.json',
          installedAt: 'not-a-date',
          contributions: {},
        },
      },
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject package with empty version', () => {
    const input = {
      version: 1,
      packages: {
        test: {
          version: '',
          source: './test.json',
          installedAt: '2026-03-24T12:00:00Z',
          contributions: {},
        },
      },
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

3. Run test: `cd packages/core && npx vitest run tests/constraints/sharing/types.test.ts`
4. Observe: all tests pass (schemas were created in Task 1).
5. Run: `harness validate`
6. Commit: `test(constraints): add schema validation tests for manifest, bundle, and lockfile`

---

### Task 3: Create writeConfig utility with atomic write

**Depends on:** none (parallel with Task 1)
**Files:** `packages/core/src/constraints/sharing/write-config.ts`

1. Create `packages/core/src/constraints/sharing/write-config.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Atomically write a config object as formatted JSON.
 *
 * Writes to a temp file in the same directory, then renames.
 * This prevents partial writes from corrupting the target file.
 *
 * @param configPath - Absolute or relative path to the target JSON file
 * @param config - The object to serialize (must be JSON-serializable)
 */
export async function writeConfig(configPath: string, config: unknown): Promise<void> {
  const resolvedPath = path.resolve(configPath);
  const dir = path.dirname(resolvedPath);
  const basename = path.basename(resolvedPath);
  const tempName = `.${basename}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const tempPath = path.join(dir, tempName);

  const content = JSON.stringify(config, null, 2) + '\n';

  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, resolvedPath);
}
```

2. Run: `harness validate`
3. Commit: `feat(constraints): add atomic writeConfig utility`

---

### Task 4: Create writeConfig tests

**Depends on:** Task 3
**Files:** `packages/core/tests/constraints/sharing/write-config.test.ts`

1. Create `packages/core/tests/constraints/sharing/write-config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { writeConfig } from '../../../src/constraints/sharing/write-config';

describe('writeConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-write-config-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write formatted JSON to the target path', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = { version: 1, name: 'test' };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(content).toBe(JSON.stringify(config, null, 2) + '\n');
  });

  it('should overwrite an existing file', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    await fs.writeFile(targetPath, '{"old": true}', 'utf-8');

    const newConfig = { version: 1, updated: true };
    await writeConfig(targetPath, newConfig);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(newConfig);
  });

  it('should produce valid JSON output', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = {
      version: 1,
      layers: [{ name: 'types', pattern: 'src/**' }],
      security: { rules: { 'SEC-001': 'error' } },
    };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(config);
  });

  it('should not leave temp files on success', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    await writeConfig(targetPath, { test: true });

    const files = await fs.readdir(tempDir);
    expect(files).toEqual(['config.json']);
  });

  it('should throw if target directory does not exist', async () => {
    const targetPath = path.join(tempDir, 'nonexistent', 'config.json');

    await expect(writeConfig(targetPath, {})).rejects.toThrow();
  });

  it('should handle nested objects and arrays', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = {
      version: 1,
      packages: {
        'strict-api': {
          version: '1.0.0',
          contributions: { layers: ['a', 'b'] },
        },
      },
    };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(config);
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/constraints/sharing/write-config.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(constraints): add writeConfig atomic write tests`

---

### Task 5: Create barrel exports and wire into constraints module

**Depends on:** Task 1, Task 3
**Files:** `packages/core/src/constraints/sharing/index.ts`, `packages/core/src/constraints/index.ts`

1. Create `packages/core/src/constraints/sharing/index.ts`:

```typescript
// Schemas
export {
  ManifestSchema,
  BundleSchema,
  BundleConstraintsSchema,
  LockfileSchema,
  LockfilePackageSchema,
  ContributionsSchema,
  SharableLayerSchema,
  SharableForbiddenImportSchema,
  SharableBoundaryConfigSchema,
  SharableSecurityRulesSchema,
} from './types';

// Types
export type {
  Manifest,
  Bundle,
  BundleConstraints,
  Lockfile,
  LockfilePackage,
  Contributions,
} from './types';

// Utilities
export { writeConfig } from './write-config';
```

2. Modify `packages/core/src/constraints/index.ts` -- add the following lines at the end of the file:

```typescript
// Constraint sharing (manifest, bundle, lockfile)
export * from './sharing';
```

3. Run: `cd packages/core && npx vitest run tests/constraints/sharing/`
4. Observe: all tests still pass.
5. Run: `harness validate`
6. Commit: `feat(constraints): add barrel exports for sharing module`

---

## Traceability

| Observable Truth                                                  | Delivered By               |
| ----------------------------------------------------------------- | -------------------------- |
| 1. types.ts exports schemas and types                             | Task 1                     |
| 2. ManifestSchema parses valid data                               | Task 1, verified by Task 2 |
| 3. ManifestSchema rejects invalid data                            | Task 1, verified by Task 2 |
| 4. BundleSchema parses with constraint sub-schemas                | Task 1, verified by Task 2 |
| 5. LockfileSchema parses with version literal and packages record | Task 1, verified by Task 2 |
| 6. writeConfig exists with correct signature                      | Task 3                     |
| 7. writeConfig writes atomically                                  | Task 3, verified by Task 4 |
| 8. writeConfig throws on missing directory                        | Task 3, verified by Task 4 |
| 9. All tests pass                                                 | Task 2, Task 4             |
| 10. harness validate passes                                       | Every task                 |

## Notes

- The `constraints/` directory already contains enforcement types (`Layer`, `DependencyGraph`, etc.). The sharing module goes in `constraints/sharing/` to avoid collision with the existing `types.ts`.
- Constraint sub-schemas (`SharableLayerSchema`, etc.) are defined locally in `types.ts` rather than imported from `packages/cli/src/config/schema.ts`, because core must not depend on cli. The schemas match the same shape as the cli schemas but are independently defined.
- The `ArchConfigSchema` import from `../../architecture/types` is valid -- it is within the same package (`@harness-engineering/core`).
- `writeConfig` appends a trailing newline after the JSON for POSIX compliance.
