# Merge MCP Server into CLI

**Status:** Proposed
**Keywords:** mcp-server, cli, merge, path-resolution, skill-discovery, harness-mcp, deprecation

## Overview

Eliminate the standalone `@harness-engineering/mcp-server` package by moving its source into `@harness-engineering/cli`. After this change, installing `@harness-engineering/cli` provides both the `harness` CLI and the `harness-mcp` MCP server binary. Skills, personas, and templates resolve correctly without external path hacks because they are bundled in the same `dist/`.

### Problem

- `harness-mcp` binary requires separate installation of `@harness-engineering/mcp-server`
- When running from npx cache or global install, skill resolution fails because `findUpDir` cannot locate `agents/skills/` from outside the project tree
- The MCP server is architecturally a thin MCP adapter over CLI functions (12+ import points), making it a natural merge target
- `harness setup-mcp` writes `"command": "harness-mcp"` but installing CLI does not provide that binary

### Out of Scope

- Changing MCP tool behavior or adding new tools
- Refactoring tool implementations
- Changing the MCP protocol version or transport

## Decisions

| Decision           | Choice                                                                        | Rationale                                                                                          |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Package fate       | Deprecate `@harness-engineering/mcp-server` completely                        | Thin adapter over CLI; separate package adds install confusion and path resolution bugs            |
| Binary names       | Both `harness mcp` subcommand and `harness-mcp` bin alias                     | Maximum compatibility — existing `.mcp.json` configs keep working                                  |
| Build strategy     | tsup bundles everything                                                       | Single build pipeline; `@modelcontextprotocol/sdk` becomes a CLI dependency                        |
| Public API         | Re-export `createHarnessServer`, `startServer`, `getToolDefinitions` from CLI | Enables programmatic MCP server creation                                                           |
| Path resolution    | Unify into CLI's `paths.ts`                                                   | CLI's `__dirname`-relative resolution works naturally because skills are bundled in `dist/agents/` |
| Migration approach | Direct move, clean break                                                      | No compatibility shim; mcp-server has minimal programmatic consumers                               |

## Technical Design

### Directory Structure After Merge

```
packages/cli/
├── src/
│   ├── bin/
│   │   ├── harness.ts              (existing)
│   │   ├── harness-mcp.ts          (new — moved from mcp-server/bin/)
│   │   └── update-check-hooks.ts   (existing)
│   ├── commands/
│   │   ├── mcp.ts                  (new — `harness mcp` subcommand)
│   │   └── ...                     (existing commands)
│   ├── mcp/
│   │   ├── server.ts               (moved — core MCP server, registration)
│   │   ├── index.ts                (moved — public exports)
│   │   ├── tools/                  (moved — 26 tool files)
│   │   ├── resources/              (moved — 6 resource files)
│   │   └── utils/
│   │       ├── config-resolver.ts  (moved)
│   │       ├── result-adapter.ts   (moved)
│   │       ├── sanitize-path.ts    (moved)
│   │       ├── glob-helper.ts      (moved)
│   │       └── graph-loader.ts     (moved)
│   ├── utils/
│   │   └── paths.ts                (unified — absorbs mcp-server path logic)
│   └── index.ts                    (updated — adds MCP re-exports)
├── tests/
│   └── mcp/
│       ├── server-integration.test.ts
│       ├── tools/                  (moved — 26+ test files)
│       ├── resources/              (moved — 6 test files)
│       └── utils/                  (moved)
└── package.json                    (updated)
```

### Import Rewrites

All `import('@harness-engineering/cli')` calls in MCP tool files become local relative imports:

```typescript
// Before (in mcp-server)
const { generateSkillFiles } = await import('@harness-engineering/cli');

// After (in cli/src/mcp/tools/)
const { generateSkillFiles } = await import('../../commands/create-skill.js');
```

### Unified Path Resolution

CLI's existing `paths.ts` works for the bundled dist case. Add `process.cwd()` fallback for monorepo dev:

```typescript
function findUpFrom(startDir, targetName, marker, maxLevels): string | null { ... }

function findUpDir(targetName, marker, maxLevels = 8): string | null {
  const fromModule = findUpFrom(__dirname, targetName, marker, maxLevels);
  if (fromModule) return fromModule;
  return findUpFrom(process.cwd(), targetName, marker, maxLevels);
}

export function resolveSkillsDir(): string {
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) return path.join(agentsDir, 'skills', 'claude-code');
  return path.join(__dirname, 'agents', 'skills', 'claude-code');
}
```

### package.json Changes

```json
{
  "bin": {
    "harness": "./dist/bin/harness.js",
    "harness-mcp": "./dist/bin/harness-mcp.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

### tsup Config Update

```typescript
entry: ['src/index.ts', 'src/bin/harness.ts', 'src/bin/harness-mcp.ts'];
```

### New CLI Exports

```typescript
export { createHarnessServer, startServer, getToolDefinitions } from './mcp/index.js';
```

### Deprecation of @harness-engineering/mcp-server

Publish a final version (0.7.0) with:

- `postinstall` script printing deprecation warning
- README with migration instructions
- Binary that prints: "harness-mcp is now included in @harness-engineering/cli"
- Mark deprecated on npm via `npm deprecate`

## Success Criteria

1. When `@harness-engineering/cli` is installed, both `harness` and `harness-mcp` commands are available
2. `harness mcp` starts the MCP server on stdio with identical behavior to current `harness-mcp`
3. `.mcp.json` with `"command": "harness-mcp"` works without changes on existing projects
4. `.mcp.json` with `"command": "harness", "args": ["mcp"]` works as the new canonical form
5. All 40 MCP tools return identical results before and after the merge
6. All 8 MCP resources return identical results before and after the merge
7. `run_skill` resolves all skills when running from: monorepo dev, global install, and npx
8. All existing CLI tests pass (70 test files)
9. All migrated MCP tests pass (38 test files)
10. `pnpm build` succeeds with tsup bundling the MCP entry point
11. `@harness-engineering/mcp-server` is deprecated on npm with migration instructions
12. `packages/mcp-server/` directory is removed from the monorepo
13. No other workspace packages have broken imports after removal

## Implementation Order

### Phase 1 — Move and Rewire

- Move source files from `packages/mcp-server/src/` to `packages/cli/src/mcp/`
- Rewrite all `@harness-engineering/cli` imports to relative paths
- Unify `paths.ts` with `process.cwd()` fallback
- Add `@modelcontextprotocol/sdk` to CLI dependencies
- Update tsup config with new `harness-mcp` entry point
- Add `harness-mcp` bin entry to CLI `package.json`
- Add `harness mcp` subcommand in `src/commands/mcp.ts`
- Update CLI `index.ts` with MCP re-exports

### Phase 2 — Tests

- Move test files from `packages/mcp-server/tests/` to `packages/cli/tests/mcp/`
- Update test import paths
- Verify all 38 migrated tests pass
- Verify all 70 existing CLI tests still pass
- Update server integration test if tool count changes

### Phase 3 — Cleanup and Deprecation

- Remove `packages/mcp-server/` from monorepo
- Remove from `pnpm-workspace.yaml`
- Update this repo's `.mcp.json` to use `"command": "harness", "args": ["mcp"]`
- Publish deprecation version of `@harness-engineering/mcp-server` (0.7.0)
- Run `npm deprecate @harness-engineering/mcp-server` with migration message
- Update any docs referencing the separate package
