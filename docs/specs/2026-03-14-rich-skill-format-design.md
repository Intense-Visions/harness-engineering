# Rich Skill Format & Infrastructure — Design Specification

**Date:** 2026-03-14
**Status:** Approved
**Depends on:** Phase 3 (Templates, Personas, MCP Server)

## Overview

Harness Engineering becomes a fully self-contained toolkit by shipping 21 integrated skills covering both harness-specific enforcement and general dev-process workflows. Skills are consumed via Claude Code / Gemini CLI (as platform skills), the `harness` CLI (`harness skill run`), and the MCP server (`run_skill` tool).

This spec defines the rich skill format, infrastructure (CLI, MCP, state management, validation), and the complete 21-skill inventory. Individual skill content (full SKILL.md files) will be specced and implemented in separate batches.

## Decisions

- Single unified skill format replaces the existing thin `skill.yaml` + `prompt.md` + `README.md` structure.
- New format: `skill.yaml` (machine-readable metadata) + `SKILL.md` (behavioral instructions + documentation, single source of truth).
- All 11 existing skills upgraded to the rich format. 10 new skills added.
- Skills are accessible via three surfaces: AI platform skills, CLI commands, MCP tools.
- Persistent state management (`.harness/`) for skills that need cross-session continuity.
- Approach: All 21 skills created at once for consistency. Infrastructure + skill.yaml + SKILL.md stubs first, then full SKILL.md content in separate batches.
- Existing `shared/` prompt fragments are inlined into SKILL.md during migration (fragments eliminated as a concept).
- Skills live once in `claude-code/`; Gemini CLI gets symlinks or generated copies with platform-specific adaptations (not a full mirror directory).
- `rigid` vs `flexible` is a linting/documentation concern, not runtime enforcement. The AI agent follows the SKILL.md instructions; `type` determines which sections are required.
- `harness agent run` (existing) runs agent tasks/personas. `harness skill run` (new) loads skill prompts for AI consumption. Different purposes, both coexist.

## Sources

This design synthesizes patterns from three systems:

- **Superpowers** — Rigid behavioral workflows (TDD, debugging, code review), subagent dispatch, verification discipline
- **GSD (Get Shit Done)** — Goal-backward verification (3-level: exists/substantive/wired), persistent state across sessions, codebase mapping, phase lifecycle, debug session persistence
- **Ralph Loop** — Fresh context per iteration, append-only learnings, AGENTS.md as evolving knowledge base, task sizing ("fit in one context window")

---

## Section 1: Rich Skill Format

### Schema Migration (existing -> new)

| Field         | Existing                                    | New                                            | Change                              |
| ------------- | ------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| `version`     | `string` (semver `"1.0.0"`)                 | `string` (semver `"1.0.0"`)                    | No change                           |
| `platform`    | `string` (single)                           | `platforms: string[]` (array)                  | Renamed, scalar to array            |
| `category`    | `enum` (enforcement/workflow/entropy/setup) | Removed                                        | Replaced by `type: rigid\|flexible` |
| `cli_command` | `string` (optional)                         | `cli: { command, args[] }`                     | Restructured                        |
| `includes`    | `string[]` (shared fragment refs)           | Removed                                        | Fragments inlined into SKILL.md     |
| `triggers`    | `enum` (manual/on_pr/on_commit)             | `string[]` (expanded set)                      | New values added                    |
| New fields    | —                                           | `type`, `phases`, `state`, `depends_on`, `mcp` | Added                               |

### Allowed Values

**Triggers:** `manual`, `on_pr`, `on_commit`, `on_new_feature`, `on_bug_fix`, `on_refactor`, `on_project_init`, `on_review`

**Platforms:** `claude-code`, `gemini-cli`

**Type:** `rigid`, `flexible`

### Zod Schema

