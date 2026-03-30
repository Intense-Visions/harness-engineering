# Runtime Enforcement Extensions

> Extend harness's mechanical enforcement from build/analysis time to runtime via CLI-managed hooks, and broaden security scanning with new rule categories for agent configs and MCP servers.

**Status:** Draft
**Date:** 2026-03-29
**Keywords:** hooks, security, enforcement, PreToolUse, agent-config, MCP, secrets, runtime

---

## Overview

Harness enforces architectural constraints and code quality mechanically — via linters, graph analysis, and typed skill pipelines. But this enforcement only operates at build/analysis time. Two gaps exist:

1. **No runtime enforcement.** An agent can run `git commit --no-verify`, weaken a linter config, or hammer a dead MCP server, and nothing stops it before the damage is done.
2. **No agent-specific security scanning.** The standalone `SecurityScanner` already has a modular `RuleRegistry` with 7 rule categories (secrets, injection, xss, crypto, network, deserialization, path-traversal) plus 4 stack-specific rule sets. However, it has no awareness of AI agent configuration security — CLAUDE.md injection surfaces, MCP server risks, hook script vulnerabilities, or permission misconfigurations. These are unique to AI-assisted development and not covered by traditional scanners.

This proposal adds two independent features:

- **`harness hooks`** — a CLI command that installs curated hook configurations with profile-based activation
- **New security rule categories** — add `agent-config` and `mcp` categories to the existing `SecurityScanner` registry, plus targeted new secret patterns

Both extend the same philosophy: constraints are checked by tools, not by humans reading output.

### Existing Security Architecture

The codebase has **two distinct security systems** that this proposal touches differently:

1. **`SecurityScanner`** (`packages/core/src/security/scanner.ts`) — standalone scanner using `RuleRegistry` with pattern-based `SecurityRule` objects (each rule has `patterns: RegExp[]`). Produces `SecurityFinding[]`. Already modular with 7 base rule files + 4 stack-specific files. **This is where new rules are added.**

2. **`SecurityAgent`** (`packages/core/src/review/agents/security-agent.ts`) — review pipeline agent with 4 inline heuristic detectors. Produces `ReviewFinding[]` (different type). Operates on `ContextBundle` (changed files from a PR/commit). **This is left as-is.** The inline detectors serve a different purpose (review-time analysis of diffs) than the scanner (project-wide scanning). Consolidation is a future consideration, not part of this proposal.

---

## Decisions

| Decision                                                                     | Rationale                                                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CLI command (`harness hooks init`) over template-only                        | Works for both new and existing projects; hooks are infrastructure, not scaffolding                                                    |
| Add rules to existing `SecurityScanner` registry, not refactor SecurityAgent | The scanner already has the modular registry pattern. The review agent serves a different purpose (diff analysis). Keep them separate. |
| No external scanner dependencies (AgentShield, etc.)                         | Avoids coupling to external maintenance cadence; harness findings already have CWE references                                          |
| Profile-based hook activation (minimal/standard/strict)                      | Lets users control safety/speed tradeoff; proven in ECC's production usage                                                             |
| Agent config and MCP as new security categories                              | Unique to AI-assisted development; extends the existing `SecurityCategory` union type                                                  |
| Fail-open design for hooks                                                   | Broken hooks must never block legitimate work; only explicit `exit 2` blocks                                                           |
| Hooks target `.claude/settings.json` (project-level)                         | Separate from `.claude/settings.local.json` (user-level permissions). Hooks are project infrastructure, not user preferences.          |

---

## Technical Design

### Feature 1: `harness hooks`

#### CLI Surface

```
harness hooks init [--profile minimal|standard|strict]  # Install hooks into current project
harness hooks list                                        # Show available hooks and active profile
harness hooks remove                                      # Remove harness-managed hooks
```

#### Hook Scripts

| Script                 | Event       | Matcher     | Profile   | Behavior       | Purpose                                               |
| ---------------------- | ----------- | ----------- | --------- | -------------- | ----------------------------------------------------- |
| `block-no-verify.js`   | PreToolUse  | Bash        | All       | Block (exit 2) | Prevents `--no-verify` on git commands                |
| `protect-config.js`    | PreToolUse  | Write, Edit | standard+ | Block (exit 2) | Prevents weakening linter/formatter configs           |
| `quality-gate.js`      | PostToolUse | Edit, Write | standard+ | Warn (exit 0)  | Runs project formatter/linter after edits             |
| `pre-compact-state.js` | PreCompact  | \*          | standard+ | Log (exit 0)   | Saves harness session state before compaction         |
| `cost-tracker.js`      | Stop        | \*          | strict    | Log (async)    | Appends token usage to `.harness/metrics/costs.jsonl` |

