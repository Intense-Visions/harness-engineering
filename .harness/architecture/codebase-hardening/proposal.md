# Proposal: Codebase Hardening

## Selected: Option A — Foundation First (Bottom-Up)

Fix structural inconsistencies before touching documentation. A solid, consistent codebase makes documentation accurate and easier to maintain long-term.

## Execution Plan

### Week 1: Package Consistency

1. Normalize all package.json scripts across 6 packages:
   - Add `lint` to mcp-server (`eslint src`)
   - Add `typecheck` to eslint-plugin (`tsc --noEmit`)
   - Add `test` to types (even if minimal — validates exports compile)
   - Add `clean` to cli (`rm -rf dist`)
   - Standardize test scripts: all use `vitest run` as default, `vitest` as `test:watch`
2. Standardize build tooling:
   - Evaluate migrating eslint-plugin/linter-gen/mcp-server to tsup for consistency
   - If tsup adds no value for a package (e.g., no bundling needed), document the rationale
3. Add mcp-server to root tsconfig.json references
4. Normalize exports fields: decide on dual CJS/ESM (main+module) or ESM-only ("type":"module") and apply consistently

### Week 2: API Surface Cleanup

1. Remove duplicate Result<T,E> from `packages/core/src/shared/result.ts`
   - Core should re-export from @harness-engineering/types only
   - Update all internal core imports to use the types package version
2. Tighten entropy exports in `packages/core/src/entropy/index.ts`
   - Remove: levenshteinDistance, buildReachabilityMap, parseDocumentationFile, findPossibleMatches, resolveEntryPoints
   - Keep: EntropyAnalyzer, detectDocDrift, detectDeadCode, detectPatternViolations, and public types
3. Standardize error returns in constraints module
   - `resolveFileToLayer()` -> return `Result<Layer, ConstraintError>` instead of `Layer | undefined`
   - `resolveImportPath()` -> return `Result<string, ConstraintError>` instead of `string | null`
4. Evaluate decoupling mcp-server from cli
   - Identify which cli exports mcp-server actually uses
   - Move shared interfaces to core if they don't belong in cli

### Week 3: Test Coverage

1. MCP server tools (7 untested):
   - `check_docs` / `validate_knowledge_map` (docs.ts)
   - `generate_linter` / `validate_linter_config` (linter.ts)
   - `init_project` (init.ts)
   - `add_component` / `run_agent_task` (agent.ts)
   - `generate_slash_commands` (generate-slash-commands.ts)
2. CLI subcommands (16 untested):
   - Prioritize by usage: skill/run, skill/list, state/show, setup-mcp first
   - Lower priority: persona/generate, persona/list, linter/generate, linter/validate
3. Utility files: cli utils/paths.ts, utils/files.ts, output/logger.ts
4. Types package: Add compilation/export validation test

### Week 4: Documentation Overhaul

1. Rewrite `docs/reference/cli.md` from actual CLI commands
   - Generate command list programmatically from commander registration if possible
2. Fix `docs/reference/configuration.md`
   - Change all yml references to json
   - Document actual Zod schema with examples
3. Update AGENTS.md
   - Fix skill count: 21 -> 26
   - Add gemini-cli platform mention
   - Verify all file paths referenced still exist
4. Fix docs/api/
   - Either generate real API docs from TypeScript exports or remove the broken placeholder
5. Address docs/changes/
   - Either populate with active proposals or remove the empty directory
6. Add docs accuracy CI check
   - Script that verifies CLI commands in docs match actual registered commands
   - Script that verifies config examples parse against actual Zod schema

## Alternatives Considered

### Option B: User-Facing Pain First (Outside-In)

Fix docs first, then internals. Rejected because documentation written against an inconsistent codebase may need re-updating after structural changes.

### Option C: Surgical Strikes (Risk-Based)

Fix only critical items. Rejected because the inconsistencies are interconnected — partial fixes leave gaps that accumulate.

## Comparison

| Criterion         | Option A (selected) | Option B | Option C |
| ----------------- | ------------------- | -------- | -------- |
| Complexity        | High                | Medium   | Low      |
| User impact speed | Slow (Week 4)       | Fast     | Fast     |
| Completeness      | Full                | Nearly   | Partial  |
| Effort            | 4 weeks             | 3 weeks  | 1 week   |
| Risk of rework    | Low                 | Med      | Low      |
| Maintainability   | High                | High     | Medium   |
