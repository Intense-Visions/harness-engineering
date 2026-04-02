# Runtime Enforcement Extensions — Iteration 1: Security Rules + Targeted Hooks

> Deliver the enforcement value from the Runtime Enforcement Extensions spec: 18 new security scanner rules and 2 high-value hook scripts.

**Status:** Draft
**Date:** 2026-03-30
**Parent Spec:** docs/changes/runtime-enforcement-extensions/proposal.md
**Keywords:** hooks, security, enforcement, PreToolUse, PreCompact, agent-config, MCP, secrets, runtime

---

## Overview

Two independent features shipping together:

1. **18 new security scanner rules** across 3 categories (expanded secrets, agent-config, MCP) with fileGlob filtering in `scanFile()`
2. **2 hook scripts** — `protect-config` (blocks agents from weakening linter/formatter configs) and `pre-compact-state` (saves compact session summary before context compaction)

Users configure hooks manually in `.claude/settings.json` until `harness hooks init` ships in a follow-up iteration.

**Out of scope:** `harness hooks` CLI command, profile system, `block-no-verify` hook (Claude Code already discourages this), `quality-gate` hook (redundant with CI/pre-commit), `cost-tracker` hook (native cost tracking emerging), documentation updates, template updates.

---

## Decisions

| Decision                                          | Rationale                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Security rules + 2 hooks only, defer CLI and docs | Rules are the clear high-value win; only 2 hooks solve observed problems (config weakening, compaction context loss) |
| Drop `block-no-verify` hook                       | Claude Code already discourages `--no-verify`; low real-world incidence                                              |
| Drop `quality-gate` hook                          | Redundant with CI/pre-commit hooks in well-configured projects                                                       |
| Drop `cost-tracker` hook                          | Native cost tracking emerging in Claude Code; likely obsolete quickly                                                |
| Drop profile system from iteration 1              | With only 2 hooks, profile gating adds complexity for no value; both hooks always active                             |
| fileGlob filtering in `scanFile()`                | Rules must be self-describing and caller-independent; prevents false positives on source files                       |
| Sequential implementation (rules then hooks)      | Features are genuinely independent; no artificial coupling; each phase independently shippable                       |
| Hook scripts are plain .js, no shared base        | 2 scripts with no build step; copy-a-file simplicity                                                                 |
| Fail-open design for all hooks                    | Broken hooks must never block legitimate work; only deliberate policy violations exit 2                              |
| Pre-compact saves compact session summary         | Preserves enough context for agent to resume after compaction without bulk state copying                             |

---

## Technical Design

### Feature 1: Security Rules

**Type change** — extend `SecurityCategory` in `packages/core/src/security/types.ts`:

```typescript
export type SecurityCategory =
  | 'secrets'
  | 'injection'
  | 'xss'
  | 'crypto'
  | 'network'
  | 'deserialization'
  | 'path-traversal'
  | 'agent-config' // NEW
  | 'mcp'; // NEW
```

**New files:**

- `packages/core/src/security/rules/agent-config.ts` — 7 rules (SEC-AGT-001 through SEC-AGT-007)
- `packages/core/src/security/rules/mcp.ts` — 5 rules (SEC-MCP-001 through SEC-MCP-005)

**Modified files:**

- `packages/core/src/security/rules/secrets.ts` — 6 new rules (SEC-SEC-006 through SEC-SEC-011)
- `packages/core/src/security/scanner.ts` — import + register new rules; add fileGlob filtering to `scanFile()`

The scanner change is ~5 lines: before iterating rules against file content, filter `activeRules` to those whose `fileGlob` either is undefined (apply everywhere) or matches the current file path.

#### New Secret Rules (6 rules — added to existing `secrets.ts`)

