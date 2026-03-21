# Plan: Detection-Remediation for Dead Code & Architecture

**Date:** 2026-03-21
**Spec:** docs/changes/detection-remediation-dead-code-architecture/proposal.md
**Estimated tasks:** 18
**Estimated time:** 72 minutes (18 tasks x ~4 min avg)

## Goal

Expand auto-fix capabilities for dead code and architecture violations, add standalone convergence loops to both skills, and compose them in a new `harness-codebase-cleanup` orchestrator with a shared convergence loop that catches cross-concern cascades.

## Observable Truths (Acceptance Criteria)

1. When `createFixes` receives a `DeadCodeReport` with dead exports (non-public), commented-out code entries, and orphaned deps, the system shall return Fix objects for each with correct fix types and actions.
2. When `applyFixes` processes a `dead-exports` fix, the system shall remove the `export` keyword from the target declaration (or delete the entire function if it has zero internal callers).
3. When `applyFixes` processes a `commented-code` fix, the system shall delete the commented block from the file.
4. When `applyFixes` processes an `orphaned-deps` fix, the system shall remove the dependency from `package.json`.
5. When `check_dependencies` detects a forbidden import that has a configured `alternative`, the system shall produce a fix with `action: 'replace'` containing the old and new import paths.
6. The `CleanupFinding` interface shall exist in `packages/core/src/entropy/types.ts` with fields: `id`, `concern`, `file`, `line`, `type`, `description`, `safety`, `safetyReason`, `hotspotDowngraded`, `fixAction`, `suggestion`.
7. The `cleanup-dead-code` SKILL.md shall include a standalone convergence loop (detect -> classify -> fix -> verify -> re-detect -> stop).
8. The `enforce-architecture` SKILL.md shall include auto-fix instructions for import ordering and forbidden import replacement, plus a standalone convergence loop.
9. The `harness-codebase-cleanup` skill shall exist at `agents/skills/claude-code/harness-codebase-cleanup/` with both `skill.yaml` and `SKILL.md`.
10. The orchestrator SKILL.md shall define 5 phases: CONTEXT, DETECT, CLASSIFY, FIX (convergence loop), REPORT.
11. While classifying findings, the system shall downgrade safety from `safe` to `probably-safe` for files in the top 10% by churn (hotspot context).
12. When a dead import from a forbidden layer is detected, the system shall produce a single `CleanupFinding` (cross-concern dedup), not two separate findings.
13. If a fix batch fails verification (lint + typecheck + test), then the system shall not keep the changes -- it shall revert the batch and reclassify findings as `unsafe`.
14. The system shall not auto-fix upward dependencies, circular dependencies, skip-layer dependencies, public API dead export removal, or dead internals -- these shall always surface to the user.
15. The `forbiddenImports` config in `harness.config.json` shall support an `alternative` field per entry for 1:1 import path replacement.
16. `pnpm vitest run packages/core/tests/entropy/fixers/safe-fixes.test.ts` shall pass with all new fix type tests.
17. `pnpm vitest run packages/core/tests/entropy/fixers/cleanup-finding.test.ts` shall pass with CleanupFinding classification tests.
18. `pnpm harness validate` shall pass after all changes.

## File Map

```
MODIFY  packages/core/src/entropy/types.ts                          (add FixType variants, CleanupFinding, HotspotContext)
MODIFY  packages/core/src/entropy/fixers/safe-fixes.ts              (add dead-export, commented-code, orphaned-dep fix creators + appliers)
MODIFY  packages/core/src/entropy/fixers/index.ts                   (re-export new functions)
MODIFY  packages/core/src/entropy/index.ts                          (re-export new types)
CREATE  packages/core/src/entropy/fixers/cleanup-finding.ts         (CleanupFinding classifier, hotspot downgrade, cross-concern dedup)
CREATE  packages/core/src/entropy/fixers/architecture-fixes.ts      (forbidden import replacement fix creator)
CREATE  packages/core/tests/entropy/fixers/dead-export-fixes.test.ts
CREATE  packages/core/tests/entropy/fixers/commented-code-fixes.test.ts
CREATE  packages/core/tests/entropy/fixers/orphaned-dep-fixes.test.ts
CREATE  packages/core/tests/entropy/fixers/architecture-fixes.test.ts
CREATE  packages/core/tests/entropy/fixers/cleanup-finding.test.ts
MODIFY  packages/mcp-server/src/tools/entropy.ts                    (wire new fix types into handleApplyFixes)
MODIFY  packages/core/src/constraints/types.ts                      (add alternative field to ForbiddenImport type)
MODIFY  harness.config.json                                         (add alternative field to forbiddenImports schema docs)
MODIFY  agents/skills/claude-code/cleanup-dead-code/SKILL.md        (add new fix types + standalone convergence loop)
MODIFY  agents/skills/claude-code/enforce-architecture/SKILL.md     (add auto-fix section + standalone convergence loop)
CREATE  agents/skills/claude-code/harness-codebase-cleanup/skill.yaml
CREATE  agents/skills/claude-code/harness-codebase-cleanup/SKILL.md
```

## Tasks

### Task 1: Expand FixType and add CleanupFinding to types.ts

**Depends on:** none
**Files:** packages/core/src/entropy/types.ts

1. Read `packages/core/src/entropy/types.ts`
2. Expand the `FixType` union to include new fix types. Replace:
   ```typescript
   export type FixType =
     | 'unused-imports'
     | 'dead-files'
     | 'trailing-whitespace'
     | 'broken-links'
     | 'sort-imports';
   ```
   With:
   ```typescript
   export type FixType =
     | 'unused-imports'
     | 'dead-files'
     | 'dead-exports'
     | 'commented-code'
     | 'orphaned-deps'
     | 'forbidden-import-replacement'
     | 'import-ordering'
     | 'trailing-whitespace'
     | 'broken-links'
     | 'sort-imports';
   ```
3. Add the `CleanupFinding` interface and `HotspotContext` type after the `FixResult` interface:

   ```typescript
   // ============ Cleanup Finding Types ============

   export type SafetyLevel = 'safe' | 'probably-safe' | 'unsafe';

   export interface CleanupFinding {
     id: string;
     concern: 'dead-code' | 'architecture';
     file: string;
     line?: number;
     type: string;
     description: string;
     safety: SafetyLevel;
     safetyReason: string;
     hotspotDowngraded: boolean;
     fixAction?: string;
     suggestion: string;
   }

   export interface HotspotContext {
     churnMap: Map<string, number>;
     topPercentileThreshold: number;
   }
   ```

4. Run: `pnpm harness validate`
5. Commit: `feat(entropy): expand FixType union and add CleanupFinding schema`

---

### Task 2: Add ForbiddenImportConfig alternative field to constraints types

**Depends on:** none
**Files:** packages/core/src/constraints/types.ts

1. Read `packages/core/src/constraints/types.ts`
2. Add a `ForbiddenImportRule` interface after the existing `DependencyViolation` interface:
   ```typescript
   export interface ForbiddenImportRule {
     from: string;
     disallow: string[];
     message: string;
     alternative?: string;
   }
   ```
3. Run: `pnpm harness validate`
4. Commit: `feat(constraints): add ForbiddenImportRule type with alternative field`

---

### Task 3: Add dead export fix creator and applier (TDD)

**Depends on:** Task 1
**Files:** packages/core/tests/entropy/fixers/dead-export-fixes.test.ts, packages/core/src/entropy/fixers/safe-fixes.ts

