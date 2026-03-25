# Plan: Constraint Sharing Phase 6 -- Uninstall and Upgrade

**Date:** 2026-03-25
**Spec:** docs/changes/constraint-sharing/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Users can uninstall constraint packages (removing exactly the rules they contributed) and upgrade installed packages (uninstall old + install new) via CLI commands.

## Observable Truths (Acceptance Criteria)

1. When a user runs `harness uninstall-constraints strict-api`, the system shall remove exactly the layers, forbiddenImports, boundaries, architecture thresholds/modules, and security rules that `strict-api` contributed (as recorded in the lockfile), leaving all other config entries untouched.
2. When a user runs `harness uninstall-constraints nonexistent`, the system shall exit with error `"Package 'nonexistent' is not installed."` without modifying any files.
3. When a user runs `harness install-constraints` with a bundle whose name matches an already-installed package at a different version, the system shall remove the old contributions, merge the new bundle, and update the lockfile entry (upgrade semantics).
4. When a user installs then uninstalls a constraint package, the resulting `harness.config.json` shall be identical to its pre-install state (round-trip integrity).
5. `npx vitest run packages/core/tests/constraints/sharing/remove.test.ts` passes with tests covering all six contribution sections.
6. `npx vitest run packages/cli/tests/commands/uninstall-constraints.test.ts` passes with tests for success, not-found, and round-trip.
7. `npx vitest run packages/cli/tests/commands/install-constraints.test.ts` passes including new upgrade-detection tests.
8. `harness validate` passes after all tasks are complete.

## File Map

- CREATE `packages/core/src/constraints/sharing/remove.ts`
- CREATE `packages/core/tests/constraints/sharing/remove.test.ts`
- MODIFY `packages/core/src/constraints/sharing/index.ts` (add `removeContributions` export)
- CREATE `packages/cli/src/commands/uninstall-constraints.ts`
- CREATE `packages/cli/tests/commands/uninstall-constraints.test.ts`
- MODIFY `packages/cli/src/commands/install-constraints.ts` (add upgrade detection)
- MODIFY `packages/cli/tests/commands/install-constraints.test.ts` (add upgrade tests)
- MODIFY `packages/cli/src/index.ts` (register `uninstall-constraints` command)

## Tasks

### Task 1: Create removeContributions core function (TDD)

**Depends on:** none
**Files:** `packages/core/tests/constraints/sharing/remove.test.ts`, `packages/core/src/constraints/sharing/remove.ts`

