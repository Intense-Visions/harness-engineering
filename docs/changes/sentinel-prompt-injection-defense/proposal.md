# Sentinel: Prompt Injection Defense

**Status:** Approved
**Keywords:** prompt-injection, sentinel, taint-model, session-taint, CLAUDE.md-scanning, hook-defense, untrusted-input, connector-sanitization, PreToolUse, orchestrator-security, gemini-parity

## Overview

Multi-layered defense against prompt injection attacks targeting harness users who process untrusted external input (Jira issues, GitHub PRs, Slack messages, cloned repos). Three capabilities:

1. **Sentinel runtime scanning** — intercept and scan tool inputs/outputs for injection patterns at the Claude Code hook layer (PreToolUse/PostToolUse) and the harness MCP server layer (for Gemini CLI parity).
2. **Session taint model** — when injection patterns are detected, mark the session as tainted and block destructive operations (git push/commit, filesystem writes outside workspace, destructive Bash commands) for 30 minutes (wall-clock) or until manually cleared.
3. **Config scanning on clone** — scan CLAUDE.md, AGENTS.md, and .gemini/settings.json files in cloned repos before orchestrator plan execution. High-severity findings block execution. Medium-severity findings trigger taint.

### Design Principles

- **Defense-in-depth:** Existing connector sanitization + new runtime/static scanning layers
- **Platform parity:** Claude Code (hooks) and Gemini CLI (MCP middleware) receive equivalent protection
- **Fail-open on errors:** Scanning failures must not break tool execution
- **Minimal latency:** Pattern-based scanning, not LLM-based

## Decisions

| #   | Decision                                                                                                   | Rationale                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Restrictive taint model** — tainted sessions block destructive ops, not just warn                        | Advisory-only taint provides visibility but no enforcement. Restrictive taint contains blast radius even if injection succeeds.                                                                                                                                          |
| D2  | **Tiered CLAUDE.md scanning response** — block on high-severity, warn+taint on medium                      | Avoids false-positive halts for ambiguous patterns while hard-stopping obvious attacks (hidden unicode, explicit re-roling, permission escalation).                                                                                                                      |
| D3  | **PreToolUse + PostToolUse hook points** — scan both inputs and outputs                                    | Connector sanitization covers most MCP-returned data, but PostToolUse provides defense-in-depth for unsanitized paths or new connectors.                                                                                                                                 |
| D4  | **Wall-clock 30-minute taint expiry with notification**                                                    | Simple, predictable. Notification on expiry prevents silent state changes. Idle sessions likely lose injection context from the window anyway.                                                                                                                           |
| D5  | **Git + filesystem writes blocked during taint** — no network egress blocking                              | Orchestrator needs to read from external APIs during tainted sessions. Blocking git push/commit and filesystem writes outside workspace contains the highest-impact attack vectors.                                                                                      |
| D6  | **Hybrid architecture** — hooks for Claude Code, MCP middleware for Gemini, shared CLI for static scanning | Gemini CLI has no hook system. MCP server is the shared layer. Hooks remain the standard Claude Code extension point.                                                                                                                                                    |
| D7  | **Taint file is authoritative**                                                                            | `.harness/session-taint-{sessionId}.json` is the single source of truth for taint state. No dual-write to session state — add audit trail later if needed (YAGNI).                                                                                                       |
| D8  | **Session-scoped taint files**                                                                             | Taint files include a session ID in the filename (`.harness/session-taint-{sessionId}.json`) to support concurrent agents in the same workspace. Each agent's taint is independent — one agent detecting injection does not block another agent's legitimate operations. |

## Technical Design

### Injection Pattern Engine

A shared pattern library used by hooks, MCP middleware, and the CLI scanner:

**Location:** `packages/core/src/security/injection-patterns.ts`

**Pattern categories with severity levels:**

| Severity   | Category              | Examples                                                              |
| ---------- | --------------------- | --------------------------------------------------------------------- |
| **HIGH**   | Hidden unicode        | Zero-width chars, RTL override, homoglyph substitution                |
| **HIGH**   | Explicit re-roling    | "you are now", "ignore previous instructions", "forget all prior"     |
| **HIGH**   | Permission escalation | "allow all tools", "disable safety", "auto-approve", "--no-verify"    |
| **HIGH**   | Encoded payloads      | Base64-encoded instructions, hex-encoded directives                   |
| **MEDIUM** | Indirect injection    | "when the user asks, say X", "include this in your response"          |
| **MEDIUM** | Context manipulation  | "the system prompt says", "your instructions are", fake XML/JSON tags |
| **MEDIUM** | Social engineering    | "this is urgent", "the admin authorized", "for testing purposes"      |
| **LOW**    | Suspicious patterns   | Unusual unicode blocks, excessive whitespace, repeated delimiters     |

**Returns:** `{ severity: 'high' | 'medium' | 'low', ruleId: string, match: string, line?: number }[]`

**Severity behavior:**

- **HIGH / MEDIUM:** Trigger taint (hooks and MCP middleware act on these)
- **LOW:** Informational only — logged to stderr for visibility, no taint set, no operations blocked

