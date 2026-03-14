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

---

## Section 2: Agent Personas

### Persona Schema

Personas live in `agents/personas/` as YAML configs:

```yaml
# agents/personas/architecture-enforcer.yaml
name: Architecture Enforcer
description: Validates architectural constraints and dependency rules
role: Enforce layer boundaries, detect circular dependencies, block forbidden imports

skills:
  - enforce-architecture
  - check-mechanical-constraints

tools:
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

### Three Generated Artifacts

From a single persona YAML, the system generates:

**1. Runtime config** — Used by `harness agent run --persona architecture-enforcer`:

```json
{
  "name": "architecture-enforcer",
  "skills": ["enforce-architecture", "check-mechanical-constraints"],
  "tools": ["check-deps", "validate"],
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
// 2. Resolve which CLI commands map to the persona's tools
// 3. Execute each tool in sequence
// 4. Aggregate results into a single report
// 5. Return pass/fail with details
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
- `result-adapter.ts` converts the `Result<T, E>` pattern to MCP's `{ content: [...], isError?: boolean }` format.
- Communicates via stdio (standard MCP transport).
- Config resolution: looks for `harness.config.json` from the `path` param or cwd.

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

## Success Criteria

- `harness init --level intermediate --framework nextjs` scaffolds a working project with linters, layers, and Next.js structure
- Templates are usable standalone (copy directory, run `npm install`)
- `harness persona generate architecture-enforcer` produces valid runtime config, AGENTS.md fragment, and GitHub Actions workflow
- MCP server starts via `npx @harness-engineering/mcp-server` and exposes all tools
- `run_persona` meta-tool executes a persona's tools and returns aggregated results
- All three built-in personas generate correct CI workflows