```typescript
const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const SkillCliSchema = z.object({
  command: z.string(),
  args: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean().default(false),
      })
    )
    .default([]),
});

const SkillMcpSchema = z.object({
  tool: z.string(),
  input: z.record(z.string()),
});

const SkillStateSchema = z.object({
  persistent: z.boolean().default(false),
  files: z.array(z.string()).default([]),
});

const ALLOWED_TRIGGERS = [
  'manual',
  'on_pr',
  'on_commit',
  'on_new_feature',
  'on_bug_fix',
  'on_refactor',
  'on_project_init',
  'on_review',
] as const;

const ALLOWED_PLATFORMS = ['claude-code', 'gemini-cli'] as const;

export const SkillMetadataSchema = z.object({
  name: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
  triggers: z.array(z.enum(ALLOWED_TRIGGERS)),
  platforms: z.array(z.enum(ALLOWED_PLATFORMS)),
  tools: z.array(z.string()),
  cli: SkillCliSchema.optional(),
  mcp: SkillMcpSchema.optional(),
  type: z.enum(['rigid', 'flexible']),
  phases: z.array(SkillPhaseSchema).optional(),
  state: SkillStateSchema.default({}),
  depends_on: z.array(z.string()).default([]),
});
```

### `skill.yaml` Example

```yaml
name: harness-tdd
version: '1.0.0'
description: Test-driven development integrated with harness validation

# Discovery & activation
triggers:
  - manual
  - on_new_feature
  - on_bug_fix
platforms:
  - claude-code
  - gemini-cli

# AI agent tooling
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob

# CLI integration
cli:
  command: harness skill run harness-tdd
  args:
    - name: path
      description: Project root path
      required: false

# MCP integration
mcp:
  tool: run_skill
  input:
    skill: harness-tdd
    path: string

# Behavioral metadata
type: rigid # rigid | flexible
phases: # Optional: multi-phase skills declare phases
  - name: red
    description: Write failing test
  - name: green
    description: Implement minimal code
  - name: refactor
    description: Clean up while keeping tests green
state:
  persistent: false # Whether skill uses harness-state-management
  files: [] # State files this skill reads/writes
depends_on: [] # Other skills this skill may invoke
```

### `SKILL.md` Structure

Every `SKILL.md` follows required sections enforced by linting:

```markdown
# Skill Name

> One-line description of what this skill does and when to use it.

## When to Use

- Trigger conditions
- NOT conditions (when to use something else)

## Process

- Step-by-step behavioral instructions
- For rigid skills: exact phases with gates
- For flexible skills: guidelines with adaptation points

## Harness Integration

- Which harness CLI commands this skill uses
- How results feed back into the process

## Success Criteria

- Observable outcomes that indicate the skill was applied correctly

## Examples

- At least one concrete example showing the skill in action
```

Additional required sections for rigid skills:

- `## Gates` — Hard stops that prevent proceeding
- `## Escalation` — When to stop and ask for help

### File Layout

```
skill-name/
  skill.yaml    # Machine-readable metadata
  SKILL.md      # Behavioral instructions + documentation (single source of truth)
```

Two files per skill. `skill.yaml` for machines, `SKILL.md` for humans and AI agents.

### Validation Rules

- `skill.yaml` parses against Zod schema
- `SKILL.md` contains required sections: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`
- `type: rigid` skills must have `## Gates` and `## Escalation` sections
- `depends_on` references exist as real skill names
- `cli.command` and `mcp.tool` are consistent with registered tools
- `triggers` values are from allowed set
- `platforms` values are from allowed set

---

## Section 2: Infrastructure

### CLI Integration

New command group added to `packages/cli/`:

```
harness skill list                    # List all available skills
harness skill run <name> [--path .]   # Load skill content with project context for AI consumption
harness skill validate                # Validate all skills (schema + SKILL.md structure)
harness skill info <name>             # Show skill metadata + description
```

`harness skill run` outputs the skill's `SKILL.md` content with injected project context (harness config, current state if `state.persistent: true`). It does not execute AI behavior — it provides the prompt for an AI agent to follow.

### MCP Integration

One new MCP tool added to `packages/mcp-server/`:

```json
{
  "name": "run_skill",
  "description": "Load a harness skill for AI agent consumption",
  "inputSchema": {
    "type": "object",
    "properties": {
      "skill": { "type": "string", "description": "Skill name" },
      "path": { "type": "string", "description": "Project root path" }
    },
    "required": ["skill"]
  }
}
```

Returns `SKILL.md` content with injected project context.

### State Management Infrastructure

Skills opt in to persistent state via `state.persistent: true` in `skill.yaml`.

State lives in `.harness/` at the project root:

```
.harness/
├── state.json           # Project-level state (position, decisions, progress)
├── debug/               # Persistent debug sessions
│   ├── active/
│   └── resolved/
└── learnings.md         # Append-only knowledge capture
```

