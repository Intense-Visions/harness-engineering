# @harness-engineering/cli

CLI for the Harness Engineering toolkit. Provides the `harness` command with subcommands for validation, initialization, skill management, persona execution, graph operations, and more.

**Version:** 1.24.0

## Installation

```bash
npm install -g @harness-engineering/cli
```

## CLI Commands

The `harness` binary supports these global options:

| Option                | Description         |
| --------------------- | ------------------- |
| `-c, --config <path>` | Path to config file |
| `--json`              | Output as JSON      |
| `--verbose`           | Verbose output      |
| `--quiet`             | Minimal output      |

### Commands

#### Project Setup

| Command             | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `harness init`      | Initialize a new harness-engineering project                              |
| `harness setup`     | Configure harness environment: slash commands, MCP, and more              |
| `harness setup-mcp` | Configure MCP server for AI agent integration                             |
| `harness doctor`    | Check environment health: Node version, slash commands, MCP configuration |
| `harness update`    | Update all @harness-engineering packages to the latest version            |
| `harness add`       | Add a component to the project                                            |

#### Validation

| Command                    | Description                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `harness validate`         | Run all validation checks                                                                      |
| `harness check-arch`       | Check architecture assertions against baseline and thresholds                                  |
| `harness check-deps`       | Validate dependency layers and detect circular dependencies                                    |
| `harness check-docs`       | Check documentation coverage                                                                   |
| `harness check-perf`       | Run performance checks: structural complexity, coupling, and size budgets                      |
| `harness check-phase-gate` | Verify that implementation files have matching spec documents                                  |
| `harness check-security`   | Run lightweight security scan: secrets, injection, XSS, weak crypto                            |
| `harness scan-config`      | Scan CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml for prompt injection patterns |

#### Entropy and Drift

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `harness cleanup`   | Detect entropy issues (doc drift, dead code, patterns) |
| `harness fix-drift` | Auto-fix entropy issues (doc drift, dead code)         |
| `harness taint`     | Manage session taint status for destructive operations |

#### Knowledge Graph

| Command                  | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `harness graph`          | Knowledge graph management                                        |
| `harness scan`           | Scan project and build knowledge graph                            |
| `harness query`          | Query the knowledge graph                                         |
| `harness ingest`         | Ingest data into the knowledge graph                              |
| `harness impact-preview` | Show blast radius of staged changes using the knowledge graph     |
| `harness traceability`   | Show spec-to-implementation traceability from the knowledge graph |
| `harness predict`        | Predict which architectural constraints will break and when       |

#### Performance

| Command            | Description                             |
| ------------------ | --------------------------------------- |
| `harness perf`     | Performance benchmarking commands       |
| `harness snapshot` | Architecture timeline snapshot commands |

#### Code Generation

| Command                              | Description                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `harness generate`                   | Generate all platform integrations (slash commands + agent definitions)                         |
| `harness generate-slash-commands`    | Generate native commands for Claude Code, Gemini CLI, Codex CLI, and Cursor from skill metadata |
| `harness generate-agent-definitions` | Generate agent definition files from personas for Claude Code and Gemini CLI                    |
| `harness blueprint`                  | Generate a self-contained, interactive blueprint of the codebase                                |
| `harness linter`                     | Generate and validate ESLint rules from YAML config                                             |

#### Skills and Personas

| Command                | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `harness skill`        | Skill management commands                                               |
| `harness create-skill` | Scaffold a new skill with skill.yaml and SKILL.md                       |
| `harness install`      | Install skills from npm registry, local directory, or GitHub repository |
| `harness uninstall`    | Uninstall a community skill                                             |
| `harness persona`      | Agent persona management commands                                       |
| `harness recommend`    | Recommend skills based on codebase health analysis                      |

#### `harness install` — Skill Installation

Install skills from multiple sources:

```bash
# Install from npm registry
harness install acme-ui

# Install a single skill from a local directory
harness install my-skill --from ./path/to/skill

# Install all skills from a directory (auto-discovers skill.yaml files)
harness install . --from /path/to/acme-skills/skills

# Install from a GitHub repository (shallow clone, discovers all skills)
harness install . --from github:owner/repo
harness install . --from github:owner/repo#branch
harness install . --from https://github.com/owner/repo

# Install globally — available to ALL harness projects on this machine
harness install . --from github:owner/repo --global
harness install . --from /path/to/project/skills --global
```

