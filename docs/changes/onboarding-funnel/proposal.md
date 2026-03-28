# Onboarding Funnel: Setup, Doctor, and First-Run Welcome

**Keywords:** onboarding, setup, doctor, first-run, MCP, slash-commands, discovery, CLI

## Overview

The gap between `npm install -g @harness-engineering/cli` and a productive harness environment requires users to know about `harness generate --global` and `harness setup-mcp` — commands they have no reason to discover on their own. This proposal bridges that gap with three additions:

1. **`harness setup`** — A single command that chains environment configuration: generates global slash commands, configures MCP for detected AI clients, and optionally scaffolds a project.
2. **`harness doctor`** — A lightweight diagnostic command that validates the environment is correctly configured: Node version, MCP status, slash command presence.
3. **First-run welcome** — On the first invocation of any `harness` command, print a welcome message directing users to `harness setup`.

### Goals

- Reduce time from install to working slash commands from "read the docs" to "run one command"
- Give users a self-service diagnostic when something isn't working
- Zero new dependencies, zero background processes, zero config files beyond a marker

### Non-Goals

- Interactive prompts during setup (the slash command `/harness:initialize-project` handles interactive project init)
- Shell completion (deferred to a follow-up)
- Advanced diagnostics like graph health or config validation (covered by `harness validate`)

## Decisions

| Decision            | Choice                                         | Rationale                                                                |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Target audience     | First-time users                               | Existing project migration works well enough via slash commands          |
| Core problem        | Discovery gap post-install                     | Users don't know about `generate --global` and `setup-mcp`               |
| Entry point         | `harness setup` (separate from `harness init`) | `init` stays project-focused; `setup` is environment-focused             |
| Doctor scope        | Lightweight (Node, MCP, slash commands)        | Avoids overlap with `harness validate`; keeps it fast                    |
| Shell completion    | Deferred                                       | Slash commands are the primary UX; completion is nice-to-have            |
| Discovery mechanism | First-run welcome (not postinstall)            | Postinstall is suppressed in CI and by some users; first-run is reliable |

## Technical Design

### First-Run Detection

- Marker file: `~/.harness/.setup-complete`
- On any `harness` command, if the marker is absent, print:
  ```
  Welcome to harness! Run `harness setup` to get started.
  ```
- The welcome is a single line — not a wall of text. Printed to stderr so it doesn't interfere with `--json` output or piped commands.
- Suppressed when `CI` environment variable is set or `--quiet` flag is passed.
- `harness setup` writes the marker on successful completion. Creates `~/.harness/` directory with `mkdirSync({ recursive: true })` if it does not exist.
- First-run check is a utility function in `packages/cli/src/utils/first-run.ts`, called imperatively in `bin/harness.ts` before `parseAsync()` (consistent with the existing update-check pattern, not via Commander hooks).

### `harness setup` Command

File: `packages/cli/src/commands/setup.ts`

Steps executed sequentially with pass/fail output:

```
$ harness setup

  harness setup

  ✓ Node.js v22.4.0 (requires >=22)
  ✓ Generated global slash commands -> ~/.claude/commands/harness/
  ✓ Configured MCP for Claude Code -> .mcp.json
  ⚠ Gemini CLI not detected — skipped MCP configuration

  Setup complete. Next steps:
    - Open a project directory and run /harness:initialize-project
    - Or run harness init --name my-project to scaffold a new one
    - Run harness doctor anytime to check your environment
```

Implementation details:

- Reuses `generateSlashCommands(opts: GenerateOptions)` from existing `generate-slash-commands.ts`, passing `{ global: true, platforms: ['claude-code', 'gemini-cli'], yes: true }` and sensible defaults for other fields.
- Reuses `setupMcp(cwd, client)` from existing `setup-mcp.ts`. The `setup` command adds **new client-detection logic** wrapping calls to `setupMcp`: checks for `~/.claude/` (Claude Code) and `~/.gemini/` (Gemini CLI) directories and only calls `setupMcp` for detected clients. Skipped clients produce a warning, not a failure.
- Node version check: `process.version` against `>=22.0.0` (hardcoded constant matching the root `package.json` engines field).
- MCP config scope: `setupMcp` writes project-local `.mcp.json` relative to `cwd`. When `harness setup` runs, it uses the current working directory. The "Next steps" output reminds users to re-run `harness setup-mcp` inside project directories if needed.
- Idempotent — safe to re-run. Overwrites existing slash commands and MCP config (same as the underlying commands already do).
- Writes `~/.harness/.setup-complete` on success. Creates `~/.harness/` with `mkdirSync({ recursive: true })` if absent.
- Exit code 0 if all required steps pass, 1 if any required step fails.

### `harness doctor` Command

File: `packages/cli/src/commands/doctor.ts`

Checks executed and reported:

```
$ harness doctor

  harness doctor

  ✓ Node.js v22.4.0 (requires >=22)
  ✓ Slash commands installed -> ~/.claude/commands/harness/ (30 commands)
  ✓ MCP configured for Claude Code
  ✗ MCP not configured for Gemini CLI
    -> Run: harness setup-mcp --client gemini

  3/4 checks passed
```

Implementation details:

- Node version: `semver.satisfies(process.version, '>=22.0.0')`
- Slash commands: glob `~/.claude/commands/harness/*.md` and/or `~/.gemini/commands/harness/*.toml`, report count
- MCP for Claude Code: check `cwd/.mcp.json` for harness server entry (consistent with where `setupMcp` writes)
- MCP for Gemini CLI: check `~/.gemini/settings.json` for harness server entry
- Each failing check prints a one-line fix command
- Exit code 0 if all checks pass, 1 if any fail (useful in scripts/CI)
- `--json` flag supported for programmatic consumption (consistent with other CLI commands)

### File Layout

```
packages/cli/src/
  commands/
    setup.ts          # new — harness setup
    doctor.ts         # new — harness doctor
  utils/
    first-run.ts      # new — marker file check + welcome message
  index.ts            # modified — register setup/doctor commands
  bin/harness.ts      # modified — add first-run check before parseAsync()
```

### No New Dependencies

- `semver` is already a dependency (used in update checker)
- `chalk` is already a dependency (used throughout CLI)
- File system checks use Node built-ins
- Glob uses existing internal utilities

## Success Criteria

1. When `harness setup` is run, it completes in under 5 seconds and produces pass/fail output for each step.
2. When `harness doctor` is run, every check reflects actual system state (not cached or stale).
3. When any `harness` command is run for the first time (marker absent), a welcome message appears on stderr. After `harness setup` completes, the welcome does not appear again.
4. If `--json` is passed to any command, the first-run welcome does not appear on stdout.
5. When `harness setup` is run twice, the second run produces the same result without errors.
6. When `harness doctor` is run, it does not modify any files (read-only).
7. When all checks pass, both commands exit with code 0. When any required check fails, both commands exit with code 1.
8. When the changes are complete, all existing tests continue to pass with no regressions.
9. When the changes are complete, new commands have unit tests covering setup steps, doctor checks, and first-run detection.

## Implementation Order

1. **Phase 1: First-run detection** — `first-run.ts` utility, imperative call in `bin/harness.ts`, marker file logic. This is the foundation both other pieces depend on.
2. **Phase 2: `harness setup`** — New command wiring existing internals (`generateSlashCommands`, `setupMcp`), formatted output, writes marker on success.
3. **Phase 3: `harness doctor`** — New command with environment checks, fix suggestions, `--json` support.
4. **Phase 4: Tests** — Unit tests for all three pieces. Integration test: fresh environment -> `harness setup` -> `harness doctor` all green.
