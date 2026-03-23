# Plan: Phase 3 -- Tool Consolidation

**Date:** 2026-03-22
**Spec:** docs/changes/agent-workflow-acceleration/proposal.md
**Estimated tasks:** 9
**Estimated time:** 35 minutes

## Goal

Consolidate three pairs of overlapping MCP tools (`manage_state`/`manage_handoff`, `check_docs`/`validate_knowledge_map`, `detect_entropy`/`apply_fixes`) so the absorbed tools are removed from the MCP surface while their underlying core functions remain available.

## Observable Truths (Acceptance Criteria)

1. When `manage_state` is called with `action: 'save-handoff'` and a valid `handoff` object, the system shall save the handoff and return `{ saved: true }`.
2. When `manage_state` is called with `action: 'load-handoff'`, the system shall return the stored handoff document (or `null` if none exists).
3. When `manage_state` is called with `action: 'save-handoff'` without a `handoff` property, the system shall return an error with `isError: true` and a message containing "handoff is required".
4. The `manage_state` definition's `action` enum shall contain `['show', 'learn', 'failure', 'archive', 'reset', 'gate', 'save-handoff', 'load-handoff']`.
5. When `check_docs` is called with `scope: 'coverage'`, the system shall perform documentation coverage analysis (existing behavior).
6. When `check_docs` is called with `scope: 'integrity'`, the system shall validate the AGENTS.md knowledge map structure and links.
7. When `check_docs` is called with `scope: 'all'`, the system shall return both coverage and integrity results.
8. When `check_docs` is called without a `scope` parameter, the system shall default to `'coverage'` (backward-compatible).
9. When `check_docs` is called with `scope: 'integrity'` on a path with no AGENTS.md, the system shall return an error containing "Failed to read AGENTS.md".
10. When `detect_entropy` is called with `autoFix: true`, the system shall run analysis and then apply fixes, returning both the analysis report and fix results.
11. When `detect_entropy` is called with `autoFix: true` and `dryRun: true`, the system shall return planned fixes without applying them.
12. When `detect_entropy` is called without `autoFix` (or `autoFix: false`), the system shall perform analysis only (existing behavior).
13. The `detect_entropy` definition's `inputSchema` shall include `autoFix` (boolean), `dryRun` (boolean), and `fixTypes` (array) properties.
14. `getToolDefinitions()` shall return exactly 37 tools (40 - 3 removed).
15. `getToolDefinitions().map(t => t.name)` shall not contain `'manage_handoff'`, `'validate_knowledge_map'`, or `'apply_fixes'`.
16. If the string `manage_handoff`, `validate_knowledge_map`, or `apply_fixes` appears in any `.ts` file under `packages/mcp-server/src/` (excluding comments), the system is not correctly consolidated.
17. `npx vitest run packages/mcp-server/tests/tools/state.test.ts` passes with tests covering all 8 actions.
18. `npx vitest run packages/mcp-server/tests/tools/docs.test.ts` passes with tests covering all 3 scope values.
19. `npx vitest run packages/mcp-server/tests/tools/entropy.test.ts` passes with tests covering autoFix behavior.
20. `npx vitest run packages/mcp-server/tests/server.test.ts` passes with updated tool count (37).
21. `npx vitest run packages/mcp-server/tests/server-integration.test.ts` passes with removed tool assertions deleted.
22. `npx turbo run test` passes with zero regressions.
23. `harness validate` passes.

## File Map