1. Create test file `packages/core/tests/constraints/sharing/remove.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { removeContributions } from '../../../src/constraints/sharing/remove';
import type { Contributions } from '../../../src/constraints/sharing/types';

describe('removeContributions', () => {
  it('returns config unchanged when contributions is empty', () => {
    const config = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const contributions: Contributions = {};
    const result = removeContributions(config, contributions);
    expect(result).toEqual(config);
  });

  describe('layers removal', () => {
    it('removes layers whose name matches contributions.layers', () => {
      const config = {
        layers: [
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
          { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
          { name: 'api', pattern: 'src/api/**', allowedDependencies: ['domain'] },
        ],
      };
      const contributions: Contributions = { layers: ['infra'] };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(2);
      expect(layers.map((l) => l.name)).toEqual(['domain', 'api']);
    });

    it('handles removing multiple layers', () => {
      const config = {
        layers: [
          { name: 'a', pattern: 'a/**', allowedDependencies: [] },
          { name: 'b', pattern: 'b/**', allowedDependencies: [] },
          { name: 'c', pattern: 'c/**', allowedDependencies: [] },
        ],
      };
      const contributions: Contributions = { layers: ['a', 'c'] };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('b');
    });

    it('is a no-op when contributed layer name does not exist', () => {
      const config = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      };
      const contributions: Contributions = { layers: ['nonexistent'] };
      const result = removeContributions(config, contributions);
      expect(result.layers).toEqual(config.layers);
    });
  });

  describe('forbiddenImports removal', () => {
    it('removes rules whose from key matches contributions.forbiddenImports', () => {
      const config = {
        forbiddenImports: [
          { from: 'src/types/**', disallow: ['src/core/**'], message: 'No core' },
          { from: 'src/api/**', disallow: ['src/db/**'], message: 'No db' },
        ],
      };
      const contributions: Contributions = { forbiddenImports: ['src/types/**'] };
      const result = removeContributions(config, contributions);
      const rules = result.forbiddenImports as Array<{ from: string }>;
      expect(rules).toHaveLength(1);
      expect(rules[0].from).toBe('src/api/**');
    });
  });

  describe('boundaries removal', () => {
    it('removes matching requireSchema entries', () => {
      const config = {
        boundaries: {
          requireSchema: ['user.schema.json', 'order.schema.json', 'product.schema.json'],
        },
      };
      const contributions: Contributions = {
        boundaries: ['order.schema.json'],
      };
      const result = removeContributions(config, contributions);
      const boundaries = result.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['user.schema.json', 'product.schema.json']);
    });
  });

  describe('architecture.thresholds removal', () => {
    it('removes matching category keys from thresholds', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { coupling: 0.5, complexity: 10, cohesion: 0.8 },
          modules: {},
        },
      };
      const contributions: Contributions = {
        'architecture.thresholds': ['complexity'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        thresholds: Record<string, unknown>;
      };
      expect(arch.thresholds).toEqual({ coupling: 0.5, cohesion: 0.8 });
    });
  });

  describe('architecture.modules removal', () => {
    it('removes matching modulePath:category entries', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {
            'src/core': { coupling: 0.3, complexity: 5 },
            'src/api': { coupling: 0.4 },
          },
        },
      };
      const contributions: Contributions = {
        'architecture.modules': ['src/core:complexity'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/core']).toEqual({ coupling: 0.3 });
      expect(arch.modules['src/api']).toEqual({ coupling: 0.4 });
    });

    it('removes entire module entry when all categories are removed', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {
            'src/core': { coupling: 0.3 },
            'src/api': { coupling: 0.4 },
          },
        },
      };
      const contributions: Contributions = {
        'architecture.modules': ['src/core:coupling'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/core']).toBeUndefined();
      expect(arch.modules['src/api']).toEqual({ coupling: 0.4 });
    });
  });

  describe('security.rules removal', () => {
    it('removes matching rule IDs', () => {
      const config = {
        security: {
          rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning', 'SEC-XSS-003': 'error' },
        },
      };
      const contributions: Contributions = {
        'security.rules': ['SEC-CRY-001', 'SEC-XSS-003'],
      };
      const result = removeContributions(config, contributions);
      const security = result.security as { rules: Record<string, string> };
      expect(security.rules).toEqual({ 'SEC-INJ-002': 'warning' });
    });
  });

  describe('multi-section removal', () => {
    it('removes contributions from multiple sections in one call', () => {
      const config = {
        layers: [
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
          { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
        ],
        forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
        security: {
          rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
        },
      };
      const contributions: Contributions = {
        layers: ['infra'],
        forbiddenImports: ['src/types/**'],
        'security.rules': ['SEC-CRY-001'],
      };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('domain');
      expect(result.forbiddenImports).toEqual([]);
      const security = result.security as { rules: Record<string, string> };
      expect(security.rules).toEqual({ 'SEC-INJ-002': 'warning' });
    });
  });

  it('does not mutate the original config object', () => {
    const config = {
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
      ],
    };
    const contributions: Contributions = { layers: ['infra'] };
    const originalLayersLength = config.layers.length;
    removeContributions(config, contributions);
    expect(config.layers).toHaveLength(originalLayersLength);
  });
});
```

2. Run test: `npx vitest run packages/core/tests/constraints/sharing/remove.test.ts`
3. Observe failure: `removeContributions` is not found / cannot be imported.

4. Create implementation `packages/core/src/constraints/sharing/remove.ts`:

