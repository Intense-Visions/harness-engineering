# Plan: Central Telemetry Phase 5 -- Validation and Documentation

**Date:** 2026-04-10
**Spec:** docs/changes/central-telemetry/proposal.md (Phase 5)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Document the telemetry subsystem in the configuration reference and AGENTS.md so that users can discover, configure, and troubleshoot telemetry, and AI agents have complete context about the telemetry architecture.

## Observable Truths (Acceptance Criteria)

1. The system shall have a `## telemetry` section in `docs/reference/configuration.md` that documents: the `telemetry` object, its `enabled` field (type `boolean`, default `true`), the `.harness/telemetry.json` identity file (gitignored), the `DO_NOT_TRACK` and `HARNESS_TELEMETRY_OPTOUT` env var overrides, and the CLI commands (`harness telemetry identify`, `harness telemetry status`).
2. `AGENTS.md` shall contain a "Telemetry" subsection under "### CLI Subsystems" that documents: the telemetry module in `packages/core/src/telemetry/`, the `telemetry-reporter.js` stop hook, the CLI `telemetry` command group, the consent flow, the transport mechanism, and the identity model.
3. `AGENTS.md` shall list the telemetry CLI commands (`telemetry/index.ts`, `telemetry/identify.ts`, `telemetry/status.ts`) in the **Commands** list and the `telemetry-reporter.js` hook in the **Hooks** list.
4. When `harness validate` is run after all documentation changes, the system shall report "validation passed."
5. The `_Last Updated_` date in `docs/reference/configuration.md` shall be `2026-04-10`.

## File Map

- MODIFY `docs/reference/configuration.md` (add `## telemetry` section between `roadmap` and `phaseGates`; update "Complete Example" and "Last Updated")
- MODIFY `AGENTS.md` (add telemetry entries to Commands list, Hooks list, and a new Telemetry subsection; update "Last Updated")

_Skeleton not produced -- task count (4) below threshold (8)._

## Tasks

### Task 1: Add telemetry section to configuration reference

**Depends on:** none
**Files:** `docs/reference/configuration.md`

1. Open `docs/reference/configuration.md`. Insert a new `## telemetry` section immediately before the `## phaseGates` heading (line 592). The section content:

   ````markdown
   ## `telemetry`

   - **Type:** `TelemetryConfig`
   - **Required:** No

   Configures anonymous usage telemetry. Telemetry is enabled by default and sends anonymized product analytics (skill usage, session duration, outcome) to a central PostHog instance via HTTP. No personally identifiable information is sent unless the user explicitly opts in via `.harness/telemetry.json`.

   ### TelemetryConfig Object

   | Field     | Type      | Default | Description                                  |
   | --------- | --------- | ------- | -------------------------------------------- |
   | `enabled` | `boolean` | `true`  | Whether anonymous telemetry collection is on |

   ### Opting Out

   There are three ways to disable telemetry (checked in this order):

   1. **Environment variable:** `DO_NOT_TRACK=1` (ecosystem standard)
   2. **Environment variable:** `HARNESS_TELEMETRY_OPTOUT=1`
   3. **Config file:** Set `telemetry.enabled` to `false` in `harness.config.json`

   Any of these disables all telemetry -- no HTTP requests are made.

   ### Identity (Optional Opt-In)

   Users who want to associate telemetry with a project, team, or alias can configure identity fields in `.harness/telemetry.json` (gitignored, never committed):

   ```json
   {
     "identity": {
       "project": "myapp",
       "team": "platform",
       "alias": "cwarner"
     }
   }
   ```

   Use the CLI to manage identity:

   ```bash
   # Set identity fields
   harness telemetry identify --project myapp --team platform --alias cwarner

   # Clear all identity fields
   harness telemetry identify --clear

   # View current telemetry state
   harness telemetry status
   harness telemetry status --json
   ```

   ### First-Run Notice

   On first use, a one-time notice is printed to stderr explaining that anonymous telemetry is collected and how to disable it. The notice is not repeated after the flag file `.harness/.telemetry-notice-shown` is created.

   ### Example

   ```json
   {
     "telemetry": {
       "enabled": true
     }
   }
   ```

   To disable:

   ```json
   {
     "telemetry": {
       "enabled": false
     }
   }
   ```
   ````

2. In the "Complete Example" JSON block (around line 690), add the `telemetry` field after `roadmap` and before `phaseGates`:

   ```json
   "telemetry": {
     "enabled": true
   },
   ```

3. Update the `_Last Updated_` line at the bottom of the file from `2026-04-06` to `2026-04-10`.

4. Run: `harness validate`

5. Commit: `docs(config): add telemetry section to configuration reference`

### Task 2: Add telemetry entries to AGENTS.md CLI Subsystems lists

**Depends on:** none
**Files:** `AGENTS.md`

