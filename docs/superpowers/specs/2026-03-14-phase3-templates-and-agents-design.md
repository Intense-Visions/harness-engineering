# Phase 3: Templates & Agents — Design Specification

**Date:** 2026-03-14
**Status:** Approved
**Depends on:** Phase 2 (CLI, Core Library, ESLint Plugin, Linter Gen, Agent Skills)

## Overview

Phase 3 delivers two parallel tracks that extend the Harness Engineering toolkit from "tools for existing projects" to "complete project scaffolding and autonomous agent deployment":

- **Track A — Project Templates:** Adoption-level templates (basic, intermediate, advanced) with framework overlays (Next.js first), consumed both standalone and via `harness init`.
- **Track B — Customized Agents:** Agent persona configs that generate runtime configs, AGENTS.md fragments, and CI workflows from a single YAML source of truth, plus an MCP server (`@harness-engineering/mcp-server`) providing full CLI tool parity to any MCP-compatible AI client.

## Decisions

- Both tracks run in parallel (Slices 1 and 2 are independent).
- Vertical slice delivery: each slice is usable end-to-end before the next begins.
- Templates are both standalone (copy and use) and consumed by `harness init` (option C).
- Start with Next.js only for framework templates; prove the system, then expand.
- MCP server lives in `packages/mcp-server/` as a first-class publishable npm package.
- Agent personas generate three artifacts: runtime config, AGENTS.md fragment, CI workflow.
- MCP tools mirror the full CLI plus a `run_persona` meta-tool.

---

## Section 1: Template System

### Template Structure

Templates live in `templates/` at the repo root, each as a self-contained project directory:

```
templates/
├── base/                    # Shared files included in ALL templates
│   ├── .gitignore
│   ├── AGENTS.md.hbs        # Handlebars template (interpolates project name, level)
│   └── docs/
│       └── index.md.hbs
├── basic/                   # Level 1 adoption
│   ├── template.json        # Metadata: name, description, level, extends: "base"
│   ├── harness.config.json.hbs
│   ├── package.json.hbs
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
├── intermediate/            # Level 2 adoption
│   ├── template.json        # extends: "base", adds linters + more layers
│   ├── harness.config.json.hbs
│   ├── eslint.config.mjs.hbs
│   ├── package.json.hbs
│   └── src/
│       ├── types/
│       ├── domain/
│       └── services/
├── advanced/                # Level 3 adoption
│   ├── template.json        # extends: "base", adds agents + entropy
│   ├── harness.config.json.hbs
│   ├── package.json.hbs
│   └── agents/
│       └── personas/        # Pre-configured persona configs
└── nextjs/                  # Framework overlay
    ├── template.json        # framework: "nextjs", composable with any level
    ├── next.config.mjs
    ├── package.json.hbs     # Merges with level template's package.json
    └── src/
        ├── app/
        └── lib/
```

### Key Design Decisions

- **Handlebars for interpolation** — Already used in linter-gen, consistent across the project. Template context: `{ projectName, level, framework }`.
- **Composition via `extends` + framework overlays** — A level template extends `base/`. A framework template overlays on top. So `harness init --level intermediate --framework nextjs` composes: `base/` -> `intermediate/` -> `nextjs/`.
- **`template.json` metadata** — Each template declares its name, description, adoption level, dependencies, and merge strategy.
- **Standalone use** — Each level template (with base merged) is a valid project you can copy and use directly without the CLI.

### CLI Integration

`harness init` gets new flags:

```
harness init [--level basic|intermediate|advanced] [--framework nextjs] [--name <name>]
```

Default: `--level basic` (backwards compatible with current behavior). The existing `templates/basic.ts` inline templates get replaced by the file-based template system.

### Template Metadata Schema (`template.json`)

Each template directory contains a `template.json` validated with Zod:

```typescript
const TemplateMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  framework: z.string().optional(),
  extends: z.string().optional(),           // e.g., "base"
  mergeStrategy: z.object({
    json: z.enum(['deep-merge', 'overlay-wins']).default('deep-merge'),
    files: z.enum(['overlay-wins', 'error']).default('overlay-wins'),
  }).default({}),
  version: z.literal(1),
});
```

### File Merge Strategy

When composing templates (e.g., `base/` -> `intermediate/` -> `nextjs/`):