State API added to `@harness-engineering/core`:

```typescript
interface HarnessState {
  schemaVersion: 1; // For future migration
  position: { phase?: string; task?: string };
  decisions: Array<{ date: string; decision: string; context: string }>;
  blockers: Array<{ id: string; description: string; status: 'open' | 'resolved' }>;
  progress: Record<string, 'pending' | 'in_progress' | 'complete'>;
  lastSession: { date: string; summary: string };
}

async function loadState(projectPath: string): Promise<Result<HarnessState, Error>>;
async function saveState(projectPath: string, state: HarnessState): Promise<Result<void, Error>>;
async function appendLearning(projectPath: string, learning: string): Promise<Result<void, Error>>;
```

**Error handling:**

- Missing `.harness/state.json`: `loadState` returns a default empty state (not an error). State is created on first `saveState`.
- Corrupted/unparseable JSON: Returns `Err` with message including file path.
- Schema version mismatch: Returns `Err` with migration guidance message. Future versions may auto-migrate.
- Skills with `state.persistent: true` may also read/write custom files listed in `state.files`. These are managed by the skill itself, not the core API.

CLI commands:

```
harness state show                    # Show current state
harness state reset                   # Reset state (with confirmation)
harness state learn <message>         # Append a learning
```

### Directory Structure

Skills live once in `claude-code/`. Each skill's `skill.yaml` declares `platforms: [claude-code, gemini-cli]`. The Gemini CLI directory contains symlinks or generated platform-specific adaptations (not a full copy of every skill).

```
agents/skills/
├── claude-code/               # Primary skill directory (all 21 skills)
│   ├── harness-tdd/
│   │   ├── skill.yaml
│   │   └── SKILL.md
│   ├── harness-debugging/
│   │   ├── skill.yaml
│   │   └── SKILL.md
│   └── ... (21 skills)
├── gemini-cli/                # Platform adaptations only (symlinks + overrides)
├── tests/
│   ├── schema.test.ts         # skill.yaml validation (replaces existing schema.ts)
│   ├── structure.test.ts      # SKILL.md required sections (replaces prompt-lint.test.ts)
│   └── references.test.ts     # depends_on, cli, mcp consistency (replaces includes.test.ts)
├── package.json
├── tsconfig.json
└── vitest.config.mts
```

**Note:** The existing `shared/` directory is removed. Shared prompt fragments are inlined into each SKILL.md during migration. The `includes` field and `includes.test.ts` are eliminated.

### SKILL.md Stubs

During migration (implementation step 5), SKILL.md stubs are created with all required sections present but minimal content. A stub looks like:

```markdown
# Harness TDD

> Test-driven development integrated with harness validation.

## When to Use

- TODO: Full content in skill content batch

## Process

- TODO: Full content in skill content batch

## Harness Integration

- `harness check-deps`, `harness validate`

## Success Criteria

- TODO: Full content in skill content batch

## Examples

- TODO: Full content in skill content batch

## Gates

- TODO: Full content in skill content batch

## Escalation

- TODO: Full content in skill content batch
```

Stubs pass structural validation (all sections present) but contain TODO markers. Full content is written in step 6 (separate specs per batch).

---

## Section 3: The 21 Skills

### Harness-Specific Skills (upgrade existing 11)

#### #1 `validate-context-engineering` — Type: flexible

Validates AGENTS.md structure AND evolves it as codebase changes. Process: Validate -> Detect gaps -> Suggest updates -> Apply with approval. Harness integration: `harness validate`, `harness check-docs`. Inspired by Ralph's dynamic AGENTS.md knowledge base.

#### #2 `enforce-architecture` — Type: rigid

Full architecture enforcement methodology. Process: Load constraints -> Analyze violations -> Explain impact -> Guide resolution. Gates: Cannot approve code with layer violations. Harness integration: `harness check-deps`, eslint-plugin rules.

#### #3 `check-mechanical-constraints` — Type: rigid

Verify and enforce linter rules, boundary schemas, forbidden imports. Process: Run checks -> Categorize violations -> Auto-fix where safe -> Report remaining. Harness integration: `harness validate`, `harness linter validate`.

#### #4 `harness-tdd` — Type: rigid

