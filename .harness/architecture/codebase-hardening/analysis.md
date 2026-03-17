# Codebase Analysis: Codebase Hardening

## Current Patterns

- **Build tools**: types/core/cli use tsup (bundler); eslint-plugin/linter-gen/mcp-server use raw tsc
- **Test runner**: All packages use vitest, but default behavior differs (watch vs run)
- **Error handling**: Core uses Result<T,E> for most functions, but some return null/undefined; CLI throws CLIError
- **Exports**: types/core provide dual CJS/ESM via main+module; others use main with "type":"module"
- **Test location**: All packages consistently use top-level tests/ directory

## Integration Points

- **mcp-server -> cli**: Direct import creates wide coupling surface; should go through core interfaces
- **core -> types**: Core re-exports types but also defines its own duplicate Result<T,E> in shared/result.ts
- **entropy module**: Exports low-level helpers (levenshteinDistance, buildReachabilityMap) alongside public API

## Technical Debt

- **Documentation drift (critical)**: cli.md documents 9+ nonexistent commands, omits 16+ real ones; all config references say yml when implementation uses json; schema docs describe wrong structure
- **Missing scripts**: mcp-server lacks lint; eslint-plugin lacks typecheck; types lacks test; cli lacks clean
- **mcp-server not in tsconfig references**: Root tsconfig.json doesn't include mcp-server
- **AGENTS.md inaccuracies**: Says 21 skills (actually 26); doesn't mention gemini-cli platform
- **Empty directories**: docs/changes/ empty; docs/api/ has only placeholder with broken links

## Relevant Files

- `packages/*/package.json` — Script and export inconsistencies
- `packages/core/src/shared/result.ts` — Duplicate Result<T,E> definition
- `packages/core/src/entropy/index.ts` — Over-exported internals
- `packages/core/src/constraints/layers.ts:22` — Returns undefined instead of Result
- `packages/core/src/constraints/dependencies.ts:30` — Returns null instead of Result
- `packages/mcp-server/src/server.ts` — Tool registration (7 tools lack tests)
- `docs/reference/cli.md` — Critically wrong CLI reference
- `docs/reference/configuration.md` — Wrong format and schema
- `AGENTS.md` — Stale counts and missing platform info
- `tsconfig.json` — Missing mcp-server reference