- **JSON files (`.json`, `.json.hbs`):** Deep merge. Later layers' keys override earlier layers. Arrays are concatenated for `dependencies`/`devDependencies` in `package.json`; replaced for all other fields. This matches npm/pnpm merge semantics.
- **Non-JSON files:** Overlay wins. If a file exists in both `intermediate/` and `nextjs/`, the `nextjs/` version is used.
- **Directories:** Merged additively. Files from all layers coexist; conflicts resolved by overlay-wins.

### Template Rendering

Handlebars templates use strict mode — missing variables and syntax errors produce `Result` errors with actionable messages (variable name, template file path, line number). This follows the core `Result<T, E>` pattern consistently. Note: the existing linter-gen uses a different `{ success, error }` pattern; new template code uses `Result<T, E>` exclusively, and linter-gen alignment is deferred to a future cleanup.

### Template Engine

New module in `packages/cli/src/templates/engine.ts`:

```typescript
interface TemplateEngine {
  listTemplates(): Result<TemplateMetadata[], Error>
  resolveTemplate(level: string, framework?: string): Result<ResolvedTemplate, Error>
  render(template: ResolvedTemplate, context: TemplateContext): Result<RenderedFiles, Error>
  write(files: RenderedFiles, targetDir: string, options: WriteOptions): Result<string[], Error>
}
```

### Config Schema Extension

After scaffolding, the generated `harness.config.json` records which template was used:

```typescript
// Addition to HarnessConfigSchema
template: z.object({
  level: z.enum(['basic', 'intermediate', 'advanced']),
  framework: z.string().optional(),
  version: z.number(),         // Template version at time of scaffolding
}).optional(),
```

This enables `harness validate` to enforce level-appropriate checks and supports future upgrade paths (e.g., basic -> intermediate migration).

---

## Section 2: Agent Personas

### Persona Schema

Personas live in `agents/personas/` as YAML configs:

```yaml
# agents/personas/architecture-enforcer.yaml
version: 1
name: Architecture Enforcer
description: Validates architectural constraints and dependency rules
role: Enforce layer boundaries, detect circular dependencies, block forbidden imports

skills:
  - enforce-architecture
  - check-mechanical-constraints

commands:                  # CLI commands this persona executes (not AI agent tools)
  - check-deps
  - validate

triggers:
  - event: on_pr
    conditions:
      paths: ["src/**"]
  - event: on_commit
    conditions:
      branches: ["main", "develop"]
  - event: scheduled
    cron: "0 6 * * 1"  # Weekly Monday 6am

config:
  severity: error        # error | warning
  autoFix: false
  timeout: 300000

outputs:
  agents-md: true        # Generate AGENTS.md fragment
  ci-workflow: true      # Generate GitHub Actions workflow
  runtime-config: true   # Generate harness agent runtime config
```

**Note on `commands` vs `tools`:** Persona configs use `commands` to list CLI commands (e.g., `check-deps`, `validate`). This avoids collision with the `tools` field in skill YAML (`skill.yaml`), which lists AI agent tools (e.g., `Bash`, `Read`, `Glob`). These are fundamentally different concepts.

**Note on `triggers`:** Persona triggers use a richer model than skill triggers (which are a flat enum: `['manual', 'on_pr', 'on_commit']`). Persona triggers add `conditions` (path filters, branch filters) and `scheduled` with cron expressions. This is a superset — persona triggers define *when CI runs the persona*, while skill triggers define *when an AI agent activates a skill*. These serve different purposes and intentionally diverge.

### Three Generated Artifacts

From a single persona YAML, the system generates:

**1. Runtime config** — Used by `harness agent run --persona architecture-enforcer`:

```json
{
  "name": "architecture-enforcer",
  "skills": ["enforce-architecture", "check-mechanical-constraints"],
  "commands": ["check-deps", "validate"],
  "timeout": 300000,
  "severity": "error"
}
```

**2. AGENTS.md fragment** — Pasteable section for a project's AGENTS.md:

```markdown
## Architecture Enforcer Agent

**Role:** Enforce layer boundaries, detect circular dependencies, block forbidden imports

**Triggers:** On PR (src/**), on commit (main, develop), weekly Monday 6am

**Skills:** enforce-architecture, check-mechanical-constraints

**When this agent flags an issue:** Fix layer violations before merging. Run `harness check-deps` locally to validate.
```