```typescript
import type { Contributions } from './types';

/**
 * Remove contributions from a config object.
 *
 * Uses the contributions record (as stored in the lockfile) to identify
 * exactly which rules/layers/thresholds to remove from each section.
 *
 * Returns a new config object; does not mutate the input.
 */
export function removeContributions(
  config: Record<string, unknown>,
  contributions: Contributions
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };

  // --- Layers ---
  const layerNames = contributions.layers as string[] | undefined;
  if (layerNames && layerNames.length > 0 && Array.isArray(result.layers)) {
    const nameSet = new Set(layerNames);
    result.layers = (result.layers as Array<{ name: string }>).filter((l) => !nameSet.has(l.name));
  }

  // --- Forbidden Imports ---
  const fromKeys = contributions.forbiddenImports as string[] | undefined;
  if (fromKeys && fromKeys.length > 0 && Array.isArray(result.forbiddenImports)) {
    const fromSet = new Set(fromKeys);
    result.forbiddenImports = (result.forbiddenImports as Array<{ from: string }>).filter(
      (r) => !fromSet.has(r.from)
    );
  }

  // --- Boundaries ---
  const boundarySchemas = contributions.boundaries as string[] | undefined;
  if (boundarySchemas && boundarySchemas.length > 0 && result.boundaries) {
    const boundaries = result.boundaries as { requireSchema?: string[] };
    if (boundaries.requireSchema) {
      const schemaSet = new Set(boundarySchemas);
      result.boundaries = {
        ...boundaries,
        requireSchema: boundaries.requireSchema.filter((s) => !schemaSet.has(s)),
      };
    }
  }

  // --- Architecture Thresholds ---
  const thresholdKeys = contributions['architecture.thresholds'] as string[] | undefined;
  if (thresholdKeys && thresholdKeys.length > 0 && result.architecture) {
    const arch = { ...(result.architecture as Record<string, unknown>) };
    const thresholds = { ...(arch.thresholds as Record<string, unknown>) };
    for (const key of thresholdKeys) {
      delete thresholds[key];
    }
    arch.thresholds = thresholds;
    result.architecture = arch;
  }

  // --- Architecture Modules ---
  const moduleKeys = contributions['architecture.modules'] as string[] | undefined;
  if (moduleKeys && moduleKeys.length > 0 && result.architecture) {
    const arch = { ...(result.architecture as Record<string, unknown>) };
    const modules = { ...(arch.modules as Record<string, Record<string, unknown>>) };
    for (const key of moduleKeys) {
      const colonIdx = key.indexOf(':');
      if (colonIdx === -1) continue;
      const modulePath = key.substring(0, colonIdx);
      const category = key.substring(colonIdx + 1);
      if (modules[modulePath]) {
        const moduleCategories = { ...modules[modulePath] };
        delete moduleCategories[category];
        if (Object.keys(moduleCategories).length === 0) {
          delete modules[modulePath];
        } else {
          modules[modulePath] = moduleCategories;
        }
      }
    }
    arch.modules = modules;
    result.architecture = arch;
  }

  // --- Security Rules ---
  const ruleIds = contributions['security.rules'] as string[] | undefined;
  if (ruleIds && ruleIds.length > 0 && result.security) {
    const security = { ...(result.security as Record<string, unknown>) };
    const rules = { ...(security.rules as Record<string, string>) };
    for (const id of ruleIds) {
      delete rules[id];
    }
    security.rules = rules;
    result.security = security;
  }

  return result;
}
```

5. Run test: `npx vitest run packages/core/tests/constraints/sharing/remove.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(constraints): add removeContributions function for lockfile-driven rule removal`

---

### Task 2: Export removeContributions from core sharing index

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/index.ts`

1. Add export to `packages/core/src/constraints/sharing/index.ts`. After the line `export { readLockfile, writeLockfile, addProvenance, removeProvenance } from './lockfile';`, add:

```typescript
// Removal
export { removeContributions } from './remove';
```

2. Verify the export is accessible by running: `npx vitest run packages/core/tests/constraints/sharing/remove.test.ts`
3. Run: `harness validate`
4. Commit: `feat(constraints): export removeContributions from sharing index`

---

### Task 3: Create uninstall-constraints CLI command (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/tests/commands/uninstall-constraints.test.ts`, `packages/cli/src/commands/uninstall-constraints.ts`