1. Create test file `packages/core/tests/entropy/fixers/dead-export-fixes.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
   import type { DeadCodeReport, Fix } from '../../../src/entropy/types';
   import * as fs from 'fs';
   import { promisify } from 'util';
   import * as path from 'path';
   import * as os from 'os';

   const writeFile = promisify(fs.writeFile);
   const readFile = promisify(fs.readFile);
   const mkdir = promisify(fs.mkdir);
   const rm = promisify(fs.rm);

   describe('dead export fixes', () => {
     let tempDir: string;

     beforeEach(async () => {
       tempDir = path.join(os.tmpdir(), `dead-export-test-${Date.now()}`);
       await mkdir(tempDir, { recursive: true });
     });

     afterEach(async () => {
       await rm(tempDir, { recursive: true, force: true });
     });

     it('should create fix for dead export with zero importers', () => {
       const report: DeadCodeReport = {
         deadExports: [
           {
             file: '/project/src/utils.ts',
             name: 'unusedHelper',
             line: 10,
             type: 'function',
             isDefault: false,
             reason: 'NO_IMPORTERS',
           },
         ],
         deadFiles: [],
         deadInternals: [],
         unusedImports: [],
         stats: {
           filesAnalyzed: 10,
           entryPointsUsed: [],
           totalExports: 20,
           deadExportCount: 1,
           totalFiles: 10,
           deadFileCount: 0,
           estimatedDeadLines: 5,
         },
       };

       const fixes = createFixes(report, { fixTypes: ['dead-exports'] });
       expect(fixes.length).toBe(1);
       expect(fixes[0].type).toBe('dead-exports');
       expect(fixes[0].action).toBe('replace');
       expect(fixes[0].file).toBe('/project/src/utils.ts');
       expect(fixes[0].safe).toBe(true);
     });

     it('should remove export keyword from function declaration', async () => {
       const testFile = path.join(tempDir, 'utils.ts');
       await writeFile(
         testFile,
         'export function unusedHelper() {\n  return 1;\n}\n\nexport function usedHelper() {\n  return 2;\n}\n'
       );

       const fixes: Fix[] = [
         {
           type: 'dead-exports',
           file: testFile,
           description: 'Remove export keyword from unusedHelper',
           action: 'replace',
           oldContent: 'export function unusedHelper',
           newContent: 'function unusedHelper',
           safe: true,
           reversible: true,
         },
       ];

       const result = await applyFixes(fixes, {
         dryRun: false,
         fixTypes: ['dead-exports'],
         createBackup: false,
       });

       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.applied.length).toBe(1);
         const content = await readFile(testFile, 'utf-8');
         expect(content).toContain('function unusedHelper');
         expect(content).not.toMatch(/^export function unusedHelper/m);
         expect(content).toContain('export function usedHelper');
       }
     });
   });
   ```

2. Run test: `pnpm vitest run packages/core/tests/entropy/fixers/dead-export-fixes.test.ts`
3. Observe failure: `createFixes` does not produce `dead-exports` fixes yet.
4. Modify `packages/core/src/entropy/fixers/safe-fixes.ts`:
   - Add `'dead-exports'` to `DEFAULT_FIX_CONFIG.fixTypes` array
   - Add new function `createDeadExportFixes`:
     ```typescript
     /**
      * Create fixes for dead exports (non-public, zero importers)
      */
     function createDeadExportFixes(deadCodeReport: DeadCodeReport): Fix[] {
       return deadCodeReport.deadExports
         .filter((exp) => exp.reason === 'NO_IMPORTERS')
         .map((exp) => ({
           type: 'dead-exports' as FixType,
           file: exp.file,
           description: `Remove export keyword from ${exp.name} (${exp.reason})`,
           action: 'replace' as const,
           oldContent: exp.isDefault
             ? `export default ${exp.type === 'class' ? 'class' : exp.type === 'function' ? 'function' : ''} ${exp.name}`
             : `export ${exp.type === 'class' ? 'class' : exp.type === 'function' ? 'function' : exp.type === 'variable' ? 'const' : exp.type === 'type' ? 'type' : exp.type === 'interface' ? 'interface' : 'enum'} ${exp.name}`,
           newContent: exp.isDefault
             ? `${exp.type === 'class' ? 'class' : exp.type === 'function' ? 'function' : ''} ${exp.name}`
             : `${exp.type === 'class' ? 'class' : exp.type === 'function' ? 'function' : exp.type === 'variable' ? 'const' : exp.type === 'type' ? 'type' : exp.type === 'interface' ? 'interface' : 'enum'} ${exp.name}`,
           safe: true as const,
           reversible: true,
         }));
     }
     ```
   - Wire it into `createFixes`:
     ```typescript
     if (fullConfig.fixTypes.includes('dead-exports')) {
       fixes.push(...createDeadExportFixes(deadCodeReport));
     }
     ```
5. Run test: `pnpm vitest run packages/core/tests/entropy/fixers/dead-export-fixes.test.ts`
6. Observe: all tests pass
7. Run: `pnpm vitest run packages/core/tests/entropy/fixers/safe-fixes.test.ts` (regression check)
8. Run: `pnpm harness validate`
9. Commit: `feat(entropy): add dead export fix creator and applier`

---

### Task 4: Add commented-out code fix creator and applier (TDD)

**Depends on:** Task 1
**Files:** packages/core/tests/entropy/fixers/commented-code-fixes.test.ts, packages/core/src/entropy/fixers/safe-fixes.ts

1. Create test file `packages/core/tests/entropy/fixers/commented-code-fixes.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createCommentedCodeFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
   import type { Fix } from '../../../src/entropy/types';
   import * as fs from 'fs';
   import { promisify } from 'util';
   import * as path from 'path';
   import * as os from 'os';

   const writeFile = promisify(fs.writeFile);
   const readFile = promisify(fs.readFile);
   const mkdir = promisify(fs.mkdir);
   const rm = promisify(fs.rm);

   interface CommentedCodeBlock {
     file: string;
     startLine: number;
     endLine: number;
     content: string;
   }

   describe('commented code fixes', () => {
     let tempDir: string;

     beforeEach(async () => {
       tempDir = path.join(os.tmpdir(), `commented-code-test-${Date.now()}`);
       await mkdir(tempDir, { recursive: true });
     });

     afterEach(async () => {
       await rm(tempDir, { recursive: true, force: true });
     });

     it('should create fix for commented-out code block', () => {
       const blocks: CommentedCodeBlock[] = [
         {
           file: '/project/src/service.ts',
           startLine: 5,
           endLine: 10,
           content: '// function oldHandler() {\n//   return null;\n// }',
         },
       ];

       const fixes = createCommentedCodeFixes(blocks);
       expect(fixes.length).toBe(1);
       expect(fixes[0].type).toBe('commented-code');
       expect(fixes[0].action).toBe('replace');
       expect(fixes[0].safe).toBe(true);
     });

     it('should remove commented block from file', async () => {
       const testFile = path.join(tempDir, 'service.ts');
       await writeFile(
         testFile,
         'const active = 1;\n// function old() {\n//   return null;\n// }\nconst active2 = 2;\n'
       );

       const fixes: Fix[] = [
         {
           type: 'commented-code',
           file: testFile,
           description: 'Remove commented-out code block',
           action: 'replace',
           oldContent: '// function old() {\n//   return null;\n// }\n',
           newContent: '',
           safe: true,
           reversible: true,
         },
       ];

       const result = await applyFixes(fixes, {
         dryRun: false,
         fixTypes: ['commented-code'],
         createBackup: false,
       });

       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.applied.length).toBe(1);
         const content = await readFile(testFile, 'utf-8');
         expect(content).not.toContain('function old');
         expect(content).toContain('const active = 1');
         expect(content).toContain('const active2 = 2');
       }
     });
   });
   ```