**3. GitHub Actions workflow** — `.github/workflows/architecture-enforcer.yml`:

```yaml
name: Architecture Enforcer
on:
  pull_request:
    paths: ['src/**']
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 6 * * 1'
jobs:
  enforce:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx harness check-deps --severity error
      - run: npx harness validate
```

### CLI Commands

```
harness persona list                              # List available personas
harness persona generate <name> [--output-dir .]  # Generate all artifacts
harness persona generate <name> --only ci         # Generate only CI workflow
harness persona generate <name> --only agents-md  # Generate only AGENTS.md fragment
harness persona generate <name> --only runtime    # Generate only runtime config
```

### Persona YAML Schema (Zod)

```typescript
const PersonaTriggerSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('on_pr'),
    conditions: z.object({ paths: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('on_commit'),
    conditions: z.object({ branches: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('scheduled'),
    cron: z.string(),
  }),
]);

const PersonaSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  description: z.string(),
  role: z.string(),
  skills: z.array(z.string()),
  commands: z.array(z.string()),
  triggers: z.array(PersonaTriggerSchema),
  config: z.object({
    severity: z.enum(['error', 'warning']).default('error'),
    autoFix: z.boolean().default(false),
    timeout: z.number().default(300000),
  }).default({}),
  outputs: z.object({
    'agents-md': z.boolean().default(true),
    'ci-workflow': z.boolean().default(true),
    'runtime-config': z.boolean().default(true),
  }).default({}),
});
```

### Persona Generator

New module in `packages/cli/src/persona/generator.ts`:

```typescript
interface PersonaGenerator {
  loadPersona(name: string): Result<Persona, Error>
  listPersonas(): Result<PersonaMetadata[], Error>
  generateRuntime(persona: Persona): Result<RuntimeConfig, Error>
  generateAgentsMd(persona: Persona): Result<string, Error>
  generateCIWorkflow(persona: Persona, platform: 'github' | 'gitlab'): Result<string, Error>
  generateAll(persona: Persona, outputDir: string): Result<GeneratedFiles, Error>
}
```

### Integration with `harness agent run`

The existing `harness agent run <task>` command uses a hardcoded `agentTypeMap` and routes through `requestPeerReview`. The `--persona` flag introduces a new code path:

- `harness agent run <task>` — Existing behavior, unchanged. Routes through `requestPeerReview`.
- `harness agent run --persona <name>` — New path. Loads the persona config, executes each listed command in sequence, returns the aggregated `PersonaRunReport`. Does **not** use `requestPeerReview`.

The old task-based path is not deprecated — personas are a higher-level abstraction that compose commands, while tasks are direct agent invocations. Both coexist.

### CLI Output Format

`harness persona list` respects existing CLI output conventions:
- Default: formatted table (name, description, triggers summary)
- `--json`: JSON array of persona metadata
- `--quiet`: names only, one per line

### Three Built-in Personas

1. **architecture-enforcer** — `check-deps` + `validate` on PRs/commits
2. **documentation-maintainer** — `check-docs` + `validate` on PRs touching docs or source
3. **entropy-cleaner** — `cleanup` + `fix-drift` on weekly schedule

---

## Section 3: MCP Server

### Package Setup

