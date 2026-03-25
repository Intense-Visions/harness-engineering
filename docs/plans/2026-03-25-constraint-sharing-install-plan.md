# Plan: Constraint Sharing Phase 5 -- Install Command

**Date:** 2026-03-25
**Spec:** docs/changes/constraint-sharing/proposal.md
**Phase:** 5 of 7
**Estimated tasks:** 8
**Estimated time:** 35 minutes

## Goal

Implement the `harness install-constraints <source>` CLI command that reads a constraint bundle from a file path, validates it, deep-merges it into the local `harness.config.json` with conflict detection and resolution, writes the merged config back, and updates the lockfile with provenance tracking.

## Observable Truths (Acceptance Criteria)

1. When `harness install-constraints ./bundle.harness-constraints.json` is run with a valid bundle and no conflicts, the system shall merge the bundle constraints into `harness.config.json` and write provenance to `.harness/constraints.lock.json`.
2. When the bundle contains constraints that conflict with local config (e.g., same layer name with different `allowedDependencies`), and no resolution flag is provided, the system shall exit with error code 1 and print each conflict with section, key, and both values.
3. When `--force-local` is passed, the system shall resolve all conflicts by keeping local values and complete the install without prompting.
4. When `--force-package` is passed, the system shall resolve all conflicts by using package values and complete the install without prompting.
5. When `--dry-run` is passed, the system shall print what would change (added rules, conflicts) without writing any files.
6. When a bundle declares `minHarnessVersion` higher than the installed CLI version, the system shall fail with a clear compatibility error before modifying any files.
7. When the bundle `constraints` object is empty (no sections), the system shall warn and exit without modifying config or lockfile.
8. When the same bundle is installed twice (idempotent), the system shall detect no new contributions and report "already installed" without duplicating rules or lockfile entries.
9. When the lockfile does not yet exist (first install), the system shall create it with `version: 1` and the package entry.
10. `npx vitest run packages/cli/tests/commands/install-constraints.test.ts` passes with all tests green.
11. `harness validate` passes after all tasks are complete.

## File Map

```
CREATE  packages/cli/src/commands/install-constraints.ts              (CLI command + orchestration logic)
CREATE  packages/cli/tests/commands/install-constraints.test.ts       (unit tests for the command)
MODIFY  packages/cli/src/index.ts                                     (register install-constraints command)
```

## Design Decision: Separate Command

The existing `packages/cli/src/commands/install.ts` handles skill marketplace packages (`@harness-skills/*` npm packages). Constraint bundle installation is a fundamentally different domain: different source format (JSON bundle vs npm tarball), different target (config file vs skill directory), different lockfile (`.harness/constraints.lock.json` vs `community/skills-lock.json`). The command is named `install-constraints` to match the spec and avoid collision with the existing `install` command.

## Conflict Resolution Design

When conflicts exist:

- **No flag, non-TTY (CI):** Print conflicts and exit with code 1. User must re-run with `--force-local` or `--force-package`.
- **`--force-local`:** Skip all conflicting package values; only merge non-conflicting additions.
- **`--force-package`:** Apply package values for all conflicts (overwrite local values in the merged config).

Interactive TTY prompting (per-conflict) is deferred to a follow-up. This plan implements the non-interactive path which covers CI and explicit flag usage.

## Tasks

### Task 1: Create core orchestration function `runInstallConstraints` with tests -- happy path (TDD)

**Depends on:** none
**Files:** packages/cli/tests/commands/install-constraints.test.ts, packages/cli/src/commands/install-constraints.ts

