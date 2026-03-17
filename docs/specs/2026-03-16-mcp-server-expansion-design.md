# MCP Server Expansion — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Scope:** Add 8 new tools, enhance 2 existing tools, and add 1 new resource to the harness MCP server

## Context

The MCP server currently exposes 15 tools and 4 resources. An audit revealed gaps where CLI commands and core capabilities have no MCP equivalent. This expansion brings the MCP server to full feature parity with the CLI and exposes key core subsystems (state, feedback) that are high-value for agent workflows.

Workflow/pipeline modules are excluded — they require callback functions (`StepExecutor`, `SkillExecutor`) that don't map to MCP's request/response model. The existing `run_skill` and `run_agent_task` tools cover their high-level use cases.

## New Tools (8) + Enhanced Existing Tools (2)

### 1. `manage_state` — State management operations

**File:** `tools/state.ts`
**Core APIs:** `loadState`, `saveState`, `appendLearning`, `appendFailure`, `archiveFailures`, `runMechanicalGate`

| Action    | Description                                                      | Required params                                   | Optional params        |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `show`    | Load current state from `.harness/state.json`                    | `path`                                            | —                      |
| `learn`   | Append a learning entry to `.harness/learnings.md`               | `path`, `learning`                                | `skillName`, `outcome` |
| `failure` | Record a failure to `.harness/failures.md`                       | `path`, `description`, `skillName`, `failureType` | —                      |
| `archive` | Archive failures.md to dated backup                              | `path`                                            | —                      |
| `reset`   | Reset state to defaults (calls `saveState` with `DEFAULT_STATE`) | `path`                                            | —                      |
| `gate`    | Run mechanical gate checks (tests, lint)                         | `path`                                            | —                      |

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "action": "string (required) — show|learn|failure|archive|reset|gate",
  "learning": "string — learning text (required for 'learn')",
  "skillName": "string — skill context",
  "outcome": "string — learning outcome",
  "description": "string — failure description (required for 'failure')",
  "failureType": "string — failure type (required for 'failure')"
}
```

### 2. `manage_handoff` — Session handoff persistence

**File:** `tools/state.ts`
**Core APIs:** `saveHandoff`, `loadHandoff`

| Action | Description                                        | Required params   | Optional params |
| ------ | -------------------------------------------------- | ----------------- | --------------- |
| `save` | Persist handoff context to `.harness/handoff.json` | `path`, `handoff` | —               |
| `load` | Load handoff context                               | `path`            | —               |

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "action": "string (required) — save|load",
  "handoff": "object — handoff data (required for 'save')"
}
```

### 3. `create_self_review` — Checklist-based code review

**File:** `tools/feedback.ts`
**Core APIs:** `createSelfReview`, `ChecklistBuilder`

Analyzes code changes against harness checks, custom rules, and diff patterns. Returns a categorized checklist with pass/fail items, severity, and suggestions.

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "diff": "string (required) — git diff output",
  "customRules": "array — additional review rules",
  "maxFileSize": "number — max lines per file (default from config)",
  "maxFileCount": "number — max files in diff (default from config)"
}
```

### 4. `analyze_diff` — Pattern-based diff analysis

**File:** `tools/feedback.ts`
**Core APIs:** `parseDiff`, `analyzeDiff`

Parses a git diff and checks for forbidden patterns, oversized files, and missing test coverage.

**Input schema:**

```json
{
  "diff": "string (required) — git diff output",
  "forbiddenPatterns": "array of strings — regex patterns to flag",
  "maxFileSize": "number — max additions per file",
  "maxFileCount": "number — max files in diff"
}
```

### 5. `request_peer_review` — Agent-spawned code review

**File:** `tools/feedback.ts`
**Core APIs:** `requestPeerReview`

Spawns an agent subprocess to perform code review. Returns structured feedback with approval status, comments, and suggestions.

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "agentType": "string (required) — agent type to spawn",
  "diff": "string (required) — git diff output",
  "context": "string — additional review context"
}
```

### 6. `check_phase_gate` — Verify implementation-to-spec mappings

**File:** `tools/phase-gate.ts`
**Core APIs:** `runCheckPhaseGate` (CLI)

Maps implementation files to spec documents and validates 1:1 correspondence.

**Input schema:**

```json
{
  "path": "string (required) — project root"
}
```

### Enhanced: `detect_entropy` — Add type filter

**File:** `tools/entropy.ts` (modify existing)

Add optional `type` parameter to filter results by category. When omitted, behaves as before (returns all).

**New input param:**

```json
{
  "type": "string — drift|dead-code|patterns|all (default: all)"
}
```

### Enhanced: `apply_fixes` — Add suggestions to response

**File:** `tools/entropy.ts` (modify existing)

After applying fixes, also call `generateSuggestions` and include the suggestions in the response alongside the fix results.

### 7. `validate_cross_check` — Plan-to-implementation coverage

**File:** `tools/cross-check.ts`
**Core APIs:** `runCrossCheck` (CLI)