#### File Layout

```
packages/cli/src/commands/hooks/         # CLI command directory (follows existing pattern: ci/, state/, skill/)
  index.ts                               # createHooksCommand() — registers init/list/remove subcommands
  init.ts                                # harness hooks init implementation
  list.ts                                # harness hooks list implementation
  remove.ts                              # harness hooks remove implementation
packages/cli/src/hooks/                  # Hook script sources (shipped as assets, copied to projects)
  block-no-verify.js
  protect-config.js
  quality-gate.js
  pre-compact-state.js
  cost-tracker.js
  profiles.ts                            # Profile definitions (which hooks at which tier)
```

#### How `harness hooks init` Works

1. Copies hook scripts to `.harness/hooks/` in the project
2. Reads or creates `.claude/settings.json` (project-level, separate from `.claude/settings.local.json`)
3. Merges hook entries into `settings.json` under the `hooks` key per the Claude Code hooks protocol:
   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [{ "type": "command", "command": "node .harness/hooks/block-no-verify.js" }]
         },
         {
           "matcher": "Write|Edit",
           "hooks": [{ "type": "command", "command": "node .harness/hooks/protect-config.js" }]
         }
       ],
       "PostToolUse": [
         {
           "matcher": "Edit|Write",
           "hooks": [{ "type": "command", "command": "node .harness/hooks/quality-gate.js" }]
         }
       ],
       "PreCompact": [
         {
           "matcher": "*",
           "hooks": [{ "type": "command", "command": "node .harness/hooks/pre-compact-state.js" }]
         }
       ],
       "Stop": [
         {
           "matcher": "*",
           "hooks": [{ "type": "command", "command": "node .harness/hooks/cost-tracker.js" }]
         }
       ]
     }
   }
   ```
4. Writes profile selection to `.harness/hooks/profile.json`
5. Each hook script reads `profile.json` at runtime to check whether it should execute for the active profile. If the profile excludes the hook, it exits 0 immediately.

#### Profile Model

- **minimal** — `block-no-verify` only (safety floor)
- **standard** — adds `protect-config`, `quality-gate`, `pre-compact-state` (default)
- **strict** — adds `cost-tracker`

Profiles are additive. Each higher tier includes all hooks from lower tiers.

#### Hook Conventions

- **Exit codes:** 0 = allow/warn (stderr shown to agent), 2 = block tool call, other = error (fail-open)
- **Input:** JSON on stdin per Claude Code hook protocol (tool name, input, context)
- **Fail-open:** All hooks wrap their logic in try/catch. Parse errors and unexpected exceptions log to stderr and exit 0. Only deliberate policy violations exit 2.
- **Stdin cap:** Hooks should handle truncated input gracefully. Security-sensitive hooks (`protect-config`) should block on truncated input rather than risk bypassing checks.
- **Idempotency:** `harness hooks init` can be run multiple times safely. It overwrites hook scripts and merges settings without duplicating entries.

#### Protected Config Files (for `protect-config.js`)

`.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `biome.json`, `biome.jsonc`, `.ruff.toml`, `ruff.toml`, `.stylelintrc*`, `.markdownlint*`, `deno.json`

Note: `pyproject.toml` is excluded because it contains project metadata alongside linter config. `tsconfig.json` is excluded because legitimate changes are common.

#### Quality Gate Auto-Detection (for `quality-gate.js`)

Checks in order, runs the first match:

1. `biome.json` or `biome.jsonc` exists → `biome check`
2. `.prettierrc*` or `prettier.config.*` exists → `prettier --check`
3. `.ruff.toml` or `ruff.toml` exists → `ruff check`
4. Edited file is `.go` → `gofmt -l`

Warns on stderr with violation details. Never blocks (exit 0 always).

---

### Feature 2: New Security Scanner Categories

#### Approach: Extend Existing Registry

The existing `SecurityScanner` uses `RuleRegistry` with `SecurityRule` objects that have `patterns: RegExp[]`. New rules follow this exact interface — no interface changes needed. The existing `SecurityRule` type:

```typescript
// packages/core/src/security/types.ts — EXISTING, unchanged
interface SecurityRule {
  id: string;
  name: string;
  category: SecurityCategory;
  severity: SecuritySeverity; // 'error' | 'warning' | 'info'
  confidence: SecurityConfidence; // 'high' | 'medium' | 'low'
  patterns: RegExp[];
  fileGlob?: string; // Optional file targeting
  stack?: string[]; // Optional stack filtering
  message: string;
  remediation: string;
  references?: string[]; // CWE/OWASP references go here
}
```

#### Type Extension