1. Create test file `packages/cli/tests/commands/install-constraints.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs/promises';
   import * as path from 'path';
   import * as os from 'os';

   // We test the exported runInstallConstraints function directly
   import { runInstallConstraints } from '../../src/commands/install-constraints';

   describe('runInstallConstraints', () => {
     let tmpDir: string;
     let configPath: string;
     let lockfilePath: string;
     let bundlePath: string;

     const minimalBundle = {
       name: 'test-bundle',
       version: '1.0.0',
       manifest: {
         name: 'test-bundle',
         version: '1.0.0',
         include: ['layers'],
       },
       constraints: {
         layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
       },
     };

     const minimalConfig = {
       version: 1,
       name: 'test-project',
       layers: [],
     };

     beforeEach(async () => {
       tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-install-test-'));
       configPath = path.join(tmpDir, 'harness.config.json');
       lockfilePath = path.join(tmpDir, '.harness', 'constraints.lock.json');
       bundlePath = path.join(tmpDir, 'test-bundle.harness-constraints.json');

       await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
       await fs.writeFile(configPath, JSON.stringify(minimalConfig, null, 2));
       await fs.writeFile(bundlePath, JSON.stringify(minimalBundle, null, 2));
     });

     afterEach(async () => {
       await fs.rm(tmpDir, { recursive: true, force: true });
     });

     it('installs a bundle into an empty config', async () => {
       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.installed).toBe(true);
       expect(result.value.packageName).toBe('test-bundle');
       expect(result.value.contributionsCount).toBeGreaterThan(0);

       // Verify config was written
       const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
       expect(updatedConfig.layers).toContainEqual(expect.objectContaining({ name: 'shared' }));

       // Verify lockfile was created
       const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
       expect(lockfile.version).toBe(1);
       expect(lockfile.packages['test-bundle']).toBeDefined();
       expect(lockfile.packages['test-bundle'].version).toBe('1.0.0');
       expect(lockfile.packages['test-bundle'].source).toBe(bundlePath);
     });

     it('returns error when bundle file does not exist', async () => {
       const result = await runInstallConstraints({
         source: path.join(tmpDir, 'nonexistent.json'),
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error).toContain('not found');
     });

     it('returns error when bundle has invalid JSON', async () => {
       await fs.writeFile(bundlePath, '{ invalid json !!!');
       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
     });

     it('returns error when bundle fails schema validation', async () => {
       await fs.writeFile(bundlePath, JSON.stringify({ notABundle: true }));
       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error).toContain('schema');
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe failure: `runInstallConstraints` does not exist.

4. Create implementation file `packages/cli/src/commands/install-constraints.ts`:

   ```typescript
   import * as fs from 'fs/promises';
   import * as path from 'path';
   import { Command } from 'commander';
   import semver from 'semver';
   import {
     BundleSchema,
     deepMergeConstraints,
     readLockfile,
     writeLockfile,
     addProvenance,
     writeConfig,
   } from '@harness-engineering/core';
   import type {
     Bundle,
     Lockfile,
     LockfilePackage,
     Contributions,
   } from '@harness-engineering/core';
   import type { ConflictReport } from '@harness-engineering/core';
   import { findConfigFile, loadConfig } from '../config/loader';
   import { logger } from '../output/logger';
   import { CLI_VERSION } from '../version';

   // --- Types ---

   export interface InstallConstraintsOptions {
     source: string;
     configPath: string;
     lockfilePath: string;
     forceLocal?: boolean;
     forcePackage?: boolean;
     dryRun?: boolean;
   }

   export interface InstallConstraintsSuccess {
     installed: boolean;
     packageName: string;
     version: string;
     contributionsCount: number;
     conflicts: ConflictReport[];
     alreadyInstalled?: boolean;
     dryRun?: boolean;
   }

   type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

   // --- Core orchestration ---

   export async function runInstallConstraints(
     options: InstallConstraintsOptions
   ): Promise<Result<InstallConstraintsSuccess, string>> {
     const { source, configPath, lockfilePath } = options;

     // 1. Read and parse bundle file
     let rawBundle: string;
     try {
       rawBundle = await fs.readFile(source, 'utf-8');
     } catch (err: unknown) {
       if (isNodeError(err) && err.code === 'ENOENT') {
         return { ok: false, error: `Bundle file not found: ${source}` };
       }
       return {
         ok: false,
         error: `Failed to read bundle: ${err instanceof Error ? err.message : String(err)}`,
       };
     }

     let parsedJson: unknown;
     try {
       parsedJson = JSON.parse(rawBundle);
     } catch {
       return { ok: false, error: `Bundle file contains invalid JSON: ${source}` };
     }

     // 2. Validate against BundleSchema
     const bundleResult = BundleSchema.safeParse(parsedJson);
     if (!bundleResult.success) {
       const issues = bundleResult.error.issues
         .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
         .join('; ');
       return { ok: false, error: `Bundle schema validation failed: ${issues}` };
     }
     const bundle: Bundle = bundleResult.data;

     // 3. Check minHarnessVersion
     if (bundle.minHarnessVersion) {
       const installed = semver.valid(semver.coerce(CLI_VERSION));
       const required = semver.valid(semver.coerce(bundle.minHarnessVersion));
       if (installed && required && semver.lt(installed, required)) {
         return {
           ok: false,
           error: `Bundle requires harness version >= ${bundle.minHarnessVersion}, but installed version is ${CLI_VERSION}. Please upgrade.`,
         };
       }
     }

     // 4. Check for empty constraints
     const constraintKeys = Object.keys(bundle.constraints).filter(
       (k) => bundle.constraints[k as keyof typeof bundle.constraints] !== undefined
     );
     if (constraintKeys.length === 0) {
       return {
         ok: false,
         error: 'Bundle contains no constraints. Nothing to install.',
       };
     }

     // 5. Read local config
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

     // 6. Read existing lockfile
     const lockfileResult = await readLockfile(lockfilePath);
     if (!lockfileResult.ok) {
       return { ok: false, error: lockfileResult.error };
     }
     const existingLockfile: Lockfile = lockfileResult.value ?? {
       version: 1,
       packages: {},
     };

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

     // 8. Deep-merge constraints
     const mergeResult = deepMergeConstraints(localConfig, bundle.constraints);

     // 9. Handle conflicts
     if (mergeResult.conflicts.length > 0) {
       if (options.forceLocal) {
         // Keep merged config as-is (deepMergeConstraints already keeps local values for conflicts)
         // No additional action needed -- conflicts are left as local values
       } else if (options.forcePackage) {
         // Apply package values for each conflict
         for (const conflict of mergeResult.conflicts) {
           applyPackageValue(mergeResult.config, conflict);
           // Track as contribution
           addConflictContribution(mergeResult.contributions, conflict);
         }
       } else if (!options.dryRun) {
         // No resolution strategy and not dry-run -- cannot proceed
         return {
           ok: false,
           error: formatConflictsError(mergeResult.conflicts),
         };
       }
     }

     // 10. Dry-run: report without writing
     if (options.dryRun) {
       return {
         ok: true,
         value: {
           installed: false,
           packageName: bundle.name,
           version: bundle.version,
           contributionsCount: Object.keys(mergeResult.contributions).length,
           conflicts: mergeResult.conflicts,
           dryRun: true,
         },
       };
     }

     // 11. Write merged config
     const writeResult = await writeConfig(configPath, mergeResult.config);
     if (!writeResult.ok) {
       return {
         ok: false,
         error: `Failed to write config: ${writeResult.error instanceof Error ? writeResult.error.message : String(writeResult.error)}`,
       };
     }

     // 12. Update lockfile
     const lockfileEntry: LockfilePackage = {
       version: bundle.version,
       source,
       installedAt: new Date().toISOString(),
       contributions: mergeResult.contributions,
     };
     const updatedLockfile = addProvenance(existingLockfile, bundle.name, lockfileEntry);

     await writeLockfile(lockfilePath, updatedLockfile);

     return {
       ok: true,
       value: {
         installed: true,
         packageName: bundle.name,
         version: bundle.version,
         contributionsCount: Object.keys(mergeResult.contributions).length,
         conflicts: mergeResult.conflicts,
       },
     };
   }

   // --- Conflict helpers ---

   function applyPackageValue(config: Record<string, unknown>, conflict: ConflictReport): void {
     if (conflict.section === 'layers') {
       const layers = config.layers as Array<{
         name: string;
         pattern: string;
         allowedDependencies: string[];
       }>;
       const idx = layers.findIndex((l) => l.name === conflict.key);
       if (idx >= 0) {
         layers[idx] = conflict.packageValue as (typeof layers)[number];
       }
     } else if (conflict.section === 'forbiddenImports') {
       const rules = config.forbiddenImports as Array<{
         from: string;
         disallow: string[];
         message?: string;
       }>;
       const idx = rules.findIndex((r) => r.from === conflict.key);
       if (idx >= 0) {
         rules[idx] = conflict.packageValue as (typeof rules)[number];
       }
     } else if (conflict.section === 'architecture.thresholds') {
       const arch = config.architecture as { thresholds: Record<string, unknown> };
       if (arch?.thresholds) {
         arch.thresholds[conflict.key] = conflict.packageValue;
       }
     } else if (conflict.section === 'architecture.modules') {
       const arch = config.architecture as { modules: Record<string, Record<string, unknown>> };
       if (arch?.modules) {
         const [modulePath, category] = conflict.key.split(':');
         if (arch.modules[modulePath]) {
           arch.modules[modulePath][category] = conflict.packageValue;
         }
       }
     } else if (conflict.section === 'security.rules') {
       const security = config.security as { rules: Record<string, string> };
       if (security?.rules) {
         security.rules[conflict.key] = conflict.packageValue as string;
       }
     }
   }

   function addConflictContribution(contributions: Contributions, conflict: ConflictReport): void {
     const section = conflict.section;
     const existing = (contributions[section] as string[]) ?? [];
     existing.push(conflict.key);
     contributions[section] = existing;
   }

   function formatConflictsError(conflicts: ConflictReport[]): string {
     const lines = [
       `${conflicts.length} conflict(s) detected. Resolve with --force-local or --force-package:`,
       '',
     ];
     for (const c of conflicts) {
       lines.push(`  [${c.section}] ${c.key}: ${c.description}`);
       lines.push(`    Local:   ${JSON.stringify(c.localValue)}`);
       lines.push(`    Package: ${JSON.stringify(c.packageValue)}`);
       lines.push('');
     }
     return lines.join('\n');
   }

   function isNodeError(err: unknown): err is NodeJS.ErrnoException {
     return err instanceof Error && 'code' in err;
   }

   // --- Commander command ---

   export function createInstallConstraintsCommand(): Command {
     const cmd = new Command('install-constraints');
     cmd
       .description('Install a constraints bundle into the local harness config')
       .argument('<source>', 'Path to a .harness-constraints.json bundle file')
       .option('--force-local', 'Resolve all conflicts by keeping local values')
       .option('--force-package', 'Resolve all conflicts by using package values')
       .option('--dry-run', 'Show what would change without writing files')
       .option('-c, --config <path>', 'Path to harness.config.json')
       .action(
         async (
           source: string,
           opts: {
             forceLocal?: boolean;
             forcePackage?: boolean;
             dryRun?: boolean;
             config?: string;
           }
         ) => {
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

           // Derive lockfile path from config location
           const projectRoot = path.dirname(configPath);
           const lockfilePath = path.join(projectRoot, '.harness', 'constraints.lock.json');

           // Resolve source path
           const resolvedSource = path.resolve(source);

           if (opts.forceLocal && opts.forcePackage) {
             logger.error('Cannot use both --force-local and --force-package.');
             process.exit(1);
           }

           const result = await runInstallConstraints({
             source: resolvedSource,
             configPath,
             lockfilePath,
             forceLocal: opts.forceLocal,
             forcePackage: opts.forcePackage,
             dryRun: opts.dryRun,
           });

           if (!result.ok) {
             logger.error(result.error);
             process.exit(1);
           }

           const val = result.value;

           if (val.dryRun) {
             logger.info(`[dry-run] Would install ${val.packageName}@${val.version}`);
             logger.info(`[dry-run] ${val.contributionsCount} section(s) would be added`);
             if (val.conflicts.length > 0) {
               logger.warn(`[dry-run] ${val.conflicts.length} conflict(s) detected`);
               for (const c of val.conflicts) {
                 logger.warn(`  [${c.section}] ${c.key}: ${c.description}`);
               }
             }
             return;
           }

           if (val.alreadyInstalled) {
             logger.info(
               `${val.packageName}@${val.version} is already installed. No changes made.`
             );
             return;
           }

           logger.success(
             `Installed ${val.packageName}@${val.version} (${val.contributionsCount} section(s) merged)`
           );

           if (val.conflicts.length > 0) {
             logger.warn(
               `${val.conflicts.length} conflict(s) resolved with ${opts.forceLocal ? '--force-local' : '--force-package'}`
             );
           }
         }
       );
     return cmd;
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

6. Observe: all 4 tests pass.

7. Run: `harness validate`

8. Commit: `feat(cli): add install-constraints command with bundle validation and merge orchestration`

---

### Task 2: Add tests for conflict detection and --force-local resolution

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the test file's `describe('runInstallConstraints')` block:

   ```typescript
   describe('conflict handling', () => {
     const conflictBundle = {
       name: 'conflict-bundle',
       version: '1.0.0',
       manifest: {
         name: 'conflict-bundle',
         version: '1.0.0',
         include: ['layers'],
       },
       constraints: {
         layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: ['core'] }],
       },
     };

     const configWithExistingLayer = {
       version: 1,
       name: 'test-project',
       layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
     };

     it('returns error with conflict details when no resolution flag is provided', async () => {
       await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
       await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error).toContain('conflict');
       expect(result.error).toContain('shared');
     });

     it('resolves conflicts with --force-local by keeping local values', async () => {
       await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
       await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
         forceLocal: true,
       });

       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.installed).toBe(true);
       expect(result.value.conflicts).toHaveLength(1);

       // Config should keep local value (empty allowedDependencies)
       const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
       const sharedLayer = updatedConfig.layers.find((l: { name: string }) => l.name === 'shared');
       expect(sharedLayer.allowedDependencies).toEqual([]);
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass (--force-local keeps local values, which is the default merge behavior).

4. Run: `harness validate`

5. Commit: `test(cli): add conflict detection and --force-local tests for install-constraints`

---

### Task 3: Add tests for --force-package conflict resolution

**Depends on:** Task 2
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the `describe('conflict handling')` block:

   ```typescript
   it('resolves conflicts with --force-package by using package values', async () => {
     await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
     await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

     const result = await runInstallConstraints({
       source: bundlePath,
       configPath,
       lockfilePath,
       forcePackage: true,
     });

     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value.installed).toBe(true);
     expect(result.value.conflicts).toHaveLength(1);

     // Config should use package value (allowedDependencies: ['core'])
     const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
     const sharedLayer = updatedConfig.layers.find((l: { name: string }) => l.name === 'shared');
     expect(sharedLayer.allowedDependencies).toEqual(['core']);
   });

   it('resolves security rule conflicts with --force-package', async () => {
     const configWithRules = {
       version: 1,
       name: 'test-project',
       security: { rules: { 'SEC-CRY-001': 'warning' } },
     };
     const bundleWithRules = {
       name: 'sec-bundle',
       version: '1.0.0',
       manifest: {
         name: 'sec-bundle',
         version: '1.0.0',
         include: ['security.rules'],
       },
       constraints: {
         security: { rules: { 'SEC-CRY-001': 'error' } },
       },
     };
     await fs.writeFile(configPath, JSON.stringify(configWithRules, null, 2));
     await fs.writeFile(bundlePath, JSON.stringify(bundleWithRules, null, 2));

     const result = await runInstallConstraints({
       source: bundlePath,
       configPath,
       lockfilePath,
       forcePackage: true,
     });

     expect(result.ok).toBe(true);
     if (!result.ok) return;

     const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
     expect(updatedConfig.security.rules['SEC-CRY-001']).toBe('error');
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `test(cli): add --force-package conflict resolution tests for install-constraints`

---

### Task 4: Add tests for --dry-run mode

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the main `describe('runInstallConstraints')` block:

   ```typescript
   describe('dry-run mode', () => {
     it('reports what would change without writing files', async () => {
       const configBefore = await fs.readFile(configPath, 'utf-8');

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
         dryRun: true,
       });

       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.dryRun).toBe(true);
       expect(result.value.installed).toBe(false);
       expect(result.value.contributionsCount).toBeGreaterThan(0);

       // Config should be unchanged
       const configAfter = await fs.readFile(configPath, 'utf-8');
       expect(configAfter).toBe(configBefore);

       // Lockfile should not exist
       const lockfileExists = await fs
         .access(lockfilePath)
         .then(() => true)
         .catch(() => false);
       expect(lockfileExists).toBe(false);
     });

     it('reports conflicts in dry-run without requiring resolution flags', async () => {
       const configWithLayer = {
         version: 1,
         name: 'test-project',
         layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
       };
       const conflictBundle = {
         name: 'conflict-bundle',
         version: '1.0.0',
         manifest: {
           name: 'conflict-bundle',
           version: '1.0.0',
           include: ['layers'],
         },
         constraints: {
           layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: ['core'] }],
         },
       };
       await fs.writeFile(configPath, JSON.stringify(configWithLayer, null, 2));
       await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
         dryRun: true,
       });

       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.dryRun).toBe(true);
       expect(result.value.conflicts).toHaveLength(1);
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `test(cli): add dry-run mode tests for install-constraints`

---

### Task 5: Add tests for minHarnessVersion check

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the main `describe('runInstallConstraints')` block:

   ```typescript
   describe('version compatibility', () => {
     it('rejects bundle requiring a higher harness version', async () => {
       const futureBundle = {
         name: 'future-bundle',
         version: '1.0.0',
         minHarnessVersion: '99.0.0',
         manifest: {
           name: 'future-bundle',
           version: '1.0.0',
           include: ['layers'],
           minHarnessVersion: '99.0.0',
         },
         constraints: {
           layers: [{ name: 'future', pattern: 'src/future/**', allowedDependencies: [] }],
         },
       };
       await fs.writeFile(bundlePath, JSON.stringify(futureBundle, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error).toContain('version');
       expect(result.error).toContain('99.0.0');
     });

     it('accepts bundle with no minHarnessVersion', async () => {
       // minimalBundle has no minHarnessVersion -- should work fine
       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(true);
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `test(cli): add minHarnessVersion compatibility tests for install-constraints`

---

### Task 6: Add tests for idempotency and empty bundle

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the main `describe('runInstallConstraints')` block:

   ```typescript
   describe('idempotency', () => {
     it('reports already installed when same package+version exists in lockfile', async () => {
       // First install
       const first = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });
       expect(first.ok).toBe(true);

       // Second install -- same bundle
       const second = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(second.ok).toBe(true);
       if (!second.ok) return;
       expect(second.value.alreadyInstalled).toBe(true);
       expect(second.value.installed).toBe(false);
     });
   });

   describe('empty bundle', () => {
     it('rejects a bundle with empty constraints', async () => {
       const emptyBundle = {
         name: 'empty-bundle',
         version: '1.0.0',
         manifest: {
           name: 'empty-bundle',
           version: '1.0.0',
           include: ['layers'],
         },
         constraints: {},
       };
       await fs.writeFile(bundlePath, JSON.stringify(emptyBundle, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error).toContain('no constraints');
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `test(cli): add idempotency and empty bundle tests for install-constraints`

---

### Task 7: Add test for lockfile creation on first install (no existing lockfile)

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/install-constraints.test.ts

1. Append to the main `describe('runInstallConstraints')` block:

   ```typescript
   describe('lockfile management', () => {
     it('creates lockfile with version:1 when no lockfile exists', async () => {
       // Ensure no lockfile exists
       await fs.rm(lockfilePath, { force: true });

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(true);

       const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
       expect(lockfile.version).toBe(1);
       expect(lockfile.packages['test-bundle']).toBeDefined();
       expect(lockfile.packages['test-bundle'].contributions).toBeDefined();
     });

     it('preserves existing lockfile entries when adding new package', async () => {
       // Pre-populate lockfile with an existing entry
       const existingLockfile = {
         version: 1,
         packages: {
           'other-bundle': {
             version: '2.0.0',
             source: '/some/path.json',
             installedAt: '2026-01-01T00:00:00Z',
             contributions: { layers: ['other'] },
           },
         },
       };
       await fs.writeFile(lockfilePath, JSON.stringify(existingLockfile, null, 2));

       const result = await runInstallConstraints({
         source: bundlePath,
         configPath,
         lockfilePath,
       });

       expect(result.ok).toBe(true);

       const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
       expect(lockfile.packages['other-bundle']).toBeDefined();
       expect(lockfile.packages['other-bundle'].version).toBe('2.0.0');
       expect(lockfile.packages['test-bundle']).toBeDefined();
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `test(cli): add lockfile management tests for install-constraints`

---

### Task 8: Register command in CLI entry point

[checkpoint:human-verify] -- Verify all tests pass before wiring into the CLI.

**Depends on:** Task 1
**Files:** packages/cli/src/index.ts

1. Add the import to `packages/cli/src/index.ts` alongside the existing command imports (after the `createShareCommand` import):

   ```typescript
   import { createInstallConstraintsCommand } from './commands/install-constraints';
   ```

2. Add the command registration in the `createProgram()` function, after the `createShareCommand()` line:

   ```typescript
   program.addCommand(createInstallConstraintsCommand());
   ```

3. Add the public export at the bottom of the file, in the "Skill installation and management" section or a new "Constraint sharing" section:

   ```typescript
   /**
    * Constraint sharing: install constraints bundle.
    */
   export { runInstallConstraints } from './commands/install-constraints';
   export type {
     InstallConstraintsOptions,
     InstallConstraintsSuccess,
   } from './commands/install-constraints';
   ```

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/install-constraints.test.ts`

5. Run: `harness validate`

6. Commit: `feat(cli): register install-constraints command in CLI entry point`

---

## Traceability Matrix

| Observable Truth                                        | Delivered by Task(s) |
| ------------------------------------------------------- | -------------------- |
| 1. Happy path install merges config + writes lockfile   | Task 1               |
| 2. Conflicts without flag exit with error               | Task 2               |
| 3. --force-local keeps local values                     | Task 2               |
| 4. --force-package uses package values                  | Task 3               |
| 5. --dry-run shows changes without writing              | Task 4               |
| 6. minHarnessVersion check fails before modifying files | Task 5               |
| 7. Empty bundle warns and exits                         | Task 6               |
| 8. Idempotent install (same package twice)              | Task 6               |
| 9. Lockfile creation on first install                   | Task 7               |
| 10. All tests pass                                      | Tasks 1-7            |
| 11. harness validate passes                             | All tasks            |
