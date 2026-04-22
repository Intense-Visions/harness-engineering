# @harness-engineering/cli

CLI for the Harness Engineering toolkit. Provides the `harness` command with subcommands for validation, initialization, skill management, persona execution, graph operations, and more.

**Version:** 1.25.6

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

| Command                    | Description                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `harness validate`         | Run all validation checks                                                                                                                                                |
| `harness check-arch`       | Check architecture assertions against baseline and thresholds                                                                                                            |
| `harness check-deps`       | Validate dependency layers and detect circular dependencies                                                                                                              |
| `harness check-docs`       | Check documentation coverage                                                                                                                                             |
| `harness check-perf`       | Run performance checks: structural complexity, coupling, and size budgets                                                                                                |
| `harness check-phase-gate` | Verify that implementation files have matching spec documents                                                                                                            |
| `harness check-security`   | Run lightweight security scan: secrets, injection, XSS, weak crypto. Options: `--severity <level>` (default: warning), `--changed-only` (scan only git-changed files)    |
| `harness scan-config`      | Scan CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml for prompt injection patterns. Options: `--fix` (strip high-severity patterns in-place), `--path <dir>` |

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
| `harness ci check`     | Run all harness checks for CI                             |
| `harness ci init`      | Generate CI configuration for harness checks              |
| `harness ci notify`    | Post CI check results to GitHub (PR comment or issue)     |
| `harness dashboard`    | Start the Harness local web dashboard                     |

#### `harness ci check`

Run all harness checks in a single pass, producing a structured report suitable for CI pipelines. Runs the following checks by default: `validate`, `deps`, `docs`, `entropy`, `security`, `perf`, `phase-gate`, `arch`, `traceability`.

```bash
# Run all checks
harness ci check

# Output as JSON (for CI artifact collection)
harness ci check --json

# Skip specific checks
harness ci check --skip entropy,docs

# Fail on warnings (default: fail on errors only)
harness ci check --fail-on warning
```

| Option                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `--skip <checks>`      | Comma-separated checks to skip (e.g., `entropy,docs`)  |
| `--fail-on <severity>` | Fail on severity level: `error` (default) or `warning` |

Exit codes: `0` = all checks passed, `1` = one or more checks failed.

#### `harness ci init`

Generate CI configuration files for running harness checks automatically. Auto-detects the CI platform from the project directory (`.github/` = GitHub Actions, `.gitlab-ci.yml` = GitLab CI), falling back to a generic shell script.

```bash
# Auto-detect platform and generate config
harness ci init

# Specify platform explicitly
harness ci init --platform github
harness ci init --platform gitlab
harness ci init --platform generic

# Include only specific checks
harness ci init --checks validate,deps,docs,arch
```

| Option              | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `--platform <name>` | CI platform: `github`, `gitlab`, or `generic` (auto-detected)     |
| `--checks <list>`   | Comma-separated list of checks to include in the generated config |

Generated files:

- **GitHub Actions:** `.github/workflows/harness.yml`
- **GitLab CI:** `.gitlab-ci-harness.yml`
- **Generic:** `harness-ci.sh` (executable shell script)

#### `harness ci notify`

Post CI check results to GitHub as a PR comment or a new issue. Requires a `harness ci check --json` report file and a GitHub tracker configured in `harness.config.json` (`roadmap.tracker` with `kind: "github"`).

```bash
# Post results as a PR comment
harness ci notify report.json --target pr-comment --pr 42

# Create a GitHub issue on failure
harness ci notify report.json --target issue --title "CI Failure: main" --labels "ci,harness"
```

| Option              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `<report>`          | Path to CI check report JSON file (from `harness ci check --json`) |
| `--target <target>` | Notification target: `pr-comment` or `issue` (required)            |
| `--pr <number>`     | PR number (required for `pr-comment` target)                       |
| `--title <title>`   | Custom issue title (for `issue` target)                            |
| `--labels <labels>` | Comma-separated labels for created issues                          |