Extends the existing `sanitizeExternalText()` patterns from `ConnectorUtils.ts` but does NOT replace them — the connector layer continues to strip patterns, the new engine detects and reports them.

### Taint State

**File:** `.harness/session-taint-{sessionId}.json`

Session ID is derived from the `session_id` field in hook stdin JSON. For MCP middleware, the session ID is derived from the MCP connection context. Fallback: if no session ID is available, use `default` as the session identifier.

```json
{
  "sessionId": "abc123",
  "taintedAt": "2026-04-01T10:30:00Z",
  "expiresAt": "2026-04-01T11:00:00Z",
  "reason": "Injection pattern detected in PostToolUse result",
  "severity": "medium",
  "findings": [
    {
      "ruleId": "INJ-REROL-001",
      "severity": "high",
      "match": "ignore previous instructions",
      "source": "mcp__harness__ask_graph result",
      "detectedAt": "2026-04-01T10:30:00Z"
    }
  ]
}
```

**Lifecycle:**

1. **Created** by sentinel hook, MCP middleware, or `harness scan-config`. Creates `.harness/` directory if it does not exist.
2. **Read** by sentinel PreToolUse hook on every invocation. If the file contains malformed JSON, it is deleted and the hook proceeds as if no taint exists (fail-open).
3. **Deleted** when `expiresAt < now` (checked on next hook invocation, not a background timer)
4. **Manually cleared** via `harness taint clear [--session <id>]` (clears specific session or all taint files if no session specified)
5. **On expiry**, hook emits to stderr: `"Sentinel: session taint expired. Destructive operations re-enabled."`

### Sentinel Hooks (Claude Code)

Two hook scripts in `packages/cli/src/hooks/`:

**`sentinel-pre.js`** — registered at `PreToolUse: *` (all tools)

1. Read stdin JSON (`{ tool_name, tool_input }`)
2. Check `.harness/session-taint-{sessionId}.json` — if tainted and tool is destructive, exit 2 (block) with explanation
3. Scan `tool_input` values through injection pattern engine
4. If findings with severity >= medium — write/update taint file, write to stderr, exit 0 (allow the current operation but taint the session for future operations)
5. On any error — exit 0 (fail-open)

**`sentinel-post.js`** — registered at `PostToolUse: *` (all tools)

1. Read stdin JSON (`{ tool_name, tool_input, tool_output }`)
2. Scan `tool_output` through injection pattern engine
3. If findings — write/update taint file, write finding to stderr
4. Exit 0 always (PostToolUse cannot block)

**Destructive operation patterns (blocked during taint):**

| Tool  | Pattern                                                                |
| ----- | ---------------------------------------------------------------------- |
| Bash  | `git push`, `git commit`, `rm -rf`, `rm -r`, `mv` to outside workspace |
| Write | `file_path` outside workspace root                                     |
| Edit  | `file_path` outside workspace root                                     |

### MCP Middleware (Gemini CLI)

**Location:** `packages/cli/src/mcp/middleware/injection-guard.ts`

A middleware wrapper in the harness MCP server providing Gemini CLI parity:

- Wraps all MCP tool handlers with pre/post scanning
- **Pre:** scan tool input parameters; if tainted session + destructive tool, return error result
- **Post:** scan tool result content; if findings, set taint and append warning to result
- Reads/writes the same `.harness/session-taint-{sessionId}.json` file as hooks
- **Fail-open:** middleware errors pass through to the original handler

**Registration:** Added to the MCP server's tool handler pipeline in `packages/cli/src/mcp/server.ts`.

### Config Scanner CLI

```
harness scan-config [--path <dir>] [--fix]
```

- Scans CLAUDE.md, AGENTS.md, .gemini/settings.json, skill.yaml files in the target directory
- Uses the existing security scanner rules (SEC-AGT-\*) plus the new injection pattern engine
- Returns structured results: `{ file, findings[], overallSeverity }`
- `--fix` flag: strips high-severity patterns from files (modifies in-place, logs changes)
- Exit codes: 0 = clean, 1 = medium findings, 2 = high-severity findings

**Orchestrator integration:** Called in the orchestrator's post-clone pipeline (`packages/orchestrator/src/orchestrator.ts`), after workspace setup and before plan execution:

- Exit 2 — abort run, log findings
- Exit 1 — set taint on session, continue

### Hook Profile Integration

| Profile  | Includes sentinel? |
| -------- | ------------------ |
| minimal  | No                 |
| standard | No                 |
| strict   | Yes                |

Also available a la carte: `harness hooks add sentinel`

### File Layout

```
packages/core/src/security/injection-patterns.ts    — shared pattern engine
packages/core/src/security/taint.ts                  — session-scoped taint file read/write/check/clear/expire
packages/cli/src/hooks/sentinel-pre.js               — PreToolUse hook script
packages/cli/src/hooks/sentinel-post.js              — PostToolUse hook script
packages/cli/src/mcp/middleware/injection-guard.ts   — MCP middleware for Gemini
packages/cli/src/commands/scan-config.ts             — CLI command
packages/cli/src/hooks/profiles.ts                   — updated with sentinel entry
packages/orchestrator/src/orchestrator.ts            — updated post-clone pipeline
```