Red-green-refactor cycle integrated with harness validation. Phases: RED (write failing test) -> GREEN (minimal implementation) -> REFACTOR (clean up) -> VALIDATE (run harness checks). Gates: No production code without failing test. Must watch test fail. Must watch test pass. Harness integration: `harness check-deps` runs during VALIDATE phase.

#### #5 `harness-code-review` — Type: rigid

Full review lifecycle: request -> perform -> respond. Process: Gather context (SHAs, plan) -> Review (harness checks + code quality + spec compliance) -> Report -> Respond to feedback with technical rigor. Harness integration: `harness validate`, `harness check-deps`, `harness check-docs`. Subsumes superpowers' requesting-code-review, code-reviewer, and receiving-code-review.

#### #6 `harness-refactoring` — Type: flexible

Safe refactoring with constraint verification at each step. Process: Identify target -> Verify tests pass -> Refactor incrementally -> Run harness checks after each step -> Commit atomically. Harness integration: `harness validate`, `harness check-deps`.

#### #7 `detect-doc-drift` — Type: flexible

Detect and remediate documentation drift. Process: Run coverage analysis -> Identify stale docs -> Prioritize by impact -> Generate update suggestions. Harness integration: `harness check-docs`, `harness cleanup`.

#### #8 `cleanup-dead-code` — Type: flexible

Entropy analysis + safe cleanup methodology. Process: Analyze entropy -> Categorize (dead code, drift, pattern violations) -> Generate safe fixes -> Apply with verification. Harness integration: `harness cleanup`, `harness fix-drift`.

#### #9 `align-documentation` — Type: flexible

Sync docs with code changes after implementation. Process: Detect changes since last sync -> Map to affected docs -> Generate updates -> Validate links. Harness integration: `harness check-docs`, `harness validate`.

#### #10 `initialize-harness-project` — Type: flexible

Project setup using templates + persona scaffolding + migration guidance. Process: Assess current state -> Recommend adoption level -> Scaffold via templates -> Configure personas -> Generate initial AGENTS.md. Includes migration from existing projects (basic -> intermediate -> advanced). Harness integration: `harness init --level --framework`, `harness persona generate`.

#### #11 `add-harness-component` — Type: flexible

Add layers, docs, components with proper integration. Process: Determine component type -> Validate against constraints -> Scaffold -> Wire into existing architecture -> Update AGENTS.md. Harness integration: `harness add`.

### New Dev-Process Skills (12-18)

#### #12 `harness-brainstorming` — Type: rigid

Design exploration -> spec -> plan, adapted for harness projects. Process: Explore context -> Ask questions one at a time -> Propose 2-3 approaches -> Present design -> Write spec -> Validate spec -> Get approval. Gates: No implementation before design approval (hard gate). Harness integration: Specs go to `docs/`, validated by `harness validate`.

#### #13 `harness-debugging` — Type: rigid

4-phase systematic debugging with entropy analysis and persistent sessions. Phases: INVESTIGATE (entropy analysis feeds into root cause search) -> ANALYZE (pattern matching against codebase) -> HYPOTHESIZE (test one variable at a time) -> FIX (TDD-style with regression test). State: Persistent debug sessions in `.harness/debug/` (survive context resets). Gates: Phase 1 before any fix attempt. After 3 failed fixes, question architecture. Harness integration: `harness cleanup` (entropy analysis in Phase 1).

#### #14 `harness-planning` — Type: rigid

Implementation planning with task sizing, goal-backward must-haves, phase lifecycle. Process: Map file structure -> Decompose into atomic tasks (fit in one context window) -> Derive must-haves from goals -> Write plan -> Validate -> Review. Task sizing rule: Each task fits in one context window (from Ralph). Must-haves derivation: Goal -> Observable truths -> Required artifacts -> Key links (from GSD). Harness integration: Plans reference `harness` commands, validated structure.

#### #15 `harness-verification` — Type: rigid

3-level evidence-based verification. Levels: EXISTS (artifact present) -> SUBSTANTIVE (not a stub, has real implementation) -> WIRED (connected to other artifacts, being used). Anti-pattern scanning: TODO, FIXME, placeholder implementations, unused imports. Gap identification: Structured output for automated gap-closure. Gates: No completion claims without fresh verification evidence. Harness integration: `harness validate`, custom verification commands per project.