2. Run test: `pnpm vitest run packages/core/tests/entropy/fixers/commented-code-fixes.test.ts`
3. Observe failure: `createCommentedCodeFixes` is not exported.
4. Add to `packages/core/src/entropy/fixers/safe-fixes.ts`:

   ```typescript
   export interface CommentedCodeBlock {
     file: string;
     startLine: number;
     endLine: number;
     content: string;
   }

   /**
    * Create fixes for commented-out code blocks
    */
   export function createCommentedCodeFixes(blocks: CommentedCodeBlock[]): Fix[] {
     return blocks.map((block) => ({
       type: 'commented-code' as FixType,
       file: block.file,
       description: `Remove commented-out code block (lines ${block.startLine}-${block.endLine})`,
       action: 'replace' as const,
       oldContent: block.content,
       newContent: '',
       safe: true as const,
       reversible: true,
     }));
   }
   ```

5. Run test: `pnpm vitest run packages/core/tests/entropy/fixers/commented-code-fixes.test.ts`
6. Observe: all tests pass
7. Run: `pnpm harness validate`
8. Commit: `feat(entropy): add commented-out code fix creator`

---

### Task 5: Add orphaned dependency fix creator and applier (TDD)

**Depends on:** Task 1
**Files:** packages/core/tests/entropy/fixers/orphaned-dep-fixes.test.ts, packages/core/src/entropy/fixers/safe-fixes.ts

1. Create test file `packages/core/tests/entropy/fixers/orphaned-dep-fixes.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createOrphanedDepFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
   import type { Fix } from '../../../src/entropy/types';
   import * as fs from 'fs';
   import { promisify } from 'util';
   import * as path from 'path';
   import * as os from 'os';

   const writeFile = promisify(fs.writeFile);
   const readFile = promisify(fs.readFile);
   const mkdir = promisify(fs.mkdir);
   const rm = promisify(fs.rm);

   interface OrphanedDep {
     name: string;
     packageJsonPath: string;
     depType: 'dependencies' | 'devDependencies';
   }

   describe('orphaned dependency fixes', () => {
     let tempDir: string;

     beforeEach(async () => {
       tempDir = path.join(os.tmpdir(), `orphaned-dep-test-${Date.now()}`);
       await mkdir(tempDir, { recursive: true });
     });

     afterEach(async () => {
       await rm(tempDir, { recursive: true, force: true });
     });

     it('should create fix for orphaned npm dependency', () => {
       const deps: OrphanedDep[] = [
         { name: 'moment', packageJsonPath: '/project/package.json', depType: 'dependencies' },
       ];

       const fixes = createOrphanedDepFixes(deps);
       expect(fixes.length).toBe(1);
       expect(fixes[0].type).toBe('orphaned-deps');
       expect(fixes[0].action).toBe('replace');
       expect(fixes[0].file).toBe('/project/package.json');
       expect(fixes[0].safe).toBe(true);
     });

     it('should remove dependency from package.json', async () => {
       const pkgPath = path.join(tempDir, 'package.json');
       const pkgContent = JSON.stringify(
         {
           name: 'test',
           dependencies: { lodash: '^4.0.0', moment: '^2.0.0' },
         },
         null,
         2
       );
       await writeFile(pkgPath, pkgContent);

       const fixes: Fix[] = [
         {
           type: 'orphaned-deps',
           file: pkgPath,
           description: 'Remove orphaned dependency: moment',
           action: 'replace',
           oldContent: pkgContent,
           newContent: JSON.stringify(
             { name: 'test', dependencies: { lodash: '^4.0.0' } },
             null,
             2
           ),
           safe: true,
           reversible: true,
         },
       ];

       const result = await applyFixes(fixes, {
         dryRun: false,
         fixTypes: ['orphaned-deps'],
         createBackup: false,
       });

       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.applied.length).toBe(1);
         const content = JSON.parse(await readFile(pkgPath, 'utf-8'));
         expect(content.dependencies).not.toHaveProperty('moment');
         expect(content.dependencies).toHaveProperty('lodash');
       }
     });
   });
   ```

2. Run test -- observe failure.
3. Add to `packages/core/src/entropy/fixers/safe-fixes.ts`:

   ```typescript
   export interface OrphanedDep {
     name: string;
     packageJsonPath: string;
     depType: 'dependencies' | 'devDependencies';
   }

   /**
    * Create fixes for orphaned npm dependencies
    */
   export function createOrphanedDepFixes(deps: OrphanedDep[]): Fix[] {
     return deps.map((dep) => ({
       type: 'orphaned-deps' as FixType,
       file: dep.packageJsonPath,
       description: `Remove orphaned dependency: ${dep.name}`,
       action: 'replace' as const,
       safe: true as const,
       reversible: true,
     }));
   }
   ```

   Note: The actual `oldContent`/`newContent` for package.json replacement must be computed at call time by reading the file and removing the dep entry. The creator returns the fix shape; the caller reads the file and populates `oldContent`/`newContent`.

4. Run test: pass
5. Run: `pnpm harness validate`
6. Commit: `feat(entropy): add orphaned dependency fix creator`

---

### Task 6: Add architecture fix creator for forbidden import replacement (TDD)

**Depends on:** Task 1, Task 2
**Files:** packages/core/tests/entropy/fixers/architecture-fixes.test.ts, packages/core/src/entropy/fixers/architecture-fixes.ts

1. Create test file `packages/core/tests/entropy/fixers/architecture-fixes.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createForbiddenImportFixes } from '../../../src/entropy/fixers/architecture-fixes';
   import { applyFixes } from '../../../src/entropy/fixers/safe-fixes';
   import type { Fix } from '../../../src/entropy/types';
   import * as fs from 'fs';
   import { promisify } from 'util';
   import * as path from 'path';
   import * as os from 'os';

   const writeFile = promisify(fs.writeFile);
   const readFile = promisify(fs.readFile);
   const mkdir = promisify(fs.mkdir);
   const rm = promisify(fs.rm);

   describe('forbidden import replacement fixes', () => {
     let tempDir: string;

     beforeEach(async () => {
       tempDir = path.join(os.tmpdir(), `arch-fixes-test-${Date.now()}`);
       await mkdir(tempDir, { recursive: true });
     });

     afterEach(async () => {
       await rm(tempDir, { recursive: true, force: true });
     });

     it('should create fix when alternative is configured', () => {
       const violations = [
         {
           file: '/project/packages/core/src/service.ts',
           line: 3,
           forbiddenImport: 'node:fs',
           alternative: './utils/fs',
         },
       ];

       const fixes = createForbiddenImportFixes(violations);
       expect(fixes.length).toBe(1);
       expect(fixes[0].type).toBe('forbidden-import-replacement');
       expect(fixes[0].action).toBe('replace');
       expect(fixes[0].oldContent).toContain('node:fs');
       expect(fixes[0].newContent).toContain('./utils/fs');
     });

     it('should not create fix when no alternative is configured', () => {
       const violations = [
         {
           file: '/project/packages/core/src/service.ts',
           line: 3,
           forbiddenImport: '../mcp-server',
           alternative: undefined,
         },
       ];

       const fixes = createForbiddenImportFixes(violations);
       expect(fixes.length).toBe(0);
     });

     it('should replace forbidden import path in file', async () => {
       const testFile = path.join(tempDir, 'service.ts');
       await writeFile(
         testFile,
         "import { readFile } from 'node:fs';\nimport { join } from 'path';\n\nconst data = readFile('test');\n"
       );

       const fixes: Fix[] = [
         {
           type: 'forbidden-import-replacement',
           file: testFile,
           description: "Replace forbidden import 'node:fs' with './utils/fs'",
           action: 'replace',
           oldContent: "from 'node:fs'",
           newContent: "from './utils/fs'",
           safe: true,
           reversible: true,
         },
       ];

       const result = await applyFixes(fixes, {
         dryRun: false,
         fixTypes: ['forbidden-import-replacement'],
         createBackup: false,
       });

       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.applied.length).toBe(1);
         const content = await readFile(testFile, 'utf-8');
         expect(content).toContain("from './utils/fs'");
         expect(content).not.toContain("from 'node:fs'");
       }
     });
   });
   ```

