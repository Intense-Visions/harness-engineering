# Update Check Notification System

**Date:** 2026-03-20
**Status:** Proposed
**Keywords:** update-checker, version-notification, cooldown, npm-registry, fire-and-forget, MCP, CLI

## Overview

Proactively notify users when a newer version of harness packages is available, regardless of whether they interact via the CLI or slash commands (MCP), so they don't unknowingly run stale versions.

Users must still explicitly run `harness update` to upgrade — this feature only surfaces awareness.

### Non-goals

- Auto-updating
- Platform-specific notification mechanisms (no Claude Code hooks, no Gemini-specific integrations)
- Checking for pre-release/beta versions

## Decisions

| #   | Decision                                                                              | Rationale                                                                                                              |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Check runs in both CLI startup and MCP server (first tool invocation per session)     | Users may interact via either entry point; both must be covered                                                        |
| 2   | Shared cooldown file (`~/.harness/update-check.json`)                                 | Prevents redundant checks regardless of which entry point triggers it                                                  |
| 3   | Fire-and-forget background process                                                    | Zero latency impact on current invocation; result shown on next run                                                    |
| 4   | CLI notification via stderr; MCP notification via inline text in tool result          | Each uses its natural output channel without schema changes                                                            |
| 5   | Configurable cooldown interval, default 24 hours                                      | Power users and teams can tune or disable; sensible default for most                                                   |
| 6   | Disable via `HARNESS_NO_UPDATE_CHECK=1` env var or `updateCheckInterval: 0` in config | CI, Docker, air-gapped environments need an easy opt-out                                                               |
| 7   | Module lives in `@harness-engineering/core`                                           | Core already exports `VERSION` and is bundled into both CLI and MCP; avoids dependency issues or package proliferation |

## Technical Design

### New Module

`packages/core/src/update-checker.ts`

### Data Structures

```typescript
// ~/.harness/update-check.json
interface UpdateCheckState {
  lastCheckTime: number; // epoch ms
  latestVersion: string | null; // e.g. "1.8.0"
  currentVersion: string; // version at time of check
}
```

### Exported Functions

| Function                            | Purpose                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `isUpdateCheckEnabled()`            | Returns `false` if env var set or config interval is 0                                      |
| `shouldRunCheck(state, intervalMs)` | Compares `lastCheckTime + interval` against `Date.now()`                                    |
| `readCheckState()`                  | Reads `~/.harness/update-check.json`, returns null if missing/corrupt                       |
| `spawnBackgroundCheck()`            | Spawns detached Node process that queries npm registry and writes state file                |
| `getUpdateNotification()`           | Reads state, compares `latestVersion` > `currentVersion`, returns formatted message or null |

### Background Check Process

`spawnBackgroundCheck()` spawns a detached child running an inline script (via `node -e "..."`) that:

1. Runs `npm view @harness-engineering/cli dist-tags.latest`
2. Writes result + timestamp to `~/.harness/update-check.json`
3. Exits silently on any failure (network timeout, registry error)

The parent process calls `child.unref()` so it doesn't block exit.

### Integration Points

- **CLI** (`packages/cli/src/bin/harness.ts`): After `program.parseAsync()` resolves, call `getUpdateNotification()` and print to stderr if non-null. Call `spawnBackgroundCheck()` if `shouldRunCheck()` is true at startup.
- **MCP server**: On first tool invocation per session, call `getUpdateNotification()` and append to tool result text if non-null. Call `spawnBackgroundCheck()` if `shouldRunCheck()` is true.

### Configuration

```jsonc
// harness.config.json
{
  "updateCheckInterval": 86400000, // ms, default 24h. 0 = disabled.
}
```

**Environment variable:** `HARNESS_NO_UPDATE_CHECK=1` — checked first, overrides config.

### Notification Format

```
Update available: v1.7.0 → v1.8.0
Run "harness update" to upgrade.
```

## Success Criteria

1. CLI users see update notification on stderr when a newer version is available and cooldown has elapsed
2. MCP users see update notification in tool response text when a newer version is available and cooldown has elapsed
3. Zero latency impact — the npm registry check never blocks the current command; notification comes from the previous check's cached result
4. Cooldown is shared — running CLI then a slash command (or vice versa) within the interval does not trigger a second check
5. `HARNESS_NO_UPDATE_CHECK=1` suppresses all checking and notification — no network calls, no file reads
6. `updateCheckInterval: 0` in config suppresses all checking and notification
7. Corrupt or missing state file is handled gracefully — no crashes, just triggers a fresh background check
8. Background process failures are silent — network errors, registry timeouts, or permission issues never surface to the user
9. Notification only appears when `latestVersion` is strictly greater than current `VERSION` — not on equal or downgrade scenarios

## Implementation Order

1. **Core module** — Create `packages/core/src/update-checker.ts` with all exported functions. Unit test with mocked filesystem and child process.
2. **CLI integration** — Wire `spawnBackgroundCheck()` and `getUpdateNotification()` into `packages/cli/src/bin/harness.ts`. Verify stderr output.
3. **MCP integration** — Wire into MCP server's tool response path. Verify inline notification in tool results.
4. **Config support** — Read `updateCheckInterval` from `harness.config.json`. Respect `HARNESS_NO_UPDATE_CHECK` env var.
5. **Edge case hardening** — Corrupt state file, missing `~/.harness/` directory, concurrent writes from CLI + MCP, permission errors.