New package: `packages/mcp-server/` published as `@harness-engineering/mcp-server`.

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # Server class, tool registration
│   ├── tools/
│   │   ├── validate.ts       # validate_project, validate_config, validate_commits
│   │   ├── architecture.ts   # check_dependencies, detect_circular_deps
│   │   ├── docs.ts           # check_docs, validate_knowledge_map
│   │   ├── entropy.ts        # detect_entropy, apply_fixes
│   │   ├── linter.ts         # generate_linter, validate_linter_config
│   │   ├── persona.ts        # run_persona, list_personas, generate_persona_artifacts
│   │   └── init.ts           # init_project (template scaffolding via MCP)
│   └── utils/
│       ├── config-resolver.ts # Find and load harness.config.json
│       └── result-adapter.ts  # Convert Result<T,E> to MCP tool responses
├── bin/
│   └── harness-mcp.ts        # Stdio entry point for MCP clients
└── tests/
```

### Tool Mapping (CLI to MCP)

Every CLI command gets an MCP tool equivalent:

| CLI Command | MCP Tool | Description |
|---|---|---|
| `harness validate` | `validate_project` | Run all validation checks |
| `harness check-deps` | `check_dependencies` | Validate layer boundaries + circular deps |
| `harness check-docs` | `check_docs` | Documentation coverage analysis |
| `harness cleanup` | `detect_entropy` | Detect drift, dead code, pattern violations |
| `harness fix-drift` | `apply_fixes` | Auto-fix detected entropy issues |
| `harness init` | `init_project` | Scaffold project from template |
| `harness add` | `add_component` | Add layer, doc, or component |
| `harness agent run` | `run_agent_task` | Run an agent task |
| `harness linter generate` | `generate_linter` | Generate ESLint rule from YAML |
| `harness linter validate` | `validate_linter_config` | Validate linter YAML config |
| `harness persona list` | `list_personas` | List available personas |
| `harness persona generate` | `generate_persona_artifacts` | Generate CI/AGENTS.md/runtime from persona |
| *(new)* | `run_persona` | Execute a full persona (meta-tool) |

### The `run_persona` Meta-Tool

Key integration point between Track A and Track B:

```typescript
// Tool: run_persona
// Input: { persona: string, path?: string, dryRun?: boolean }
//
// 1. Load persona config
// 2. Resolve which CLI commands map to the persona's commands
// 3. Execute each command in sequence
// 4. Aggregate results into a single report
// 5. Return pass/fail with details
```

**Execution semantics:**

- **Fail-fast by default:** If a command fails, execution stops and returns the partial report. The report includes which commands succeeded, which failed, and which were skipped.
- **`dryRun: true`:** Prevents all write operations (no file modifications, no auto-fixes). Read-only checks still execute.
- **Timeout:** Applies to the entire persona run, not per-command. If the total timeout is reached, remaining commands are skipped and the partial report is returned.

**Aggregated report structure:**

```typescript
interface PersonaRunReport {
  persona: string
  status: 'pass' | 'fail' | 'partial'  // partial = some commands skipped
  commands: Array<{
    name: string
    status: 'pass' | 'fail' | 'skipped'
    result?: unknown               // Command-specific output
    error?: string
    durationMs: number
  }>
  totalDurationMs: number
}
```

Example MCP call:

```json
{
  "tool": "run_persona",
  "input": {
    "persona": "architecture-enforcer",
    "path": "/path/to/project"
  }
}
```

Returns aggregated results from `check_dependencies` + `validate_project` in a single response.

### Implementation Approach

- Uses `@modelcontextprotocol/sdk` for the MCP server framework.
- All tools are thin wrappers that call `@harness-engineering/core` APIs directly (not shelling out to the CLI).
- Communicates via stdio (standard MCP transport).
- Config resolution: looks for `harness.config.json` from the `path` param or cwd.

### Result Adapter (`result-adapter.ts`)

Converts `Result<T, E>` to MCP tool responses:

- **Success (`ok: true`):** `{ content: [{ type: "text", text: JSON.stringify(value) }] }`. Structured data is always JSON-serialized so MCP clients can parse it programmatically.
- **Error (`ok: false`):** `{ content: [{ type: "text", text: error.message }], isError: true }`. Error details (code, suggestions) are included in the message text.

### Client Configuration

For Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "harness-engineering": {
      "command": "npx",
      "args": ["@harness-engineering/mcp-server"]
    }
  }
}
```

---

## Section 4: Slice Execution Order & Dependencies

### Slice 1: Template System

**Depends on:** Nothing (greenfield)
**Delivers:** `templates/` directory, template engine in CLI, updated `harness init`

1. Create `templates/base/` with shared Handlebars files
2. Create `templates/basic/` — level 1 adoption (replaces inline `templates/basic.ts`)
3. Create `templates/intermediate/` — level 2 with linters + layers
4. Create `templates/advanced/` — level 3 with agent config + entropy
5. Create `templates/nextjs/` — framework overlay
6. Build template engine in `packages/cli/src/templates/engine.ts`
7. Update `harness init` to use file-based templates with `--level` and `--framework` flags
8. Remove old inline `templates/basic.ts`

### Slice 2: Persona System

**Depends on:** Nothing (independent of Slice 1)
**Delivers:** `agents/personas/`, persona generator in CLI, three built-in personas

1. Define persona YAML schema (Zod)
2. Create three persona configs in `agents/personas/`
3. Build generators: runtime config, AGENTS.md fragment, GitHub Actions workflow
4. Add `harness persona` CLI commands (list, generate)
5. Wire `harness agent run` to accept `--persona` flag