2. Run test -- observe failure.
3. Create `packages/core/src/entropy/fixers/architecture-fixes.ts`:

   ```typescript
   import type { Fix, FixType } from '../types';

   export interface ForbiddenImportViolation {
     file: string;
     line: number;
     forbiddenImport: string;
     alternative?: string;
   }

   /**
    * Create fixes for forbidden imports that have a configured alternative
    */
   export function createForbiddenImportFixes(violations: ForbiddenImportViolation[]): Fix[] {
     return violations
       .filter((v) => v.alternative !== undefined)
       .map((v) => ({
         type: 'forbidden-import-replacement' as FixType,
         file: v.file,
         description: `Replace forbidden import '${v.forbiddenImport}' with '${v.alternative}'`,
         action: 'replace' as const,
         line: v.line,
         oldContent: `from '${v.forbiddenImport}'`,
         newContent: `from '${v.alternative}'`,
         safe: true as const,
         reversible: true,
       }));
   }
   ```

4. Run test: pass
5. Run: `pnpm harness validate`
6. Commit: `feat(entropy): add forbidden import replacement fix creator`

---

### Task 7: Create CleanupFinding classifier with hotspot downgrade (TDD)

**Depends on:** Task 1
**Files:** packages/core/tests/entropy/fixers/cleanup-finding.test.ts, packages/core/src/entropy/fixers/cleanup-finding.ts

1. Create test file `packages/core/tests/entropy/fixers/cleanup-finding.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     classifyFinding,
     applyHotspotDowngrade,
     deduplicateFindings,
   } from '../../../src/entropy/fixers/cleanup-finding';
   import type { CleanupFinding, HotspotContext } from '../../../src/entropy/types';

   describe('classifyFinding', () => {
     it('should classify dead export as safe when non-public', () => {
       const finding = classifyFinding({
         concern: 'dead-code',
         file: 'src/utils.ts',
         type: 'dead-export',
         description: 'unusedHelper has zero importers',
         isPublicApi: false,
       });

       expect(finding.safety).toBe('safe');
       expect(finding.hotspotDowngraded).toBe(false);
     });

     it('should classify dead export as unsafe when public API', () => {
       const finding = classifyFinding({
         concern: 'dead-code',
         file: 'src/index.ts',
         type: 'dead-export',
         description: 'exported from entry point',
         isPublicApi: true,
       });

       expect(finding.safety).toBe('unsafe');
     });

     it('should classify forbidden import with alternative as probably-safe', () => {
       const finding = classifyFinding({
         concern: 'architecture',
         file: 'src/service.ts',
         type: 'forbidden-import',
         description: "forbidden import 'node:fs'",
         hasAlternative: true,
       });

       expect(finding.safety).toBe('probably-safe');
     });

     it('should classify upward dependency as unsafe', () => {
       const finding = classifyFinding({
         concern: 'architecture',
         file: 'src/repo.ts',
         type: 'upward-dependency',
         description: 'repo imports from UI',
         hasAlternative: false,
       });

       expect(finding.safety).toBe('unsafe');
     });
   });

   describe('applyHotspotDowngrade', () => {
     it('should downgrade safe to probably-safe for high-churn files', () => {
       const finding: CleanupFinding = {
         id: 'dc-1',
         concern: 'dead-code',
         file: 'src/hot-file.ts',
         type: 'dead-export',
         description: 'test',
         safety: 'safe',
         safetyReason: 'zero importers, non-public',
         hotspotDowngraded: false,
         suggestion: 'Remove export',
       };

       const hotspot: HotspotContext = {
         churnMap: new Map([['src/hot-file.ts', 50]]),
         topPercentileThreshold: 30,
       };

       const result = applyHotspotDowngrade(finding, hotspot);
       expect(result.safety).toBe('probably-safe');
       expect(result.hotspotDowngraded).toBe(true);
     });

     it('should not downgrade already unsafe findings', () => {
       const finding: CleanupFinding = {
         id: 'dc-2',
         concern: 'dead-code',
         file: 'src/hot-file.ts',
         type: 'dead-internal',
         description: 'test',
         safety: 'unsafe',
         safetyReason: 'cannot determine callers',
         hotspotDowngraded: false,
         suggestion: 'Manual review',
       };

       const hotspot: HotspotContext = {
         churnMap: new Map([['src/hot-file.ts', 50]]),
         topPercentileThreshold: 30,
       };

       const result = applyHotspotDowngrade(finding, hotspot);
       expect(result.safety).toBe('unsafe');
       expect(result.hotspotDowngraded).toBe(false);
     });
   });

   describe('deduplicateFindings', () => {
     it('should merge dead import that is also a forbidden import into one finding', () => {
       const findings: CleanupFinding[] = [
         {
           id: 'dc-1',
           concern: 'dead-code',
           file: 'src/service.ts',
           line: 3,
           type: 'unused-import',
           description: "Unused import from '../mcp-server'",
           safety: 'safe',
           safetyReason: 'zero references',
           hotspotDowngraded: false,
           fixAction: 'remove import',
           suggestion: 'Remove unused import',
         },
         {
           id: 'arch-1',
           concern: 'architecture',
           file: 'src/service.ts',
           line: 3,
           type: 'forbidden-import',
           description: "Forbidden import '../mcp-server'",
           safety: 'unsafe',
           safetyReason: 'no alternative configured',
           hotspotDowngraded: false,
           fixAction: undefined,
           suggestion: 'Restructure to avoid this import',
         },
       ];

       const deduped = deduplicateFindings(findings);
       expect(deduped.length).toBe(1);
       expect(deduped[0].concern).toBe('dead-code');
       expect(deduped[0].description).toContain('also violates architecture');
     });
   });
   ```