```
MODIFY packages/mcp-server/src/tools/state.ts          -- absorb handoff into manage_state, remove manage_handoff exports
MODIFY packages/mcp-server/src/tools/docs.ts            -- absorb knowledge map into check_docs via scope param, remove validate_knowledge_map exports
MODIFY packages/mcp-server/src/tools/entropy.ts         -- absorb apply_fixes into detect_entropy via autoFix param, remove apply_fixes exports
MODIFY packages/mcp-server/src/server.ts                -- remove 3 tool definitions/handlers, update imports
MODIFY packages/mcp-server/tests/tools/state.test.ts    -- migrate handoff tests, add save-handoff/load-handoff tests
MODIFY packages/mcp-server/tests/tools/docs.test.ts     -- migrate knowledge map tests, add scope param tests
MODIFY packages/mcp-server/tests/tools/entropy.test.ts  -- migrate apply_fixes tests, add autoFix param tests
MODIFY packages/mcp-server/tests/server.test.ts         -- update tool count from 40 to 37, remove manage_handoff assertion
MODIFY packages/mcp-server/tests/server-integration.test.ts -- update tool count, remove 3 removed tool assertions
MODIFY docs/api/mcp-server.md                           -- update tool tables to reflect consolidation
MODIFY agents/skills/claude-code/harness-codebase-cleanup/SKILL.md    -- replace apply_fixes references with detect_entropy autoFix
MODIFY agents/skills/gemini-cli/harness-codebase-cleanup/SKILL.md     -- replace apply_fixes references with detect_entropy autoFix
MODIFY agents/skills/claude-code/cleanup-dead-code/SKILL.md           -- replace apply_fixes references with detect_entropy autoFix
```

## Tasks

### Task 1: Absorb handoff into manage_state (TDD)

**Depends on:** none
**Files:** `packages/mcp-server/tests/tools/state.test.ts`, `packages/mcp-server/src/tools/state.ts`

1. Open `packages/mcp-server/tests/tools/state.test.ts`. Replace the entire `describe('manage_handoff tool', ...)` block with new tests under the existing `describe('manage_state tool', ...)`:

   ```typescript
   it('has save-handoff and load-handoff in action enum', () => {
     const actionProp = manageStateDefinition.inputSchema.properties.action as {
       type: string;
       enum: string[];
     };
     expect(actionProp.enum).toContain('save-handoff');
     expect(actionProp.enum).toContain('load-handoff');
   });

   it('has optional handoff property', () => {
     expect(manageStateDefinition.inputSchema.properties.handoff).toBeDefined();
   });

   it('load-handoff action returns null for nonexistent handoff', async () => {
     const response = await handleManageState({
       path: '/nonexistent/project',
       action: 'load-handoff',
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed).toBeNull();
   });

   it('save-handoff action returns error when handoff is missing', async () => {
     const response = await handleManageState({
       path: '/nonexistent/project',
       action: 'save-handoff',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('handoff is required');
   });
   ```

2. Remove the import of `manageHandoffDefinition` and `handleManageHandoff` from the test file imports.

3. Run test: `npx vitest run packages/mcp-server/tests/tools/state.test.ts`

4. Observe failure: `save-handoff` and `load-handoff` not in enum, `handoff` property not defined.

5. Open `packages/mcp-server/src/tools/state.ts`. Make these changes:

   a. In `manageStateDefinition.inputSchema.properties.action.enum`, add `'save-handoff'` and `'load-handoff'` to the array:

   ```typescript
   enum: ['show', 'learn', 'failure', 'archive', 'reset', 'gate', 'save-handoff', 'load-handoff'],
   ```

   b. In `manageStateDefinition.inputSchema.properties`, add:

   ```typescript
   handoff: { type: 'object', description: 'Handoff data to save (required for save-handoff)' },
   ```

   c. In `manageStateDefinition.description`, update to:

   ```
   'Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff'
   ```

   d. Update `handleManageState` input type: add `'save-handoff' | 'load-handoff'` to the `action` union, add `handoff?: unknown` to the input type.

   e. Add two new cases in the switch statement (before the `default` case):

   ```typescript
   case 'save-handoff': {
     if (!input.handoff) {
       return {
         content: [
           { type: 'text' as const, text: 'Error: handoff is required for save-handoff action' },
         ],
         isError: true,
       };
     }
     const { saveHandoff } = await import('@harness-engineering/core');
     const result = await saveHandoff(
       projectPath,
       input.handoff as Parameters<typeof saveHandoff>[1],
       input.stream
     );
     return resultToMcpResponse(result.ok ? Ok({ saved: true }) : result);
   }

   case 'load-handoff': {
     const { loadHandoff } = await import('@harness-engineering/core');
     const result = await loadHandoff(projectPath, input.stream);
     return resultToMcpResponse(result);
   }
   ```

   f. Remove the entire `manage_handoff` section: delete `manageHandoffDefinition`, `handleManageHandoff` export, and all associated code (lines 151-227 approximately).