Requires `GITHUB_TOKEN` or `GH_TOKEN` environment variable. When target is `issue` and all checks pass (exit code 0), issue creation is skipped.

#### State and Learnings

| Command             | Description                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `harness state`     | Project state management. Subcommands: `show`, `reset`, `learn`, `streams` (`list`, `create`, `archive`, `set`) |
| `harness learnings` | Learnings management commands                                                                                   |
| `harness usage`     | Token usage and cost tracking                                                                                   |

#### Telemetry and Adoption

| Command             | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `harness telemetry` | Telemetry identity and status management. Subcommands: `identify`, `status`, `test`                          |
| `harness adoption`  | View skill adoption telemetry. Subcommands: `skills`, `recent`, `skill <name>`. Options: `--json`, `--limit` |

#### Analysis and Maintenance

| Command                    | Description                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `harness publish-analyses` | Publish locally generated intelligence analyses to external issue tracker. Options: `-d, --dir <path>`         |
| `harness sync-analyses`    | Pull published analyses from external issue tracker to local `.harness/analyses/`. Options: `-d, --dir <path>` |
| `harness audit-protected`  | Report all `@harness-ignore` protected code regions                                                            |
| `harness cleanup-sessions` | Remove stale session directories (no writes in 24h). Options: `--dry-run`, `--path <path>`                     |

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

The MCP server registers **59 tools** organized by category. Source: [`packages/cli/src/mcp/server.ts`](../../packages/cli/src/mcp/server.ts)

### Validation & Project Setup

| Tool                     | Description                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `validate_project`       | Run all validation checks                                                                          |
| `check_dependencies`     | Validate dependency layers and detect circular deps                                                |
| `check_docs`             | Check documentation coverage. Params: `path`, `scope` (`coverage` / `integrity` / `all`), `domain` |
| `detect_entropy`         | Detect entropy issues (drift, dead code, patterns). Params: `path`, `type`, `autoFix`              |
| `generate_linter`        | Generate custom ESLint rules from YAML config                                                      |
| `validate_linter_config` | Validate a linter configuration                                                                    |
| `init_project`           | Initialize a new harness project                                                                   |
| `add_component`          | Add a component to an existing project                                                             |
| `assess_project`         | Comprehensive project health assessment                                                            |

### Skill & Agent Tools

| Tool                         | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `search_skills`              | Search available skills by name, tag, or description |
| `run_skill`                  | Execute a skill                                      |
| `create_skill`               | Create a new skill definition                        |
| `recommend_skills`           | Recommend skills based on current context            |
| `dispatch_skills`            | Dispatch skills for changed files                    |
| `run_agent_task`             | Run an agent task definition                         |
| `generate_agent_definitions` | Generate agent definitions from project config       |
| `generate_slash_commands`    | Generate slash command definitions                   |

### Persona Tools

| Tool                         | Description                         |
| ---------------------------- | ----------------------------------- |
| `list_personas`              | List available personas             |
| `generate_persona_artifacts` | Generate persona-specific artifacts |
| `run_persona`                | Execute a persona                   |

### Graph Tools

| Tool                   | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `ask_graph`            | Natural language queries against the knowledge graph                  |
| `query_graph`          | Structured graph queries (node/edge lookups, traversals)              |
| `search_similar`       | Semantic similarity search across graph nodes                         |
| `ingest_source`        | Ingest source files into the knowledge graph                          |
| `get_relationships`    | Retrieve relationships for a given graph node                         |
| `get_impact`           | Impact analysis — what is affected by changing a node                 |
| `find_context_for`     | Find relevant context for a given file or symbol                      |
| `detect_anomalies`     | Detect structural anomalies in the knowledge graph                    |
| `compute_blast_radius` | Simulate cascading failure propagation using probability-weighted BFS |

### Review & Code Quality Tools

