# Environment Configuration via .env File

**Status:** Proposed
**Keywords:** env, dotenv, environment-variables, configuration, secrets, api-keys

## Overview

Add `.env` file support so the harness CLI loads environment variables from a root-level `.env` file at startup. Document all known variables in a `.env.example` file. Ensure all `.env` variants are gitignored except `.env.example`.

## Goals

- Provide a single, standard mechanism for configuring environment variables
- Document all known environment variables with descriptions
- Prevent accidental commit of secrets via comprehensive gitignore patterns

## Non-Goals

- Per-package `.env` files (all packages share the same process environment)
- Template `.env` files (templates are scaffolded into separate projects)
- Changes to how existing code accesses `process.env`

## Decisions

| Decision                                          | Rationale                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Root-level `.env` only                            | Single source of truth; all packages share the same env vars                                 |
| `dotenv` package                                  | Battle-tested, zero-dependency, loads from code not CLI flags                                |
| Load in bin entry points                          | `harness.ts` and `harness-mcp.ts` are the two CLI entry points — load before any other logic |
| `.env.example` at repo root                       | Documents all known variables in one place                                                   |
| Broaden gitignore to `.env*` with `!.env.example` | Catches `.env.production`, `.env.staging`, etc. while keeping the example tracked            |

## Technical Design

### Dependency

Add `dotenv` as a runtime dependency to `packages/cli/package.json`.

### Loading

Add `import 'dotenv/config';` as the first import in both CLI entry points:

- `packages/cli/src/bin/harness.ts`
- `packages/cli/src/bin/harness-mcp.ts`

The `dotenv/config` import calls `config()` on import, loading `.env` from the current working directory before any other code runs. If no `.env` file exists, it silently does nothing.

### .env.example

Create at repo root with all discovered environment variables:

```env
# API Keys — Graph Connectors & Roadmap Sync
GITHUB_TOKEN=               # Used by graph CI connector and roadmap sync
CONFLUENCE_API_KEY=
CONFLUENCE_BASE_URL=
JIRA_API_KEY=
JIRA_BASE_URL=
SLACK_API_KEY=

# Integrations
PERPLEXITY_API_KEY=

# Feature Flags
HARNESS_NO_UPDATE_CHECK=    # Set to "1" to disable update checks
CI=                         # Set to "true" when running in CI

# Server (used by templates)
PORT=3000
```

### .gitignore Update

Replace the existing `.env` / `.env*.local` lines with:

```gitignore
.env*
!.env.example
```

This ensures all `.env` variants are ignored while the example file remains tracked.

## Success Criteria

1. When a `.env` file exists at the repo root, `harness` CLI commands pick up the variables
2. When a `.env` file exists at the repo root, `harness-mcp` picks up the variables
3. `.env.example` exists at repo root documenting all known variables with comments
4. All `.env` variants (`.env.local`, `.env.production`, etc.) are gitignored
5. `.env.example` is NOT gitignored
6. Existing `process.env` access patterns continue to work unchanged
7. If no `.env` file exists, the CLI works without error

## Implementation Order

1. Add `dotenv` dependency to `packages/cli`
2. Add `import 'dotenv/config'` to both bin entry points (`harness.ts`, `harness-mcp.ts`)
3. Create `.env.example` at repo root
4. Update `.gitignore` to use `.env*` / `!.env.example` pattern
5. Verify build passes