## Success Criteria

| #    | Criterion                                                                                                                                          | Verification                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SC1  | When a tool input contains a high-severity injection pattern, the sentinel PreToolUse hook detects it and taints the session                       | Unit test: feed known injection payloads via stdin, assert taint file is created                                                       |
| SC2  | When a tool output contains an injection pattern, the sentinel PostToolUse hook detects it and taints the session                                  | Unit test: feed tool output with injection via stdin, assert taint file is created                                                     |
| SC3  | When a session is tainted, `git push`, `git commit`, `Write` outside workspace, and destructive `Bash` commands are blocked by the PreToolUse hook | Unit test: create taint file, feed destructive tool inputs, assert exit code 2                                                         |
| SC4  | When taint expires (wall-clock > 30 min), the next hook invocation deletes the taint file and emits expiry notice to stderr                        | Unit test: create taint file with past `expiresAt`, invoke hook, assert file deleted and stderr message                                |
| SC5  | `harness taint clear` removes the taint file and logs confirmation                                                                                 | Integration test: create taint file, run command, assert file gone                                                                     |
| SC6  | `harness scan-config` detects high-severity patterns in CLAUDE.md and exits 2                                                                      | Integration test: write CLAUDE.md with hidden unicode, run scanner, assert exit 2 with findings                                        |
| SC7  | `harness scan-config` detects medium-severity patterns and exits 1                                                                                 | Integration test: write CLAUDE.md with context manipulation, assert exit 1                                                             |
| SC8  | Orchestrator aborts on `scan-config` exit 2 after cloning a repo                                                                                   | Integration test: mock clone with malicious CLAUDE.md, assert orchestrator halts before plan execution                                 |
| SC9  | Orchestrator sets taint on `scan-config` exit 1 and continues                                                                                      | Integration test: mock clone with medium-severity CLAUDE.md, assert taint set and run continues                                        |
| SC10 | MCP middleware scans tool inputs/outputs for Gemini CLI users and sets taint on detection                                                          | Unit test: invoke MCP tool handler through middleware with injection payload, assert taint file created                                |
| SC11 | MCP middleware blocks destructive tools during taint for Gemini CLI users                                                                          | Unit test: set taint, invoke destructive MCP tool, assert error result returned                                                        |
| SC12 | All scanning failures fail-open — hook exits 0, middleware passes through                                                                          | Unit test: corrupt pattern engine, assert hook exits 0 and middleware forwards to handler                                              |
| SC13 | `harness hooks init --profile strict` installs sentinel hooks                                                                                      | Integration test: run init, assert sentinel-pre.js and sentinel-post.js in `.harness/hooks/` and registered in `.claude/settings.json` |
| SC14 | Injection pattern engine detects all HIGH and MEDIUM categories from the pattern table                                                             | Unit test: one test case per pattern category, assert correct severity and ruleId                                                      |
| SC15 | Sentinel scanning adds less than 100ms latency per tool invocation                                                                                 | Unit test: benchmark pattern engine against 10KB input, assert < 100ms. Integration test: measure hook execution time end-to-end       |
| SC16 | LOW severity findings are logged to stderr but do not trigger taint or block operations                                                            | Unit test: feed LOW-severity-only input, assert no taint file created and exit 0                                                       |
| SC17 | Concurrent sessions in the same workspace maintain independent taint state                                                                         | Unit test: create taint files for two session IDs, clear one, assert the other remains                                                 |

## Implementation Order

| Phase | What                                                                                                                                                                                         | Depends on                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **1** | **Injection pattern engine** — `packages/core/src/security/injection-patterns.ts` with all pattern categories, severity levels, and the shared scan function. Unit tests for every category. | Nothing — foundation layer                              |
| **2** | **Taint state management** — `packages/core/src/security/taint.ts` with read/write/check/clear/expire logic. `harness taint clear` CLI command. Unit tests for lifecycle.                    | Phase 1 (patterns produce findings that taint consumes) |
| **3** | **Sentinel hooks** — `sentinel-pre.js` and `sentinel-post.js`. Hook profile update. `harness hooks add sentinel` support. Unit tests for detect, taint, block, expire, fail-open.            | Phase 1 + 2                                             |
| **4** | **MCP middleware** — `injection-guard.ts` middleware for Gemini CLI parity. Registration in MCP server. Unit tests mirroring sentinel hook tests.                                            | Phase 1 + 2                                             |
| **5** | **Config scanner CLI** — `harness scan-config` command. Integration with existing SEC-AGT rules + new injection patterns. `--fix` flag for stripping. Integration tests.                     | Phase 1                                                 |
| **6** | **Orchestrator integration** — post-clone `scan-config` call. Abort on exit 2, taint on exit 1. Integration tests with mock cloned workspaces.                                               | Phase 2 + 5                                             |

Phases 3, 4, and 5 are independent of each other and can be parallelized after Phase 2 completes.