6. Run test: `npx vitest run packages/mcp-server/tests/tools/state.test.ts`

7. Observe: all tests pass.

8. Run: `harness validate`

9. Commit: `refactor(mcp-server): absorb manage_handoff into manage_state as save-handoff/load-handoff actions`

---

### Task 2: Absorb validate_knowledge_map into check_docs (TDD)

**Depends on:** none
**Files:** `packages/mcp-server/tests/tools/docs.test.ts`, `packages/mcp-server/src/tools/docs.ts`

1. Open `packages/mcp-server/tests/tools/docs.test.ts`. Replace the entire `describe('validate_knowledge_map tool', ...)` block with new tests under the existing `describe('check_docs tool', ...)`:

   ```typescript
   it('has scope property in definition', () => {
     expect(checkDocsDefinition.inputSchema.properties).toHaveProperty('scope');
     const scopeProp = checkDocsDefinition.inputSchema.properties.scope as { enum: string[] };
     expect(scopeProp.enum).toEqual(['coverage', 'integrity', 'all']);
   });

   it('defaults to coverage scope', async () => {
     const response = await handleCheckDocs({ path: '/nonexistent/project' });
     expect(response.content).toHaveLength(1);
     expect(response.content[0].text).toBeDefined();
     // Should not error (coverage mode tolerates missing dirs)
   });

   it('integrity scope returns error for nonexistent path', async () => {
     const response = await handleCheckDocs({ path: '/nonexistent/project', scope: 'integrity' });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('Failed to read AGENTS.md');
   });

   it('all scope runs both coverage and integrity', async () => {
     const response = await handleCheckDocs({ path: '/nonexistent/project', scope: 'all' });
     expect(response.content).toHaveLength(1);
     const parsed = JSON.parse(response.content[0].text);
     // all scope returns an object with coverage and integrity keys
     expect(parsed).toHaveProperty('coverage');
     expect(parsed).toHaveProperty('integrity');
   });
   ```

2. Remove the imports of `validateKnowledgeMapDefinition` and `handleValidateKnowledgeMap` from the test file.

3. Run test: `npx vitest run packages/mcp-server/tests/tools/docs.test.ts`

4. Observe failure: no `scope` property, `handleCheckDocs` does not accept `scope`.

