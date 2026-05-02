# Plan: Phase 3 -- Cleanup and Deprecation (Merge MCP into CLI)

**Date:** 2026-03-23
**Spec:** docs/changes/merge-mcp-into-cli/proposal.md
**Prior phases:** Phase 1 (move and rewire), Phase 2 (tests) -- both complete
**Estimated tasks:** 5
**Estimated time:** 15 minutes

## Goal

Remove the now-redundant `packages/mcp-server/` directory, update `.mcp.json` to use the CLI binary, update docs, and document the npm deprecation commands.

## Observable Truths (Acceptance Criteria)

1. `packages/mcp-server/` directory does not exist in the monorepo.
2. When `pnpm install` is run, no workspace package references `@harness-engineering/mcp-server`.
3. `.mcp.json` at project root contains `"command": "harness", "args": ["mcp"]`.
4. `docs/api/mcp-server.md` states the package is deprecated and directs users to `@harness-engineering/cli`.
5. `docs/api/index.md` no longer lists `@harness-engineering/mcp-server` as a separate package.
6. `docs/guides/getting-started.md` does not reference `npx @harness-engineering/mcp-server`.
7. `docs/roadmap.md` shows "Merge MCP into CLI" as status `done`.
8. A deprecation instructions file exists at `docs/changes/merge-mcp-into-cli/deprecation-commands.md` with the exact npm commands to run.
9. `harness validate` passes.
10. `pnpm build` succeeds (no broken imports from removed package).

## File Map

- DELETE `packages/mcp-server/` (entire directory)
- MODIFY `.mcp.json` (update command)
- MODIFY `docs/api/mcp-server.md` (deprecation notice + redirect)
- MODIFY `docs/api/index.md` (remove mcp-server line)
- MODIFY `docs/guides/getting-started.md` (remove npx reference)
- MODIFY `docs/roadmap.md` (status -> done, add phase 3 plan)
- CREATE `docs/changes/merge-mcp-into-cli/deprecation-commands.md`

## Tasks

### Task 1: Remove packages/mcp-server/ and update lockfile

**Depends on:** none
**Files:** packages/mcp-server/ (delete), pnpm-lock.yaml (auto-updated)

1. Verify no other workspace package depends on `@harness-engineering/mcp-server`:

   ```bash
   grep -r "@harness-engineering/mcp-server" packages/*/package.json
   ```

   Expected: only `packages/mcp-server/package.json` itself matches.

2. Remove the directory:

   ```bash
   rm -rf packages/mcp-server/
   ```

3. Run `pnpm install` to update the lockfile (the `packages/*` glob in `pnpm-workspace.yaml` auto-adjusts).

4. Verify build still works:

   ```bash
   pnpm build
   ```

5. Run: `npx harness validate`
6. Commit: `chore: remove packages/mcp-server/ after merge into CLI`

**Note:** `pnpm-workspace.yaml` uses `packages/*` glob, so no edit is needed there -- removing the directory is sufficient.

### Task 2: Update .mcp.json to use CLI binary

**Depends on:** Task 1
**Files:** .mcp.json

1. Replace `.mcp.json` contents with:

   ```json
   {
     "mcpServers": {
       "harness": {
         "command": "harness",
         "args": ["mcp"]
       }
     }
   }
   ```

2. Run: `npx harness validate`
3. Commit: `chore: update .mcp.json to use harness mcp subcommand`

### Task 3: Update API docs (mcp-server.md and index.md)

**Depends on:** Task 1
**Files:** docs/api/mcp-server.md, docs/api/index.md

1. Replace `docs/api/mcp-server.md` with a deprecation redirect:

   ````markdown
   # @harness-engineering/mcp-server (Deprecated)

   > **This package has been deprecated.** The MCP server is now included in
   > `@harness-engineering/cli`. Install the CLI to get both the `harness` command
   > and the `harness-mcp` binary.

   ## Migration

   ```bash
   # Remove the old package
   npm uninstall @harness-engineering/mcp-server

   # Install the CLI (includes MCP server)
   npm install -g @harness-engineering/cli
   ```
   ````

   ## Updated .mcp.json

   ```json
   {
     "mcpServers": {
       "harness": {
         "command": "harness",
         "args": ["mcp"]
       }
     }
   }
   ```

   Or use `harness-mcp` directly (also provided by the CLI package).

   ## API Reference

   See [@harness-engineering/cli MCP exports](cli.md) for the programmatic API:
   - `createHarnessServer(projectRoot?)`
   - `startServer()`
   - `getToolDefinitions()`

   For the full tool and resource reference, see the [CLI documentation](cli.md).

   ```

   ```