1. Create test file `packages/cli/tests/commands/uninstall-constraints.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { runUninstallConstraints } from '../../src/commands/uninstall-constraints';

describe('runUninstallConstraints', () => {
  let tmpDir: string;
  let configPath: string;
  let lockfilePath: string;

  // Config state after installing "test-bundle" with layers + security.rules
  const installedConfig = {
    version: 1,
    name: 'test-project',
    layers: [
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
      { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
    ],
    security: {
      rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
    },
  };

  const lockfileWithPackage = {
    version: 1 as const,
    packages: {
      'test-bundle': {
        version: '1.0.0',
        source: '/some/path/test-bundle.harness-constraints.json',
        installedAt: '2026-03-25T12:00:00Z',
        contributions: {
          layers: ['infra'],
          'security.rules': ['SEC-CRY-001'],
        },
      },
    },
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-uninstall-test-'));
    configPath = path.join(tmpDir, 'harness.config.json');
    lockfilePath = path.join(tmpDir, '.harness', 'constraints.lock.json');

    await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(installedConfig, null, 2));
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileWithPackage, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('removes contributed rules and updates config and lockfile', async () => {
    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toBe(true);
    expect(result.value.packageName).toBe('test-bundle');
    expect(result.value.sectionsRemoved).toContain('layers');
    expect(result.value.sectionsRemoved).toContain('security.rules');

    // Verify config: infra layer removed, domain remains
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const layers = updatedConfig.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('domain');

    // Verify config: SEC-CRY-001 removed, SEC-INJ-002 remains
    expect(updatedConfig.security.rules['SEC-CRY-001']).toBeUndefined();
    expect(updatedConfig.security.rules['SEC-INJ-002']).toBe('warning');

    // Verify lockfile: package entry removed
    const updatedLockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
    expect(updatedLockfile.packages['test-bundle']).toBeUndefined();
  });

  it('returns error when package is not installed', async () => {
    const result = await runUninstallConstraints({
      packageName: 'nonexistent',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not installed');
  });

  it('returns error when lockfile does not exist', async () => {
    await fs.rm(lockfilePath, { force: true });

    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('No lockfile');
  });

  it('handles package with no contributions gracefully', async () => {
    const lockfileNoContribs = {
      version: 1 as const,
      packages: {
        'empty-pkg': {
          version: '1.0.0',
          source: '/some/path.json',
          installedAt: '2026-03-25T12:00:00Z',
          contributions: null,
        },
      },
    };
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileNoContribs, null, 2));

    const result = await runUninstallConstraints({
      packageName: 'empty-pkg',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toBe(true);
    expect(result.value.sectionsRemoved).toEqual([]);
  });

  it('round-trip: install then uninstall restores original config', async () => {
    // Start with a clean config (only domain layer, only SEC-INJ-002)
    const originalConfig = {
      version: 1,
      name: 'test-project',
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      security: {
        rules: { 'SEC-INJ-002': 'warning' },
      },
    };
    await fs.writeFile(configPath, JSON.stringify(originalConfig, null, 2));

    // Simulate that test-bundle added infra + SEC-CRY-001 on top
    await fs.writeFile(configPath, JSON.stringify(installedConfig, null, 2));
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileWithPackage, null, 2));

    // Uninstall
    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(updatedConfig.layers).toEqual(originalConfig.layers);
    expect(updatedConfig.security.rules).toEqual(originalConfig.security.rules);
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/uninstall-constraints.test.ts`
3. Observe failure: `runUninstallConstraints` cannot be imported.