5. Open `packages/mcp-server/src/tools/docs.ts`. Make these changes:

   a. In `checkDocsDefinition.inputSchema.properties`, add:

   ```typescript
   scope: {
     type: 'string',
     enum: ['coverage', 'integrity', 'all'],
     description: "Scope of check: 'coverage' (doc coverage), 'integrity' (knowledge map validation), 'all' (both). Default: 'coverage'",
   },
   ```

   b. Update `checkDocsDefinition.description` to:

   ```
   'Analyze documentation coverage and/or validate knowledge map integrity'
   ```

   c. Update `handleCheckDocs` signature to accept `scope?: 'coverage' | 'integrity' | 'all'`.

   d. Restructure `handleCheckDocs` body to branch on scope:

   ```typescript
   export async function handleCheckDocs(input: {
     path: string;
     domain?: string;
     scope?: 'coverage' | 'integrity' | 'all';
   }) {
     try {
       const projectPath = sanitizePath(input.path);
       const scope = input.scope ?? 'coverage';

       if (scope === 'integrity') {
         const { validateKnowledgeMap } = await import('@harness-engineering/core');
         const result = await validateKnowledgeMap(projectPath);
         return resultToMcpResponse(result);
       }

       if (scope === 'all') {
         const { checkDocCoverage, validateKnowledgeMap, Ok } =
           await import('@harness-engineering/core');
         const domain = input.domain ?? 'src';

         const { loadGraphStore } = await import('../utils/graph-loader.js');
         const store = await loadGraphStore(projectPath);
         let graphCoverage:
           | { documented: string[]; undocumented: string[]; coveragePercentage: number }
           | undefined;
         if (store) {
           const { Assembler } = await import('@harness-engineering/graph');
           const assembler = new Assembler(store);
           const report = assembler.checkCoverage();
           graphCoverage = {
             documented: [...report.documented],
             undocumented: [...report.undocumented],
             coveragePercentage: report.coveragePercentage,
           };
         }

         const [coverageResult, integrityResult] = await Promise.allSettled([
           checkDocCoverage(domain, {
             sourceDir: path.resolve(projectPath, 'src'),
             docsDir: path.resolve(projectPath, 'docs'),
             graphCoverage,
           }),
           validateKnowledgeMap(projectPath),
         ]);

         const coverage =
           coverageResult.status === 'fulfilled' && coverageResult.value.ok
             ? coverageResult.value.value
             : coverageResult.status === 'fulfilled'
               ? { error: coverageResult.value.error }
               : { error: String(coverageResult.reason) };
         const integrity =
           integrityResult.status === 'fulfilled' && integrityResult.value.ok
             ? integrityResult.value.value
             : integrityResult.status === 'fulfilled'
               ? { error: integrityResult.value.error }
               : { error: String(integrityResult.reason) };

         return resultToMcpResponse(Ok({ coverage, integrity }));
       }

       // scope === 'coverage' (default -- existing behavior)
       const { checkDocCoverage } = await import('@harness-engineering/core');
       const domain = input.domain ?? 'src';
       const { loadGraphStore } = await import('../utils/graph-loader.js');
       const store = await loadGraphStore(projectPath);
       let graphCoverage:
         | { documented: string[]; undocumented: string[]; coveragePercentage: number }
         | undefined;
       if (store) {
         const { Assembler } = await import('@harness-engineering/graph');
         const assembler = new Assembler(store);
         const report = assembler.checkCoverage();
         graphCoverage = {
           documented: [...report.documented],
           undocumented: [...report.undocumented],
           coveragePercentage: report.coveragePercentage,
         };
       }

       const result = await checkDocCoverage(domain, {
         sourceDir: path.resolve(projectPath, 'src'),
         docsDir: path.resolve(projectPath, 'docs'),
         graphCoverage,
       });
       return resultToMcpResponse(result);
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }
   ```

   e. Remove the entire `validateKnowledgeMapDefinition` and `handleValidateKnowledgeMap` exports (lines 60-88 approximately).

   f. Add `import { Ok } from '@harness-engineering/core';` at the top (needed for the `all` scope path).

6. Run test: `npx vitest run packages/mcp-server/tests/tools/docs.test.ts`

7. Observe: all tests pass. (Note: the `all` scope test may need adjustment depending on exact error shapes from `validateKnowledgeMap` on a nonexistent path. If `validateKnowledgeMap` throws rather than returning `Result`, the `integrity` key will contain an error string. Verify and adjust the test assertion accordingly.)

8. Run: `harness validate`

9. Commit: `refactor(mcp-server): absorb validate_knowledge_map into check_docs via scope parameter`

---

### Task 3: Absorb apply_fixes into detect_entropy (TDD)

**Depends on:** none
**Files:** `packages/mcp-server/tests/tools/entropy.test.ts`, `packages/mcp-server/src/tools/entropy.ts`

1. Open `packages/mcp-server/tests/tools/entropy.test.ts`. Replace the entire `describe('apply_fixes tool', ...)` block with new tests under the existing `describe('detect_entropy tool', ...)`:

   ```typescript
   it('has autoFix parameter in definition', () => {
     expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('autoFix');
     expect(detectEntropyDefinition.inputSchema.properties.autoFix).toEqual({
       type: 'boolean',
       description: 'When true, apply fixes after analysis. Default: false (analysis only)',
     });
   });

   it('has dryRun parameter in definition', () => {
     expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('dryRun');
   });

   it('has fixTypes parameter in definition', () => {
     expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('fixTypes');
   });

   it('description mentions fix capability', () => {
     expect(detectEntropyDefinition.description).toContain('fix');
   });
   ```