1. In the **Commands** list (around line 317, after the `_registry.ts` entry), add the telemetry command entries:

   ```markdown
   - `telemetry/index.ts` — Parent command group for telemetry management (identify + status)
   - `telemetry/identify.ts` — Sets or clears identity fields in `.harness/telemetry.json`
   - `telemetry/status.ts` — Displays current consent state, install ID, identity, and env overrides
   ```

2. In the **Hooks** list (around line 328, after the `profiles.ts` entry), add:

   ```markdown
   - `telemetry-reporter.js` — Stop hook that reads adoption.jsonl, resolves consent, sends anonymous events to PostHog, and shows first-run privacy notice
   ```

3. Run: `harness validate`

4. Commit: `docs(agents): add telemetry commands and hook to CLI Subsystems lists`

### Task 3: Add Telemetry architecture subsection to AGENTS.md

**Depends on:** Task 2
**Files:** `AGENTS.md`

1. After the "### CLI Subsystems" section's existing subsections (Commands, Hooks, MCP Tools, Skill Dispatch, Other CLI modules) and before "### Dashboard Package", insert a new subsection:

   ```markdown
   ### Telemetry Subsystem

   Anonymous product analytics collection implemented across `packages/types`, `packages/core`, and `packages/cli`. Zero vendor SDK dependencies -- uses Node's built-in `fetch()` to POST events to PostHog's HTTP batch API.

   **Architecture:**

   - **Types** (`packages/types/src/telemetry.ts`): `TelemetryConfig`, `TelemetryIdentity`, `ConsentState`, `TelemetryEvent`
   - **Core** (`packages/core/src/telemetry/`):
     - `consent.ts` -- Merges env vars (`DO_NOT_TRACK`, `HARNESS_TELEMETRY_OPTOUT`), config (`telemetry.enabled`), and `.harness/telemetry.json` identity into a `ConsentState`
     - `install-id.ts` -- Creates/reads a persistent anonymous UUIDv4 at `.harness/.install-id`
     - `collector.ts` -- Reads `adoption.jsonl` and formats `TelemetryEvent` payloads
     - `transport.ts` -- HTTP POST to PostHog `/batch` with 3 retries, 5s timeout, silent failure
   - **CLI** (`packages/cli/src/commands/telemetry/`): `identify` (set/clear `.harness/telemetry.json`), `status` (display consent state, install ID, identity, env overrides)
   - **Hook** (`packages/cli/src/hooks/telemetry-reporter.js`): Stop hook that runs the full pipeline (consent check, collect, send, first-run notice)

   **Consent priority:** `DO_NOT_TRACK=1` > `HARNESS_TELEMETRY_OPTOUT=1` > `harness.config.json telemetry.enabled` > default (enabled)

   **Data sent (when enabled):** install ID, OS, Node version, harness version, skill name, duration, outcome. Identity fields (project, team, alias) only when explicitly set in `.harness/telemetry.json`.

   **Data NOT sent:** file paths, file contents, code, prompts, or any PII unless user opts in via identity fields.
   ```

2. Update the `**Last Updated**` line at the bottom of AGENTS.md from `2026-04-09` to `2026-04-10`.

3. Run: `harness validate`

4. Commit: `docs(agents): add Telemetry Subsystem architecture section`

### Task 4: Final validation and end-to-end pipeline smoke test

**Depends on:** Tasks 1, 2, 3
**Files:** none (validation only)

[checkpoint:human-verify] -- Verify documentation reads correctly before finalizing.

1. Run: `harness validate` -- observe "validation passed"

2. Run: `harness check-deps` -- observe "validation passed"

3. Run: `harness telemetry status` -- observe output showing consent state, install ID, and any identity. This verifies the full CLI pipeline is functional.

4. Run: `DO_NOT_TRACK=1 harness telemetry status` -- observe consent shown as "disabled" with reason "DO_NOT_TRACK=1". This verifies env var override works.

5. Verify that `docs/reference/configuration.md` contains the new `## telemetry` heading by searching for it.

6. Verify that `AGENTS.md` contains "### Telemetry Subsystem" by searching for it.

7. Run: `harness validate`

8. Commit: (no commit needed -- this task is validation only)

## Traceability

| Observable Truth                                 | Delivered by |
| ------------------------------------------------ | ------------ |
| 1. Configuration reference has telemetry section | Task 1       |
| 2. AGENTS.md has Telemetry Subsystem subsection  | Task 3       |
| 3. AGENTS.md lists telemetry commands and hook   | Task 2       |
| 4. `harness validate` passes                     | Task 4       |
| 5. Last Updated date is 2026-04-10               | Tasks 1, 3   |

## Notes

- `docs/reference/cli-commands.md` is auto-generated. The telemetry commands will appear there after the next `pnpm run generate-docs` cycle. This plan does not manually edit that file.
- The spec mentions "Verify PostHog dashboard receives events from a real session." Since we do not have a real PostHog API key (the hook uses `phc_harness_placeholder`), we cannot verify real event delivery. Task 4 instead verifies the full local pipeline (consent resolution, install ID, CLI commands) works end-to-end. PostHog delivery verification is deferred to when a real API key is configured.
