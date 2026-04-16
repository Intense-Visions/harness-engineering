# Agent Config Validation

**Date:** 2026-04-16
**Status:** Approved
**Keywords:** agnix, CLAUDE.md, hooks, skills, agents, validate, .agnix.toml, linting, agent-configs

## Overview

Harness generates CLAUDE.md, agent YAMLs, skills, and hook wiring during `harness init` and the various `generate-*` commands, but it has no mechanical check that those generated artifacts stay valid as users edit them. A typo in a hook command, an unreachable skill, or a CLAUDE.md that has grown to the size of a novel can silently degrade AI agent behavior.

This change adds `harness validate --agent-configs`, a hybrid validator that delegates to the [agnix](https://github.com/agent-sh/agnix) binary when it is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP) and falls back to ~20 high-value TypeScript rules when it is not. A `.agnix.toml` template is dropped into projects during `harness init` so the agnix path works with zero additional configuration.

### Goals

1. `harness validate --agent-configs` finds broken agent configs (missing hook commands, unreachable skills, oversize CLAUDE.md, invalid frontmatter) in every harness project — no extra install required.
2. When `agnix` is on the PATH, harness shells out to it so users get the full 385-rule catalogue without harness maintaining a 385-rule linter.
3. When `agnix` is absent, a built-in TypeScript fallback catches the ~20 most impactful issues so CI still gets value with no external dependency.
4. `harness init` ships a sensible `.agnix.toml` so the binary path is configured correctly on first run.
5. Output integrates cleanly with the existing `harness validate` command's JSON/text/quiet/verbose modes and exit codes.

### Non-Goals

- Reimplementing all 385 agnix rules in TypeScript — the fallback intentionally covers the highest-value subset and defers breadth to the external binary.
- Auto-fix in the fallback path — `agnix --fix` stays the canonical fix path. The fallback is detect-only.
- Installing agnix automatically (users opt in via `brew install agnix-cli` / `cargo install agnix-cli` / `npm i -g agnix`).
- Adding new validation surfaces beyond `.claude/`, `CLAUDE.md`, `agents/`, `AGENTS.md`, `.gemini/`, and hook wiring — other configs (eslint, TS) remain out of scope.
- SARIF export, LSP integration, or editor plugins — agnix already handles those; harness does not duplicate them.

## Decisions

| Decision                    | Choice                                                                                                               | Rationale                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Invocation shape            | `harness validate --agent-configs` (new flag on existing `validate` command)                                         | Keeps agent config checks in the same mental slot as other validations; composable with `--cross-check`    |
| Hybrid strategy             | Prefer `agnix` on PATH → fall back to TS rules → emit hint when falling back                                         | Gives power users the full 385-rule catalogue while ensuring zero-install CI coverage                      |
| Binary discovery            | `which agnix` / `where agnix.exe`, `--agnix-bin <path>` override, `HARNESS_AGNIX_BIN` env var                        | Matches the patterns used by other tool-shelling commands (e.g. how `harness:verify` discovers `pnpm`)     |
| Agnix invocation            | `agnix --format json <cwd>` with 30s timeout; parse JSON diagnostics                                                 | JSON is the machine-readable contract; text format is for humans only                                      |
| Fallback rule set (~20)     | Broken agent references, invalid hook commands, unreachable skills, oversize CLAUDE.md, missing frontmatter          | Each rule catches a class of bug observed in harness support channels or correlated with AI-agent breakage |
| Config file shipped by init | `.agnix.toml` at project root with `target = "claude-code"`, `max_files = 10000`, conservative `disabled_rules = []` | Zero-config success for `agnix .`; users can expand from a working baseline                                |
| Exit-code semantics         | `0` no issues, `1` issues found, `2` tool failure (e.g. agnix crashed)                                               | Matches convention of other harness validators (`check-security`, `check-arch`)                            |
| `--strict` interpretation   | Passed through to agnix (`--strict`); in fallback mode treats warnings as errors                                     | Preserves agnix semantics when available; mirrors them in fallback                                         |
| JSON output schema          | `{ engine: "agnix" \| "fallback", valid, issues: Array<{ file, line?, ruleId?, severity, message, suggestion? }> }`  | One shape regardless of engine so downstream consumers (CI, dashboard) do not branch on engine             |
| Location of validator code  | `packages/core/src/validation/agent-configs/` (engine, rules, types); CLI wires flag in `commands/validate.ts`       | Keeps validation logic in `core` (reusable by MCP), CLI only handles output formatting                     |
| Timeout behaviour           | If agnix exceeds 30s, kill it and fall back with a `tool-timeout` warning                                            | Protects `validate` SLA; users can still get partial signal from fallback rules                            |

## Technical Design

### Flag surface

```bash
# New flag on the existing validate command
harness validate --agent-configs [--strict] [--agnix-bin <path>]
harness validate --agent-configs --json           # machine-readable
harness validate --cross-check --agent-configs    # composable with other flags
```

Environment variable overrides:

- `HARNESS_AGNIX_BIN` — absolute path to agnix binary (takes precedence over PATH discovery)
- `HARNESS_AGNIX_DISABLE=1` — force fallback path even if agnix is available (useful for testing)

### Hybrid engine flow

```
┌────────────────────────┐
│ validate --agent-configs│
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐    found     ┌────────────────────────┐
│ resolveAgnixBinary()    ├─────────────▶│ runAgnix(cwd, strict)   │
└──────────┬─────────────┘              └──────────┬─────────────┘
           │ not found / HARNESS_AGNIX_DISABLE     │
           ▼                                       │ parse JSON
┌────────────────────────┐                         ▼
│ runFallbackRules(cwd)   │               ┌────────────────────────┐
└──────────┬─────────────┘                │ normalized diagnostics │
           │                              └──────────┬─────────────┘
           ▼                                         │
┌────────────────────────────────────────────────────┴─────────────┐
│ AgentConfigValidation { engine, valid, issues, fellBackBecause? } │
└───────────────────────────────────────────────────────────────────┘
```

### Fallback rule catalogue (~20 rules)

Each rule emits a diagnostic shaped like an agnix diagnostic for a uniform schema.

| Rule ID                               | Target                                           | What it checks                                                                         |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `HARNESS-AC-001 claude-md-size`       | `CLAUDE.md`, `AGENTS.md`                         | Warn if >20 KB, error if >50 KB (agent context budgets degrade at scale)               |
| `HARNESS-AC-002 claude-md-empty`      | `CLAUDE.md`                                      | File exists but is blank / only whitespace                                             |
| `HARNESS-AC-003 claude-md-h1`         | `CLAUDE.md`                                      | Missing a top-level `#` heading                                                        |
| `HARNESS-AC-010 agent-frontmatter`    | `agents/**/*.md`                                 | Agent definition missing or malformed YAML frontmatter                                 |
| `HARNESS-AC-011 agent-name`           | `agents/**/*.md`                                 | Frontmatter missing `name` or mismatched with file name                                |
| `HARNESS-AC-012 agent-description`    | `agents/**/*.md`                                 | Frontmatter `description` missing or under 20 chars (can't win routing)                |
| `HARNESS-AC-020 hook-command-exists`  | `.claude/settings.json`, `.gemini/settings.json` | Referenced hook command script does not exist on disk                                  |
| `HARNESS-AC-021 hook-event-valid`     | Settings files                                   | `event` field is not a known hook event                                                |
| `HARNESS-AC-022 hook-matcher-regex`   | Settings files                                   | `matcher` regex is malformed                                                           |
| `HARNESS-AC-030 skill-reachable`      | `agents/skills/**/SKILL.md`                      | Skill file exists but is not referenced by any persona or command                      |
| `HARNESS-AC-031 skill-frontmatter`    | `agents/skills/**/SKILL.md`                      | Skill frontmatter missing `name`/`description`                                         |
| `HARNESS-AC-032 skill-name-match`     | `agents/skills/**/SKILL.md`                      | Frontmatter `name` does not match directory name                                       |
| `HARNESS-AC-040 mcp-server-shape`     | `.mcp.json`, `.gemini/settings.json`             | MCP server entry missing `command` or has unknown keys                                 |
| `HARNESS-AC-041 mcp-args-array`       | Same                                             | `args` is not an array of strings                                                      |
| `HARNESS-AC-050 agents-md-sections`   | `AGENTS.md`                                      | Missing one of the required sections (covered by existing `validateAgentsMap`, reused) |
| `HARNESS-AC-060 command-file-exists`  | `agents/commands/**`                             | Referenced slash command file is missing                                               |
| `HARNESS-AC-070 settings-json-valid`  | Any `settings.json`                              | File is not valid JSON                                                                 |
| `HARNESS-AC-080 persona-skill-exists` | `agents/personas/*.yaml`                         | Persona references a skill directory that does not exist                               |
| `HARNESS-AC-090 agnix-toml-valid`     | `.agnix.toml`                                    | File is present but not valid TOML (parse error)                                       |
| `HARNESS-AC-091 agnix-toml-target`    | `.agnix.toml`                                    | `target`/`tools` mismatch (e.g. references unknown tool slug)                          |

Severity defaults: size/presence issues → `error`, stylistic → `warning`. `--strict` promotes warnings to errors.

### Diagnostic schema

```ts
export interface AgentConfigFinding {
  engine: 'agnix' | 'fallback';
  file: string; // relative to cwd
  line?: number;
  column?: number;
  ruleId: string; // e.g. "CC-MEM-006" from agnix or "HARNESS-AC-010"
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface AgentConfigValidation {
  engine: 'agnix' | 'fallback';
  valid: boolean;
  fellBackBecause?: 'binary-not-found' | 'tool-timeout' | 'tool-failure' | 'env-disabled';
  issues: AgentConfigFinding[];
}
```

### Module layout

```
packages/core/src/validation/agent-configs/
  index.ts                     # public re-exports
  types.ts                     # AgentConfigFinding, AgentConfigValidation
  runner.ts                    # validateAgentConfigs(cwd, options) orchestrator
  agnix-runner.ts              # resolveAgnixBinary, runAgnix, parseAgnixOutput
  fallback/
    index.ts                   # runFallbackRules(cwd) → findings[]
    rule-claude-md.ts          # HARNESS-AC-00x (size, empty, h1)
    rule-agents.ts             # HARNESS-AC-01x (agent frontmatter)
    rule-hooks.ts              # HARNESS-AC-02x (hook commands / events)
    rule-skills.ts             # HARNESS-AC-03x (skills reachable / frontmatter)
    rule-mcp.ts                # HARNESS-AC-04x (MCP server shape)
    rule-agents-md.ts          # HARNESS-AC-050 (delegates to existing validator)
    rule-commands.ts           # HARNESS-AC-060 (referenced command file exists)
    rule-settings-json.ts      # HARNESS-AC-070 (settings.json valid JSON)
    rule-personas.ts           # HARNESS-AC-080 (persona references)
    rule-agnix-toml.ts         # HARNESS-AC-09x (.agnix.toml sanity)
packages/cli/src/commands/
  validate.ts                  # adds --agent-configs wiring, formatter section
templates/base/
  .agnix.toml.hbs              # shipped by harness init
```

### Agnix invocation details

```ts
// packages/core/src/validation/agent-configs/agnix-runner.ts
import { spawn } from 'node:child_process';

const AGNIX_TIMEOUT_MS = 30_000;

export async function runAgnix(cwd: string, strict: boolean, binPath: string) {
  return new Promise<AgnixResult>((resolve) => {
    const args = ['--format', 'json'];
    if (strict) args.push('--strict');
    args.push(cwd);

    const child = spawn(binPath, args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ kind: 'timeout' });
    }, AGNIX_TIMEOUT_MS);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ kind: 'spawn-error', stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // agnix exits 0 clean, 1 issues, 2 usage error
      if (code === 0 || code === 1) resolve({ kind: 'ok', code, stdout });
      else resolve({ kind: 'tool-failure', code: code ?? -1, stderr });
    });
  });
}
```

Parsing treats unparseable JSON as `tool-failure` and falls back.

### CLI wiring

`packages/cli/src/commands/validate.ts` gains a new `--agent-configs` flag. When set, after the existing checks run, it invokes `validateAgentConfigs(cwd, { strict: globalOpts.strict, agnixBin: opts.agnixBin })` and merges the returned issues into the formatter output. The JSON path includes an `agentConfigs` section. Exit code remains the max of existing `validate` exit and `agent-configs` exit so `--agent-configs` cannot lower an already-failing validate.

### `.agnix.toml` template

Shipped at `templates/base/.agnix.toml.hbs` (non-hbs content — static file but placed under templates for the existing `TemplateEngine` write pipeline):

```toml
# harness-engineering: agnix configuration
# Full reference: https://agent-sh.github.io/agnix/docs/configuration
target = "claude-code"
strict = false
max_files = 10000
locale = "en"

[rules]
disabled_rules = []
```

The template is listed in `templates/base/template.json` so it is copied alongside `AGENTS.md.hbs` during `harness init`. Existing projects can adopt it via `harness validate --agent-configs --write-agnix-toml` (optional convenience flag, deferred to follow-up).

### Test strategy

- `packages/core/tests/validation/agent-configs/fallback.test.ts` — one test per rule on a fixture directory
- `packages/core/tests/validation/agent-configs/agnix-runner.test.ts` — mocked `spawn`, verifies timeout / parse-error / happy path
- `packages/core/tests/validation/agent-configs/runner.test.ts` — selection logic (binary found / not found / env-disabled / timeout)
- `packages/cli/tests/commands/validate.test.ts` — extend existing suite with `--agent-configs` JSON and text outputs
- `packages/cli/tests/commands/init.test.ts` — assert `.agnix.toml` is written to scaffolded project root

## Success Criteria

1. `harness validate --agent-configs` returns exit 0 on a clean repo, 1 when fallback rules fire, 2 only when the engine itself fails.
2. When `agnix` is on PATH, `harness validate --agent-configs` reports `engine: "agnix"` in JSON output and contains rule IDs from the agnix catalogue.
3. When `agnix` is absent, the command reports `engine: "fallback"`, `fellBackBecause: "binary-not-found"`, and still returns meaningful diagnostics for the ~20 fallback rules.
4. When `HARNESS_AGNIX_DISABLE=1` is set, the command always runs the fallback path even if agnix is installed.
5. When `agnix` exceeds the 30s timeout, the command falls back with `fellBackBecause: "tool-timeout"` and still emits fallback diagnostics.
6. Each of the 20 fallback rules has a dedicated fixture-driven test proving the rule fires on a bad example and stays silent on a good one.
7. `harness init` creates `.agnix.toml` in the project root with `target = "claude-code"` and runs cleanly against a fresh scaffold (i.e. `agnix .` passes on a freshly-initialized project when agnix is installed).
8. `harness validate --agent-configs --json` emits a schema matching `AgentConfigValidation` and is stable across engine choice.
9. `--strict` promotes fallback `warning` diagnostics to `error` and passes `--strict` through to agnix.
10. `harness validate` without `--agent-configs` behaves exactly as before (flag is fully opt-in).

## Implementation Order

1. **Phase 1 — Core types and agnix runner.** Add `AgentConfigFinding`/`AgentConfigValidation` types, implement `resolveAgnixBinary`, `runAgnix`, and `parseAgnixOutput` with unit tests. No CLI wiring yet.
2. **Phase 2 — Fallback rules.** Implement `runFallbackRules` and each of the 20 rules with fixture-based tests. Wire rule registry.
3. **Phase 3 — Orchestrator.** Implement `validateAgentConfigs(cwd, options)` which selects engine, handles timeouts/fallback, normalizes diagnostics. Unit tests for selection and fallback cases.
4. **Phase 4 — CLI integration.** Add `--agent-configs`, `--agnix-bin` flags to `validate` command. Extend JSON and text formatters. Update exit-code merging.
5. **Phase 5 — `.agnix.toml` template.** Add file to `templates/base/`, ensure it is copied by the template engine and picked up on init. Add init test.
6. **Phase 6 — Docs and roadmap.** Update CHANGELOG, close ACE-B2 line in roadmap, add usage snippet to docs.