4. Create implementation `packages/cli/src/commands/uninstall-constraints.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import {
  readLockfile,
  writeLockfile,
  removeProvenance,
  removeContributions,
  writeConfig,
} from '@harness-engineering/core';
import type { Contributions } from '@harness-engineering/core';
import { findConfigFile } from '../config/loader';
import { logger } from '../output/logger';

// --- Types ---

export interface UninstallConstraintsOptions {
  packageName: string;
  configPath: string;
  lockfilePath: string;
}

export interface UninstallConstraintsSuccess {
  removed: boolean;
  packageName: string;
  version: string;
  sectionsRemoved: string[];
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// --- Core orchestration ---

export async function runUninstallConstraints(
  options: UninstallConstraintsOptions
): Promise<Result<UninstallConstraintsSuccess, string>> {
  const { packageName, configPath, lockfilePath } = options;

  // 1. Read lockfile
  const lockfileResult = await readLockfile(lockfilePath);
  if (!lockfileResult.ok) {
    return { ok: false, error: lockfileResult.error };
  }
  if (lockfileResult.value === null) {
    return { ok: false, error: 'No lockfile found. No constraint packages are installed.' };
  }
  const lockfile = lockfileResult.value;

  // 2. Find the package
  const entry = lockfile.packages[packageName];
  if (!entry) {
    return {
      ok: false,
      error: `Package '${packageName}' is not installed.`,
    };
  }

  // 3. Read local config
  let localConfig: Record<string, unknown>;
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    localConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    return {
      ok: false,
      error: `Failed to read local config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Remove contributions from config
  const contributions = (entry.contributions ?? {}) as Contributions;
  const sectionsRemoved = Object.keys(contributions);
  const updatedConfig = removeContributions(localConfig, contributions);

  // 5. Remove package from lockfile
  const { lockfile: updatedLockfile } = removeProvenance(lockfile, packageName);

  // 6. Write updated config
  const writeResult = await writeConfig(configPath, updatedConfig);
  if (!writeResult.ok) {
    return {
      ok: false,
      error: `Failed to write config: ${writeResult.error instanceof Error ? writeResult.error.message : String(writeResult.error)}`,
    };
  }

  // 7. Write updated lockfile
  await writeLockfile(lockfilePath, updatedLockfile);

  return {
    ok: true,
    value: {
      removed: true,
      packageName,
      version: entry.version,
      sectionsRemoved,
    },
  };
}

// --- Commander command ---

export function createUninstallConstraintsCommand(): Command {
  const cmd = new Command('uninstall-constraints');
  cmd
    .description('Remove a previously installed constraints package')
    .argument('<name>', 'Name of the constraint package to uninstall')
    .option('-c, --config <path>', 'Path to harness.config.json')
    .action(async (name: string, opts: { config?: string }) => {
      // Resolve config path
      let configPath: string;
      if (opts.config) {
        configPath = path.resolve(opts.config);
      } else {
        const found = findConfigFile();
        if (!found.ok) {
          logger.error(found.error.message);
          process.exit(1);
        }
        configPath = found.value;
      }

      // Derive lockfile path
      const projectRoot = path.dirname(configPath);
      const lockfilePath = path.join(projectRoot, '.harness', 'constraints.lock.json');

      const result = await runUninstallConstraints({
        packageName: name,
        configPath,
        lockfilePath,
      });

      if (!result.ok) {
        logger.error(result.error);
        process.exit(1);
      }

      const val = result.value;
      if (val.sectionsRemoved.length === 0) {
        logger.success(
          `Removed ${val.packageName}@${val.version} (no contributed rules to remove)`
        );
      } else {
        logger.success(
          `Removed ${val.packageName}@${val.version} (${val.sectionsRemoved.length} section(s): ${val.sectionsRemoved.join(', ')})`
        );
      }
    });
  return cmd;
}
```

5. Run test: `npx vitest run packages/cli/tests/commands/uninstall-constraints.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(cli): add harness uninstall-constraints command with lockfile-driven removal`

---

### Task 4: Register uninstall-constraints in CLI entry point

**Depends on:** Task 3
**Files:** `packages/cli/src/index.ts`

1. Add import at the top of `packages/cli/src/index.ts`, after the `createInstallConstraintsCommand` import:

```typescript
import { createUninstallConstraintsCommand } from './commands/uninstall-constraints';
```

2. Register command in `createProgram()`. After the line `program.addCommand(createInstallConstraintsCommand());`, add:

```typescript
program.addCommand(createUninstallConstraintsCommand());
```

3. Add exports at the bottom of the file, in the "Skill installation and management" section:

```typescript
export { runUninstallConstraints } from './commands/uninstall-constraints';
export type {
  UninstallConstraintsOptions,
  UninstallConstraintsSuccess,
} from './commands/uninstall-constraints';
```

4. Run: `npx vitest run packages/cli/tests/commands/uninstall-constraints.test.ts`
5. Run: `harness validate`
6. Commit: `feat(cli): register uninstall-constraints command in CLI entry point`

---

### Task 5: Add upgrade detection to install-constraints (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/tests/commands/install-constraints.test.ts`, `packages/cli/src/commands/install-constraints.ts`

