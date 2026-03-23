# Plan: Phase 1 -- Move and Rewire (Merge MCP into CLI)

**Date:** 2026-03-23
**Spec:** docs/changes/merge-mcp-into-cli/proposal.md
**Estimated tasks:** 11
**Estimated time:** 45 minutes

## Goal

Move all MCP server source files from `packages/mcp-server/src/` into `packages/cli/src/mcp/`, rewire imports, unify path resolution, and expose `harness-mcp` binary + `harness mcp` subcommand from the CLI package.

## Observable Truths (Acceptance Criteria)

1. When `pnpm build` is run in `packages/cli/`, tsup compiles without errors and produces `dist/bin/harness-mcp.js`.
2. The `packages/cli/src/mcp/` directory contains `server.ts`, `index.ts`, `tools/` (26 files), `resources/` (6 files), and `utils/` (5 files, no `paths.ts`).
3. No file under `packages/cli/src/mcp/` contains the string `@harness-engineering/cli`.
4. All files under `packages/cli/src/mcp/tools/` that previously imported from `../utils/paths.js` now import from `../../utils/paths.js` (the CLI's unified paths.ts).
5. When `node dist/bin/harness-mcp.js` is executed, the MCP server starts on stdio without crashing.
6. `packages/cli/package.json` has `"harness-mcp": "./dist/bin/harness-mcp.js"` in the `bin` field.
7. `packages/cli/package.json` lists `"@modelcontextprotocol/sdk": "^1.0.0"` in dependencies.
8. The CLI's `src/utils/paths.ts` exports `findUpFrom` and has the `process.cwd()` fallback in `findUpDir`.
9. The CLI's `src/index.ts` re-exports `createHarnessServer`, `startServer`, `getToolDefinitions` from `./mcp/index.js`.
10. `harness mcp` subcommand exists and calls `startServer()`.
11. `@modelcontextprotocol/sdk` is listed in tsup's `external` option (not bundled).
12. The `packages/cli/src/mcp/server.ts` file's update-check block imports from `@harness-engineering/core` and reads CLI version from the local package.json (no cross-package require of `@harness-engineering/cli/package.json`).

## File Map

```
CREATE  packages/cli/src/mcp/server.ts
CREATE  packages/cli/src/mcp/index.ts
CREATE  packages/cli/src/mcp/tools/validate.ts
CREATE  packages/cli/src/mcp/tools/architecture.ts
CREATE  packages/cli/src/mcp/tools/docs.ts
CREATE  packages/cli/src/mcp/tools/entropy.ts
CREATE  packages/cli/src/mcp/tools/performance.ts
CREATE  packages/cli/src/mcp/tools/linter.ts
CREATE  packages/cli/src/mcp/tools/init.ts
CREATE  packages/cli/src/mcp/tools/persona.ts
CREATE  packages/cli/src/mcp/tools/agent.ts
CREATE  packages/cli/src/mcp/tools/skill.ts
CREATE  packages/cli/src/mcp/tools/state.ts
CREATE  packages/cli/src/mcp/tools/feedback.ts
CREATE  packages/cli/src/mcp/tools/phase-gate.ts
CREATE  packages/cli/src/mcp/tools/cross-check.ts
CREATE  packages/cli/src/mcp/tools/generate-slash-commands.ts
CREATE  packages/cli/src/mcp/tools/graph.ts
CREATE  packages/cli/src/mcp/tools/agent-definitions.ts
CREATE  packages/cli/src/mcp/tools/security.ts
CREATE  packages/cli/src/mcp/tools/roadmap.ts
CREATE  packages/cli/src/mcp/tools/interaction.ts
CREATE  packages/cli/src/mcp/tools/interaction-renderer.ts
CREATE  packages/cli/src/mcp/tools/interaction-schemas.ts
CREATE  packages/cli/src/mcp/tools/review-pipeline.ts
CREATE  packages/cli/src/mcp/tools/gather-context.ts
CREATE  packages/cli/src/mcp/tools/assess-project.ts
CREATE  packages/cli/src/mcp/tools/review-changes.ts
CREATE  packages/cli/src/mcp/resources/skills.ts
CREATE  packages/cli/src/mcp/resources/rules.ts
CREATE  packages/cli/src/mcp/resources/project.ts
CREATE  packages/cli/src/mcp/resources/learnings.ts
CREATE  packages/cli/src/mcp/resources/state.ts
CREATE  packages/cli/src/mcp/resources/graph.ts
CREATE  packages/cli/src/mcp/utils/config-resolver.ts
CREATE  packages/cli/src/mcp/utils/result-adapter.ts
CREATE  packages/cli/src/mcp/utils/sanitize-path.ts
CREATE  packages/cli/src/mcp/utils/glob-helper.ts
CREATE  packages/cli/src/mcp/utils/graph-loader.ts
CREATE  packages/cli/src/bin/harness-mcp.ts
CREATE  packages/cli/src/commands/mcp.ts
MODIFY  packages/cli/src/utils/paths.ts  (add findUpFrom + process.cwd() fallback)
MODIFY  packages/cli/src/index.ts  (add MCP re-exports, register mcp command)
MODIFY  packages/cli/package.json  (add bin entry, add @modelcontextprotocol/sdk dep)
MODIFY  packages/cli/tsup.config.ts  (add entry point, add external)
```

## Import Rewrite Reference

When files move from `packages/mcp-server/src/tools/` to `packages/cli/src/mcp/tools/`, the following import rewrites apply:

### `@harness-engineering/cli` dynamic imports (10 occurrences across 7 files)

Each dynamic `import('@harness-engineering/cli')` becomes a relative import to the specific CLI source file:

| File                               | Old import                                                                                                    | New import                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/skill.ts`                   | `import('@harness-engineering/cli')` for `generateSkillFiles`                                                 | `import('../../commands/create-skill.js')`                                                                                                                                                          |
| `tools/persona.ts`                 | `import('@harness-engineering/cli')` for `listPersonas`                                                       | `import('../../persona/loader.js')`                                                                                                                                                                 |
| `tools/persona.ts`                 | `import('@harness-engineering/cli')` for `loadPersona, generateRuntime, generateAgentsMd, generateCIWorkflow` | Split: `import('../../persona/loader.js')`, `import('../../persona/generators/runtime.js')`, `import('../../persona/generators/agents-md.js')`, `import('../../persona/generators/ci-workflow.js')` |
| `tools/persona.ts`                 | `import('@harness-engineering/cli')` for `loadPersona, runPersona, executeSkill`                              | `import('../../persona/loader.js')`, `import('../../persona/runner.js')`, `import('../../persona/skill-executor.js')`                                                                               |
| `tools/persona.ts`                 | `import('@harness-engineering/cli')` for `ALLOWED_PERSONA_COMMANDS`                                           | `import('../../persona/constants.js')`                                                                                                                                                              |
| `tools/init.ts`                    | `import('@harness-engineering/cli')` for `TemplateEngine`                                                     | `import('../../templates/engine.js')`                                                                                                                                                               |
| `tools/phase-gate.ts`              | `import('@harness-engineering/cli')` for `runCheckPhaseGate`                                                  | `import('../../commands/check-phase-gate.js')`                                                                                                                                                      |
| `tools/agent-definitions.ts`       | `import('@harness-engineering/cli')` for `generateAgentDefinitions`                                           | `import('../../commands/generate-agent-definitions.js')`                                                                                                                                            |
| `tools/generate-slash-commands.ts` | `import { generateSlashCommands } from '@harness-engineering/cli'` (static)                                   | `import { generateSlashCommands } from '../../commands/generate-slash-commands.js'`                                                                                                                 |
| `tools/cross-check.ts`             | `import('@harness-engineering/cli')` for `runCrossCheck`                                                      | `import('../../commands/validate-cross-check.js')`                                                                                                                                                  |

### `../utils/paths.js` imports (3 files -- init, persona, skill)

These currently import `resolveTemplatesDir`, `resolvePersonasDir`, `resolveSkillsDir` from `../utils/paths.js` (the MCP paths.ts). After the move, these functions will exist in the CLI's `../../utils/paths.js`:

| File               | Old                                                  | New                           |
| ------------------ | ---------------------------------------------------- | ----------------------------- |
| `tools/init.ts`    | `from '../utils/paths.js'` for `resolveTemplatesDir` | `from '../../utils/paths.js'` |
| `tools/persona.ts` | `from '../utils/paths.js'` for `resolvePersonasDir`  | `from '../../utils/paths.js'` |
| `tools/skill.ts`   | `from '../utils/paths.js'` for `resolveSkillsDir`    | `from '../../utils/paths.js'` |

### `../utils/*.js` imports (stay as `../utils/*.js` -- same relative path)

All tool files that import from `../utils/result-adapter.js`, `../utils/sanitize-path.js`, `../utils/config-resolver.js`, `../utils/graph-loader.js` keep the **same** relative path because both the tools dir and utils dir move together under `mcp/`.

### Workspace package imports (no change needed)

All `@harness-engineering/core`, `@harness-engineering/graph`, `@harness-engineering/linter-gen`, `@harness-engineering/types` imports stay as-is. tsup already aliases and bundles these.

### server.ts special case

The `server.ts` update-check block currently does `require('@harness-engineering/cli/package.json')` to read CLI_VERSION. Since the server is now inside the CLI package, this should change to read from the CLI's own version constant: `import { CLI_VERSION } from '../version.js'` (static import at top of file, replacing the try/catch block).

## Tasks

### Task 1: Unify CLI paths.ts with process.cwd() fallback

**Depends on:** none
**Files:** `packages/cli/src/utils/paths.ts`

1. Read the current `packages/cli/src/utils/paths.ts`.
2. Modify the `findUpDir` function to accept a `startDir` and add `process.cwd()` fallback, matching the MCP server's pattern. The updated functions should be:

```typescript
// Add this helper BEFORE findUpDir:
function findUpFrom(
  startDir: string,
  targetName: string,
  marker: string,
  maxLevels: number
): string | null {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, targetName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      if (fs.existsSync(path.join(candidate, marker))) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

// Replace existing findUpDir with:
function findUpDir(targetName: string, marker: string, maxLevels = 8): string | null {
  // First try from the compiled module location (works in monorepo dev and bundled dist)
  const fromModule = findUpFrom(__dirname, targetName, marker, maxLevels);
  if (fromModule) return fromModule;
  // Fallback: search from cwd (works when running via npx from project root)
  return findUpFrom(process.cwd(), targetName, marker, maxLevels);
}
```

3. Verify no existing tests break: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/ --reporter=verbose 2>&1 | tail -20`
4. Run: `harness validate`
5. Commit: `refactor(cli): unify paths.ts with process.cwd() fallback for MCP compatibility`

### Task 2: Update CLI package.json with new bin entry and MCP SDK dependency

**Depends on:** none
**Files:** `packages/cli/package.json`

1. Add `"harness-mcp": "./dist/bin/harness-mcp.js"` to the `bin` field.
2. Add `"@modelcontextprotocol/sdk": "^1.0.0"` to `dependencies`.
3. Run `pnpm install` from the monorepo root to update the lockfile.
4. Run: `harness validate`
5. Commit: `build(cli): add harness-mcp bin entry and @modelcontextprotocol/sdk dependency`

The `bin` field should become:

```json
"bin": {
  "harness": "./dist/bin/harness.js",
  "harness-mcp": "./dist/bin/harness-mcp.js"
}
```

### Task 3: Update tsup.config.ts with MCP entry point and external

**Depends on:** none
**Files:** `packages/cli/tsup.config.ts`

1. Add `'src/bin/harness-mcp.ts'` to the `entry` array.
2. Add `external: ['@modelcontextprotocol/sdk']` to prevent tsup from bundling the MCP SDK (it should remain a regular dependency resolved at runtime).

Updated config:

```typescript
import { defineConfig } from 'tsup';
import path from 'path';

const workspaceRoot = path.resolve(__dirname, '../..');

export default defineConfig([
  // Main CLI — bundles workspace packages, generates type declarations
  {
    entry: ['src/index.ts', 'src/bin/harness.ts', 'src/bin/harness-mcp.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist',
    external: ['@modelcontextprotocol/sdk'],
    // Bundle workspace packages into the CLI dist so the CLI works
    // when installed globally without needing sibling packages.
    noExternal: [
      '@harness-engineering/core',
      '@harness-engineering/graph',
      '@harness-engineering/linter-gen',
      '@harness-engineering/types',
    ],
    esbuildOptions(options) {
      // Resolve workspace packages to their built dist to avoid pulling
      // in devDependencies and transitive build tooling.
      options.alias = {
        '@harness-engineering/core': path.join(workspaceRoot, 'packages/core/dist/index.mjs'),
        '@harness-engineering/graph': path.join(workspaceRoot, 'packages/graph/dist/index.mjs'),
        '@harness-engineering/linter-gen': path.join(
          workspaceRoot,
          'packages/linter-gen/dist/index.js'
        ),
        '@harness-engineering/types': path.join(workspaceRoot, 'packages/types/dist/index.mjs'),
      };
    },
  },
]);
```

3. Run: `harness validate`
4. Commit: `build(cli): add harness-mcp entry point and externalize MCP SDK in tsup`

### Task 4: Copy MCP utils (5 files, excluding paths.ts) into CLI

**Depends on:** none
**Files:**

- `packages/cli/src/mcp/utils/config-resolver.ts`
- `packages/cli/src/mcp/utils/result-adapter.ts`
- `packages/cli/src/mcp/utils/sanitize-path.ts`
- `packages/cli/src/mcp/utils/glob-helper.ts`
- `packages/cli/src/mcp/utils/graph-loader.ts`

1. Create directory: `mkdir -p packages/cli/src/mcp/utils`
2. Copy each file from `packages/mcp-server/src/utils/` to `packages/cli/src/mcp/utils/`, **excluding** `paths.ts` (its logic is unified into CLI's `src/utils/paths.ts` in Task 1).
3. No import changes needed in these files -- they import from `@harness-engineering/core` and `@harness-engineering/graph` which remain as workspace package imports.
4. Run: `harness validate`
5. Commit: `refactor(cli): copy MCP utils into cli/src/mcp/utils`

### Task 5: Copy MCP resources (6 files) into CLI

**Depends on:** Task 4
**Files:**

- `packages/cli/src/mcp/resources/skills.ts`
- `packages/cli/src/mcp/resources/rules.ts`
- `packages/cli/src/mcp/resources/project.ts`
- `packages/cli/src/mcp/resources/learnings.ts`
- `packages/cli/src/mcp/resources/state.ts`
- `packages/cli/src/mcp/resources/graph.ts`

1. Create directory: `mkdir -p packages/cli/src/mcp/resources`
2. Copy all 6 resource files from `packages/mcp-server/src/resources/` to `packages/cli/src/mcp/resources/`.
3. No import changes needed:
   - `graph.ts` imports `from '../utils/graph-loader.js'` -- this path is still valid because both moved together.
   - `state.ts` imports from `@harness-engineering/core` -- no change.
   - The other 4 files (`skills.ts`, `rules.ts`, `project.ts`, `learnings.ts`) only import from `fs`, `path`, `yaml` -- no changes.
4. Run: `harness validate`
5. Commit: `refactor(cli): copy MCP resources into cli/src/mcp/resources`

### Task 6: Copy MCP tool files batch 1 (tools with NO @harness-engineering/cli imports) into CLI

**Depends on:** Task 4
**Files:** 16 tool files that do NOT import from `@harness-engineering/cli`:

- `packages/cli/src/mcp/tools/validate.ts`
- `packages/cli/src/mcp/tools/architecture.ts`
- `packages/cli/src/mcp/tools/docs.ts`
- `packages/cli/src/mcp/tools/entropy.ts`
- `packages/cli/src/mcp/tools/performance.ts`
- `packages/cli/src/mcp/tools/linter.ts`
- `packages/cli/src/mcp/tools/agent.ts`
- `packages/cli/src/mcp/tools/state.ts`
- `packages/cli/src/mcp/tools/feedback.ts`
- `packages/cli/src/mcp/tools/graph.ts`
- `packages/cli/src/mcp/tools/security.ts`
- `packages/cli/src/mcp/tools/roadmap.ts`
- `packages/cli/src/mcp/tools/interaction.ts`
- `packages/cli/src/mcp/tools/interaction-renderer.ts`
- `packages/cli/src/mcp/tools/interaction-schemas.ts`
- `packages/cli/src/mcp/tools/review-pipeline.ts`
- `packages/cli/src/mcp/tools/gather-context.ts`
- `packages/cli/src/mcp/tools/assess-project.ts`
- `packages/cli/src/mcp/tools/review-changes.ts`

1. Create directory: `mkdir -p packages/cli/src/mcp/tools`
2. Copy all 19 files listed above from `packages/mcp-server/src/tools/` to `packages/cli/src/mcp/tools/`.
3. No import changes needed for these files:
   - Their `../utils/*.js` imports remain valid (moved together).
   - Their `@harness-engineering/core`, `@harness-engineering/graph`, `@harness-engineering/linter-gen` imports remain as workspace packages.
4. Run: `harness validate`
5. Commit: `refactor(cli): copy MCP tools (no CLI imports) into cli/src/mcp/tools`

### Task 7: Copy and rewire MCP tool files batch 2 (tools WITH @harness-engineering/cli imports)

**Depends on:** Task 1 (paths.ts unified), Task 4 (utils copied)
**Files:** 7 tool files that import from `@harness-engineering/cli`:

- `packages/cli/src/mcp/tools/skill.ts`
- `packages/cli/src/mcp/tools/persona.ts`
- `packages/cli/src/mcp/tools/init.ts`
- `packages/cli/src/mcp/tools/phase-gate.ts`
- `packages/cli/src/mcp/tools/agent-definitions.ts`
- `packages/cli/src/mcp/tools/generate-slash-commands.ts`
- `packages/cli/src/mcp/tools/cross-check.ts`

1. Copy these 7 files from `packages/mcp-server/src/tools/` to `packages/cli/src/mcp/tools/`.
2. Apply these import rewrites:

**`skill.ts`:**

- Change `import { resolveSkillsDir } from '../utils/paths.js'` to `import { resolveSkillsDir } from '../../utils/paths.js'`
- Change `const { generateSkillFiles } = await import('@harness-engineering/cli')` to `const { generateSkillFiles } = await import('../../commands/create-skill.js')`

**`persona.ts`:**

- Change `import { resolvePersonasDir } from '../utils/paths.js'` to `import { resolvePersonasDir } from '../../utils/paths.js'`
- Line 14: Change `const { listPersonas } = await import('@harness-engineering/cli')` to `const { listPersonas } = await import('../../persona/loader.js')`
- Lines 40-41: Change the destructured import to:
  ```typescript
  const { loadPersona } = await import('../../persona/loader.js');
  const { generateRuntime } = await import('../../persona/generators/runtime.js');
  const { generateAgentsMd } = await import('../../persona/generators/agents-md.js');
  const { generateCIWorkflow } = await import('../../persona/generators/ci-workflow.js');
  ```
- Line 104: Change to:
  ```typescript
  const { loadPersona } = await import('../../persona/loader.js');
  const { runPersona } = await import('../../persona/runner.js');
  const { executeSkill } = await import('../../persona/skill-executor.js');
  ```
- Line 124: Change `const { ALLOWED_PERSONA_COMMANDS } = await import('@harness-engineering/cli')` to `const { ALLOWED_PERSONA_COMMANDS } = await import('../../persona/constants.js')`

**`init.ts`:**

- Change `import { resolveTemplatesDir } from '../utils/paths.js'` to `import { resolveTemplatesDir } from '../../utils/paths.js'`
- Change `const { TemplateEngine } = await import('@harness-engineering/cli')` to `const { TemplateEngine } = await import('../../templates/engine.js')`

**`phase-gate.ts`:**

- Change `const { runCheckPhaseGate } = await import('@harness-engineering/cli')` to `const { runCheckPhaseGate } = await import('../../commands/check-phase-gate.js')`

**`agent-definitions.ts`:**

- Change `const { generateAgentDefinitions } = await import('@harness-engineering/cli')` to `const { generateAgentDefinitions } = await import('../../commands/generate-agent-definitions.js')`

**`generate-slash-commands.ts`:**

- Change `import { generateSlashCommands } from '@harness-engineering/cli'` to `import { generateSlashCommands } from '../../commands/generate-slash-commands.js'`

**`cross-check.ts`:**

- Change `const { runCrossCheck } = await import('@harness-engineering/cli')` to `const { runCrossCheck } = await import('../../commands/validate-cross-check.js')`

3. Verify: `grep -r "@harness-engineering/cli" packages/cli/src/mcp/` should return zero results.
4. Run: `harness validate`
5. Commit: `refactor(cli): copy and rewire MCP tools with CLI imports into cli/src/mcp/tools`

### Task 8: Copy and rewire MCP server.ts and index.ts

**Depends on:** Task 4, Task 5, Task 6, Task 7
**Files:**

- `packages/cli/src/mcp/server.ts`
- `packages/cli/src/mcp/index.ts`

1. Copy `packages/mcp-server/src/server.ts` to `packages/cli/src/mcp/server.ts`.
2. Copy `packages/mcp-server/src/index.ts` to `packages/cli/src/mcp/index.ts`.

3. Rewire `server.ts`:
   - All `./tools/*.js` and `./resources/*.js` and `./utils/*.js` imports stay the same (same relative structure).
   - Replace the update-check version resolution block (lines 310-319 approximately). The current code does:
     ```typescript
     let CLI_VERSION = '0.0.0';
     try {
       const { createRequire } = await import('node:module');
       const require_ = createRequire(import.meta.url);
       CLI_VERSION = (require_('@harness-engineering/cli/package.json') as { version: string })
         .version;
     } catch {
       const core = await import('@harness-engineering/core');
       CLI_VERSION = core.VERSION;
     }
     ```
     Replace with:
     ```typescript
     const { CLI_VERSION: version } = await import('../version.js');
     let CLI_VERSION = version;
     ```
     This works because the server is now inside the CLI package and can directly import the CLI's version constant.

4. `index.ts` needs no changes -- it only imports from `./server.js` and `./utils/*.js` which maintain the same relative paths.

5. Run: `harness validate`
6. Commit: `refactor(cli): copy and rewire MCP server.ts and index.ts into cli/src/mcp`

### Task 9: Create harness-mcp bin entry point

**Depends on:** Task 8
**Files:** `packages/cli/src/bin/harness-mcp.ts`

1. Create `packages/cli/src/bin/harness-mcp.ts`:

```typescript
#!/usr/bin/env node
import { startServer } from '../mcp/index.js';

startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
```

2. Run: `harness validate`
3. Commit: `feat(cli): add harness-mcp bin entry point`

### Task 10: Create `harness mcp` subcommand and register it

**Depends on:** Task 8
**Files:**

- `packages/cli/src/commands/mcp.ts`
- `packages/cli/src/index.ts`

1. Create `packages/cli/src/commands/mcp.ts`:

```typescript
import { Command } from 'commander';

export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start the MCP (Model Context Protocol) server on stdio')
    .action(async () => {
      const { startServer } = await import('../mcp/index.js');
      await startServer();
    });
}
```

2. Modify `packages/cli/src/index.ts`:
   - Add import: `import { createMcpCommand } from './commands/mcp';`
   - Add registration in `createProgram()`: `program.addCommand(createMcpCommand());`
   - Add MCP re-exports at the end of the file:
     ```typescript
     // MCP server exports
     export { createHarnessServer, startServer, getToolDefinitions } from './mcp/index.js';
     ```

3. Run: `harness validate`
4. Commit: `feat(cli): add harness mcp subcommand and MCP re-exports`

### Task 11: Build verification and smoke test

[checkpoint:human-verify]
**Depends on:** Task 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
**Files:** none (verification only)

1. Run full build: `cd /Users/cwarner/Projects/harness-engineering && pnpm build`
2. Verify `dist/bin/harness-mcp.js` exists: `ls -la packages/cli/dist/bin/harness-mcp.js`
3. Verify no `@harness-engineering/cli` imports remain in moved files: `grep -r "@harness-engineering/cli" packages/cli/src/mcp/` -- should return empty.
4. Verify binary starts: `timeout 2 node packages/cli/dist/bin/harness-mcp.js 2>&1 || true` (will timeout on stdio, but should not crash with import errors).
5. Verify subcommand registered: `node packages/cli/dist/bin/harness.js mcp --help`
6. Run: `harness validate`
7. Commit: no commit (verification only)

## Dependency Graph

```
Task 1 (paths.ts) ──────────────────┐
Task 2 (package.json) ───────────── │ ──────────────────────────────┐
Task 3 (tsup.config.ts) ─────────── │ ──────────────────────────────┤
Task 4 (utils) ──────────┬──────── Task 7 (tools batch 2) ──┐     │
Task 5 (resources) ──────┤                                   ├── Task 8 (server+index) ── Task 9 (bin)
Task 6 (tools batch 1) ──┘                                   │                        ── Task 10 (mcp cmd)
                                                              │                              │
                                                              └──────────────────────────────┴── Task 11 (verify)
```

**Parallelizable groups:**

- Tasks 1, 2, 3, 4 can all run in parallel (independent files)
- Tasks 5, 6 can run in parallel after Task 4 (need utils dir created)
- Task 7 needs Tasks 1 and 4
- Task 8 needs Tasks 4-7
- Tasks 9, 10 need Task 8
- Task 11 needs all prior tasks

## Risks and Mitigations

1. **tsup DTS generation**: Adding many new .ts files to the CLI package may slow or break DTS generation. If `dts: true` causes build failures, try `dts: { resolve: false }` or temporarily disable DTS for the MCP entry point by splitting into a second tsup config entry.

2. **Circular imports**: The MCP tools import from CLI source files (e.g., `../../commands/create-skill.js`), and the CLI's index.ts re-exports MCP functions. This is not circular because the MCP tools use dynamic `import()` (lazy), and the re-exports from index.ts point to `./mcp/index.js` which does not import from the CLI's index.ts.

3. **`generate-slash-commands.ts` static import**: This is the only tool file with a static (not dynamic) import from `@harness-engineering/cli`. The rewrite to a relative path must be static too, which means the CLI's `commands/generate-slash-commands.ts` module will be eagerly loaded when this tool file is imported. This matches the current behavior since tsup bundles everything anyway.