**Global installs** place skills in `~/.harness/skills/community/` and are automatically discovered by every harness project.

**Bulk install** is triggered automatically when `--from` points to a directory that has no `skill.yaml` at its root — the command recursively discovers all `skill.yaml` files up to 3 levels deep and installs each one.

After installing or updating skills, regenerate slash commands so the new skills are available in your editor:

```bash
harness generate-slash-commands --global --include-global
```

**Updating third-party skills:**

Re-run the install command with `--force` to pull the latest version:

```bash
# Update from npm — fetches latest published version
harness install acme-ui --force --global

# Update from GitHub — re-clones and reinstalls all skills from the repo
harness install . --from github:owner/repo --force --global

# Update from a local directory
harness install . --from /path/to/skills --force --global
```

After updating, regenerate slash commands to pick up any changes:

```bash
harness generate-slash-commands --global --include-global
```

Skills installed from npm respect semver — use `--version` to pin a range (e.g., `--version "^2.0.0"`). For GitHub and local installs, `--force` is required because there is no version resolution; without it, the install is skipped if the skill name already exists in the lockfile.

| Option              | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `--from <source>`   | Local path, directory, `.tgz`, or GitHub ref             |
| `--global`          | Install to `~/.harness/skills/community/` (all projects) |
| `--version <range>` | Semver range for npm installs                            |
| `--force`           | Reinstall even if same version is already installed      |
| `--registry <url>`  | Custom npm registry                                      |

#### Constraints

| Command                         | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `harness install-constraints`   | Install a constraints bundle into the local harness config     |
| `harness uninstall-constraints` | Remove a previously installed constraints package              |
| `harness share`                 | Extract and publish a constraints bundle from constraints.yaml |

#### Agent Orchestration

| Command                | Description                  |
| ---------------------- | ---------------------------- |
| `harness agent`        | Agent orchestration commands |
| `harness orchestrator` | Run the orchestrator daemon  |

#### Integrations

| Command                | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `harness mcp`          | Start the MCP (Model Context Protocol) server on stdio    |
| `harness integrations` | Manage MCP peer integrations (add, list, remove, dismiss) |
| `harness hooks`        | Manage Claude Code hook configurations                    |
| `harness ci`           | CI/CD integration commands                                |
| `harness dashboard`    | Start the Harness local web dashboard                     |

#### State and Learnings

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `harness state`     | Project state management commands |
| `harness learnings` | Learnings management commands     |
| `harness usage`     | Token usage and cost tracking     |

## Programmatic API

The CLI also exports functions and types for use as a library.

### `createProgram()`

```typescript
function createProgram(): Command;
```

Creates and returns the configured Commander program. Useful for embedding the CLI in other tools.

### Preamble

### `buildPreamble(skillDir)`

Builds a skill preamble from a skill directory.

### Graph Operations

| Function                  | Description                                |
| ------------------------- | ------------------------------------------ |
| `runScan(options)`        | Scans source code into the knowledge graph |
| `runQuery(options)`       | Queries the knowledge graph                |
| `runIngest(options)`      | Ingests external data sources              |
| `runGraphStatus(options)` | Returns graph status information           |
| `runGraphExport(options)` | Exports graph data                         |

### Phase Gate

### `runCheckPhaseGate(options)`

Runs phase gate validation checks.

### Cross-Check

### `runCrossCheck(options)`

Validates cross-references between documents.

### Skill Creation

### `generateSkillFiles(options)`

```typescript
function generateSkillFiles(options: CreateSkillOptions): Promise<void>;
```

Generates the file scaffolding for a new skill.

**Types:** `CreateSkillOptions`

### Slash Commands

### `generateSlashCommands(options)`

Generates slash command definition files from skill metadata.

`--skills-dir <path>` is **additive**: it adds the specified directory as an extra skill source alongside project and community skills — it does not replace them.

**Types:** `GenerateResult`, `SkillSource`

### Programmatic Exports

| File                                                        | Description                                         |
| ----------------------------------------------------------- | --------------------------------------------------- |
| [`commands.ts`](../../packages/cli/src/exports/commands.ts) | Re-exports CLI command runners for programmatic use |

