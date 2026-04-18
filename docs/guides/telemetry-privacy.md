# Telemetry and Privacy

Harness collects anonymous usage analytics to understand which skills are used, how long they take, and whether they succeed or fail. This data helps prioritize improvements and catch regressions.

This page explains exactly what is collected, what is not, and how to opt out.

## What Telemetry Collects

Each time a harness session ends, the telemetry reporter reads skill invocation records and sends a batch of events containing these fields:

| Field            | Example                    | Purpose                        |
| ---------------- | -------------------------- | ------------------------------ |
| `installId`      | `a1b2c3d4-...` (UUIDv4)    | Anonymous machine identifier   |
| `os`             | `darwin`, `linux`, `win32` | Platform distribution          |
| `nodeVersion`    | `v20.11.0`                 | Runtime compatibility tracking |
| `harnessVersion` | `0.14.2`                   | Version adoption tracking      |
| `skillName`      | `detect-doc-drift`         | Which skills are used          |
| `duration`       | `12340` (ms)               | Performance tracking           |
| `outcome`        | `success` or `failure`     | Reliability tracking           |
| `phasesReached`  | `["scan", "identify"]`     | How far skills progress        |
| `project`        | `my-app`                   | Optional, only if you set it   |
| `team`           | `platform`                 | Optional, only if you set it   |

Every event also includes an ISO 8601 timestamp of when the skill invocation started.

## What Is NOT Collected

Harness does not collect:

- **File paths** -- no directory names, no file names, no project structure
- **File contents** -- no source code, no configuration values, no secrets
- **Prompts or AI responses** -- no conversation content of any kind
- **Personally identifiable information (PII)** -- no usernames, emails, IP addresses, or hostnames
- **Git data** -- no commit hashes, branch names, diffs, or repository URLs

The install ID is a random UUIDv4 generated locally. It cannot be traced back to a person or machine.

## How to Opt Out

There are three ways to disable telemetry. Use whichever fits your workflow.

### Option 1: `DO_NOT_TRACK` environment variable

```bash
export DO_NOT_TRACK=1
```

This follows the [Console Do Not Track](https://consoledonottrack.com/) standard. It disables telemetry for all tools that respect this convention.

### Option 2: `HARNESS_TELEMETRY_OPTOUT` environment variable

```bash
export HARNESS_TELEMETRY_OPTOUT=1
```

Harness-specific opt-out. Useful if you want to disable harness telemetry without affecting other tools.

### Option 3: Project configuration

In your `harness.config.json`:

```json
{
  "telemetry": {
    "enabled": false
  }
}
```

This disables telemetry for everyone working in the project.

### Consent Priority

When multiple settings exist, the highest-priority one wins:

1. `DO_NOT_TRACK=1` -- always checked first (ecosystem standard)
2. `HARNESS_TELEMETRY_OPTOUT=1` -- checked second
3. `harness.config.json` `telemetry.enabled` -- checked third
4. Default -- telemetry is **enabled**

If any higher-priority setting disables telemetry, lower-priority settings are ignored.

## Checking Your Status

Run `harness telemetry status` to see your current telemetry state:

```
$ harness telemetry status

Telemetry: enabled
Install ID: a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
Identity: not configured
```

If telemetry is disabled, the output shows the reason:

```
$ DO_NOT_TRACK=1 harness telemetry status

Telemetry: disabled
  Reason:  DO_NOT_TRACK=1
Install ID: not yet created
Identity: not configured
```

Use `--json` for machine-readable output:

```bash
harness telemetry status --json
```

## Identity Fields (Optional)

You can optionally tag telemetry events with a project name, team name, or alias. This helps teams see aggregated usage across their projects in PostHog dashboards.

Identity fields are entirely opt-in. They are never set automatically.

### Setting identity

```bash
harness telemetry identify --project my-app --team platform
harness telemetry identify --alias cw
```

Fields are additive -- setting `--alias` does not clear `--project`.

### Clearing identity

```bash
harness telemetry identify --clear
```

### Where identity is stored

Identity is saved in `.harness/telemetry.json`:

```json
{
  "identity": {
    "project": "my-app",
    "team": "platform",
    "alias": "cw"
  }
}
```

This file should be added to `.gitignore` since it may contain per-developer preferences.

When an `alias` is set, it replaces the install ID as the `distinctId` on telemetry events. This lets you correlate events across machines if you choose to.

## Technical Details

### Transport

Telemetry events are sent to the [PostHog](https://posthog.com/) HTTP batch API (`https://app.posthog.com/batch`). The API key is a public, write-only ingest key -- it cannot be used to read any data.

### Retry behavior

- Up to 3 attempts per batch
- Linear backoff: 1 second after the first failure, 2 seconds after the second
- 5-second timeout per attempt (via `AbortSignal.timeout`)
- 4xx responses are treated as permanent failures and are not retried
- 5xx responses and network errors trigger a retry

### Silent failure

Telemetry never blocks your workflow. If all retries are exhausted, the failure is silently ignored. No error is shown, and the CLI exits normally.

### When events are sent

The telemetry reporter runs as a `Stop:*` hook -- it fires when a harness session ends. It reads skill invocation records from `.harness/metrics/adoption.jsonl`, sends them as a batch, and truncates the file to prevent re-sending.

### First-run notice

On the first session with telemetry enabled, harness prints a one-time privacy notice to stderr:

```
Harness collects anonymous usage analytics to improve the tool.
No personal information is sent. Disable with:
  DO_NOT_TRACK=1  or  harness.config.json -> telemetry.enabled: false
```

The notice is not shown again after the first run. A flag file at `.harness/.telemetry-notice-shown` tracks whether it has been displayed.

## Install ID

The install ID is an anonymous UUIDv4 stored at `.harness/.install-id`. It is:

- **Generated on first use** -- created the first time telemetry runs with consent
- **Locally generated** -- uses Node.js `crypto.randomUUID()`, no network call
- **File-permission restricted** -- written with mode `0600` (owner read/write only)
- **Not PII** -- a random identifier with no connection to your name, email, or machine identity

The install ID correlates events from the same project directory over time. If you delete the file, a new one is generated on the next session.

## Summary

| Question                              | Answer                      |
| ------------------------------------- | --------------------------- |
| Is telemetry on by default?           | Yes                         |
| Does it collect code or file paths?   | No                          |
| Does it collect prompts or AI output? | No                          |
| Can I opt out?                        | Yes, three ways (see above) |
| Does it block my workflow?            | No, failures are silent     |
| Where is data sent?                   | PostHog (write-only API)    |
| Can I see my status?                  | `harness telemetry status`  |
