# Hooks System

Hooks are Claude Code lifecycle hooks that enforce security and quality policies during AI agent sessions. They run automatically at key moments -- before a tool executes, after a tool produces output, before context compaction, and when a session ends -- giving you guardrails without manual intervention.

Harness ships nine hooks organized into three profiles. Each hook is a standalone Node.js script that reads JSON from stdin, performs its check, and exits with code 0 (allow) or 2 (block).

## How Hooks Work

Claude Code exposes four lifecycle events:

| Event         | When it fires                    | Can block? |
| ------------- | -------------------------------- | ---------- |
| `PreToolUse`  | Before a tool call executes      | Yes        |
| `PostToolUse` | After a tool call returns output | No         |
| `PreCompact`  | Before context window compaction | No         |
| `Stop`        | When the session ends            | No         |

Each hook script is registered in `.claude/settings.json` with a **matcher** that determines which tool invocations trigger it. A matcher of `*` means the hook runs on every tool call; a matcher of `Bash` means it only runs when Bash is invoked.

All hooks follow a **fail-open** design: if a hook encounters a parse error, missing stdin, or an unexpected exception, it exits 0 (allow) rather than blocking the agent. The only hooks that can block (exit 2) are `PreToolUse` hooks, and they only do so on confirmed policy violations.

## Available Hooks

### sentinel-pre.js

**Event:** `PreToolUse:*` | **Profile:** strict | **Can block:** Yes

The first line of prompt injection defense. This hook does two things:

1. **Taint enforcement.** If the current session is tainted (a previous injection was detected), it blocks destructive operations: `git push`, `git commit`, `rm -rf`, and file writes outside the workspace. This prevents a compromised session from causing damage.

2. **Input scanning.** Scans tool inputs for injection patterns before execution. Detects zero-width Unicode characters, RTL/LTR overrides, role reassignment attempts ("you are now a..."), instruction overrides ("ignore previous instructions"), permission escalation ("enable all tools"), and suspicious base64 payloads. When a pattern is detected, it writes a taint file to `.harness/session-taint-<id>.json` with a 30-minute expiry.

Uses `@harness-engineering/core` injection patterns when available, with inline pattern matching as a degraded-mode fallback.

### sentinel-post.js

**Event:** `PostToolUse:*` | **Profile:** strict | **Can block:** No

The second line of prompt injection defense. Scans tool **outputs** for the same injection patterns as sentinel-pre (zero-width characters, role reassignment, instruction overrides, etc.). If a tool returns content containing injection patterns, the session is tainted. Since `PostToolUse` hooks cannot block, the taint takes effect on the next tool call when sentinel-pre checks the taint state.