2. Remove the import of `applyFixesDefinition` from the test file.

3. Run test: `npx vitest run packages/mcp-server/tests/tools/entropy.test.ts`

4. Observe failure: no `autoFix`, `dryRun`, or `fixTypes` properties on definition.

5. Open `packages/mcp-server/src/tools/entropy.ts`. Make these changes:

   a. Update `detectEntropyDefinition.description` to:

   ```
   'Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.'
   ```

   b. Add three properties to `detectEntropyDefinition.inputSchema.properties`:

   ```typescript
   autoFix: {
     type: 'boolean',
     description: 'When true, apply fixes after analysis. Default: false (analysis only)',
   },
   dryRun: { type: 'boolean', description: 'Preview fixes without applying (only used when autoFix is true)' },
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
     description: 'Specific fix types to apply (default: all safe types). Only used when autoFix is true.',
   },
   ```

   c. Update `handleDetectEntropy` signature to include optional params:

   ```typescript
   export async function handleDetectEntropy(input: {
     path: string;
     type?: string;
     autoFix?: boolean;
     dryRun?: boolean;
     fixTypes?: string[];
   });
   ```

   d. After the existing `const result = await analyzer.analyze(graphOptions);` line, add the autoFix branch:

   ```typescript
   if (!input.autoFix) {
     return resultToMcpResponse(result);
   }

   // autoFix mode: run fixes after analysis
   if (!result.ok) return resultToMcpResponse(result);

   const { createFixes, applyFixes, generateSuggestions } =
     await import('@harness-engineering/core');

   const report = result.value;
   const deadCode = report.deadCode;
   const fixTypesConfig = input.fixTypes
     ? { fixTypes: input.fixTypes as import('@harness-engineering/core').FixType[] }
     : undefined;
   const fixes = deadCode ? createFixes(deadCode, fixTypesConfig) : [];
   const suggestions = generateSuggestions(report.deadCode, report.drift, report.patterns);

   if (input.dryRun) {
     return {
       content: [
         { type: 'text' as const, text: JSON.stringify({ analysis: report, fixes, suggestions }) },
       ],
     };
   }

   if (fixes.length > 0) {
     const applied = await applyFixes(fixes, {});
     if (!applied.ok) return resultToMcpResponse(applied);
     return {
       content: [
         {
           type: 'text' as const,
           text: JSON.stringify({ analysis: report, ...applied.value, suggestions }),
         },
       ],
     };
   }

   return resultToMcpResponse(Ok({ analysis: report, fixes: [], applied: 0, suggestions }));
   ```

   e. Remove the old non-autoFix return: the original `return resultToMcpResponse(result);` at line 68 is now inside the `if (!input.autoFix)` guard above.

   f. Remove the entire `applyFixesDefinition` and `handleApplyFixes` exports (lines 82-163 approximately).

6. Run test: `npx vitest run packages/mcp-server/tests/tools/entropy.test.ts`

7. Observe: all tests pass.

8. Run: `harness validate`

9. Commit: `refactor(mcp-server): absorb apply_fixes into detect_entropy via autoFix parameter`

---

### Task 4: Update server.ts tool registry

**Depends on:** Task 1, Task 2, Task 3
**Files:** `packages/mcp-server/src/server.ts`