| ID          | Name                        | Pattern                                                 | References |
| ----------- | --------------------------- | ------------------------------------------------------- | ---------- |
| SEC-SEC-006 | Anthropic API keys          | `sk-ant-api03-` prefix                                  | CWE-798    |
| SEC-SEC-007 | OpenAI API keys             | `sk-proj-` prefix (with length check)                   | CWE-798    |
| SEC-SEC-008 | Google API keys             | `AIza` prefix followed by 35 alphanumeric chars         | CWE-798    |
| SEC-SEC-009 | GitHub PATs                 | `ghp_`, `gho_`, `ghu_`, `ghs_` prefixes                 | CWE-798    |
| SEC-SEC-010 | Stripe keys                 | `sk_live_`, `pk_live_`, `rk_live_` prefixes             | CWE-798    |
| SEC-SEC-011 | Database connection strings | URI schemes with embedded credentials (`://user:pass@`) | CWE-798    |

#### Agent Config Rules (7 rules — new file `rules/agent-config.ts`)

| ID          | Name                      | Pattern                                                                              | fileGlob                                  | References |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ---------- |
| SEC-AGT-001 | Hidden Unicode            | Zero-width characters (U+200B, U+200C, U+200D, U+FEFF, U+2060)                       | `**/CLAUDE.md,**/AGENTS.md,**/*.yaml`     | CWE-116    |
| SEC-AGT-002 | URL execution directives  | `curl`, `wget`, `fetch(` instructions in agent config                                | `**/CLAUDE.md,**/AGENTS.md`               | CWE-94     |
| SEC-AGT-003 | Wildcard tool permissions | `Bash(*)`, `Write(*)`, `Edit(*)` in settings                                         | `**/.claude/**,**/settings*.json`         | CWE-250    |
| SEC-AGT-004 | Auto-approve patterns     | `autoApprove`, `auto_approve` in config                                              | `**/.claude/**,**/.mcp.json`              | CWE-862    |
| SEC-AGT-005 | Prompt injection surface  | `${`, <code v-pre>{{</code>, template interpolation in skill YAML description fields | `**/skill.yaml`                           | CWE-94     |
| SEC-AGT-006 | Permission bypass flags   | `--dangerously-skip-permissions`, `--no-verify`                                      | `**/CLAUDE.md,**/AGENTS.md,**/.claude/**` | CWE-863    |
| SEC-AGT-007 | Hook injection surface    | `$()`, backticks, `&&`, `\|\|` in hook command values                                | `**/settings*.json,**/hooks.json`         | CWE-78     |

#### MCP Security Rules (5 rules — new file `rules/mcp.ts`)

| ID          | Name                        | Pattern                                           | fileGlob       | References |
| ----------- | --------------------------- | ------------------------------------------------- | -------------- | ---------- |
| SEC-MCP-001 | Hardcoded MCP secrets       | API key/token/password patterns in MCP env blocks | `**/.mcp.json` | CWE-798    |
| SEC-MCP-002 | Shell injection in MCP args | Shell metacharacters in `args` arrays             | `**/.mcp.json` | CWE-78     |
| SEC-MCP-003 | Network exposure            | `0.0.0.0` or `*` as bind address                  | `**/.mcp.json` | CWE-668    |
| SEC-MCP-004 | Typosquatting vector        | `npx -y` in MCP command field                     | `**/.mcp.json` | CWE-427    |
| SEC-MCP-005 | Unencrypted transport       | `http://` (not `https://`) in MCP server URLs     | `**/.mcp.json` | CWE-319    |

### Feature 2: Hook Scripts

**New files in `packages/cli/src/hooks/`:**

| Script                 | Event      | Matcher     | Exit Code | Purpose                                                 |
| ---------------------- | ---------- | ----------- | --------- | ------------------------------------------------------- |
| `protect-config.js`    | PreToolUse | Write, Edit | 2 (block) | Prevents weakening linter/formatter configs             |
| `pre-compact-state.js` | PreCompact | \*          | 0 (log)   | Saves compact session summary before context compaction |

**Hook conventions:**

- Exit codes: 0 = allow/log (stderr shown to agent), 2 = block tool call, other = error (fail-open)
- Input: JSON on stdin per Claude Code hook protocol
- Fail-open: Both hooks wrap logic in try/catch. Parse errors and unexpected exceptions log to stderr and exit 0
- No profile system in this iteration — both hooks are always active

**`protect-config.js` — Protected files:**

`.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `biome.json`, `biome.jsonc`, `.ruff.toml`, `ruff.toml`, `.stylelintrc*`, `.markdownlint*`, `deno.json`

Exclusions: `pyproject.toml` (project metadata alongside linter config), `tsconfig.json` (legitimate changes common).

**`pre-compact-state.js` — Session summary:**

Writes a compact JSON file to `.harness/state/pre-compact-summary.json` containing:

```json
{
  "timestamp": "2026-03-30T12:00:00Z",
  "sessionId": "<current session ID if available>",
  "activeStream": "<stream name if available>",
  "recentDecisions": ["<last 5 decisions from state>"],
  "openQuestions": ["<unresolved questions>"],
  "currentPhase": "<active skill phase if any>"
}
```

This is enough for an agent to orient after compaction without bulk state copying. Overwrites on each compaction (only latest pre-compaction state matters).

**Manual installation:** Users add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node .harness/hooks/protect-config.js" }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "node .harness/hooks/pre-compact-state.js" }]
      }
    ]
  }
}
```

---

## Success Criteria

### Security Rules

1. When `SecurityCategory` type is extended, all existing rule files and tests compile without changes
2. When the 6 new secret rules are registered, each fires on its specific pattern (e.g., `sk-ant-api03-` triggers SEC-SEC-006) and includes CWE references
3. When the 7 agent-config rules scan a `CLAUDE.md` containing hidden Unicode, SEC-AGT-001 fires
4. When the 5 MCP rules scan an `.mcp.json` with `npx -y`, SEC-MCP-004 fires
5. When `fileGlob` filtering is added to `scanFile()`, agent-config rules only fire against agent config files, not source code
6. When a rule severity is set to `"off"` in `harness.config.json`, that rule produces no findings
7. When `harness:security-scan` runs, it reports findings from all categories including the new ones

### Hook Scripts

8. When `protect-config.js` receives a Write/Edit targeting `.eslintrc*`, it exits 2
9. When `protect-config.js` receives a Write/Edit targeting a non-protected file, it exits 0
10. When `pre-compact-state.js` runs, it writes a valid JSON summary to `.harness/state/pre-compact-summary.json`
11. When either hook receives malformed stdin, it fails open (exit 0) and logs to stderr

---

## Implementation Order

### Phase 1: Security Rules

1. Extend `SecurityCategory` type with `'agent-config'` and `'mcp'`
2. Create `rules/agent-config.ts` with 7 rules following existing `SecurityRule` format
3. Create `rules/mcp.ts` with 5 rules following existing `SecurityRule` format
4. Add 6 new patterns to `rules/secrets.ts` (SEC-SEC-006 through SEC-SEC-011)
5. Register new rules in `scanner.ts` constructor
6. Add fileGlob filtering to `scanFile()` — filter activeRules by file path before scanning
7. Write test fixtures and test all 18 new rules

### Phase 2: Hook Scripts

1. Implement `protect-config.js` — parse stdin, extract file path from Write/Edit tool input, match against protected config list, exit 2 on match
2. Implement `pre-compact-state.js` — read harness state files, write compact JSON summary to `.harness/state/pre-compact-summary.json`
3. Test each hook in isolation: correct exit codes, input parsing, fail-open on errors

### Deferred to Iteration 2

- `harness hooks init/list/remove` CLI command
- Profile system (minimal/standard/strict)
- `block-no-verify`, `quality-gate`, `cost-tracker` hooks (revisit based on real-world feedback)
- Documentation in `docs/reference/` and `docs/guides/`
- Template updates mentioning `harness hooks init`