### Constraint Management Commands

| File                                                                                   | Description                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`install-constraints.ts`](../../packages/cli/src/commands/install-constraints.ts)     | Installs shared constraint files (ESLint configs, tsconfig) into a project |
| [`uninstall-constraints.ts`](../../packages/cli/src/commands/uninstall-constraints.ts) | Removes shared constraint files from a project                             |

### Learnings Commands

| File                                                             | Description                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`prune.ts`](../../packages/cli/src/commands/learnings/prune.ts) | Prunes old learnings, archives them, and keeps recent entries |

### Error Handling

| Export               | Description                       |
| -------------------- | --------------------------------- |
| `CLIError`           | Custom error class for CLI errors |
| `ExitCode`           | Enum of CLI exit codes            |
| `handleError(error)` | Formats and handles CLI errors    |

### Output

| Export            | Description                         |
| ----------------- | ----------------------------------- |
| `OutputFormatter` | Formats output for terminal or JSON |
| `OutputMode`      | Output mode enum (`text`, `json`)   |
| `logger`          | Shared logger instance              |

### Configuration

| Function                  | Description                        |
| ------------------------- | ---------------------------------- |
| `loadConfig(path)`        | Loads a harness config file        |
| `findConfigFile(rootDir)` | Finds the config file in a project |
| `resolveConfig(rootDir)`  | Finds and loads the config file    |

**Types:** `HarnessConfig`

### Template Engine

### `TemplateEngine`

Handlebars-based template engine for code generation.

**Types:** `TemplateContext`, `RenderedFiles`

### Persona Management

| Function                       | Description                               |
| ------------------------------ | ----------------------------------------- |
| `loadPersona(name)`            | Loads a persona definition by name        |
| `listPersonas()`               | Lists all available personas              |
| `runPersona(persona, context)` | Executes a persona's workflow             |
| `generateRuntime(persona)`     | Generates runtime artifacts for a persona |
| `generateAgentsMd(persona)`    | Generates an AGENTS.md for a persona      |
| `generateCIWorkflow(persona)`  | Generates a CI workflow for a persona     |
| `detectTrigger(context)`       | Detects which persona trigger matches     |

**Types:** `PersonaMetadata`, `Persona`, `Step`, `CommandStep`, `SkillStep`, `TriggerContext`, `CommandExecutor`, `SkillExecutor`, `StepExecutionContext`, `PersonaRunReport`, `StepReport`, `HandoffContext`, `TriggerDetectionResult`

**Constants:** `ALLOWED_PERSONA_COMMANDS`

### Skill Execution

| Function                | Description                          |
| ----------------------- | ------------------------------------ |
| `executeSkill(context)` | Executes a skill with full lifecycle |

**Types:** `SkillExecutionContext`, `SkillExecutionResult`

### Skill Infrastructure

| File                                                                | Description                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`stack-profile.ts`](../../packages/cli/src/skill/stack-profile.ts) | Technology stack detection and profile generation for skill adaptation |
| [`index-builder.ts`](../../packages/cli/src/skill/index-builder.ts) | Builds the skill index from skill directories                          |
| [`dispatcher.ts`](../../packages/cli/src/skill/dispatcher.ts)       | Routes skill invocations to the correct handler                        |

### Agent Definitions

| Function                                   | Description                                             |
| ------------------------------------------ | ------------------------------------------------------- |
| `generateAgentDefinitions(options)`        | Generates agent definition files for multiple platforms |
| `generateAgentDefinition(agent, platform)` | Generates a single agent definition                     |
| `renderClaudeCodeAgent(definition)`        | Renders a Claude Code agent YAML                        |
| `renderGeminiAgent(definition)`            | Renders a Gemini CLI agent YAML                         |

**Types:** `GenerateAgentDefsOptions`, `GenerateAgentDefsResult`, `AgentDefinition`

**Constants:** `AGENT_DESCRIPTIONS`, `DEFAULT_TOOLS`, `GEMINI_TOOL_MAP`

---

## MCP Tools

### Skill Search

| File                                                                    | Description                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`search-skills.ts`](../../packages/cli/src/mcp/tools/search-skills.ts) | MCP tool for searching available skills by name, tag, or description |

### Graph Tools