The only type change is extending `SecurityCategory` to include the two new categories:

```typescript
// packages/core/src/security/types.ts — MODIFIED
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

All existing rules, the registry, the scanner, and the config system continue to work unchanged.

#### New Rules

**New secret rules (6 rules) — added to existing `secrets.ts` or split into adjacent files:**

Existing secret rules already cover AWS keys (SEC-SEC-001), generic API keys (SEC-SEC-002), private keys (SEC-SEC-003), passwords (SEC-SEC-004), and JWT tokens (SEC-SEC-005). New rules fill specific gaps:

| ID          | Name                        | Pattern                                                 | References |
| ----------- | --------------------------- | ------------------------------------------------------- | ---------- |
| SEC-SEC-006 | Anthropic API keys          | `sk-ant-api03-` prefix                                  | CWE-798    |
| SEC-SEC-007 | OpenAI API keys             | `sk-proj-` prefix (with length check)                   | CWE-798    |
| SEC-SEC-008 | Google API keys             | `AIza` prefix followed by 35 alphanumeric chars         | CWE-798    |
| SEC-SEC-009 | GitHub PATs                 | `ghp_`, `gho_`, `ghu_`, `ghs_` prefixes                 | CWE-798    |
| SEC-SEC-010 | Stripe keys                 | `sk_live_`, `pk_live_`, `rk_live_` prefixes             | CWE-798    |
| SEC-SEC-011 | Database connection strings | URI schemes with embedded credentials (`://user:pass@`) | CWE-798    |

**Agent config rules (7 rules) — new file `rules/agent-config.ts`:**

| ID          | Name                      | Pattern                                                                       | fileGlob                                  | References |
| ----------- | ------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| SEC-AGT-001 | Hidden Unicode            | Zero-width characters (U+200B, U+200C, U+200D, U+FEFF, U+2060)                | `**/CLAUDE.md,**/AGENTS.md,**/*.yaml`     | CWE-116    |
| SEC-AGT-002 | URL execution directives  | `curl`, `wget`, `fetch(` instructions in agent config                         | `**/CLAUDE.md,**/AGENTS.md`               | CWE-94     |
| SEC-AGT-003 | Wildcard tool permissions | `Bash(*)`, `Write(*)`, `Edit(*)` in settings                                  | `**/.claude/**,**/settings*.json`         | CWE-250    |
| SEC-AGT-004 | Auto-approve patterns     | `autoApprove`, `auto_approve` in config                                       | `**/.claude/**,**/.mcp.json`              | CWE-862    |
| SEC-AGT-005 | Prompt injection surface  | `${`, `&#123;&#123;`, template interpolation in skill YAML description fields | `**/skill.yaml`                           | CWE-94     |
| SEC-AGT-006 | Permission bypass flags   | `--dangerously-skip-permissions`, `--no-verify`                               | `**/CLAUDE.md,**/AGENTS.md,**/.claude/**` | CWE-863    |
| SEC-AGT-007 | Hook injection surface    | `$()`, backticks, `&&`, `\|\|` in hook command values                         | `**/settings*.json,**/hooks.json`         | CWE-78     |

**MCP security rules (5 rules) — new file `rules/mcp.ts`:**

| ID          | Name                        | Pattern                                           | fileGlob       | References |
| ----------- | --------------------------- | ------------------------------------------------- | -------------- | ---------- |
| SEC-MCP-001 | Hardcoded MCP secrets       | API key/token/password patterns in MCP env blocks | `**/.mcp.json` | CWE-798    |
| SEC-MCP-002 | Shell injection in MCP args | Shell metacharacters in `args` arrays             | `**/.mcp.json` | CWE-78     |
| SEC-MCP-003 | Network exposure            | `0.0.0.0` or `*` as bind address                  | `**/.mcp.json` | CWE-668    |
| SEC-MCP-004 | Typosquatting vector        | `npx -y` in MCP command field                     | `**/.mcp.json` | CWE-427    |
| SEC-MCP-005 | Unencrypted transport       | `http://` (not `https://`) in MCP server URLs     | `**/.mcp.json` | CWE-319    |

#### File Layout

New files only — no restructuring of existing rules:

```
packages/core/src/security/rules/
  agent-config.ts                  # NEW — SEC-AGT-001 through SEC-AGT-007
  mcp.ts                           # NEW — SEC-MCP-001 through SEC-MCP-005
  secrets.ts                       # MODIFIED — add SEC-SEC-006 through SEC-SEC-011
```

#### Scanner Integration

Minimal changes to `scanner.ts`:

```typescript
// packages/core/src/security/scanner.ts — add imports and registration
import { agentConfigRules } from './rules/agent-config';
import { mcpRules } from './rules/mcp';

// In constructor, add alongside existing registerAll calls:
this.registry.registerAll([...agentConfigRules, ...mcpRules]);
```

The existing `scanContent()` method already handles all rules generically via `rule.patterns` iteration. New rules use `fileGlob` to limit which files they scan — the scanner already supports this (rules without `fileGlob` apply to all files; rules with `fileGlob` are filtered by `scanFile`).

**Note:** The current `scanContent()` does not filter by `fileGlob` — it applies all active rules to all content. To make `fileGlob` functional, `scanFile()` needs a small change to filter `this.activeRules` by matching the file path against each rule's `fileGlob` before scanning. This is the only behavioral change to the scanner.

#### Config Integration

The existing `harness.config.json` security config already supports per-rule overrides:

```json
{
  "security": {
    "rules": {
      "SEC-AGT-003": "warning",
      "SEC-MCP-004": "off"
    }
  }
}
```

No config schema changes needed — `RuleOverride` already supports `'off' | SecuritySeverity`.

#### SecurityAgent (Review Pipeline) — No Changes

The inline detectors in `security-agent.ts` are left as-is. They operate on `ContextBundle` (changed files) and produce `ReviewFinding[]` with `cweId`, `owaspCategory`, `confidence`, and `evidence` fields. These serve review-time diff analysis. The `SecurityScanner` serves project-wide scanning. Consolidating them is a separate concern.

---

## Success Criteria

### Feature 1: `harness hooks`

1. When `harness hooks init` is run, hook scripts are installed to `.harness/hooks/` and `.claude/settings.json` is configured with correct hook entries
2. When `harness hooks init --profile minimal` is run, only `block-no-verify` is active
3. When `harness hooks init --profile strict` is run, all 5 hooks are active
4. When `harness hooks list` is run, it shows installed hooks and active profile
5. When `harness hooks remove` is run, all harness-managed hooks and settings entries are cleanly removed
6. When a hook receives valid input, it exits with the correct code (0 = allow/warn, 2 = block)
7. When a hook receives malformed input, it fails open (exit 0) and logs to stderr
8. When `protect-config.js` detects an edit to a protected config file, it blocks with exit 2
9. When `quality-gate.js` runs, it auto-detects at least one formatter/linter and warns on violations
10. When `harness hooks init` is run twice, the result is identical to running it once

### Feature 2: New Security Scanner Categories

1. When `SecurityCategory` type is extended, all existing rule files and tests compile without changes
2. When the 6 new secret rules are added to `secrets.ts`, each fires on its specific pattern and includes CWE references
3. When the 7 agent config rules scan CLAUDE.md containing hidden Unicode, SEC-AGT-001 fires
4. When the 5 MCP rules scan `.mcp.json` with `npx -y`, SEC-MCP-004 fires
5. When `fileGlob` filtering is added to `scanFile()`, agent-config rules only run against agent config files (not source code)
6. When a rule severity is set to `"off"` in `harness.config.json`, that rule produces no findings
7. When secret rules scan test fixtures and documentation, no false positives are produced (exclude patterns work)
8. When `harness:security-scan` runs, it reports findings from all categories including the new ones

---

## Implementation Order

**Phase 1: New security rule categories**

- Extend `SecurityCategory` type with `'agent-config'` and `'mcp'`
- Create `rules/agent-config.ts` with 7 rules following existing `SecurityRule` format
- Create `rules/mcp.ts` with 5 rules following existing `SecurityRule` format
- Add 6 new patterns to `rules/secrets.ts` (SEC-SEC-006 through SEC-SEC-011)
- Register new rules in `scanner.ts` constructor
- Add `fileGlob` filtering to `scanFile()` so agent-config and MCP rules only run against relevant files
- Test all 18 new rules against fixture files

**Phase 2: Hook scripts**

- Implement the 5 hook scripts with correct exit code behavior
- Define profile model in `profiles.ts`
- Test each hook in isolation (correct exit codes, input parsing, fail-open on errors)

**Phase 3: `harness hooks` CLI command**

- Create `packages/cli/src/commands/hooks/index.ts` with `createHooksCommand()` (follows existing ci/, state/, skill/ pattern)
- Implement `init` subcommand with `.claude/settings.json` merge logic
- Implement `list` and `remove` subcommands
- Idempotency handling (detect existing hooks, overwrite scripts, merge settings)
- Integration test: init → list → remove cycle

**Phase 4: Documentation and integration**

- Add security rule reference to `docs/reference/`
- Add hook documentation to `docs/guides/`
- Update AGENTS.md with hook and security scanner sections
- Update harness templates to mention `harness hooks init` as post-init step