1. Add upgrade tests to `packages/cli/tests/commands/install-constraints.test.ts`. Append before the final closing `});`:

```typescript
describe('upgrade detection', () => {
  it('upgrades when same package name is installed at different version', async () => {
    // First install v1
    const v1Bundle = {
      name: 'upgrade-bundle',
      version: '1.0.0',
      manifest: { name: 'upgrade-bundle', version: '1.0.0', include: ['layers'] },
      constraints: {
        layers: [{ name: 'old-layer', pattern: 'src/old/**', allowedDependencies: [] }],
      },
    };
    const v1Path = path.join(tmpDir, 'v1-bundle.json');
    await fs.writeFile(v1Path, JSON.stringify(v1Bundle, null, 2));

    const firstResult = await runInstallConstraints({
      source: v1Path,
      configPath,
      lockfilePath,
    });
    expect(firstResult.ok).toBe(true);

    // Verify v1 was installed
    let config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(config.layers).toContainEqual(expect.objectContaining({ name: 'old-layer' }));

    // Now install v2 with different layers
    const v2Bundle = {
      name: 'upgrade-bundle',
      version: '2.0.0',
      manifest: { name: 'upgrade-bundle', version: '2.0.0', include: ['layers'] },
      constraints: {
        layers: [{ name: 'new-layer', pattern: 'src/new/**', allowedDependencies: [] }],
      },
    };
    const v2Path = path.join(tmpDir, 'v2-bundle.json');
    await fs.writeFile(v2Path, JSON.stringify(v2Bundle, null, 2));

    const upgradeResult = await runInstallConstraints({
      source: v2Path,
      configPath,
      lockfilePath,
    });

    expect(upgradeResult.ok).toBe(true);
    if (!upgradeResult.ok) return;
    expect(upgradeResult.value.installed).toBe(true);
    expect(upgradeResult.value.version).toBe('2.0.0');

    // Verify: old-layer removed, new-layer present
    config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const layerNames = (config.layers as Array<{ name: string }>).map((l) => l.name);
    expect(layerNames).not.toContain('old-layer');
    expect(layerNames).toContain('new-layer');

    // Verify lockfile updated to v2
    const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
    expect(lockfile.packages['upgrade-bundle'].version).toBe('2.0.0');
  });

  it('upgrade removes old security rules and adds new ones', async () => {
    // Install v1 with security rules
    const v1Bundle = {
      name: 'sec-upgrade',
      version: '1.0.0',
      manifest: { name: 'sec-upgrade', version: '1.0.0', include: ['security.rules'] },
      constraints: {
        security: { rules: { 'SEC-OLD-001': 'error' } },
      },
    };
    const v1Path = path.join(tmpDir, 'sec-v1.json');
    await fs.writeFile(v1Path, JSON.stringify(v1Bundle, null, 2));
    await runInstallConstraints({ source: v1Path, configPath, lockfilePath });

    // Install v2 with different security rules
    const v2Bundle = {
      name: 'sec-upgrade',
      version: '2.0.0',
      manifest: { name: 'sec-upgrade', version: '2.0.0', include: ['security.rules'] },
      constraints: {
        security: { rules: { 'SEC-NEW-001': 'warning' } },
      },
    };
    const v2Path = path.join(tmpDir, 'sec-v2.json');
    await fs.writeFile(v2Path, JSON.stringify(v2Bundle, null, 2));
    const result = await runInstallConstraints({ source: v2Path, configPath, lockfilePath });

    expect(result.ok).toBe(true);

    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(config.security?.rules?.['SEC-OLD-001']).toBeUndefined();
    expect(config.security?.rules?.['SEC-NEW-001']).toBe('warning');
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/install-constraints.test.ts`
3. Observe: upgrade tests fail because `install-constraints` returns `alreadyInstalled` for same-name packages or does not remove old contributions.