2. Run test -- observe failure.
3. Create `packages/core/src/entropy/fixers/cleanup-finding.ts`:

   ```typescript
   import type { CleanupFinding, HotspotContext, SafetyLevel } from '../types';

   interface FindingInput {
     concern: 'dead-code' | 'architecture';
     file: string;
     line?: number;
     type: string;
     description: string;
     isPublicApi?: boolean;
     hasAlternative?: boolean;
   }

   const ALWAYS_UNSAFE_TYPES = new Set([
     'upward-dependency',
     'skip-layer-dependency',
     'circular-dependency',
     'dead-internal',
   ]);

   let idCounter = 0;

   /**
    * Classify a raw finding into a CleanupFinding with safety level
    */
   export function classifyFinding(input: FindingInput): CleanupFinding {
     idCounter++;
     const id = `${input.concern === 'dead-code' ? 'dc' : 'arch'}-${idCounter}`;

     let safety: SafetyLevel;
     let safetyReason: string;
     let fixAction: string | undefined;
     let suggestion: string;

     if (ALWAYS_UNSAFE_TYPES.has(input.type)) {
       safety = 'unsafe';
       safetyReason = `${input.type} requires human judgment`;
       suggestion = 'Review and refactor manually';
     } else if (input.concern === 'dead-code') {
       if (input.isPublicApi) {
         safety = 'unsafe';
         safetyReason = 'Public API export may have external consumers';
         suggestion = 'Deprecate before removing';
       } else if (
         input.type === 'dead-export' ||
         input.type === 'unused-import' ||
         input.type === 'commented-code' ||
         input.type === 'dead-file'
       ) {
         safety = 'safe';
         safetyReason = 'zero importers, non-public';
         fixAction =
           input.type === 'dead-export'
             ? 'Remove export keyword'
             : input.type === 'dead-file'
               ? 'Delete file'
               : input.type === 'commented-code'
                 ? 'Delete commented block'
                 : 'Remove import';
         suggestion = fixAction;
       } else if (input.type === 'orphaned-dep') {
         safety = 'probably-safe';
         safetyReason = 'No imports found, but needs install+test verification';
         fixAction = 'Remove from package.json';
         suggestion = fixAction;
       } else {
         safety = 'unsafe';
         safetyReason = 'Unknown dead code type';
         suggestion = 'Manual review required';
       }
     } else {
       // architecture
       if (input.type === 'import-ordering') {
         safety = 'safe';
         safetyReason = 'Mechanical reorder, no semantic change';
         fixAction = 'Reorder imports';
         suggestion = fixAction;
       } else if (input.type === 'forbidden-import' && input.hasAlternative) {
         safety = 'probably-safe';
         safetyReason = 'Alternative configured, needs typecheck+test';
         fixAction = 'Replace with configured alternative';
         suggestion = fixAction;
       } else {
         safety = 'unsafe';
         safetyReason = `${input.type} requires structural changes`;
         suggestion = 'Restructure code to fix violation';
       }
     }

     return {
       id,
       concern: input.concern,
       file: input.file,
       line: input.line,
       type: input.type,
       description: input.description,
       safety,
       safetyReason,
       hotspotDowngraded: false,
       fixAction,
       suggestion,
     };
   }

   /**
    * Downgrade safety for findings in high-churn files
    */
   export function applyHotspotDowngrade(
     finding: CleanupFinding,
     hotspot: HotspotContext
   ): CleanupFinding {
     if (finding.safety !== 'safe') return finding;

     const churn = hotspot.churnMap.get(finding.file) ?? 0;
     if (churn >= hotspot.topPercentileThreshold) {
       return {
         ...finding,
         safety: 'probably-safe',
         safetyReason: `${finding.safetyReason}; downgraded due to high churn (${churn} commits)`,
         hotspotDowngraded: true,
       };
     }

     return finding;
   }

   /**
    * Deduplicate cross-concern findings (e.g., dead import + forbidden import on same line)
    */
   export function deduplicateFindings(findings: CleanupFinding[]): CleanupFinding[] {
     const byFileAndLine = new Map<string, CleanupFinding[]>();

     for (const f of findings) {
       const key = `${f.file}:${f.line ?? 'none'}`;
       const group = byFileAndLine.get(key) ?? [];
       group.push(f);
       byFileAndLine.set(key, group);
     }

     const result: CleanupFinding[] = [];

     for (const group of byFileAndLine.values()) {
       if (group.length === 1) {
         result.push(group[0]);
         continue;
       }

       // Check for dead-code + architecture overlap
       const deadCode = group.find((f) => f.concern === 'dead-code');
       const arch = group.find((f) => f.concern === 'architecture');

       if (deadCode && arch) {
         // Merge: dead code fix resolves both
         result.push({
           ...deadCode,
           description: `${deadCode.description} (also violates architecture: ${arch.type})`,
           suggestion: deadCode.fixAction
             ? `${deadCode.fixAction} (resolves both dead code and architecture violation)`
             : deadCode.suggestion,
         });
       } else {
         result.push(...group);
       }
     }

     return result;
   }
   ```

4. Run test: pass
5. Run: `pnpm harness validate`
6. Commit: `feat(entropy): add CleanupFinding classifier with hotspot downgrade and dedup`

---

### Task 8: Wire new fixers into index.ts exports

**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7
**Files:** packages/core/src/entropy/fixers/index.ts, packages/core/src/entropy/index.ts

1. Update `packages/core/src/entropy/fixers/index.ts`:
   ```typescript
   export {
     createFixes,
     previewFix,
     applyFixes,
     createCommentedCodeFixes,
     createOrphanedDepFixes,
   } from './safe-fixes';
   export type { CommentedCodeBlock, OrphanedDep } from './safe-fixes';
   export { generateSuggestions } from './suggestions';
   export { createForbiddenImportFixes } from './architecture-fixes';
   export type { ForbiddenImportViolation } from './architecture-fixes';
   export { classifyFinding, applyHotspotDowngrade, deduplicateFindings } from './cleanup-finding';
   ```
2. Update `packages/core/src/entropy/index.ts` to add new exports in the Fixers section:
   ```typescript
   // Fixers
   export {
     createFixes,
     applyFixes,
     previewFix,
     createCommentedCodeFixes,
     createOrphanedDepFixes,
   } from './fixers/safe-fixes';
   export type { CommentedCodeBlock, OrphanedDep } from './fixers/safe-fixes';
   export { generateSuggestions } from './fixers/suggestions';
   export { createForbiddenImportFixes } from './fixers/architecture-fixes';
   export type { ForbiddenImportViolation } from './fixers/architecture-fixes';
   export {
     classifyFinding,
     applyHotspotDowngrade,
     deduplicateFindings,
   } from './fixers/cleanup-finding';
   ```
   And add new types to the type exports section:
   ```typescript
   // Cleanup Finding types
   SafetyLevel,
   CleanupFinding,
   HotspotContext,
   ```
3. Run: `pnpm harness validate`
4. Run: `pnpm harness check-deps`
5. Commit: `feat(entropy): wire new fixer exports through index`

---

### Task 9: Wire new fix types into MCP apply_fixes handler

**Depends on:** Task 8
**Files:** packages/mcp-server/src/tools/entropy.ts

1. Read `packages/mcp-server/src/tools/entropy.ts`
2. Update the `applyFixesDefinition` inputSchema to add a `fixTypes` property:
   ```typescript
   export const applyFixesDefinition = {
     name: 'apply_fixes',
     description:
       'Auto-fix detected entropy issues and return actionable suggestions for remaining issues',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         dryRun: { type: 'boolean', description: 'Preview fixes without applying' },
         fixTypes: {
           type: 'array',
           items: {
             type: 'string',
             enum: [
               'unused-imports',
               'dead-files',
               'dead-exports',
               'commented-code',
               'orphaned-deps',
               'forbidden-import-replacement',
               'import-ordering',
             ],
           },
           description: 'Specific fix types to apply (default: all safe types)',
         },
       },
       required: ['path'],
     },
   };
   ```
3. Update `handleApplyFixes` to pass the `fixTypes` through to `createFixes`:
   Replace:
   ```typescript
   const fixes = deadCode ? createFixes(deadCode, {}) : [];
   ```
   With:
   ```typescript
   const fixTypesConfig = input.fixTypes ? { fixTypes: input.fixTypes } : {};
   const fixes = deadCode ? createFixes(deadCode, fixTypesConfig) : [];
   ```
   (Adjust the `input` type to include `fixTypes?: string[]`)
4. Run: `pnpm harness validate`
5. Run: `pnpm harness check-deps`
6. Commit: `feat(mcp): wire new fix types into apply_fixes handler`

---

### Task 10: Update cleanup-dead-code SKILL.md with new fix types and convergence loop

**Depends on:** Task 3, Task 4, Task 5
**Files:** agents/skills/claude-code/cleanup-dead-code/SKILL.md

1. Read the current SKILL.md.
2. In Phase 2 (Categorize), add the new fix types to the "Safe to auto-fix" list:
   - Dead exports (non-public, zero importers) -- remove `export` keyword or delete entirely if zero internal callers
   - Commented-out code blocks -- delete commented block
   - Orphaned npm dependencies -- remove from package.json (probably safe; needs install+test)