1. Open `packages/mcp-server/src/server.ts`. Make these changes:

   a. Update the import from `'./tools/state.js'` -- remove `manageHandoffDefinition` and `handleManageHandoff`:

   ```typescript
   import {
     manageStateDefinition,
     handleManageState,
     listStreamsDefinition,
     handleListStreams,
   } from './tools/state.js';
   ```

   b. Update the import from `'./tools/docs.js'` -- remove `validateKnowledgeMapDefinition` and `handleValidateKnowledgeMap`:

   ```typescript
   import { checkDocsDefinition, handleCheckDocs } from './tools/docs.js';
   ```

   c. Update the import from `'./tools/entropy.js'` -- remove `applyFixesDefinition` and `handleApplyFixes`:

   ```typescript
   import { detectEntropyDefinition, handleDetectEntropy } from './tools/entropy.js';
   ```

   d. In the `TOOL_DEFINITIONS` array, remove these three entries:
   - `validateKnowledgeMapDefinition`
   - `applyFixesDefinition`
   - `manageHandoffDefinition`

   e. In the `TOOL_HANDLERS` record, remove these three entries:
   - `validate_knowledge_map: handleValidateKnowledgeMap as ToolHandler,`
   - `apply_fixes: handleApplyFixes as ToolHandler,`
   - `manage_handoff: handleManageHandoff as ToolHandler,`

2. Run: `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` (verify no compile errors).

3. Run: `harness validate`

4. Commit: `refactor(mcp-server): remove manage_handoff, validate_knowledge_map, apply_fixes from tool registry`

---

### Task 5: Update server tests for new tool count

**Depends on:** Task 4
**Files:** `packages/mcp-server/tests/server.test.ts`, `packages/mcp-server/tests/server-integration.test.ts`

1. Open `packages/mcp-server/tests/server.test.ts`. Make these changes:

   a. Change `expect(tools).toHaveLength(40)` to `expect(tools).toHaveLength(37)`.

   b. In the `'registers new state tools'` test, remove the line:

   ```typescript
   expect(names).toContain('manage_handoff');
   ```

   c. Add a new test to verify removed tools are absent:

   ```typescript
   it('does not register removed tools', () => {
     const names = getToolDefinitions().map((t) => t.name);
     expect(names).not.toContain('manage_handoff');
     expect(names).not.toContain('validate_knowledge_map');
     expect(names).not.toContain('apply_fixes');
   });
   ```

2. Open `packages/mcp-server/tests/server-integration.test.ts`. Make these changes:

   a. Change `expect(tools).toHaveLength(40)` to `expect(tools).toHaveLength(37)`.

   b. Remove these three lines from the `'registers all expected tools'` test:

   ```typescript
   expect(names).toContain('validate_knowledge_map');
   expect(names).toContain('apply_fixes');
   ```

   (Note: `manage_handoff` does not appear in this test file, so only two lines to remove.)

3. Run tests: `npx vitest run packages/mcp-server/tests/server.test.ts packages/mcp-server/tests/server-integration.test.ts`

4. Observe: all tests pass.

5. Run: `harness validate`

6. Commit: `test(mcp-server): update server tests for 37-tool count after consolidation`

---

### Task 6: Run full test suite -- verify zero regressions

[checkpoint:human-verify]

**Depends on:** Task 5
**Files:** none (verification only)

1. Run: `npx turbo run test`

2. Observe: all test suites pass with zero failures.

3. Run: `harness validate`

4. If any tests fail, identify the cause. Common issues:
   - Other test files may import `handleApplyFixes`, `handleManageHandoff`, or `handleValidateKnowledgeMap` directly. Search and fix.
   - Snapshot files may reference old tool names. Update snapshots.

5. Do not commit -- this is a verification checkpoint.

---

### Task 7: Update API documentation

**Depends on:** Task 4
**Files:** `docs/api/mcp-server.md`

1. Open `docs/api/mcp-server.md`. Make these changes:

   a. In the **Documentation** table (around line 83-86), remove the `validate_knowledge_map` row. Update `check_docs` description to:

   ```
   | `check_docs`             | Check documentation coverage and/or knowledge map integrity (`scope` parameter) |
   ```

   b. In the **Entropy & Code Quality** table (around line 90-93), remove the `apply_fixes` row. Update `detect_entropy` description to:

   ```
   | `detect_entropy` | Detect code entropy and optionally auto-fix issues (`autoFix` parameter) |
   ```

   c. In the **State Management** table (around line 129-133), remove the `manage_handoff` row. Update `manage_state` description to:

   ```
   | `manage_state`   | Read/write harness state including handoff save/load |
   ```