| Tool                      | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `run_code_review`         | Run the full code review pipeline                                  |
| `create_self_review`      | Create a self-review for changes                                   |
| `analyze_diff`            | Analyze a diff for change type and impact                          |
| `request_peer_review`     | Request a peer review from a specialized agent                     |
| `review_changes`          | Review changes with configurable depth (`quick`/`standard`/`deep`) |
| `validate_cross_check`    | Cross-check validation between spec and implementation             |
| `check_phase_gate`        | Verify spec documents exist for implementation files               |
| `check_task_independence` | Determine if tasks can be executed in parallel                     |
| `predict_conflicts`       | Predict merge conflicts from co-change patterns                    |

### Security Tools

| Tool                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| `run_security_scan`   | Run a security scan with configurable severity |
| `get_security_trends` | Get security finding trends over time          |

### Performance Tools

| Tool                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `check_performance`     | Run performance checks (complexity, coupling, size budgets) |
| `get_perf_baselines`    | Read current performance baselines                          |
| `update_perf_baselines` | Update performance baselines                                |
| `get_critical_paths`    | Identify critical execution paths                           |

### Architecture & Prediction Tools

| Tool                          | Description                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `detect_stale_constraints`    | Detect constraint rules that haven't been violated recently |
| `detect_constraint_emergence` | Detect emergent constraints from violation history          |
| `predict_failures`            | Predict likely failure points from graph and timeline data  |
| `get_decay_trends`            | Get architecture decay trends over time                     |
| `check_traceability`          | Check spec-to-implementation traceability                   |

### Code Navigation Tools

| Tool           | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `code_outline` | Get a structural outline of a source file (classes, functions, etc.) |
| `code_search`  | Search for symbols across the codebase                               |
| `code_unfold`  | Expand a symbol to see its full implementation                       |

### Context & State Tools

| Tool               | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `gather_context`   | Assemble context for a skill invocation with token budget management |
| `compact`          | Compact content to fit within a token budget                         |
| `emit_interaction` | Emit a skill interaction event                                       |
| `manage_state`     | Session lifecycle actions (see below)                                |
| `list_streams`     | List all state streams                                               |
| `manage_roadmap`   | CRUD operations for `docs/roadmap.md`                                |

#### `manage_state` Actions

| Action                | Description                          | Auto-Sync |
| --------------------- | ------------------------------------ | --------- |
| `show`                | Display current project state        | No        |
| `learn`               | Append a learning entry              | No        |
| `failure`             | Record a failure entry               | No        |
| `archive`             | Archive old failures                 | No        |
| `reset`               | Reset project state                  | No        |
| `gate`                | Run mechanical quality gate          | No        |
| `save-handoff`        | Save session handoff                 | Yes       |
| `load-handoff`        | Load current handoff                 | No        |
| `append_entry`        | Append an entry to a session section | No        |
| `update_entry_status` | Update the status of a session entry | No        |
| `read_section`        | Read a specific session section      | No        |
| `read_sections`       | Read all session sections            | No        |
| `archive_session`     | Archive a completed session          | Yes       |
| `task-start`          | Signal a task has started            | Yes       |
| `task-complete`       | Signal a task has completed          | Yes       |
| `phase-start`         | Signal a phase has started           | Yes       |
| `phase-complete`      | Signal a phase has completed         | Yes       |

Actions marked "Yes" in Auto-Sync fire `autoSyncRoadmap` which performs local roadmap sync, then (if tracker config is present) fires `fullSync` to push/pull from the external tracker.

### MCP Resources

The MCP server exposes 9 resources:

| URI                            | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `harness://skills`             | Available skills with metadata (application/json)             |
| `harness://rules`              | Active linter rules and constraints (application/json)        |
| `harness://project`            | Project structure and AGENTS.md content (text/markdown)       |
| `harness://learnings`          | Review learnings and anti-pattern log (text/markdown)         |
| `harness://state`              | Current harness state (application/json)                      |
| `harness://graph`              | Knowledge graph statistics (application/json)                 |
| `harness://entities`           | All entity nodes with types (application/json)                |
| `harness://relationships`      | All edges with types and confidence scores (application/json) |
| `harness://business-knowledge` | Business domain knowledge (application/json)                  |

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