3. After Phase 3 (Apply Safe Fixes), add a new section:

   ```markdown
   ### Phase 3.5: Convergence Loop (Standalone)

   When running standalone (not through the orchestrator), apply a single-concern convergence loop:

   1. **Re-run detection.** After applying all safe fixes, run `harness cleanup --type dead-code` again.
   2. **Check if issue count decreased.** Compare the new count to the previous count.
   3. **If decreased: loop.** New dead code may have been exposed by the fixes (e.g., removing a dead export made a file fully unused). Go back to Phase 2 (Categorize) with the new report.
   4. **If unchanged: stop.** No more cascading fixes are possible. Proceed to Phase 4 (Report).
   5. **Maximum iterations: 5.** To prevent infinite loops, stop after 5 convergence cycles regardless.

   **Why convergence matters:** Removing dead code can create more dead code. For example:

   - Removing a dead export may make all remaining exports in a file dead, making the file itself dead.
   - Removing a dead file removes its imports, which may make other files' exports dead.
   - Removing an orphaned dep may cause lint warnings that reveal unused imports.
   ```

4. In Phase 3, add explicit steps for the new fix types:

   ```markdown
   **New fix types:**

   - **Dead exports (non-public):** Use `apply_fixes` with `fixTypes: ['dead-exports']`. The tool removes the `export` keyword. If the function/class has zero internal callers too, delete the entire declaration.
   - **Commented-out code:** Use `apply_fixes` with `fixTypes: ['commented-code']`. The tool deletes commented-out code blocks. This is cosmetic and only needs lint verification.
   - **Orphaned dependencies:** Use `apply_fixes` with `fixTypes: ['orphaned-deps']`. The tool removes the dep from package.json. **Must run `pnpm install && pnpm test` after** to verify nothing breaks.
   ```

5. Run: `pnpm harness validate`
6. Commit: `docs(skills): add new fix types and convergence loop to cleanup-dead-code`

---

### Task 11: Update enforce-architecture SKILL.md with auto-fix and convergence loop

**Depends on:** Task 6
**Files:** agents/skills/claude-code/enforce-architecture/SKILL.md

1. Read the current SKILL.md.
2. Add a new Phase 3.5 after "Phase 3: Analyze Violations" for auto-fixable violations:

   ```markdown
   ### Phase 3.5: Apply Safe Architecture Fixes

   Some architecture violations can be auto-fixed. Apply these before surfacing remaining violations.

   **Import ordering violations:**

   1. Identify files where imports are not ordered according to the project's layer convention.
   2. Reorder imports: external packages first, then by layer (lowest to highest), then relative imports.
   3. Verify with lint + typecheck. This is a safe, mechanical fix.

   **Forbidden import replacement (with configured alternative):**

   1. Check `harness.config.json` for `forbiddenImports` entries that include an `alternative` field.
   2. For each violation where an alternative exists, replace the import path with the alternative.
   3. Verify with typecheck + test. This is "probably safe" -- present as a diff for approval in interactive mode, apply silently in CI mode.

   **Design token substitution (unambiguous mapping):**

   1. When a hardcoded value has exactly one matching design token, replace the literal with the token reference.
   2. Verify with typecheck + test.
   3. If the mapping is ambiguous (multiple candidate tokens), surface to user.

   **Never auto-fix these (always surface to user):**

   - Upward dependencies
   - Skip-layer dependencies
   - Circular dependencies
   - Forbidden imports without a configured alternative

   ### Phase 3.6: Convergence Loop (Standalone)

   When running standalone (not through the orchestrator), apply a single-concern convergence loop:

   1. **Re-run detection.** After applying all safe/probably-safe fixes, run `harness check-deps` again.
   2. **Check if violation count decreased.** Compare the new count to the previous count.
   3. **If decreased: loop.** Fixing one violation can resolve others (e.g., replacing a forbidden import may eliminate a transitive skip-layer violation). Go back to Phase 2 with the new results.
   4. **If unchanged: stop.** Proceed to Phase 4 (Guide Resolution) for remaining violations.
   5. **Maximum iterations: 5.** To prevent infinite loops.

   **Verification gate:** After each fix batch, run:
   ```

   pnpm lint && pnpm tsc --noEmit && pnpm test

   ```
   If any command fails, revert the batch and reclassify those findings as unsafe.
   ```

3. Update Phase 4 (Guide Resolution) to note the `alternative` field:

   ```markdown
   - **Forbidden import:** Check `harness.config.json` for an `alternative` field. If present, this should have been auto-fixed in Phase 3.5. If not present, replace the forbidden import with the approved alternative or restructure the code.
   ```

4. Run: `pnpm harness validate`
5. Commit: `docs(skills): add auto-fix and convergence loop to enforce-architecture`

---

### Task 12: Update forbiddenImports config format

**Depends on:** Task 2
**Files:** harness.config.json

[checkpoint:decision] -- The spec shows a different `forbiddenImports` format (using `pattern`/`forbidden`/`alternative`) than what exists (`from`/`disallow`/`message`). The plan preserves the existing format and adds an optional `alternative` field to each entry. The human should confirm this is the right approach vs. migrating to the spec's format.

1. Read `harness.config.json`
2. The existing `forbiddenImports` entries use `{ from, disallow, message }`. Add an `alternative` field to entries where a 1:1 replacement exists. For this project, no entries currently need alternatives (they are all layer-boundary rules). Add a commented example to the spec documentation.
3. No changes to `harness.config.json` needed for now -- the structure already works. The `ForbiddenImportRule` type from Task 2 documents the optional `alternative` field.
4. Run: `pnpm harness validate`
5. Commit: `docs(config): document alternative field for forbiddenImports`

---

### Task 13: Create harness-codebase-cleanup skill.yaml

**Depends on:** none
**Files:** agents/skills/claude-code/harness-codebase-cleanup/skill.yaml

1. Create directory and file `agents/skills/claude-code/harness-codebase-cleanup/skill.yaml`:
   ```yaml
   name: harness-codebase-cleanup
   version: '1.0.0'
   description: Orchestrate dead code removal and architecture violation fixes with shared convergence loop
   cognitive_mode: systematic-orchestrator
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Glob
     - Grep
   cli:
     command: harness skill run harness-codebase-cleanup
     args:
       - name: path
         description: Project root path
         required: false
       - name: fix
         description: Enable convergence-based auto-fix (default detect+report only)
         required: false
       - name: dead-code-only
         description: Skip architecture checks
         required: false
       - name: architecture-only
         description: Skip dead code checks
         required: false
       - name: dry-run
         description: Show what would be fixed without applying
         required: false
       - name: ci
         description: Non-interactive mode (safe fixes only, report everything else)
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-codebase-cleanup
       path: string
   type: flexible
   phases:
     - name: context
       description: Run hotspot detection, build churn map
       required: true
     - name: detect
       description: Run dead code and architecture detection in parallel
       required: true
     - name: classify
       description: Classify findings, apply hotspot downgrade, cross-concern dedup
       required: true
     - name: fix
       description: Convergence loop - apply safe fixes, verify, re-detect
       required: false
     - name: report
       description: Generate actionable report of fixes applied and remaining findings
       required: true
   state:
     persistent: false
     files: []
   depends_on:
     - cleanup-dead-code
     - enforce-architecture
     - harness-hotspot-detector
   ```
2. Run: `pnpm harness validate`
3. Commit: `feat(skills): create harness-codebase-cleanup skill.yaml`

---

### Task 14: Create harness-codebase-cleanup SKILL.md -- Context and Detect phases

**Depends on:** Task 13
**Files:** agents/skills/claude-code/harness-codebase-cleanup/SKILL.md