2. Run: `harness validate`

3. Commit: `docs: update mcp-server API docs for tool consolidation`

---

### Task 8: Update skill files referencing apply_fixes

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md`, `agents/skills/gemini-cli/harness-codebase-cleanup/SKILL.md`, `agents/skills/claude-code/cleanup-dead-code/SKILL.md`

1. Open `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md`. Find the line referencing `apply_fixes` (line 208):

   ```
   - **`apply_fixes` MCP tool** -- Applies safe fixes via the MCP server
   ```

   Replace with:

   ```
   - **`detect_entropy` MCP tool with `autoFix: true`** -- Detects entropy and applies safe fixes via the MCP server
   ```

2. Open `agents/skills/gemini-cli/harness-codebase-cleanup/SKILL.md`. Apply the same change at line 208.

3. Open `agents/skills/claude-code/cleanup-dead-code/SKILL.md`. Find lines 77-79 referencing `apply_fixes`. Replace:

   ```
   - **Dead exports (non-public):** Use `apply_fixes` with `fixTypes: ['dead-exports']`. The tool removes the `export` keyword. If the function/class has zero internal callers too, delete the entire declaration.
   - **Commented-out code:** Use `apply_fixes` with `fixTypes: ['commented-code']`. The tool deletes commented-out code blocks. This is cosmetic and only needs lint verification.
   - **Orphaned dependencies:** Use `apply_fixes` with `fixTypes: ['orphaned-deps']`. The tool removes the dep from package.json. **Must run `pnpm install && pnpm test` after** to verify nothing breaks.
   ```

   With:

   ```
   - **Dead exports (non-public):** Use `detect_entropy` with `autoFix: true, fixTypes: ['dead-exports']`. The tool removes the `export` keyword. If the function/class has zero internal callers too, delete the entire declaration.
   - **Commented-out code:** Use `detect_entropy` with `autoFix: true, fixTypes: ['commented-code']`. The tool deletes commented-out code blocks. This is cosmetic and only needs lint verification.
   - **Orphaned dependencies:** Use `detect_entropy` with `autoFix: true, fixTypes: ['orphaned-deps']`. The tool removes the dep from package.json. **Must run `pnpm install && pnpm test` after** to verify nothing breaks.
   ```

4. Run: `harness validate`

5. Commit: `docs(skills): replace apply_fixes references with detect_entropy autoFix`

---

### Task 9: Final verification -- zero remaining references to removed tools

[checkpoint:human-verify]

**Depends on:** Task 8
**Files:** none (verification only)

1. Search for remaining references in source code:

   ```bash
   grep -r 'manage_handoff\|manageHandoff' packages/mcp-server/src/ --include='*.ts'
   grep -r 'validate_knowledge_map\|validateKnowledgeMap' packages/mcp-server/src/ --include='*.ts'
   grep -r 'apply_fixes\|applyFixes' packages/mcp-server/src/ --include='*.ts'
   ```

2. Each command should return zero results.

3. Search for remaining references in test files:

   ```bash
   grep -r 'manage_handoff\|manageHandoff' packages/mcp-server/tests/ --include='*.ts'
   grep -r 'validate_knowledge_map\|validateKnowledgeMap' packages/mcp-server/tests/ --include='*.ts'
   grep -r 'apply_fixes\|applyFixesDefinition\|handleApplyFixes' packages/mcp-server/tests/ --include='*.ts'
   ```

4. Each command should return zero results (references in test descriptions like "does not register removed tools" are acceptable since they verify absence, not usage).

5. Search skill files:

   ```bash
   grep -r 'apply_fixes' agents/ --include='*.md'
   grep -r 'manage_handoff' agents/ --include='*.md'
   grep -r 'validate_knowledge_map' agents/ --include='*.md'
   ```

6. Each command should return zero results.

7. Run: `npx turbo run test`

8. Run: `harness validate`

9. Observe: all passing, zero references. Phase 3 is complete.