Validates that plans have corresponding implementations and detects staleness.

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "specsDir": "string — specs directory (default: docs/specs)",
  "plansDir": "string — plans directory (default: docs/plans)"
}
```

### 8. `create_skill` — Scaffold a new skill

**File:** `tools/skill.ts` (extend existing)
**Core APIs:** `generateSkillFiles` (CLI)

Generates `skill.yaml` and `SKILL.md` for a new skill.

**Input schema:**

```json
{
  "path": "string (required) — project root",
  "name": "string (required) — skill name in kebab-case",
  "description": "string (required) — skill description",
  "cognitiveMode": "string — adversarial-reviewer|constructive-architect|meticulous-implementer|diagnostic-investigator|advisory-guide|meticulous-verifier (default: constructive-architect)"
}
```

## New Resource (1)

### `harness://state`

**File:** `resources/state.ts`
**Core API:** `loadState`

Returns the current `.harness/state.json` as JSON. Provides agents with read access to project state without using a tool call.

```json
{
  "uri": "harness://state",
  "name": "Project State",
  "description": "Current harness state including position, progress, decisions, and blockers",
  "mimeType": "application/json"
}
```

## Tool Overlap Resolution

### `cleanup` vs existing `detect_entropy`

`detect_entropy` runs the full `EntropyAnalyzer` and returns a combined report. `cleanup` adds a `type` filter parameter so agents can request only drift, dead-code, or pattern issues. Rather than adding a second tool, **add the `type` filter parameter to the existing `detect_entropy` tool**. This avoids duplication. The `cleanup` tool is removed from the new tools list; instead, `detect_entropy` is updated in-place.

### `fix_drift` vs existing `apply_fixes`

`apply_fixes` runs `EntropyAnalyzer` then applies fixes. `fix_drift` adds `generateSuggestions` on top. Rather than having two overlapping tools, **extend `apply_fixes` to include suggestions in its response**. The `fix_drift` tool is removed; `apply_fixes` is enhanced.

**Net effect:** 8 new tools instead of 10. Total: 23 tools, 5 resources.

## CLI-to-MCP Coupling Strategy

Several tools wrap CLI commands that depend on CLI-internal utilities (`resolveConfig`, `CLIError`, `OutputFormatter`). Strategy for each:

- **`check_phase_gate`, `validate_cross_check`:** These CLI functions use `resolveConfig` and CLI error types. The MCP handlers will dynamically import the CLI package (`@harness-engineering/cli`) and call the exported `run*` functions, wrapping `CLIError` exceptions in MCP error responses via try/catch.
- **`create_skill`:** `generateSkillFiles` throws `CLIError` rather than returning `Result`. The MCP handler wraps in try/catch and converts to MCP error format.
- **`request_peer_review`:** The spawned agent subprocess inherits a 120-second timeout (matching `runMechanicalGate` behavior). The MCP handler documents this timeout in the tool description.

## `harness://state` Error Handling

`loadState` returns `Result<HarnessState, Error>`. If the result is an error (e.g., `.harness/state.json` doesn't exist), the resource handler returns a default empty state object rather than throwing, so agents always get a valid response.

## Implementation Pattern

Each tool follows the existing pattern in the codebase:

```typescript
// Definition: exported const with name, description, inputSchema
export const myToolDefinition = {
  name: 'my_tool',
  description: '...',
  inputSchema: { type: 'object', properties: {...}, required: [...] },
};

// Handler: exported async function returning MCP response
export async function handleMyTool(input: { ... }) {
  // 1. Resolve path
  // 2. Dynamic import of @harness-engineering/core or CLI function
  // 3. Call core API
  // 4. Return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  // On error: return { content: [...], isError: true }
}
```

Registration in `server.ts` follows the existing arrays: add to `TOOL_DEFINITIONS` and `TOOL_HANDLERS`.

## File Changes

**New files:**

- `packages/mcp-server/src/tools/state.ts` — manage_state, manage_handoff
- `packages/mcp-server/src/tools/feedback.ts` — create_self_review, analyze_diff, request_peer_review
- `packages/mcp-server/src/tools/phase-gate.ts` — check_phase_gate
- `packages/mcp-server/src/tools/cross-check.ts` — validate_cross_check
- `packages/mcp-server/src/resources/state.ts` — harness://state resource

**Modified files:**

- `packages/mcp-server/src/tools/entropy.ts` — add `type` filter to detect_entropy, add suggestions to apply_fixes
- `packages/mcp-server/src/tools/skill.ts` — add create_skill definition + handler
- `packages/mcp-server/src/server.ts` — register all new tools/resources

**Doc updates:**

- `README.md` — update tool/resource counts
- `docs/guides/getting-started.md` — update tool/resource counts

## Final Counts

|                | Before | After |
| -------------- | ------ | ----- |
| Tools          | 15     | 23    |
| Resources      | 4      | 5     |
| Tool files     | 9      | 13    |
| Resource files | 4      | 5     |