4. Modify `packages/cli/src/commands/install-constraints.ts`. Replace the idempotency check block (step 7 in the function, approximately lines 126-139) with upgrade-aware logic:

Replace the existing block:

```typescript
// 7. Check idempotency -- if same package+version already installed
const existingEntry = existingLockfile.packages[bundle.name];
if (existingEntry && existingEntry.version === bundle.version) {
  return {
    ok: true,
    value: {
      installed: false,
      packageName: bundle.name,
      version: bundle.version,
      contributionsCount: 0,
      conflicts: [],
      alreadyInstalled: true,
    },
  };
}
```

With:

```typescript
// 7. Check idempotency or upgrade
const existingEntry = existingLockfile.packages[bundle.name];
if (existingEntry && existingEntry.version === bundle.version) {
  return {
    ok: true,
    value: {
      installed: false,
      packageName: bundle.name,
      version: bundle.version,
      contributionsCount: 0,
      conflicts: [],
      alreadyInstalled: true,
    },
  };
}

// 7b. Upgrade: remove old contributions before merging new ones
if (existingEntry) {
  const oldContributions = (existingEntry.contributions ?? {}) as Record<string, unknown>;
  const { removeContributions } = await import('@harness-engineering/core');
  localConfig = removeContributions(localConfig, oldContributions);
}
```

Note: `localConfig` must be changed from `const` to `let` on the line where it is declared (approximately line 104). Change:

```typescript
let localConfig: Record<string, unknown>;
```

(This is already `let` in the existing code due to the try/catch assignment pattern.)

Also add the import for `removeContributions` at the top of the file. Add to the existing import from `@harness-engineering/core`:

```typescript
import {
  BundleSchema,
  deepMergeConstraints,
  readLockfile,
  writeLockfile,
  addProvenance,
  writeConfig,
  removeContributions,
} from '@harness-engineering/core';
```

And then change the upgrade block to use it directly (no dynamic import):

```typescript
// 7b. Upgrade: remove old contributions before merging new ones
if (existingEntry) {
  const oldContributions = (existingEntry.contributions ?? {}) as Record<string, unknown>;
  localConfig = removeContributions(localConfig, oldContributions);
}
```

5. Run test: `npx vitest run packages/cli/tests/commands/install-constraints.test.ts`
6. Observe: all tests pass (including existing tests and new upgrade tests).
7. Run: `harness validate`
8. Commit: `feat(cli): add upgrade detection to install-constraints (uninstall old + install new)`

---

### Task 6: End-to-end round-trip verification

**Depends on:** Task 5
**Files:** `packages/cli/tests/commands/install-constraints.test.ts`

[checkpoint:human-verify] -- Verify round-trip integrity across install + uninstall before marking Phase 6 complete.

1. Add a round-trip integration test to `packages/cli/tests/commands/install-constraints.test.ts`. Append before the final closing `});`:

```typescript
describe('round-trip with uninstall', () => {
  it('install then uninstall restores original config exactly', async () => {
    // Import uninstall function
    const { runUninstallConstraints } = await import('../../src/commands/uninstall-constraints');

    // Capture original config
    const originalConfig = await fs.readFile(configPath, 'utf-8');

    // Install
    const installResult = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
    });
    expect(installResult.ok).toBe(true);

    // Config should be different now
    const afterInstall = await fs.readFile(configPath, 'utf-8');
    expect(afterInstall).not.toBe(originalConfig);

    // Uninstall
    const uninstallResult = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });
    expect(uninstallResult.ok).toBe(true);

    // Config should match original
    const afterUninstall = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const originalParsed = JSON.parse(originalConfig);
    expect(afterUninstall).toEqual(originalParsed);
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/install-constraints.test.ts`
3. Observe: round-trip test passes.
4. Run all sharing tests: `npx vitest run packages/core/tests/constraints/sharing/`
5. Run CLI uninstall tests: `npx vitest run packages/cli/tests/commands/uninstall-constraints.test.ts`
6. Run: `harness validate`
7. Commit: `test(constraints): add round-trip integration test for install + uninstall`