| File                                                                                  | Description                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`shared.ts`](../../packages/cli/src/mcp/tools/graph/shared.ts)                       | Shared utilities for graph MCP tools (store loading, response formatting) |
| [`ask-graph.ts`](../../packages/cli/src/mcp/tools/graph/ask-graph.ts)                 | Natural language queries against the knowledge graph                      |
| [`query-graph.ts`](../../packages/cli/src/mcp/tools/graph/query-graph.ts)             | Structured graph queries (node/edge lookups, traversals)                  |
| [`search-similar.ts`](../../packages/cli/src/mcp/tools/graph/search-similar.ts)       | Semantic similarity search across graph nodes                             |
| [`ingest-source.ts`](../../packages/cli/src/mcp/tools/graph/ingest-source.ts)         | Ingests source files into the knowledge graph                             |
| [`get-relationships.ts`](../../packages/cli/src/mcp/tools/graph/get-relationships.ts) | Retrieves relationships for a given graph node                            |
| [`get-impact.ts`](../../packages/cli/src/mcp/tools/graph/get-impact.ts)               | Impact analysis — determines what is affected by changing a node          |
| [`find-context-for.ts`](../../packages/cli/src/mcp/tools/graph/find-context-for.ts)   | Finds relevant context for a given file or symbol                         |
| [`detect-anomalies.ts`](../../packages/cli/src/mcp/tools/graph/detect-anomalies.ts)   | Detects structural anomalies in the knowledge graph                       |

### Roadmap & State Tools

| File                                                                            | Description                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`roadmap.ts`](../../packages/cli/src/mcp/tools/roadmap.ts)                     | `manage_roadmap` — CRUD operations for `docs/roadmap.md`                   |
| [`roadmap-auto-sync.ts`](../../packages/cli/src/mcp/tools/roadmap-auto-sync.ts) | Auto-sync engine — local sync + external tracker sync on state transitions |
| [`state.ts`](../../packages/cli/src/mcp/tools/state.ts)                         | `manage_state` — session lifecycle actions with auto-sync triggers         |

#### `manage_state` Actions

| Action            | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `save-handoff`    | Save session handoff (existing). Triggers `autoSyncRoadmap`.        |
| `archive_session` | Archive a completed session (existing). Triggers `autoSyncRoadmap`. |
| `task-start`      | Signal a task has started. Triggers `autoSyncRoadmap`.              |
| `task-complete`   | Signal a task has completed. Triggers `autoSyncRoadmap`.            |
| `phase-start`     | Signal a phase has started. Triggers `autoSyncRoadmap`.             |
| `phase-complete`  | Signal a phase has completed. Triggers `autoSyncRoadmap`.           |

All 6 actions fire `autoSyncRoadmap` which performs local roadmap sync, then (if tracker config is present) fires `fullSync` to push/pull from the external tracker.

#### `autoSyncRoadmap(projectPath)`

Best-effort roadmap sync. Reads `docs/roadmap.md`, runs local sync, writes back. If `roadmap.tracker` config exists in `harness.config.json`, calls `triggerExternalSync` to push planning fields and pull execution fields from the external tracker. Errors are swallowed — sync never blocks state operations.

#### `loadTrackerConfig(projectPath)`

Reads `harness.config.json`, validates the `roadmap.tracker` section via `TrackerConfigSchema.safeParse`, and returns a `TrackerSyncConfig` or `null`.

### Config Schema

| File                                                   | Description                           |
| ------------------------------------------------------ | ------------------------------------- |
| [`schema.ts`](../../packages/cli/src/config/schema.ts) | Zod schemas for `harness.config.json` |

#### `TrackerConfigSchema`

Validates the `roadmap.tracker` block in `harness.config.json`:

```typescript
{
  kind: 'github',           // Only 'github' supported currently
  repo: 'owner/repo',       // Optional — defaults to git remote
  labels: ['harness-managed'], // Labels auto-applied to synced issues
  statusMap: {               // Maps roadmap status → GitHub state
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open'
  },
  reverseStatusMap: {        // Maps GitHub state+label → roadmap status
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned'
  }
}
```

#### `RoadmapConfigSchema`

Wraps `TrackerConfigSchema` as the `roadmap` field on `HarnessConfigSchema`.