1. Create `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md` with the first two phases:

   ````markdown
   # Harness Codebase Cleanup

   > Orchestrate dead code removal and architecture violation fixes with a shared convergence loop. Catches cross-concern cascades that individual skills miss.

   ## When to Use

   - After a major refactoring or feature removal when both dead code and architecture violations are likely
   - As a periodic comprehensive codebase hygiene task
   - When `cleanup-dead-code` or `enforce-architecture` individually are not catching cascading issues
   - When you want hotspot-aware safety classification
   - NOT for quick single-concern checks -- use `cleanup-dead-code` or `enforce-architecture` directly
   - NOT when tests are failing -- fix tests first
   - NOT during active feature development

   ## Flags

   | Flag                  | Effect                                                            |
   | --------------------- | ----------------------------------------------------------------- |
   | `--fix`               | Enable convergence-based auto-fix (default: detect + report only) |
   | `--dead-code-only`    | Skip architecture checks                                          |
   | `--architecture-only` | Skip dead code checks                                             |
   | `--dry-run`           | Show what would be fixed without applying                         |
   | `--ci`                | Non-interactive: apply safe fixes only, report everything else    |

   ## Process

   ### Phase 1: CONTEXT -- Build Hotspot Map

   1. **Run hotspot detection** via `harness skill run harness-hotspot-detector` or equivalent git log analysis:
      ```bash
      git log --format=format: --name-only --since="6 months ago" | sort | uniq -c | sort -rn | head -50
      ```
   ````

   2. **Build churn map.** Parse output into a `file -> commit count` mapping.
   3. **Compute top 10% threshold.** Sort all files by commit count. The file at the 90th percentile defines the threshold. Files above this threshold are "high churn."
   4. **Store as HotspotContext** for use in Phase 3 (CLASSIFY).

   ### Phase 2: DETECT -- Run Both Concerns in Parallel
   1. **Dead code detection** (skip if `--architecture-only`):
      - Run `harness cleanup --type dead-code --json`
      - Or use the `detect_entropy` MCP tool with `type: 'dead-code'`
      - Captures: dead files, dead exports, unused imports, dead internals, commented-out code blocks, orphaned dependencies

   2. **Architecture detection** (skip if `--dead-code-only`):
      - Run `harness check-deps --json`
      - Captures: layer violations, forbidden imports, circular dependencies, import ordering issues

   3. **Merge findings.** Convert all raw findings into `CleanupFinding` objects using `classifyFinding()`. This normalizes both concerns into a shared schema.

   ```

   ```

2. Run: `pnpm harness validate`
3. Commit: `docs(skills): create harness-codebase-cleanup SKILL.md (phases 1-2)`

---

### Task 15: Add Classify and Fix phases to harness-codebase-cleanup SKILL.md

**Depends on:** Task 14
**Files:** agents/skills/claude-code/harness-codebase-cleanup/SKILL.md

1. Append to the SKILL.md after Phase 2:

   ```markdown
   ### Phase 3: CLASSIFY -- Safety Classification and Dedup

   1. **Apply safety classification.** Each `CleanupFinding` already has a safety level from `classifyFinding()`. Review the classification rules:

      **Dead code safety:**
      | Finding | Safety | Condition |
      |---|---|---|
      | Dead files | Safe | Not entry point, no side effects |
      | Unused imports | Safe | Zero references |
      | Dead exports (non-public) | Safe | Zero importers, not in package entry point |
      | Dead exports (public API) | Unsafe | In package entry point or published package |
      | Commented-out code | Safe | Always (code is in git history) |
      | Orphaned npm deps | Probably safe | Needs install + test verification |
      | Dead internals | Unsafe | Cannot reliably determine all callers |

      **Architecture safety:**
      | Violation | Safety | Condition |
      |---|---|---|
      | Import ordering | Safe | Mechanical reorder |
      | Forbidden import (with alternative) | Probably safe | 1:1 replacement configured |
      | Forbidden import (no alternative) | Unsafe | Requires restructuring |
      | Design token (unambiguous) | Probably safe | Single token match |
      | Design token (ambiguous) | Unsafe | Multiple candidates |
      | Upward dependency | Unsafe | Always |
      | Skip-layer dependency | Unsafe | Always |
      | Circular dependency | Unsafe | Always |

   2. **Apply hotspot downgrade.** For each finding, check if the file is in the top 10% by churn (from Phase 1 HotspotContext). If so, downgrade `safe` to `probably-safe`. Do not downgrade `unsafe` findings.

   3. **Cross-concern dedup.** Call `deduplicateFindings()` to merge overlapping findings:
      - A dead import from a forbidden layer = one finding (dead-code concern, noting architecture overlap)
      - A dead file that has architecture violations = one finding (dead-code, noting violations resolved by deletion)

   ### Phase 4: FIX -- Convergence Loop

   **Only runs when `--fix` flag is set.** Without `--fix`, skip to Phase 5 (REPORT).
   ```

   findings = classified findings from Phase 3
   previousCount = findings.length
   iteration = 0

   while iteration < 5:
   iteration++

   # Batch 1: Apply safe fixes silently

   safeFixes = findings.filter(f => f.safety === 'safe')
   apply(safeFixes)

   # Batch 2: Present probably-safe fixes

   if --ci mode:
   skip probably-safe fixes (report only)
   else:
   probablySafeFixes = findings.filter(f => f.safety === 'probably-safe')
   presentAsDiffs(probablySafeFixes)
   apply(approved fixes)

   # Verify: lint + typecheck + test

   verifyResult = run("pnpm lint && pnpm tsc --noEmit && pnpm test")

   if verifyResult.failed:
   revertBatch()
   reclassify failed fixes as unsafe
   continue

   # Re-detect both concerns

   newFindings = runDetection() # Phase 2 again
   newFindings = classify(newFindings) # Phase 3 again

   if newFindings.length >= previousCount:
   break # No progress, stop

   previousCount = newFindings.length
   findings = newFindings

   ```

   **Verification gate:** Every fix batch must pass lint + typecheck + test. If verification fails:
   1. Revert the entire batch (use git: `git checkout -- .`)
   2. Reclassify all findings in the batch as `unsafe`
   3. Continue the loop with remaining findings

   **Cross-concern cascade examples:**
   - Dead import from forbidden layer: removing the dead import also resolves the architecture violation. Single fix, both resolved.
   - Architecture fix creates dead code: replacing a forbidden import makes the old module's export dead. Next detect cycle catches it.
   - Dead file resolves multiple violations: deleting a dead file that imports from wrong layers resolves those violations too.
   ```

2. Run: `pnpm harness validate`
3. Commit: `docs(skills): add CLASSIFY and FIX phases to harness-codebase-cleanup`

---

### Task 16: Add Report phase and remaining sections to harness-codebase-cleanup SKILL.md

**Depends on:** Task 15
**Files:** agents/skills/claude-code/harness-codebase-cleanup/SKILL.md

