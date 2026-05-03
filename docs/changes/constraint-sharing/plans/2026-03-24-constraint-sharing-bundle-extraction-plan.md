# Plan: Constraint Sharing Phase 2 -- Bundle Extraction

**Date:** 2026-03-24
**Spec:** docs/changes/constraint-sharing/proposal.md
**Phase:** 2 of 7
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Implement `parseManifest()` and `extractBundle()` in core, and the `harness share` CLI command, so that a user can write a `constraints.yaml` manifest, run `harness share`, and get a valid `.harness-constraints.json` bundle file.

## Observable Truths (Acceptance Criteria)

1. When `parseManifest()` is called with valid YAML string content matching `ManifestSchema`, the system shall return `Ok<Manifest>` with all fields populated.
2. When `parseManifest()` is called with invalid YAML or content that fails `ManifestSchema` validation, the system shall return `Err` with a descriptive error message.
3. When `extractBundle()` is called with a valid `Manifest` and a config object containing `layers`, `forbiddenImports`, `boundaries`, `security`, and `architecture`, the system shall return a `Bundle` containing only the sections listed in `manifest.include`.
4. When `extractBundle()` is called with an include path like `"security.rules"`, the system shall extract the nested sub-key (`rules` from `security`) and place it at the correct location in the bundle constraints (`security.rules`).
5. When `extractBundle()` is called with an include path referencing a section that does not exist in the config, that section shall be omitted from the bundle (not error).
6. When `harness share` is run with a valid `constraints.yaml` and `harness.config.json`, the system shall write `<name>.harness-constraints.json` to the current directory that validates against `BundleSchema`.
7. When `harness share` is run without a `constraints.yaml` file present, the system shall exit with error code 2 and message containing `"No constraints.yaml found"`.
8. `npx vitest run packages/core/tests/constraints/sharing/manifest.test.ts` passes with all tests green.
9. `npx vitest run packages/core/tests/constraints/sharing/bundle.test.ts` passes with all tests green.
10. `npx vitest run packages/cli/tests/commands/share.test.ts` passes with all tests green.
11. `harness validate` passes after all tasks are complete.

## File Map

```
MODIFY  packages/core/package.json                              (add yaml dependency)
CREATE  packages/core/src/constraints/sharing/manifest.ts        (parseManifest, validateManifest)
CREATE  packages/core/src/constraints/sharing/bundle.ts          (extractBundle)
CREATE  packages/core/tests/constraints/sharing/manifest.test.ts (manifest tests)
CREATE  packages/core/tests/constraints/sharing/bundle.test.ts   (bundle tests)
MODIFY  packages/core/src/constraints/sharing/index.ts           (add exports)
CREATE  packages/cli/src/commands/share.ts                       (harness share CLI command)
CREATE  packages/cli/tests/commands/share.test.ts                (share command tests)
MODIFY  packages/cli/src/index.ts                                (register share command)
```

## Tasks

### Task 1: Add yaml dependency to core package

**Depends on:** none
**Files:** packages/core/package.json

1. Add `yaml` to `packages/core/package.json` dependencies:

   ```json
   "yaml": "^2.3.0"
   ```

   Add it in the `dependencies` object alongside existing entries.

2. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm install`

3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

4. Commit: `chore(core): add yaml dependency for constraint manifest parsing`

---

### Task 2: Create parseManifest() with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/tests/constraints/sharing/manifest.test.ts, packages/core/src/constraints/sharing/manifest.ts

1. Create test file `packages/core/tests/constraints/sharing/manifest.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { parseManifest, validateManifest } from '../../../src/constraints/sharing/manifest';

   describe('validateManifest', () => {
     it('returns Ok for a valid manifest object', () => {
       const raw = {
         name: 'strict-api',
         version: '1.0.0',
         description: 'Strict API constraints',
         minHarnessVersion: '1.0.0',
         keywords: ['api', 'strict'],
         include: ['layers', 'forbiddenImports'],
       };
       const result = validateManifest(raw);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.name).toBe('strict-api');
         expect(result.value.version).toBe('1.0.0');
         expect(result.value.include).toEqual(['layers', 'forbiddenImports']);
       }
     });

     it('returns Ok with defaults for minimal manifest', () => {
       const raw = {
         name: 'minimal',
         version: '1.0.0',
         include: ['layers'],
       };
       const result = validateManifest(raw);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.keywords).toEqual([]);
         expect(result.value.description).toBeUndefined();
         expect(result.value.minHarnessVersion).toBeUndefined();
       }
     });

     it('returns Err when name is missing', () => {
       const raw = { version: '1.0.0', include: ['layers'] };
       const result = validateManifest(raw);
       expect(result.ok).toBe(false);
     });

     it('returns Err when include is empty', () => {
       const raw = { name: 'bad', version: '1.0.0', include: [] };
       const result = validateManifest(raw);
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toContain('include');
       }
     });

     it('returns Err when version is missing', () => {
       const raw = { name: 'bad', include: ['layers'] };
       const result = validateManifest(raw);
       expect(result.ok).toBe(false);
     });
   });

   describe('parseManifest', () => {
     it('parses valid YAML string into Manifest', () => {
       const yaml = `
   name: strict-api
   version: "1.0.0"
   description: Strict API layer enforcement
   minHarnessVersion: "1.0.0"
   keywords: [api, layers]
   include:
     - layers
     - forbiddenImports
     - security.rules
   `;
       const result = parseManifest(yaml);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.name).toBe('strict-api');
         expect(result.value.include).toEqual(['layers', 'forbiddenImports', 'security.rules']);
       }
     });

     it('returns Err for invalid YAML syntax', () => {
       const yaml = `
   name: strict-api
   version: "1.0.0"
   include:
     - layers
     bad indentation here
   `;
       const result = parseManifest(yaml);
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toContain('parse');
       }
     });

     it('returns Err for YAML that parses but fails schema validation', () => {
       const yaml = `
   name: bad
   version: "1.0.0"
   include: []
   `;
       const result = parseManifest(yaml);
       expect(result.ok).toBe(false);
     });

     it('returns Err for non-object YAML (e.g. a string)', () => {
       const yaml = `just a plain string`;
       const result = parseManifest(yaml);
       expect(result.ok).toBe(false);
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/manifest.test.ts`

3. Observe failure: `parseManifest` and `validateManifest` not found.

4. Create implementation `packages/core/src/constraints/sharing/manifest.ts`:

   ```typescript
   import YAML from 'yaml';
   import type { Result } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';
   import { ManifestSchema, type Manifest } from './types';

   /**
    * Validate a raw object against the ManifestSchema.
    *
    * Use this when you already have a parsed object (e.g. from JSON).
    * For YAML strings, use parseManifest() instead.
    */
   export function validateManifest(raw: unknown): Result<Manifest, Error> {
     const parsed = ManifestSchema.safeParse(raw);
     if (!parsed.success) {
       const issues = parsed.error.issues
         .map((i) => `${i.path.join('.')}: ${i.message}`)
         .join('; ');
       return Err(new Error(`Invalid manifest: ${issues}`));
     }
     return Ok(parsed.data);
   }

   /**
    * Parse a YAML string into a validated Manifest.
    *
    * Handles YAML parsing errors and schema validation in one step.
    */
   export function parseManifest(yamlContent: string): Result<Manifest, Error> {
     let raw: unknown;
     try {
       raw = YAML.parse(yamlContent);
     } catch (err) {
       return Err(
         new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`)
       );
     }

     if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
       return Err(new Error('Invalid manifest: expected a YAML mapping (object) at the top level'));
     }

     return validateManifest(raw);
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/manifest.test.ts`

6. Observe: all tests pass.

7. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

8. Commit: `feat(core): add parseManifest and validateManifest for constraint sharing`

---

### Task 3: Create extractBundle() with tests (TDD)

**Depends on:** Task 2
**Files:** packages/core/tests/constraints/sharing/bundle.test.ts, packages/core/src/constraints/sharing/bundle.ts

1. Create test file `packages/core/tests/constraints/sharing/bundle.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { extractBundle } from '../../../src/constraints/sharing/bundle';
   import type { Manifest } from '../../../src/constraints/sharing/types';

   const fullConfig = {
     version: 1 as const,
     layers: [
       { name: 'types', pattern: 'packages/types/src/**', allowedDependencies: [] },
       { name: 'core', pattern: 'packages/core/src/**', allowedDependencies: ['types'] },
     ],
     forbiddenImports: [
       { from: 'packages/types/src/**', disallow: ['packages/core/src/**'], message: 'No' },
     ],
     boundaries: { requireSchema: ['packages/mcp-server/**'] },
     architecture: {
       enabled: true,
       baselinePath: '.harness/arch/baselines.json',
       thresholds: {
         'circular-deps': { max: 0 },
         'layer-violations': { max: 0 },
       },
       modules: {},
     },
     security: {
       enabled: true,
       strict: false,
       rules: { 'SEC-CRY-001': 'warning' as const },
     },
   };

   function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
     return {
       name: 'test-bundle',
       version: '1.0.0',
       keywords: [],
       include: ['layers', 'forbiddenImports'],
       ...overrides,
     };
   }

   describe('extractBundle', () => {
     it('extracts only the sections listed in include', () => {
       const manifest = makeManifest({ include: ['layers', 'forbiddenImports'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.name).toBe('test-bundle');
         expect(result.value.version).toBe('1.0.0');
         expect(result.value.constraints.layers).toEqual(fullConfig.layers);
         expect(result.value.constraints.forbiddenImports).toEqual(fullConfig.forbiddenImports);
         expect(result.value.constraints.boundaries).toBeUndefined();
         expect(result.value.constraints.security).toBeUndefined();
         expect(result.value.constraints.architecture).toBeUndefined();
       }
     });

     it('extracts boundaries when included', () => {
       const manifest = makeManifest({ include: ['boundaries'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.boundaries).toEqual(fullConfig.boundaries);
         expect(result.value.constraints.layers).toBeUndefined();
       }
     });

     it('extracts security.rules as a nested sub-key', () => {
       const manifest = makeManifest({ include: ['security.rules'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.security).toEqual({
           rules: { 'SEC-CRY-001': 'warning' },
         });
       }
     });

     it('extracts architecture.thresholds as a nested sub-key', () => {
       const manifest = makeManifest({ include: ['architecture.thresholds'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.architecture).toBeDefined();
         expect((result.value.constraints.architecture as any).thresholds).toEqual(
           fullConfig.architecture.thresholds
         );
       }
     });

     it('extracts architecture.modules as a nested sub-key', () => {
       const manifest = makeManifest({ include: ['architecture.modules'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.architecture).toBeDefined();
         expect((result.value.constraints.architecture as any).modules).toEqual(
           fullConfig.architecture.modules
         );
       }
     });

     it('omits sections that do not exist in the config', () => {
       const sparseConfig = { version: 1 as const };
       const manifest = makeManifest({ include: ['layers', 'forbiddenImports'] });
       const result = extractBundle(manifest, sparseConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.layers).toBeUndefined();
         expect(result.value.constraints.forbiddenImports).toBeUndefined();
       }
     });

     it('copies manifest metadata into bundle', () => {
       const manifest = makeManifest({
         description: 'My bundle',
         minHarnessVersion: '2.0.0',
       });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.description).toBe('My bundle');
         expect(result.value.minHarnessVersion).toBe('2.0.0');
       }
     });

     it('extracts multiple sections including top-level and nested', () => {
       const manifest = makeManifest({
         include: ['layers', 'security.rules', 'architecture.thresholds'],
       });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.constraints.layers).toBeDefined();
         expect(result.value.constraints.security).toBeDefined();
         expect(result.value.constraints.architecture).toBeDefined();
       }
     });

     it('returns Err for unrecognized include paths', () => {
       const manifest = makeManifest({ include: ['nonexistent'] });
       const result = extractBundle(manifest, fullConfig);
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toContain('nonexistent');
       }
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/bundle.test.ts`

3. Observe failure: `extractBundle` not found.

4. Create implementation `packages/core/src/constraints/sharing/bundle.ts`:

   ```typescript
   import type { Result } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';
   import { BundleSchema, type Manifest, type Bundle, type BundleConstraints } from './types';

   /**
    * Valid include paths and their extraction logic.
    *
    * Top-level paths (e.g. "layers") copy the config key directly.
    * Dot-path keys (e.g. "security.rules") extract a nested sub-key
    * and place it under the parent in the bundle constraints.
    */
   const VALID_INCLUDE_PATHS = new Set([
     'layers',
     'forbiddenImports',
     'boundaries',
     'security.rules',
     'architecture.thresholds',
     'architecture.modules',
   ]);

   /**
    * Extract a bundle from a parsed manifest and a loaded config object.
    *
    * Only the sections listed in `manifest.include` are extracted.
    * Sections that do not exist in the config are silently omitted.
    * Unrecognized include paths produce an error.
    */
   export function extractBundle(
     manifest: Manifest,
     config: Record<string, unknown>
   ): Result<Bundle, Error> {
     // Validate include paths
     const invalid = manifest.include.filter((p) => !VALID_INCLUDE_PATHS.has(p));
     if (invalid.length > 0) {
       return Err(
         new Error(
           `Unrecognized include paths: ${invalid.join(', ')}. ` +
             `Valid paths: ${[...VALID_INCLUDE_PATHS].join(', ')}`
         )
       );
     }

     const constraints: Record<string, unknown> = {};

     for (const includePath of manifest.include) {
       if (includePath.includes('.')) {
         // Dot-path: e.g. "security.rules" -> extract config.security.rules,
         // place at constraints.security = { rules: value }
         const [parent, child] = includePath.split('.');
         const parentObj = config[parent];
         if (parentObj != null && typeof parentObj === 'object' && !Array.isArray(parentObj)) {
           const value = (parentObj as Record<string, unknown>)[child];
           if (value !== undefined) {
             // Merge into existing parent if multiple sub-keys of same parent
             const existing = (constraints[parent] as Record<string, unknown>) ?? {};
             constraints[parent] = { ...existing, [child]: value };
           }
         }
       } else {
         // Top-level path: e.g. "layers" -> extract config.layers
         const value = config[includePath];
         if (value !== undefined) {
           constraints[includePath] = value;
         }
       }
     }

     const bundle = {
       name: manifest.name,
       version: manifest.version,
       ...(manifest.minHarnessVersion && {
         minHarnessVersion: manifest.minHarnessVersion,
       }),
       ...(manifest.description && { description: manifest.description }),
       constraints,
     };

     // Validate the constructed bundle against BundleSchema
     const parsed = BundleSchema.safeParse(bundle);
     if (!parsed.success) {
       const issues = parsed.error.issues
         .map((i) => `${i.path.join('.')}: ${i.message}`)
         .join('; ');
       return Err(new Error(`Bundle validation failed: ${issues}`));
     }

     return Ok(parsed.data);
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/bundle.test.ts`

6. Observe: all tests pass.

7. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

8. Commit: `feat(core): add extractBundle for constraint sharing bundle extraction`

---

### Task 4: Update sharing barrel exports

**Depends on:** Task 2, Task 3
**Files:** packages/core/src/constraints/sharing/index.ts

1. Modify `packages/core/src/constraints/sharing/index.ts` to add exports for the new modules:

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

   // Manifest parsing
   export { parseManifest, validateManifest } from './manifest';

   // Bundle extraction
   export { extractBundle } from './bundle';

   // Utilities
   export { writeConfig } from './write-config';
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/`

3. Observe: all tests still pass.

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

5. Commit: `feat(core): export parseManifest, validateManifest, extractBundle from sharing barrel`

---

### Task 5: Create harness share CLI command

**Depends on:** Task 4
**Files:** packages/cli/src/commands/share.ts

1. Create `packages/cli/src/commands/share.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err, parseManifest, extractBundle, writeConfig } from '@harness-engineering/core';
   import { resolveConfig, findConfigFile } from '../config/loader';
   import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
   import { logger } from '../output/logger';
   import { CLIError, ExitCode } from '../utils/errors';

   interface ShareOptions {
     cwd?: string;
     configPath?: string;
     json?: boolean;
     verbose?: boolean;
     quiet?: boolean;
   }

   interface ShareResult {
     bundlePath: string;
     name: string;
     version: string;
     includedSections: string[];
   }

   export async function runShare(options: ShareOptions): Promise<Result<ShareResult, CLIError>> {
     const cwd = options.cwd ?? process.cwd();

     // 1. Read constraints.yaml
     const manifestPath = path.join(cwd, 'constraints.yaml');
     if (!fs.existsSync(manifestPath)) {
       return Err(
         new CLIError(
           'No constraints.yaml found. Run harness share --init to create one.',
           ExitCode.ERROR
         )
       );
     }

     let yamlContent: string;
     try {
       yamlContent = fs.readFileSync(manifestPath, 'utf-8');
     } catch (err) {
       return Err(
         new CLIError(
           `Failed to read constraints.yaml: ${err instanceof Error ? err.message : String(err)}`,
           ExitCode.ERROR
         )
       );
     }

     // 2. Parse and validate manifest
     const manifestResult = parseManifest(yamlContent);
     if (!manifestResult.ok) {
       return Err(new CLIError(manifestResult.error.message, ExitCode.ERROR));
     }
     const manifest = manifestResult.value;

     // 3. Load harness.config.json
     const configResult = resolveConfig(options.configPath);
     if (!configResult.ok) {
       return configResult;
     }
     const config = configResult.value;

     // 4. Extract bundle
     const bundleResult = extractBundle(manifest, config as unknown as Record<string, unknown>);
     if (!bundleResult.ok) {
       return Err(new CLIError(bundleResult.error.message, ExitCode.ERROR));
     }
     const bundle = bundleResult.value;

     // 5. Write bundle file
     const bundleFilename = `${manifest.name}.harness-constraints.json`;
     const bundlePath = path.join(cwd, bundleFilename);
     try {
       await writeConfig(bundlePath, bundle);
     } catch (err) {
       return Err(
         new CLIError(
           `Failed to write bundle: ${err instanceof Error ? err.message : String(err)}`,
           ExitCode.ERROR
         )
       );
     }

     return Ok({
       bundlePath,
       name: manifest.name,
       version: manifest.version,
       includedSections: manifest.include,
     });
   }

   export function createShareCommand(): Command {
     const command = new Command('share')
       .description('Extract constraint bundle from constraints.yaml manifest')
       .action(async (_opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const mode: OutputModeType = globalOpts.json
           ? OutputMode.JSON
           : globalOpts.quiet
             ? OutputMode.QUIET
             : globalOpts.verbose
               ? OutputMode.VERBOSE
               : OutputMode.TEXT;

         const formatter = new OutputFormatter(mode);

         const result = await runShare({
           configPath: globalOpts.config,
           json: globalOpts.json,
           verbose: globalOpts.verbose,
           quiet: globalOpts.quiet,
         });

         if (!result.ok) {
           if (mode === OutputMode.JSON) {
             console.log(JSON.stringify({ error: result.error.message }));
           } else {
             logger.error(result.error.message);
           }
           process.exit(result.error.exitCode);
         }

         if (mode === OutputMode.JSON) {
           console.log(formatter.format(result.value));
         } else if (mode !== OutputMode.QUIET) {
           console.log(
             `Bundle written: ${result.value.bundlePath}\n` +
               `  Name: ${result.value.name}\n` +
               `  Version: ${result.value.version}\n` +
               `  Sections: ${result.value.includedSections.join(', ')}`
           );
         }

         process.exit(ExitCode.SUCCESS);
       });

     return command;
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

3. Commit: `feat(cli): add harness share command for constraint bundle extraction`

---

### Task 6: Create share command tests (TDD verification)

**Depends on:** Task 5
**Files:** packages/cli/tests/commands/share.test.ts

1. Create `packages/cli/tests/commands/share.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createShareCommand, runShare } from '../../src/commands/share';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';

   describe('share command', () => {
     describe('createShareCommand', () => {
       it('creates command with correct name', () => {
         const cmd = createShareCommand();
         expect(cmd.name()).toBe('share');
       });

       it('has a description', () => {
         const cmd = createShareCommand();
         expect(cmd.description()).toBeTruthy();
       });
     });

     describe('runShare', () => {
       let tmpDir: string;

       beforeEach(() => {
         tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-share-test-'));
       });

       afterEach(() => {
         fs.rmSync(tmpDir, { recursive: true, force: true });
       });

       it('returns error when constraints.yaml is missing', async () => {
         const result = await runShare({ cwd: tmpDir });
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.message).toContain('No constraints.yaml found');
           expect(result.error.exitCode).toBe(2);
         }
       });

       it('returns error when constraints.yaml has invalid schema', async () => {
         fs.writeFileSync(
           path.join(tmpDir, 'constraints.yaml'),
           'name: bad\nversion: "1.0.0"\ninclude: []\n'
         );
         // Also need a harness.config.json for resolveConfig
         fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify({ version: 1 }));
         const result = await runShare({
           cwd: tmpDir,
           configPath: path.join(tmpDir, 'harness.config.json'),
         });
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.message).toContain('include');
         }
       });

       it('returns error when harness.config.json is missing', async () => {
         fs.writeFileSync(
           path.join(tmpDir, 'constraints.yaml'),
           'name: test\nversion: "1.0.0"\ninclude:\n  - layers\n'
         );
         const result = await runShare({
           cwd: tmpDir,
           configPath: path.join(tmpDir, 'harness.config.json'),
         });
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.message).toContain('Config file not found');
         }
       });

       it('produces a valid bundle file on success', async () => {
         const config = {
           version: 1,
           layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
           forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'], message: 'No' }],
         };
         fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
         fs.writeFileSync(
           path.join(tmpDir, 'constraints.yaml'),
           'name: my-constraints\nversion: "1.0.0"\ndescription: Test\ninclude:\n  - layers\n  - forbiddenImports\n'
         );

         const result = await runShare({
           cwd: tmpDir,
           configPath: path.join(tmpDir, 'harness.config.json'),
         });

         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.name).toBe('my-constraints');
           expect(result.value.includedSections).toEqual(['layers', 'forbiddenImports']);

           // Verify the bundle file was written
           const bundlePath = path.join(tmpDir, 'my-constraints.harness-constraints.json');
           expect(fs.existsSync(bundlePath)).toBe(true);

           const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
           expect(bundle.name).toBe('my-constraints');
           expect(bundle.version).toBe('1.0.0');
           expect(bundle.description).toBe('Test');
           expect(bundle.constraints.layers).toHaveLength(1);
           expect(bundle.constraints.forbiddenImports).toHaveLength(1);
         }
       });

       it('extracts only declared sections', async () => {
         const config = {
           version: 1,
           layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
           forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
           security: {
             enabled: true,
             rules: { 'SEC-001': 'error' },
           },
         };
         fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
         fs.writeFileSync(
           path.join(tmpDir, 'constraints.yaml'),
           'name: layers-only\nversion: "1.0.0"\ninclude:\n  - layers\n'
         );

         const result = await runShare({
           cwd: tmpDir,
           configPath: path.join(tmpDir, 'harness.config.json'),
         });

         expect(result.ok).toBe(true);
         if (result.ok) {
           const bundlePath = path.join(tmpDir, 'layers-only.harness-constraints.json');
           const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
           expect(bundle.constraints.layers).toBeDefined();
           expect(bundle.constraints.forbiddenImports).toBeUndefined();
           expect(bundle.constraints.security).toBeUndefined();
         }
       });

       it('handles security.rules dot-path extraction', async () => {
         const config = {
           version: 1,
           security: {
             enabled: true,
             strict: false,
             rules: { 'SEC-001': 'error', 'SEC-002': 'warning' },
           },
         };
         fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
         fs.writeFileSync(
           path.join(tmpDir, 'constraints.yaml'),
           'name: sec-rules\nversion: "1.0.0"\ninclude:\n  - security.rules\n'
         );

         const result = await runShare({
           cwd: tmpDir,
           configPath: path.join(tmpDir, 'harness.config.json'),
         });

         expect(result.ok).toBe(true);
         if (result.ok) {
           const bundlePath = path.join(tmpDir, 'sec-rules.harness-constraints.json');
           const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
           expect(bundle.constraints.security.rules).toEqual({
             'SEC-001': 'error',
             'SEC-002': 'warning',
           });
           // Should not include enabled, strict, etc.
           expect(bundle.constraints.security.enabled).toBeUndefined();
         }
       });
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/share.test.ts`

3. Observe: all tests pass (implementation already exists from Task 5).

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

5. Commit: `test(cli): add share command tests for constraint bundle extraction`

---

### Task 7: Register share command in CLI entry point

**Depends on:** Task 5
**Files:** packages/cli/src/index.ts

1. Modify `packages/cli/src/index.ts`:

   Add import at the top with the other command imports:

   ```typescript
   import { createShareCommand } from './commands/share';
   ```

   Add registration after the last `program.addCommand(...)` call:

   ```typescript
   program.addCommand(createShareCommand());
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/share.test.ts`

3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/constraints/sharing/`

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`

5. Commit: `feat(cli): register harness share command`

---

## Traceability Matrix

| Observable Truth                                   | Delivered by   |
| -------------------------------------------------- | -------------- |
| 1. parseManifest returns Ok for valid YAML         | Task 2         |
| 2. parseManifest returns Err for invalid input     | Task 2         |
| 3. extractBundle extracts only included sections   | Task 3         |
| 4. extractBundle handles dot-path sub-keys         | Task 3         |
| 5. extractBundle omits missing config sections     | Task 3         |
| 6. harness share writes valid bundle file          | Task 5, Task 6 |
| 7. harness share exits with error when no manifest | Task 5, Task 6 |
| 8. manifest.test.ts passes                         | Task 2         |
| 9. bundle.test.ts passes                           | Task 3         |
| 10. share.test.ts passes                           | Task 6         |
| 11. harness validate passes                        | All tasks      |
