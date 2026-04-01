# Plan: Docs Phase 3 — MCP Tools Generator Reconciliation

**Date:** 2026-04-01
**Spec:** docs/changes/docs-auto-generation/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Verify and reconcile the existing MCP tools generator in `scripts/generate-docs.mjs` against the spec requirements, fixing the four identified gaps: broken import path (causing missing parameter schemas), missing graph subdirectory scanning in fallback, missing features overview link, and missing CLI command cross-links.

## Reconciliation Analysis

The MCP tools generator is approximately 70% complete. The core structure (category grouping, tool name/description extraction, parameter rendering logic) is already implemented. However, the primary import path (`dist/mcp/server.js`) does not exist — the CLI build bundles into chunks, not mirrored directory structure. This causes the generator to fall back to a regex-based source parser that:

1. **Misses 8 graph tools** — `parseToolDefinitionsFromSource()` only scans `packages/cli/src/mcp/tools/*.ts` files directly, not the `tools/graph/` subdirectory
2. **Produces 0 parameters** — the fallback regex cannot parse nested `inputSchema` objects, so it always returns `{ properties: {}, required: [] }`

The fix is to change the import path from `dist/mcp/server.js` to `dist/index.js` and use the exported `getToolDefinitions()` function, which returns all 49 tools with full input schemas. The fallback parser should also be fixed for robustness (scanning subdirectories).

Additionally: 3. **No features overview link** in the intro text (spec requires all generated docs link back to features overview) 4. **No CLI command cross-links** (spec says "Links to corresponding CLI command where one exists")

## Observable Truths (Acceptance Criteria)

1. When `node scripts/generate-docs.mjs` is run, `docs/reference/mcp-tools.md` is produced with the auto-generated header.
2. The generated MCP tools reference lists all 49 tools (not 41) with descriptions.
3. When a tool has input parameters (e.g., `validate_project` has `path`), the generated output includes a **Parameters:** section with parameter name, type, required/optional status, and description.
4. The generated MCP tools reference contains a link to `../guides/features-overview.md` in the introductory section.
5. When a tool has a corresponding CLI command (e.g., `validate_project` maps to `harness validate`), the generated output includes a "See also" link to the CLI reference.
6. The fallback source parser scans the `tools/graph/` subdirectory (robustness for environments without a built CLI).
7. `harness validate` passes after all changes.

## File Map

- MODIFY `scripts/generate-docs.mjs` (fix import path, add features overview link, add CLI cross-links, fix fallback subdirectory scanning)
- MODIFY `docs/reference/mcp-tools.md` (regenerated output — reflects all fixes)

## Tasks

### Task 1: Fix the import path to use getToolDefinitions from dist/index.js

**Depends on:** none
**Files:** `scripts/generate-docs.mjs`

1. Open `scripts/generate-docs.mjs` and locate the `generateMcpReference` function (line 121).

2. Replace the import block (lines 123-131):

   ```javascript
   let toolDefinitions;
   try {
     const serverModule = await import(join(ROOT, 'packages', 'cli', 'dist', 'mcp', 'server.js'));
     // Try to access exported tool definitions
     toolDefinitions = serverModule.TOOL_DEFINITIONS || serverModule.toolDefinitions;
   } catch {
     // Fallback: parse the source file for tool metadata
     toolDefinitions = parseToolDefinitionsFromSource();
   }
   ```

   with:

   ```javascript
   let toolDefinitions;
   try {
     const cliModule = await import(join(ROOT, 'packages', 'cli', 'dist', 'index.js'));
     toolDefinitions = cliModule.getToolDefinitions?.() || cliModule.TOOL_DEFINITIONS;
   } catch {
     // Fallback: parse the source files for tool metadata
     toolDefinitions = parseToolDefinitionsFromSource();
   }
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/mcp-tools.md`:
   - Count `### ` headings — should be 49 (was 41)
   - Check that `validate_project` has a **Parameters:** section with `path (string, required)`
   - Check that graph tools appear: `query_graph`, `search_similar`, `find_context_for`, `get_relationships`, `get_impact`, `ingest_source`, `detect_anomalies`, `ask_graph`

5. Run: `npx harness validate`

6. Commit: `fix(docs): use getToolDefinitions import path for MCP tools generator`

### Task 2: Add features overview link to MCP tools reference

**Depends on:** Task 1
**Files:** `scripts/generate-docs.mjs`

1. In `generateMcpReference()`, locate the intro lines array (lines 137-142):

   ```javascript
   const lines = [
     HEADER,
     '# MCP Tools Reference\n\n',
     'Complete reference for all harness MCP (Model Context Protocol) tools.\n',
     'These tools are available to AI agents via the harness MCP server.\n\n',
   ];
   ```