1. Append to the SKILL.md after Phase 4:

   ```markdown
   ### Phase 5: REPORT -- Actionable Output

   Generate a structured report with two sections:

   **1. Fixes Applied:**
   For each fix that was applied:

   - File and line
   - What was fixed (finding type and description)
   - What action was taken (delete, replace, reorder)
   - Verification status (pass/fail)

   **2. Remaining Findings (requires human action):**
   For each unsafe finding that was not auto-fixed:

   - **What is wrong:** The finding type, file, line, and description
   - **Why it cannot be auto-fixed:** The safety reason and classification logic
   - **Suggested approach:** Concrete next steps for manual resolution

   Example report output:
   ```

   === HARNESS CODEBASE CLEANUP REPORT ===

   Fixes applied: 12
   - 5 unused imports removed (safe)
   - 3 dead exports de-exported (safe)
   - 2 commented-out code blocks deleted (safe)
   - 1 forbidden import replaced (probably-safe, approved)
   - 1 orphaned dependency removed (probably-safe, approved)

   Convergence: 3 iterations, 12 → 8 → 3 → 3 (stopped)

   Remaining findings: 3 (require human action)
   1. UNSAFE: Circular dependency
      File: src/services/order-service.ts <-> src/services/inventory-service.ts
      Why: Circular dependencies require structural refactoring
      Suggested: Extract shared logic into src/services/stock-calculator.ts

   2. UNSAFE: Dead internal function
      File: src/utils/legacy.ts:45 — processLegacyFormat()
      Why: Cannot reliably determine all callers (possible dynamic usage)
      Suggested: Search for string references, check config files, then delete if confirmed unused

   3. UNSAFE: Public API dead export
      File: packages/core/src/index.ts — legacyHelper
      Why: Export is in package entry point; external consumers may depend on it
      Suggested: Deprecate with @deprecated JSDoc tag, remove in next major version

   ```

   ## Harness Integration

   - **`harness cleanup --type dead-code --json`** -- Dead code detection input
   - **`harness check-deps --json`** -- Architecture violation detection input
   - **`harness skill run harness-hotspot-detector`** -- Hotspot context for safety classification
   - **`apply_fixes` MCP tool** -- Applies safe fixes via the MCP server
   - **`harness validate`** -- Final validation after all fixes
   - **`harness check-deps`** -- Final architecture check after all fixes

   ## Success Criteria

   - All safe fixes are applied without test failures
   - Probably-safe fixes are presented as diffs for approval (or skipped in CI mode)
   - Unsafe findings are never auto-fixed
   - Convergence loop catches cross-concern cascades
   - Report includes actionable guidance for every remaining finding
   - `harness validate` passes after cleanup

   ## Escalation

   - **When convergence loop does not converge after 5 iterations:** The codebase has deeply tangled issues. Stop and report all remaining findings. Consider breaking the cleanup into focused sessions.
   - **When a safe fix causes test failures:** The classification was wrong. Revert, reclassify as unsafe, and investigate the hidden dependency. Document the false positive for future improvement.
   - **When the hotspot detector is unavailable:** Skip the hotspot downgrade. All safety classifications use their base level without churn context.
   - **When dead code and architecture fixes conflict:** The convergence loop handles this naturally. If removing dead code creates an architecture issue (rare), the next detection cycle catches it.
   ```

2. Run: `pnpm harness validate`
3. Commit: `docs(skills): complete harness-codebase-cleanup SKILL.md with report phase`

---

### Task 17: Update cleanup-dead-code skill.yaml with new triggers and dependencies

**Depends on:** Task 10
**Files:** agents/skills/claude-code/cleanup-dead-code/skill.yaml

1. Read the current `skill.yaml`.
2. Update to reflect new capabilities:
   ```yaml
   name: cleanup-dead-code
   version: '1.1.0'
   description: Detect and auto-fix dead code including dead exports, commented-out code, and orphaned dependencies
   cognitive_mode: diagnostic-investigator
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Glob
     - Grep
   cli:
     command: harness skill run cleanup-dead-code
     args:
       - name: path
         description: Project root path
         required: false
       - name: fix
         description: Enable auto-fix with convergence loop
         required: false
   mcp:
     tool: run_skill
     input:
       skill: cleanup-dead-code
       path: string
   type: flexible
   state:
     persistent: false
     files: []
   depends_on: []
   ```
3. Run: `pnpm harness validate`
4. Commit: `feat(skills): update cleanup-dead-code skill.yaml for v1.1.0`

---

### Task 18: Update enforce-architecture skill.yaml with new capabilities

**Depends on:** Task 11
**Files:** agents/skills/claude-code/enforce-architecture/skill.yaml

1. Read the current `skill.yaml`.
2. Update to reflect new auto-fix capabilities:
   ```yaml
   name: enforce-architecture
   version: '1.1.0'
   description: Validate architectural layer boundaries, detect violations, and auto-fix import ordering and forbidden import replacement
   cognitive_mode: meticulous-verifier
   triggers:
     - manual
     - on_pr
     - on_commit
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Glob
   cli:
     command: harness skill run enforce-architecture
     args:
       - name: path
         description: Project root path
         required: false
       - name: fix
         description: Enable auto-fix with convergence loop
         required: false
   mcp:
     tool: run_skill
     input:
       skill: enforce-architecture
       path: string
   type: rigid
   state:
     persistent: false
     files: []
   depends_on: []
   ```
3. Run: `pnpm harness validate`
4. Commit: `feat(skills): update enforce-architecture skill.yaml for v1.1.0`

---

## Dependency Graph

```
Task 1 (types) ──────┬──> Task 3 (dead export fixes)
                      ├──> Task 4 (commented code fixes)
                      ├──> Task 5 (orphaned dep fixes)
                      ├──> Task 7 (cleanup finding classifier)
                      │
Task 2 (constraint types) ──> Task 6 (architecture fixes)
                      │
Tasks 3-7 ───────────> Task 8 (wire exports)
                      │
Task 8 ──────────────> Task 9 (MCP wiring)
                      │
Task 3,4,5 ──────────> Task 10 (cleanup-dead-code SKILL.md)
Task 6 ──────────────> Task 11 (enforce-architecture SKILL.md)
Task 2 ──────────────> Task 12 (config format)
                      │
(none) ──────────────> Task 13 (orchestrator skill.yaml)
Task 13 ─────────────> Task 14 (SKILL.md phases 1-2)
Task 14 ─────────────> Task 15 (SKILL.md phases 3-4)
Task 15 ─────────────> Task 16 (SKILL.md phase 5)
                      │
Task 10 ─────────────> Task 17 (cleanup-dead-code skill.yaml)
Task 11 ─────────────> Task 18 (enforce-architecture skill.yaml)
```

**Parallel opportunities:**

- Tasks 1 and 2 can run in parallel (no shared files)
- Tasks 3, 4, 5, 7 can run in parallel after Task 1 (different test/implementation files)
- Task 6 can run in parallel with Tasks 3-5 (after Task 2)
- Tasks 10, 11, 12, 13 can run in parallel (different files)
- Tasks 17 and 18 can run in parallel

## Traceability: Observable Truths to Tasks

| Observable Truth                                    | Delivered by Task(s) |
| --------------------------------------------------- | -------------------- |
| 1. createFixes returns Fix objects for new types    | 3, 4, 5              |
| 2. applyFixes removes export keyword                | 3                    |
| 3. applyFixes deletes commented block               | 4                    |
| 4. applyFixes removes dep from package.json         | 5                    |
| 5. Forbidden import fix with alternative            | 6                    |
| 6. CleanupFinding interface exists                  | 1                    |
| 7. cleanup-dead-code standalone convergence loop    | 10                   |
| 8. enforce-architecture auto-fix + convergence loop | 11                   |
| 9. harness-codebase-cleanup skill exists            | 13, 14               |
| 10. Orchestrator 5 phases defined                   | 14, 15, 16           |
| 11. Hotspot downgrade for high-churn files          | 7                    |
| 12. Cross-concern dedup                             | 7                    |
| 13. Verification gate reverts and reclassifies      | 15                   |
| 14. Unsafe violations never auto-fixed              | 7, 10, 11, 15        |
| 15. forbiddenImports alternative field              | 2, 12                |
| 16. safe-fixes tests pass                           | 3, 4, 5              |
| 17. cleanup-finding tests pass                      | 7                    |
| 18. harness validate passes                         | All tasks            |