#### #16 `harness-parallel-agents` — Type: flexible

Parallel investigation/execution coordination. Process: Identify independent domains -> Create focused agent tasks -> Dispatch in parallel -> Integrate results -> Verify no conflicts -> Run full suite. Constraint: Only for truly independent problems (no shared state).

#### #17 `harness-execution` — Type: rigid

Plan execution with checkpoints and knowledge capture. Process: Load plan -> Execute tasks atomically -> Per-task commits -> Checkpoint protocol for human decisions -> Append learnings between iterations. Checkpoints: human-verify (pause + show), decision (pause + ask), human-action (pause + instruct). State: Updates `.harness/state.json` with position, captures learnings to `.harness/learnings.md`. Harness integration: `harness state`, per-task `harness validate`.

#### #18 `harness-git-workflow` — Type: flexible

Worktree setup + branch finishing. Process: Create worktree -> Install deps -> Verify baseline -> Execute work -> Finish (merge/PR/keep/discard). Worktree directory selection: `.worktrees/` (preferred) -> CLAUDE.md preference -> ask user. Safety: Verify gitignored before creating project-local worktree.

### New Support Skills (19-21)

#### #19 `harness-skill-authoring` — Type: flexible

How to create and extend harness skills. Process: Define purpose -> Choose type (rigid/flexible) -> Write skill.yaml -> Write SKILL.md -> Validate -> Test. Harness integration: `harness skill validate`.

#### #20 `harness-onboarding` — Type: flexible

Navigate existing harness projects + structured codebase mapping. Process: Read AGENTS.md -> Map codebase (stack, architecture, conventions, concerns) -> Understand constraints -> Identify adoption level -> Generate orientation summary. Codebase mapping outputs structured docs (from GSD's mapper). Harness integration: `harness validate` (understand current state), `harness check-docs`.

#### #21 `harness-state-management` — Type: flexible

Persistent project state across sessions. Process: Load state -> Track position/decisions/blockers/progress -> Save state -> Capture learnings. State files: `.harness/state.json`, `.harness/learnings.md`, `.harness/debug/`. Harness integration: `harness state show`, `harness state learn`.

---

## Section 4: Migration & Backwards Compatibility

### Migration from existing skills

The 11 existing thin skills are replaced in-place. No backwards compatibility shim. Old `prompt.md` + `README.md` files are deleted and replaced with `SKILL.md`. `skill.yaml` files are updated with new fields (`cli`, `mcp`, `type`, `phases`, `state`, `depends_on`).

Existing tests updated to validate the new schema and `SKILL.md` structure.

### New infrastructure

- CLI: `harness skill list/run/validate/info` + `harness state show/reset/learn`
- MCP: `run_skill` tool added to `@harness-engineering/mcp-server`
- Core: State management API (`loadState`, `saveState`, `appendLearning`)

### `.harness/` directory

Added to project `.gitignore` templates. State is local by default. Learnings can optionally be committed if teams want shared knowledge.

### Scope boundary

This spec covers:

- Rich skill format (schema + SKILL.md structure)
- Infrastructure (CLI commands, MCP tool, state management, validation)
- Skill inventory (21 skills with behavioral summaries)

This spec does NOT cover:

- Full SKILL.md content for each of the 21 skills (separate specs per batch)
- GSD-style roadmap/phase management
- Ralph-style autonomous loop orchestration

### Implementation order

1. Skill format schema + validation updates
2. State management infrastructure (`.harness/`, core API, CLI commands)
3. CLI `harness skill` commands
4. MCP `run_skill` tool
5. Migrate existing 11 skills to new format (skill.yaml updates + SKILL.md stubs)
6. Write full SKILL.md content for all 21 skills (separate specs, batched)

---

## Success Criteria

- `harness skill validate` passes for all 21 skills
- `harness skill run harness-tdd` outputs SKILL.md with injected project context
- `harness skill list` shows all 21 skills with metadata
- MCP `run_skill` tool returns skill content for any of the 21 skills
- `harness state show` displays current project state from `.harness/state.json`
- `harness state learn "message"` appends to `.harness/learnings.md`
- All skill.yaml files pass Zod schema validation
- All SKILL.md files pass required section linting
- Rigid skills have `## Gates` and `## Escalation` sections
- `depends_on` references resolve to real skill names