### Slice 3: MCP Server

**Depends on:** Slice 2 (needs persona system for `run_persona` tool)
**Delivers:** `packages/mcp-server/`, full tool parity, `run_persona` meta-tool

1. Scaffold `packages/mcp-server/` package
2. Build MCP server with `@modelcontextprotocol/sdk`
3. Implement core tools (validate, architecture, docs, entropy)
4. Implement extended tools (linter, init, add)
5. Implement persona tools (list, generate, `run_persona`)
6. Add `bin/harness-mcp.ts` stdio entry point
7. Test with Claude Desktop / MCP inspector

### Slice 4: Expand (Future)

**Depends on:** Slices 1-3 complete
**Delivers:** Additional framework templates, personas, polish

1. Add more framework overlays (NestJS, Express, Fastify)
2. Additional personas based on team feedback
3. Documentation site integration

### Dependency Graph

```
Slice 1 (Templates) ──────────────────┐
                                       ├──> Slice 4 (Expand)
Slice 2 (Personas) ──> Slice 3 (MCP) ─┘
```

Slices 1 and 2 can run in parallel. Slice 3 follows Slice 2. Slice 4 is future work.

### Not in Scope

- Multi-language templates (Python, Go) — future phase
- Architecture templates (microservices) — future, only single-service for now
- GitLab CI generation — GitHub Actions only in v1
- Cloud agent executor — subprocess only in v1

---

## Testing Strategy

### Template System (Slice 1)
- **Unit tests:** Template engine — resolve, render, write for each level + framework overlay
- **Unit tests:** Merge strategy — JSON deep merge, file overlay-wins, directory merging
- **Integration tests:** `harness init --level X --framework Y` produces a valid, installable project
- **Snapshot tests:** Rendered template output for each level matches expected structure

### Persona System (Slice 2)
- **Unit tests:** Persona YAML schema validation (valid and invalid configs)
- **Unit tests:** Each generator (runtime, AGENTS.md, CI workflow) produces correct output
- **Integration tests:** `harness persona generate <name>` writes valid files
- **Validation tests:** Generated GitHub Actions workflows pass `actionlint` (if available)

### MCP Server (Slice 3)
- **Unit tests:** Each tool handler receives input, calls core API, returns correct MCP response
- **Unit tests:** Result adapter converts success and error cases correctly
- **Integration tests:** MCP server starts, registers all tools, handles tool calls via stdio
- **Integration tests:** `run_persona` meta-tool executes commands and returns aggregated report

---

## Success Criteria

- `harness init --level intermediate --framework nextjs` scaffolds a working project with linters, layers, and Next.js structure
- Templates are usable standalone (copy directory, run `npm install`)
- `harness persona generate architecture-enforcer` produces valid runtime config, AGENTS.md fragment, and GitHub Actions workflow
- MCP server starts via `npx @harness-engineering/mcp-server` and exposes all tools
- `run_persona` meta-tool executes a persona's tools and returns aggregated results
- All three built-in personas generate correct CI workflows

---

## Known Follow-Up Items

1. ~~`validate_project` MCP tool is a stub~~ — **RESOLVED.** Now runs `validateFileStructure` and `validateAgentsMap`.
2. ~~Missing `add_component` and `run_agent_task` MCP tools~~ — **RESOLVED.** Both implemented in `packages/mcp-server/src/tools/agent.ts`. Server now has 14 tools.
3. ~~Persona runner timeout test coverage~~ — **RESOLVED.** Timeout test added, string-matching replaced with `TIMEOUT_ERROR_MESSAGE` sentinel.
4. ~~`toKebabCase` duplication~~ — **RESOLVED.** Extracted to `packages/cli/src/utils/string.ts`.
5. ~~`mergeStrategy.files: 'error'` not enforced~~ — **RESOLVED.** Simplified schema to only accept `'overlay-wins'` (YAGNI).
6. ~~Template render error messages~~ — **RESOLVED.** Per-file error catching with source template + file path in messages.
7. ~~MCP server path resolution for published packages~~ — **RESOLVED.** Centralized in `packages/mcp-server/src/utils/paths.ts` using `findUpDir` pattern with marker-based directory detection. Falls back to hardcoded relative paths.
