# CLI Self-Update Command

**Date:** 2026-03-17
**Status:** Approved
**Keywords:** cli, update, self-update, package-manager, npm, pnpm, global-install, slash-commands

## Overview

Add a `harness update` CLI command that updates all globally installed `@harness-engineering/*` packages to the latest (or specified) version using the user's package manager, with an interactive prompt to regenerate slash commands afterward.

### Out of Scope

- Auto-update checks on other commands (e.g., "a new version is available" notices)
- Non-global installation updates (monorepo/local dev installs)
- Multiple post-update actions beyond slash command regeneration

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Update mechanism | Shell out to package manager | Delegates to proven tooling, avoids reinventing installation logic |
| Package manager detection | Auto-detect from binary symlink path, fall back to npm | Covers npm/pnpm/yarn transparently; npm fallback handles edge cases (Volta, asdf) |
| Scope of update | All `@harness-engineering/*` packages | Keeps packages in sync, avoids version mismatches between cli/core/mcp-server |
| Version targeting | `latest` by default, `--version <semver>` flag for pinning | Covers 99% case simply, with escape hatch for teams needing specific versions |
| Post-update actions | Interactive prompt for slash command regeneration only | YAGNI — one action for now, easy to add more later |
| Architecture | Single command file, inline logic | Follows existing pattern, avoids premature abstraction |

## Technical Design

### New File

`packages/cli/src/commands/update.ts`

### Command Signature

```
harness update [--version <semver>] [--verbose]
```

### Flow

#### 1. Detect Package Manager

- Resolve the real path of `process.argv[1]` (the `harness` binary) via `fs.realpathSync`
- Check the resolved path for known patterns:
  - Contains `/lib/node_modules/` → npm
  - Contains `pnpm/global/` or `pnpm-global/` → pnpm
  - Contains `.yarn/` → yarn
- Fall back to npm if no pattern matches
- Log detected PM in verbose mode

#### 2. Determine Target Version

- If `--version` provided, use that value
- Otherwise, fetch latest from npm registry: shell out to `npm view @harness-engineering/cli dist-tags.latest`
- Compare against current `VERSION` from `@harness-engineering/core`
- If already up to date, print message and exit

#### 3. Discover Installed Packages

- Shell out to `<pm> list -g --json` and filter for `@harness-engineering/*` packages
- Only update packages the user actually has installed (not everyone installs mcp-server or eslint-plugin)

#### 4. Run Update

- Build command: `<pm> install -g <pkg1>@<version> <pkg2>@<version> ...`
- Shell out via `child_process.execSync` with `stdio: 'inherit'` so the user sees install progress
- Check exit code, report success or failure

#### 5. Post-Update Prompt

- Use `readline` to prompt: "Regenerate slash commands? (y/N)"
- If yes, ask: "Generate for (g)lobal or (l)ocal project?"
- Shell out to `harness generate-slash-commands [--global]`

### Registration

Add `createUpdateCommand()` to `packages/cli/src/index.ts` alongside existing commands.

### Dependencies

No new dependencies — `child_process`, `fs`, and `readline` are all Node builtins.

### Error Handling

Follows existing pattern — wrap errors in `CLIError` with appropriate exit codes.

## Success Criteria

1. `harness update` updates all installed `@harness-engineering/*` packages to latest
2. `harness update --version 1.3.0` pins all packages to the specified version
3. Package manager is correctly auto-detected for npm, pnpm, and yarn global installs
4. Falls back to npm gracefully when detection fails
5. Skips update with a message when already on the target version
6. Only updates packages the user actually has installed globally
7. Prompts to regenerate slash commands after successful update (global or local)
8. Follows existing command pattern (`createUpdateCommand()` factory)
9. Errors are wrapped in `CLIError` with proper exit codes

## Implementation Order

1. **Create command file** — `packages/cli/src/commands/update.ts` with PM detection, version check, update execution, and post-update prompt
2. **Register command** — add to `packages/cli/src/index.ts`
3. **Test manually** — verify detection logic across npm/pnpm, version comparison, and prompt flow