2. In `docs/api/index.md`, replace the mcp-server line:

   ```
   - **[@harness-engineering/mcp-server](mcp-server.md)** — MCP server exposing 41 tools and 8 resources for AI agent integration
   ```

   With:

   ```
   - **[@harness-engineering/mcp-server](mcp-server.md)** — *(Deprecated)* MCP server now included in `@harness-engineering/cli`
   ```

3. Run: `npx harness validate`
4. Commit: `docs: mark mcp-server as deprecated in API docs`

### Task 4: Update getting-started.md and roadmap.md

**Depends on:** Task 1
**Files:** docs/guides/getting-started.md, docs/roadmap.md

1. In `docs/guides/getting-started.md`, find line 190 and replace:

   ```
   > **Note:** `harness-mcp` is installed alongside the CLI by `npm install -g @harness-engineering/cli`. Using the installed binary instead of `npx @harness-engineering/mcp-server` avoids stale npx cache issues and ensures version-matched dependencies.
   ```

   With:

   ```
   > **Note:** `harness-mcp` is installed alongside the CLI by `npm install -g @harness-engineering/cli`. The MCP server is bundled with the CLI -- no separate package needed.
   ```

2. In `docs/roadmap.md`, find the "Merge MCP into CLI" section and change:
   - `- **Status:** in-progress` to `- **Status:** done`

3. Run: `npx harness validate`
4. Commit: `docs: update getting-started and roadmap for mcp-server removal`

### Task 5: Create deprecation commands reference

**Depends on:** none
**Files:** docs/changes/merge-mcp-into-cli/deprecation-commands.md

1. Create `docs/changes/merge-mcp-into-cli/deprecation-commands.md`:

   ````markdown
   # Deprecation Commands for @harness-engineering/mcp-server

   These commands must be run manually with npm credentials.

   ## 1. Publish final deprecation version (0.7.0)

   The `packages/mcp-server/package.json` was already at version 0.7.0 before removal.
   To publish a deprecation stub:

   1. Create a temporary directory with a minimal package:
      ```bash
      mkdir -p /tmp/mcp-server-deprecation
      cd /tmp/mcp-server-deprecation
      ```
   ````

   2. Create `package.json`:

      ```json
      {
        "name": "@harness-engineering/mcp-server",
        "version": "0.7.0",
        "description": "DEPRECATED: Use @harness-engineering/cli instead",
        "scripts": {
          "postinstall": "echo '\\n\\n  WARNING: @harness-engineering/mcp-server is deprecated.\\n  Install @harness-engineering/cli instead, which includes the MCP server.\\n  Run: npm install -g @harness-engineering/cli\\n\\n'"
        },
        "bin": {
          "harness-mcp": "./bin/harness-mcp.js"
        }
      }
      ```

   3. Create `bin/harness-mcp.js`:

      ```javascript
      #!/usr/bin/env node
      console.error(
        '\n@harness-engineering/mcp-server is deprecated.\n' +
          'The MCP server is now included in @harness-engineering/cli.\n\n' +
          'To migrate:\n' +
          '  npm install -g @harness-engineering/cli\n' +
          '  # Then use: harness mcp\n'
      );
      process.exit(1);
      ```

   4. Publish:
      ```bash
      npm publish --access public
      ```

   ## 2. Mark as deprecated on npm

   ```bash
   npm deprecate "@harness-engineering/mcp-server" "This package is deprecated. The MCP server is now included in @harness-engineering/cli. Install the CLI package instead: npm install -g @harness-engineering/cli"
   ```

   ```

   ```

2. Run: `npx harness validate`
3. Commit: `docs: add npm deprecation commands for mcp-server`

---

## Verification Checklist

After all tasks:

1. `ls packages/mcp-server` returns "No such file or directory"
2. `pnpm build` passes
3. `pnpm test` passes (all 104 CLI test files)
4. `npx harness validate` passes
5. `cat .mcp.json` shows `"command": "harness", "args": ["mcp"]`
6. `grep -r "@harness-engineering/mcp-server" packages/` returns nothing