Together, sentinel-pre and sentinel-post form a detection-taint-blocking loop (see [Taint Tracking](#taint-tracking) below).

### quality-gate.js

**Event:** `PostToolUse:Edit|Write` | **Profile:** standard | **Can block:** No

Runs the project's formatter or linter after every file edit. Detects the active tool by checking for config files in this order:

1. **Biome** -- `biome.json` or `biome.jsonc`
2. **Prettier** -- `.prettierrc`, `prettier.config.*`
3. **Ruff** -- `.ruff.toml` or `ruff.toml`
4. **gofmt** -- any `.go` file (detected by extension, not config)

Violations are reported as warnings on stderr. The hook never blocks -- it alerts the agent to formatting issues so it can self-correct.

### protect-config.js

**Event:** `PreToolUse:Write|Edit` | **Profile:** standard | **Can block:** Yes

Blocks modifications to linter and formatter configuration files. Protected files include:

- ESLint: `.eslintrc*`, `eslint.config.*`
- Prettier: `.prettierrc*`, `prettier.config.*`
- Biome: `biome.json`, `biome.jsonc`
- Ruff: `.ruff.toml`, `ruff.toml`
- Stylelint: `.stylelintrc*`
- Markdownlint: `.markdownlint*`
- Deno: `deno.json`

This prevents an AI agent from weakening linting rules to make code pass. If you need to update a config file, temporarily remove this hook or use `harness hooks remove`.

### pre-compact-state.js

**Event:** `PreCompact:*` | **Profile:** standard | **Can block:** No

Saves a session summary to `.harness/state/pre-compact-summary.json` before Claude Code compacts the context window. The summary includes:

- Current session ID and active stream
- Last 5 decisions from `.harness/state.json`
- Open questions and blockers
- Current phase

This ensures critical context survives compaction. The agent can read the summary after compaction to recover its position.

### cost-tracker.js

**Event:** `Stop:*` | **Profile:** strict | **Can block:** No

Appends token usage data to `.harness/metrics/costs.jsonl` when a session ends. Each entry records the timestamp, session ID, token usage, model name, and cache token counts (creation and read). Use this data to track API costs across sessions.

### block-no-verify.js

**Event:** `PreToolUse:Bash` | **Profile:** minimal | **Can block:** Yes

Blocks any Bash command containing `--no-verify` or `git commit -n`. This prevents the agent from skipping git hooks, which are a critical part of the quality enforcement chain.

### adoption-tracker.js

**Event:** `Stop:*` | **Profile:** standard | **Can block:** No

Reads `.harness/events.jsonl` at session end, reconstructs skill invocation records, and appends them to `.harness/metrics/adoption.jsonl`. Each record captures:

- Which skill was invoked
- Session ID
- Start time and duration
- Outcome (completed, failed, or abandoned)
- Phases reached during execution

Can be disabled by setting `adoption.enabled: false` in `harness.config.json`.

### telemetry-reporter.js

**Event:** `Stop:*` | **Profile:** standard | **Can block:** No

Sends anonymous usage analytics to PostHog at session end. Reads adoption records from `.harness/metrics/adoption.jsonl`, transforms them into telemetry events, and sends a batch request. After a successful send, truncates `adoption.jsonl` to prevent re-sending.

Respects opt-out via any of:

- Environment variable: `DO_NOT_TRACK=1`
- Environment variable: `HARNESS_TELEMETRY_OPTOUT=1`
- Config: `telemetry.enabled: false` in `harness.config.json`

Shows a one-time privacy notice on first run. Uses a write-only PostHog API key -- no data can be read through it. Retries up to 3 times on server errors with exponential backoff.

## Hook Profiles

Profiles are **additive** -- each higher tier includes all hooks from lower tiers.

### minimal

The safety floor. Includes only `block-no-verify`.

| Hook            | Event      | Matcher |
| --------------- | ---------- | ------- |
| block-no-verify | PreToolUse | Bash    |

### standard (default)

Adds config protection, quality checks, state preservation, and usage tracking.

| Hook               | Event       | Matcher     |
| ------------------ | ----------- | ----------- |
| block-no-verify    | PreToolUse  | Bash        |
| protect-config     | PreToolUse  | Write\|Edit |
| quality-gate       | PostToolUse | Edit\|Write |
| pre-compact-state  | PreCompact  | \*          |
| adoption-tracker   | Stop        | \*          |
| telemetry-reporter | Stop        | \*          |

### strict

Adds full prompt injection defense and cost tracking.

| Hook               | Event       | Matcher     |
| ------------------ | ----------- | ----------- |
| block-no-verify    | PreToolUse  | Bash        |
| protect-config     | PreToolUse  | Write\|Edit |
| quality-gate       | PostToolUse | Edit\|Write |
| pre-compact-state  | PreCompact  | \*          |
| adoption-tracker   | Stop        | \*          |
| telemetry-reporter | Stop        | \*          |
| cost-tracker       | Stop        | \*          |
| sentinel-pre       | PreToolUse  | \*          |
| sentinel-post      | PostToolUse | \*          |

## Installation

### Automatic (recommended)

Hooks are installed automatically when you run `harness setup` in a harness project (any directory with a `harness.config.json`). Setup detects the existing profile or defaults to `standard`.

```bash
harness setup
```

### Manual via CLI

Use the `harness hooks` subcommands for direct control:

```bash
# Initialize hooks with the standard profile
harness hooks init --profile standard

# Initialize with a different profile
harness hooks init --profile strict

# List installed hooks
harness hooks list

# Add a single hook (without changing the profile)
harness hooks add sentinel      # adds both sentinel-pre and sentinel-post
harness hooks add cost-tracker

# Remove all harness hooks
harness hooks remove
```

### What installation does

1. **Copies hook scripts** to `.harness/hooks/` in your project. Each hook is a self-contained `.js` file.
2. **Writes the profile** to `.harness/hooks/profile.json` so subsequent runs remember your choice.
3. **Configures `.claude/settings.json`** with the hooks configuration that tells Claude Code when to run each script. The hooks key is fully managed by harness -- existing non-hooks settings are preserved.

When switching profiles (e.g., from `standard` to `strict`), `harness hooks init` cleans stale scripts before copying the new set. Downgrading from `strict` to `standard` removes sentinel and cost-tracker scripts.

## Configuration

### Changing profiles

Re-run init with the desired profile:

```bash
harness hooks init --profile minimal
```

### Disabling specific hooks

Remove the hook's `.js` file from `.harness/hooks/` and delete its entry from `.claude/settings.json`. Or use `harness hooks remove` to clear everything, then `harness hooks init` with a lower profile.

### Disabling telemetry

Set any of these:

```bash
# Environment variable
export DO_NOT_TRACK=1

# Or in harness.config.json
{
  "telemetry": {
    "enabled": false
  }
}
```

### Disabling adoption tracking

```json
{
  "adoption": {
    "enabled": false
  }
}
```

## Taint Tracking

The sentinel hooks implement a **detection-taint-blocking** loop that contains prompt injection attacks:

```
                                 sentinel-pre
                                ┌─────────────────────────┐
  Tool call ──────────────────> │ 1. Check taint state    │
                                │    - tainted? block      │
                                │      destructive ops     │
                                │ 2. Scan tool inputs     │
                                │    - pattern found?      │
                                │      write taint file    │
                                └─────────────────────────┘
                                          │
                                          v
                                    Tool executes
                                          │
                                          v
                                 sentinel-post
                                ┌─────────────────────────┐
                                │ Scan tool outputs       │
                                │ - pattern found?         │
                                │   write taint file       │
                                └─────────────────────────┘
                                          │
                                          v
                                   Next tool call
                                ┌─────────────────────────┐
                                │ sentinel-pre checks     │
                                │ taint state again...    │
                                └─────────────────────────┘
```

### How it works

1. **Detection.** sentinel-post scans tool output (e.g., file contents, command results) for injection patterns. sentinel-pre scans tool inputs for injections the agent may have been tricked into writing.

2. **Taint.** When a pattern is detected, the hook writes a taint file at `.harness/session-taint-<session-id>.json`. The taint records the reason, severity, matched patterns, and sets a 30-minute expiry.

3. **Blocking.** On subsequent tool calls, sentinel-pre checks for an active taint. If tainted, it blocks:
   - `git push`, `git commit`, `rm -rf`, `rm -r` (destructive Bash commands)
   - File writes outside the workspace directory (prevents escaping the project)

4. **Expiry.** Taint expires after 30 minutes. You can also clear it manually:
   ```bash
   harness taint clear
   ```

### What gets detected

The sentinel hooks scan for these injection pattern categories:

| Rule ID       | Severity | Pattern                        |
| ------------- | -------- | ------------------------------ |
| INJ-UNI-001   | High     | Zero-width Unicode characters  |
| INJ-UNI-002   | High     | RTL/LTR override characters    |
| INJ-REROL-001 | High     | "Ignore previous instructions" |
| INJ-REROL-002 | High     | Role reassignment attempts     |
| INJ-REROL-003 | High     | Direct instruction overrides   |
| INJ-PERM-001  | High     | "Enable all tools/permissions" |
| INJ-PERM-002  | High     | "Disable safety/security"      |
| INJ-PERM-003  | High     | Auto-approve directives        |
| INJ-ENC-001   | High     | Suspicious base64 payloads     |
| INJ-CTX-001   | Medium   | System prompt claims           |

High and medium severity findings trigger taint. Low severity findings are logged to stderr as warnings.

## File Layout

After installation, the hooks system creates these files:

```
.harness/
  hooks/
    profile.json              # Active profile (minimal/standard/strict)
    block-no-verify.js        # Hook scripts (varies by profile)
    protect-config.js
    quality-gate.js
    pre-compact-state.js
    adoption-tracker.js
    telemetry-reporter.js
    cost-tracker.js           # strict only
    sentinel-pre.js           # strict only
    sentinel-post.js          # strict only
  metrics/
    costs.jsonl               # Token usage log (cost-tracker)
    adoption.jsonl            # Skill invocation log (adoption-tracker)
  state/
    pre-compact-summary.json  # Last pre-compaction snapshot
  session-taint-<id>.json    # Taint state (sentinel hooks)
.claude/
  settings.json               # Claude Code settings with hooks config
```

## Next Steps

- Read [Security Quickstart](security-quickstart.md) for the full security model
- See [Getting Started](getting-started.md) for initial project setup
- Run `harness hooks list --json` to inspect your current hook configuration