2. Replace the intro to include the features overview link:

   ```javascript
   const lines = [
     HEADER,
     '# MCP Tools Reference\n\n',
     'Complete reference for all harness MCP (Model Context Protocol) tools. ',
     'These tools are available to AI agents via the harness MCP server. ',
     'See the [Features Overview](../guides/features-overview.md) for narrative documentation.\n\n',
   ];
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/mcp-tools.md` contains the link text `[Features Overview](../guides/features-overview.md)` in the introductory paragraph.

5. Run: `npx harness validate`

6. Commit: `fix(docs): add features overview link to MCP tools reference`

### Task 3: Add CLI command cross-links to MCP tools

**Depends on:** Task 2
**Files:** `scripts/generate-docs.mjs`

1. In `generateMcpReference()`, add a mapping from MCP tool names to CLI commands. Insert this before the category grouping loop:

   ```javascript
   // Map MCP tool names to corresponding CLI commands
   const toolToCliCommand = {
     validate_project: 'harness validate',
     check_dependencies: 'harness check-deps',
     check_docs: 'harness check-docs',
     detect_entropy: 'harness check-entropy',
     generate_linter: 'harness linter generate',
     validate_linter_config: 'harness linter validate',
     init_project: 'harness init',
     list_personas: 'harness persona list',
     generate_persona_artifacts: 'harness persona generate',
     run_persona: 'harness persona run',
     add_component: 'harness add',
     run_agent_task: 'harness agent run',
     run_skill: 'harness skill run',
     manage_state: 'harness state',
     create_skill: 'harness skill create',
     generate_slash_commands: 'harness skill generate-commands',
     generate_agent_definitions: 'harness agent generate-definitions',
     run_security_scan: 'harness check-security',
     check_performance: 'harness perf check',
     get_perf_baselines: 'harness perf baselines',
     update_perf_baselines: 'harness perf update-baselines',
     get_critical_paths: 'harness perf critical-paths',
     list_streams: 'harness state list-streams',
     query_graph: 'harness graph query',
     ingest_source: 'harness graph ingest',
   };
   ```

2. In the tool rendering loop, after the parameters section (after the closing `}` of the `if (tool.inputSchema...)` block), add:

   ```javascript
   const cliCmd = toolToCliCommand[tool.name];
   if (cliCmd) {
     lines.push(
       `**CLI equivalent:** [\`${cliCmd}\`](cli-commands.md#${cliCmd.replace(/\s+/g, '-')})\n\n`
     );
   }
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/mcp-tools.md`:
   - Check that `validate_project` has `**CLI equivalent:** [\`harness validate\`](cli-commands.md#harness-validate)`
   - Check that tools without CLI equivalents (e.g., `gather_context`, `code_outline`) do NOT have the CLI equivalent line

5. Run: `npx harness validate`

6. Commit: `feat(docs): add CLI command cross-links to MCP tools reference`

### Task 4: Fix fallback parser to scan subdirectories and regenerate

**Depends on:** Task 3
**Files:** `scripts/generate-docs.mjs`, `docs/reference/mcp-tools.md`

1. In `parseToolDefinitionsFromSource()`, replace the file scanning loop (lines 200-201):

   ```javascript
   for (const file of readdirSync(toolsDir).filter(f => f.endsWith('.ts'))) {
     const content = readFileSync(join(toolsDir, file), 'utf-8');
   ```

   with a recursive scan that includes subdirectories:

   ```javascript
   // Collect all .ts files including subdirectories (e.g., graph/)
   const tsFiles = [];
   function collectTsFiles(dir) {
     for (const entry of readdirSync(dir, { withFileTypes: true })) {
       if (entry.isDirectory()) {
         collectTsFiles(join(dir, entry.name));
       } else if (entry.name.endsWith('.ts')) {
         tsFiles.push(join(dir, entry.name));
       }
     }
   }
   collectTsFiles(toolsDir);

   for (const filePath of tsFiles) {
     const content = readFileSync(filePath, 'utf-8');
   ```

   Also update the closing brace to match the new structure (remove the `join(toolsDir, file)` since `filePath` is already absolute).

2. Run: `node scripts/generate-docs.mjs`

3. Verify the final generated `docs/reference/mcp-tools.md`:
   - 49 tools listed (count `### ` headings)
   - Parameters present for tools that have them (48 out of 49)
   - Features overview link in intro
   - CLI equivalent links on mapped tools
   - Graph tools present: `query_graph`, `ask_graph`, `detect_anomalies`, `search_similar`, `find_context_for`, `get_relationships`, `get_impact`, `ingest_source`

4. Run: `npx harness validate`

5. Commit: `fix(docs): scan tool subdirectories in MCP fallback parser and regenerate`
