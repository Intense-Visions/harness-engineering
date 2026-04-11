# CLI Reference

Complete reference for Harness Engineering CLI commands, options, and usage.

## Command Structure

All Harness Engineering CLI commands follow this structure:

```
harness [global-options] <command> [command-options]
```

## Global Options

These options are available for all commands:

```
--config, -c <path>     Path to harness.config.json
--json                  Output results as JSON
--verbose               Enable verbose output
--quiet                 Suppress non-error output
```

### Examples

```bash
# Use custom config file
harness validate --config=./custom/harness.config.json

# Get verbose output
harness validate --verbose

# Output as JSON for scripting
harness validate --json
```

## Setup and Environment Commands

### harness setup

Configure the harness environment in one step: generates global slash commands, sets up MCP server for detected AI clients, and configures peer integrations.

```
harness setup
```

**Examples:**

```bash
# Run interactive setup
harness setup
```

---

### harness doctor

Check environment health: Node version, slash command installation, and MCP configuration for all detected AI clients.

```
harness doctor
```

**Examples:**

```bash
# Run environment health checks
harness doctor

# Output as JSON
harness doctor --json
```

---

## Project Commands

### harness init

Initialize a new Harness Engineering project.

```
harness init [options]
```

**Options:**

```
-n, --name <name>       Project name
-l, --level <level>     Adoption level (basic, intermediate, advanced)
--framework <overlay>   Framework overlay (e.g., nextjs)
--language <lang>       Target language (typescript, python, go, rust, java)
-f, --force             Overwrite existing files
-y, --yes               Use defaults without prompting
```

**Examples:**

```bash
# Initialize with defaults (interactive)
harness init

# Initialize with a specific name and level
harness init --name my-project --level advanced

# Non-interactive, overwrite existing
harness init --name my-project --yes --force
```

---

### harness validate

Run all validation checks on the project.

```
harness validate [options]
```

**Options:**

```
--cross-check           Run cross-artifact consistency validation
```

**Examples:**

```bash
# Run all validation checks
harness validate

# Run with cross-check validation
harness validate --cross-check

# Output results as JSON
harness validate --json
```

---

### harness check-deps

Validate dependency layers and detect circular dependencies.

```
harness check-deps
```

**Examples:**

```bash
# Check for dependency issues
harness check-deps

# Verbose output for debugging
harness check-deps --verbose
```

---

### harness check-docs

Check documentation coverage across the project.

```
harness check-docs [options]
```

**Options:**

```
--min-coverage <percent>   Minimum required documentation coverage (0-100)
```

**Examples:**

```bash
# Check documentation coverage
harness check-docs

# Require at least 80% coverage
harness check-docs --min-coverage 80
```

---

### harness check-phase-gate

Verify that implementation files have matching spec documents.

```
harness check-phase-gate
```

**Examples:**

```bash
# Verify phase gate compliance
harness check-phase-gate
```

---

### harness check-arch

Check architecture assertions against baseline and thresholds. Detects regressions in circular dependencies, layer violations, complexity, coupling, forbidden imports, module size, and dependency depth.

```
harness check-arch [options]
```

**Options:**

```
--update-baseline       Capture current state as the new baseline
--module <path>         Check a single module only
```

**Examples:**

```bash
# Check architecture assertions
harness check-arch

# Update baseline to current state
harness check-arch --update-baseline

# Check a single module
harness check-arch --module src/services

# Output as JSON
harness check-arch --json
```

---

### harness check-perf

Run performance checks: structural complexity, coupling metrics, and size budgets.

```
harness check-perf [options]
```

**Options:**

```
--structural            Run structural complexity checks only
--coupling              Run coupling metric checks only
--size                  Run size budget checks only
```

**Examples:**

```bash
# Run all performance checks
harness check-perf

# Run only structural complexity checks
harness check-perf --structural

# Output as JSON
harness check-perf --json
```

---

### harness check-security

Run lightweight security scan: secrets, injection, XSS, and weak crypto detection.

```
harness check-security [options]
```

**Options:**

```
--severity <level>      Minimum severity threshold (default: warning)
--changed-only          Only scan git-changed files
```

**Examples:**

```bash
# Run full security scan
harness check-security

# Scan only changed files at error severity
harness check-security --changed-only --severity error
```

---

### harness add

Add a component to the project.

```
harness add <type> <name>
```

**Types:**

```
layer          Add a new architectural layer
module         Add a new module
doc            Add a new documentation file
skill          Add a new skill
persona        Add a new persona
```

**Examples:**

```bash
# Add a new layer
harness add layer data-access

# Add a documentation file
harness add doc api-reference

# Add a module
harness add module user-service

# Add a skill
harness add skill code-review
```

---

### harness blueprint

Generate a self-contained, interactive HTML blueprint of the codebase including architecture, dependencies, and module structure.

```
harness blueprint [path]
```

**Arguments:**

```
[path]                   Path to the project root (default: .)
```

**Options:**

```
-o, --output <dir>      Output directory (default: docs/blueprint)
```

**Examples:**

```bash
# Generate blueprint for current project
harness blueprint

# Generate to a custom output directory
harness blueprint --output ./out/blueprint

# Generate for a specific project path
harness blueprint /path/to/project
```

---

### harness predict

Predict which architectural constraints will break and when, based on timeline snapshot trends and optional roadmap spec impact.

```
harness predict [options]
```

**Options:**

```
--category <name>       Filter to a single metric category
--no-roadmap            Baseline only — skip roadmap spec impact analysis
--horizon <weeks>       Forecast horizon in weeks (default: 12)
```

**Examples:**

```bash
# Predict constraint failures
harness predict

# Predict only for complexity metrics
harness predict --category complexity

# Forecast 24 weeks out, baseline only
harness predict --horizon 24 --no-roadmap

# Output as JSON
harness predict --json
```

---

### harness recommend

Recommend skills based on codebase health analysis. Analyzes validation results, entropy, documentation coverage, and architecture health to suggest the most impactful skills to run next.

```
harness recommend [options]
```

**Options:**

```
--no-cache              Force fresh health snapshot (skip cached results)
--top <n>               Maximum number of recommendations (default: 5)
```

**Examples:**

```bash
# Get skill recommendations
harness recommend

# Force fresh analysis, show top 3
harness recommend --no-cache --top 3

# Output as JSON
harness recommend --json
```

---

## Entropy and Drift Commands

### harness cleanup

Detect entropy issues such as documentation drift, dead code, and inconsistent patterns.

```
harness cleanup [options]
```

**Options:**

```
-t, --type <type>       Type of entropy to check (drift, dead-code, patterns, all). Default: all
```

**Examples:**

```bash
# Detect all entropy issues
harness cleanup

# Check only for documentation drift
harness cleanup --type drift

# Check only for dead code
harness cleanup --type dead-code
```

---

### harness fix-drift

Auto-fix detected entropy issues including documentation drift and dead code.

```
harness fix-drift [options]
```

**Options:**

```
--no-dry-run            Apply fixes (default behavior is dry-run)
```

**Examples:**

```bash
# Preview fixes (dry run)
harness fix-drift

# Apply fixes
harness fix-drift --no-dry-run
```

---

### harness impact-preview

Show the blast radius of staged changes using the knowledge graph. Groups affected files by category (code, tests, docs) to help assess risk before committing.

```
harness impact-preview [options]
```

**Options:**

```
--detailed              Show all affected files instead of top items
--per-file              Show impact per staged file instead of aggregate
--path <path>           Project root (default: cwd)
```

**Examples:**

```bash
# Preview impact of staged changes
harness impact-preview

# Show detailed per-file breakdown
harness impact-preview --detailed --per-file

# Output as JSON
harness impact-preview --json
```

---

### harness scan-config

Scan CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml files for prompt injection patterns and security rule violations.

```
harness scan-config [options]
```

**Options:**

```
--path <dir>            Target directory to scan (default: cwd)
--fix                   Strip high-severity patterns from files in-place
```

**Examples:**

```bash
# Scan for prompt injection patterns
harness scan-config

# Scan a specific directory
harness scan-config --path ./my-project

# Auto-fix high-severity patterns
harness scan-config --fix
```

---

## Snapshot and Timeline Commands

### harness snapshot capture

Capture current architecture metrics as a timeline snapshot, recording values for circular deps, layer violations, complexity, coupling, and other metrics.

```
harness snapshot capture
```

**Examples:**

```bash
# Capture a snapshot
harness snapshot capture

# Output as JSON
harness snapshot capture --json
```

---

### harness snapshot list

List all captured architecture snapshots.

```
harness snapshot list
```

**Examples:**

```bash
# List snapshots
harness snapshot list

# Output as JSON
harness snapshot list --json
```

---

### harness snapshot trends

Show architecture metric trends over time based on captured snapshots.

```
harness snapshot trends [options]
```

**Options:**

```
--last <n>              Number of recent snapshots to analyze (default: 10)
--since <date>          Show trends since an ISO date
```

**Examples:**

```bash
# Show trends from recent snapshots
harness snapshot trends

# Show trends from the last 20 snapshots
harness snapshot trends --last 20

# Show trends since a specific date
harness snapshot trends --since 2026-01-01
```

---

## Agent Commands

### harness agent run

Run an agent task.

```
harness agent run [task] [options]
```

**Arguments:**

```
[task]                  Task to run (review, doc-review, test-review)
```

**Options:**

```
--timeout <ms>          Timeout in milliseconds (default: 300000)
--persona <name>        Run a persona by name
--trigger <context>     Trigger context (auto, on_pr, on_commit, manual). Default: auto
```

**Examples:**

```bash
# Run an agent task
harness agent run

# Run with a specific persona and timeout
harness agent run --persona architect --timeout 60000
```

---

### harness agent review

Run unified code review pipeline on current changes.

```
harness agent review [options]
```

**Options:**

```
--comment               Post inline comments to GitHub PR
--ci                    Enable eligibility gate, non-interactive output
--deep                  Add threat modeling pass to security agent
--no-mechanical         Skip mechanical checks
```

**Examples:**

```bash
# Review current changes
harness agent review

# CI mode with deep security analysis
harness agent review --ci --deep

# Post comments to GitHub PR
harness agent review --comment
```

---

### harness orchestrator run

Run the orchestrator daemon, which coordinates multi-agent workflows defined in a WORKFLOW.md file.

```
harness orchestrator run [options]
```

**Options:**

```
-w, --workflow <path>   Path to WORKFLOW.md (default: WORKFLOW.md)
```

**Examples:**

```bash
# Run the orchestrator with default workflow
harness orchestrator run

# Run with a custom workflow file
harness orchestrator run --workflow ./workflows/deploy.md
```

---

## Taint Commands

Manage sentinel session taint state. When the sentinel hook detects risky operations, it taints the session to block further destructive operations until cleared.

### harness taint status

Show current taint status for a session or all sessions.

```
harness taint status [sessionId]
```

**Arguments:**

```
[sessionId]             Specific session ID to check (default: all sessions)
```

**Examples:**

```bash
# Show taint status for all sessions
harness taint status

# Show taint status for a specific session
harness taint status my-session-id
```

---

### harness taint clear

Clear session taint, removing taint files and re-enabling destructive operations.

```
harness taint clear [sessionId]
```

**Arguments:**

```
[sessionId]             Specific session ID to clear (default: all sessions)
```

**Examples:**

```bash
# Clear all taint
harness taint clear

# Clear taint for a specific session
harness taint clear my-session-id
```

---

## Persona Commands

### harness persona list

List available agent personas.

```
harness persona list
```

---

### harness persona generate

Generate artifacts from a persona configuration.

```
harness persona generate <name> [options]
```

**Options:**

```
--output-dir <dir>      Output directory for generated artifacts
--only <type>           Generate only a specific artifact type (ci, agents-md, runtime)
```

**Examples:**

```bash
# Generate all artifacts for a persona
harness persona generate architect

# Generate only CI workflow to a custom directory
harness persona generate architect --only ci --output-dir ./out

# Generate only AGENTS.md fragment
harness persona generate architect --only agents-md

# Generate only runtime config
harness persona generate architect --only runtime
```

---

## Skill Commands

### harness skill list

List available skills.

```
harness skill list [options]
```

**Options:**

```
--installed             Show only community-installed skills
--local                 Show only project-local skills
--all                   Show all skills (default)
```

---

### harness skill run

Run a skill, outputting SKILL.md content with a context preamble.

```
harness skill run <name> [options]
```

**Options:**

```
--path <path>           Project root path for context injection
--complexity <level>    Rigor level: fast, standard, thorough (default: standard)
--phase <name>          Start at a specific phase (for re-entry)
--party                 Enable multi-perspective evaluation
```

**Examples:**

```bash
# Run a skill
harness skill run code-review

# Run with complexity and phase context
harness skill run implementation --complexity thorough --phase build
```

---

### harness skill validate

Validate all skill.yaml files and SKILL.md structure.

```
harness skill validate
```

---

### harness skill info

Show metadata for a specific skill.

```
harness skill info <name>
```

**Examples:**

```bash
# Show info about a skill
harness skill info code-review
```

---

### harness create-skill

Scaffold a new skill with skill.yaml and SKILL.md files.

```
harness create-skill <path> [options]
```

**Options:**

```
--name <name>           Skill name
--description <desc>    Skill description
--cognitive-mode <mode> Cognitive mode for the skill
--reads <files>         Files the skill reads
--produces <files>      Files the skill produces
--pre-checks <checks>   Pre-check commands
--post-checks <checks>  Post-check commands
```

**Examples:**

```bash
# Scaffold a new skill
harness create-skill ./skills/my-skill --name my-skill --description "Does a thing"

# Scaffold with full metadata
harness create-skill ./skills/review \
  --name review \
  --cognitive-mode analytical \
  --reads "src/**/*.ts" \
  --produces "reports/review.md"
```

---

## Skill Marketplace Commands

### harness install

Install a community skill from the `@harness-skills/*` npm registry.

```
harness install <skill> [options]
```

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--version <range>` | Semver range or exact version (default: latest)           |
| `--force`           | Force reinstall even if same version is already installed |
| `--from <path>`     | Install from a local directory or .tgz file               |
| `--registry <url>`  | Use a custom npm registry URL                             |

Skills are placed in `agents/skills/community/{platform}/` and tracked in `skills-lock.json`. Dependencies listed in `depends_on` are auto-installed.

#### Examples

```bash
# Install latest version
harness install deployment

# Install specific version range
harness install deployment --version "^1.0.0"

# Force reinstall
harness install deployment --force
```

---

### harness uninstall

Remove a community-installed skill.

```
harness uninstall <skill> [options]
```

| Option    | Description                                    |
| --------- | ---------------------------------------------- |
| `--force` | Remove even if other skills depend on this one |

#### Examples

```bash
# Uninstall a skill
harness uninstall deployment

# Force remove despite dependents
harness uninstall docker-basics --force
```

---

### harness skill search

Search for community skills on the npm registry.

```
harness skill search <query> [options]
```

| Option                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `--platform <platform>` | Filter by platform (e.g., claude-code, gemini-cli) |
| `--trigger <trigger>`   | Filter by trigger type (e.g., manual, automatic)   |
| `--registry <url>`      | Use a custom npm registry URL                      |

#### Examples

```bash
# Search for deployment skills
harness skill search deploy

# Filter by platform
harness skill search auth --platform claude-code
```

---

### harness skill create

Scaffold a new community skill with `skill.yaml`, `SKILL.md`, and `README.md`.

```
harness skill create <name> [options]
```

| Option                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `--description <desc>` | Skill description                                 |
| `--type <type>`        | Skill type: rigid or flexible (default: flexible) |
| `--platforms <list>`   | Comma-separated platforms (default: claude-code)  |
| `--triggers <list>`    | Comma-separated triggers (default: manual)        |
| `--output-dir <dir>`   | Output directory                                  |

#### Examples

```bash
# Create a basic skill
harness skill create my-deploy --description "Deploy to production"

# Create with options
harness skill create ci-helper --type rigid --platforms "claude-code,gemini-cli"
```

---

### harness skill publish

Validate and publish a skill to the `@harness-skills/*` namespace on npm.

```
harness skill publish [options]
```

| Option             | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| `--dry-run`        | Run validation and generate package.json without publishing |
| `--dir <dir>`      | Skill directory (default: current directory)                |
| `--registry <url>` | Use a custom npm registry URL                               |

Runs a 6-check pre-publish validation pipeline: schema validation, required fields, SKILL.md sections, version bump, name guard, dependency check.

#### Examples

```bash
# Dry run to check validation
harness skill publish --dry-run

# Publish from a specific directory
harness skill publish --dir ./my-skill
```

---

## Constraint Sharing Commands

### harness share

Extract and publish a constraints bundle from `constraints.yaml`. Packages your architecture constraints (layers, dependency rules, thresholds) into a portable `.harness-constraints.json` file that other projects can install.

```
harness share [path]
```

**Arguments:**

```
[path]                   Path to the project root (default: .)
```

**Options:**

```
-o, --output <dir>      Output directory for the bundle (default: .)
```

**Examples:**

```bash
# Extract constraints bundle from current project
harness share

# Output bundle to a specific directory
harness share --output ./dist

# Share from a specific project
harness share /path/to/project
```

---

### harness install-constraints

Install a constraints bundle into the local harness config. Merges layers, dependency rules, and thresholds from a `.harness-constraints.json` file into `harness.config.json`.

```
harness install-constraints <source>
```

**Arguments:**

```
<source>                Path to a .harness-constraints.json bundle file
```

**Options:**

```
--force-local           Resolve all conflicts by keeping local values
--force-package         Resolve all conflicts by using package values
--dry-run               Show what would change without writing files
-c, --config <path>     Path to harness.config.json
```

**Examples:**

```bash
# Install constraints from a bundle
harness install-constraints ./team-standards.harness-constraints.json

# Preview changes without applying
harness install-constraints ./standards.harness-constraints.json --dry-run

# Force package values on conflict
harness install-constraints ./standards.harness-constraints.json --force-package
```

---

### harness uninstall-constraints

Remove a previously installed constraints package, reverting the config sections it contributed.

```
harness uninstall-constraints <name>
```

**Arguments:**

```
<name>                  Name of the constraint package to uninstall
```

**Options:**

```
-c, --config <path>     Path to harness.config.json
```

**Examples:**

```bash
# Uninstall a constraints package
harness uninstall-constraints team-standards
```

---

## Linter Commands

### harness linter generate

Generate ESLint rules from a harness-linter.yml configuration.

```
harness linter generate [options]
```

**Options:**

```
-c, --config <path>     Path to harness-linter.yml config
-o, --output <dir>      Output directory for generated rules
--clean                 Remove existing generated rules before generating
--dry-run               Preview what would be generated without writing files
--json                  Output results as JSON
--verbose               Verbose output
```

**Examples:**

```bash
# Generate rules from default config
harness linter generate

# Generate with custom config and output directory
harness linter generate --config ./my-linter.yml --output ./eslint-rules

# Preview without writing
harness linter generate --dry-run
```

---

### harness linter validate

Validate a harness-linter.yml configuration file.

```
harness linter validate [options]
```

**Options:**

```
-c, --config <path>     Path to harness-linter.yml config
--json                  Output results as JSON
```

**Examples:**

```bash
# Validate default config
harness linter validate

# Validate a specific config file
harness linter validate --config ./my-linter.yml
```

---

## State Commands

### harness state show

Show current project state.

```
harness state show [options]
```

**Options:**

```
--path <path>           Project root path
--stream <name>         Target a specific stream
```

---

### harness state reset

Reset project state.

```
harness state reset [options]
```

**Options:**

```
--path <path>           Project root path
--stream <name>         Target a specific stream
--yes                   Skip confirmation prompt
```

**Examples:**

```bash
# Reset state (with confirmation)
harness state reset

# Reset without confirmation
harness state reset --yes
```

---

### harness state learn

Append a learning to .harness/learnings.md.

```
harness state learn <message> [options]
```

**Options:**

```
--path <path>           Project root path
--stream <name>         Target a specific stream
```

**Examples:**

```bash
# Record a learning
harness state learn "Circular deps in data layer resolved by extracting interfaces"
```

---

### harness state streams

Manage state streams. Streams allow multiple parallel workstreams to track state independently.

```
harness state streams
```

---

## Learnings Commands

### harness learnings prune

Analyze global learnings for patterns, present improvement proposals, and archive old entries.

```
harness learnings prune [options]
```

**Options:**

```
--path <path>           Project root path (default: .)
--stream <name>         Target a specific stream
```

**Examples:**

```bash
# Prune and consolidate learnings
harness learnings prune

# Prune a specific stream
harness learnings prune --stream feature-auth
```

---

## Usage and Cost Tracking Commands

### harness usage sessions

List recent sessions with token usage and cost.

```
harness usage sessions [options]
```

**Options:**

```
--limit <n>             Number of sessions to show (default: 10, max: 100)
```

**Examples:**

```bash
# List recent sessions
harness usage sessions

# Show last 25 sessions
harness usage sessions --limit 25

# Output as JSON
harness usage sessions --json
```

---

### harness usage session

Show detailed token breakdown for a specific session.

```
harness usage session <id>
```

**Arguments:**

```
<id>                    Session ID
```

**Examples:**

```bash
# Show details for a session
harness usage session abc123
```

---

### harness usage daily

Show per-day token usage and cost.

```
harness usage daily [options]
```

**Options:**

```
--days <n>              Number of days to show (default: 7, max: 90)
```

**Examples:**

```bash
# Show last 7 days of usage
harness usage daily

# Show last 30 days
harness usage daily --days 30

# Output as JSON
harness usage daily --json
```

---

### harness usage latest

Show the most recently completed session cost summary.

```
harness usage latest
```

**Examples:**

```bash
# Show latest session cost
harness usage latest
```

---

## Integration Commands

### harness setup-mcp

Configure MCP server for AI agent integration.

```
harness setup-mcp [options]
```

**Options:**

```
--client <client>       Client to configure (claude, gemini, codex, cursor, all). Default: all
--pick                  Launch interactive tool picker (Cursor only)
--yes                   Bypass interactive picker and use curated 25-tool set (Cursor only)
```

**Examples:**

```bash
# Set up MCP integration for all clients
harness setup-mcp

# Set up for a specific client
harness setup-mcp --client claude
```

---

### harness integrations list

Show all MCP peer integrations and their current status (enabled, available, dismissed).

```
harness integrations list
```

**Examples:**

```bash
# List all integrations
harness integrations list
```

---

### harness integrations add

Enable an MCP peer integration by adding its configuration to your MCP settings.

```
harness integrations add <name>
```

**Arguments:**

```
<name>                  Integration name (e.g., perplexity, augment-code)
```

**Examples:**

```bash
# Enable Perplexity integration
harness integrations add perplexity
```

---

### harness integrations remove

Remove an MCP peer integration from your configuration.

```
harness integrations remove <name>
```

**Arguments:**

```
<name>                  Integration name (e.g., perplexity, augment-code)
```

**Examples:**

```bash
# Remove an integration
harness integrations remove perplexity
```

---

### harness integrations dismiss

Suppress doctor recommendations for an integration you do not want to use.

```
harness integrations dismiss <name>
```

**Arguments:**

```
<name>                  Integration name (e.g., perplexity, augment-code)
```

**Examples:**

```bash
# Dismiss integration recommendation
harness integrations dismiss augment-code
```

---

### harness generate-slash-commands

Generate native slash commands for Claude Code, Gemini CLI, Codex CLI, and Cursor from skill metadata.

```
harness generate-slash-commands [options]
```

**Options:**

```
--platforms <platforms>  Target platforms (comma-separated)
--global                Install commands globally
--include-global        Include built-in global skills alongside project skills
--output <dir>          Output directory
--skills-dir <dir>      Directory containing skills
--dry-run               Preview without writing files
--yes                   Skip confirmation prompts
```

**Examples:**

```bash
# Generate slash commands for all platforms
harness generate-slash-commands

# Generate only for Claude Code, dry run
harness generate-slash-commands --platforms claude-code --dry-run

# Generate globally with custom skills directory
harness generate-slash-commands --global --skills-dir ./my-skills
```

---

## Generation Commands

### harness generate-agent-definitions

Generate agent definition files from personas for Claude Code and Gemini CLI.

```
harness generate-agent-definitions [options]
```

**Options:**

```
--platforms <list>       Target platforms (comma-separated, default: claude-code,gemini-cli)
--global                 Write to global agent directories
--output <dir>           Custom output directory
--dry-run                Show what would change without writing
```

**Examples:**

```bash
# Generate agent definitions for all platforms
harness generate-agent-definitions

# Preview without writing
harness generate-agent-definitions --dry-run

# Generate only for Claude Code
harness generate-agent-definitions --platforms claude-code
```

---

### harness generate

Generate all platform integrations (slash commands + agent definitions).

```
harness generate [options]
```

**Options:**

```
--platforms <list>       Target platforms (comma-separated, default: claude-code,gemini-cli)
--global                 Write to global directories
--include-global         Include built-in global skills
--output <dir>           Custom output directory
--dry-run                Show what would change without writing
--yes                    Skip deletion confirmation prompts
```

**Examples:**

```bash
# Generate all integrations
harness generate

# Generate globally with dry run
harness generate --global --dry-run
```

---

## Dashboard Command

### harness dashboard

Start the Harness local web dashboard, providing a visual overview of project health, architecture metrics, entropy analysis, and more.

```
harness dashboard [options]
```

**Options:**

```
--port <port>           Client dev server port (default: 3700)
--api-port <port>       API server port (default: 3701)
--no-open               Do not automatically open browser
--cwd <path>            Project directory (defaults to cwd)
```

**Examples:**

```bash
# Start dashboard with defaults
harness dashboard

# Start on custom ports without opening browser
harness dashboard --port 4000 --api-port 4001 --no-open

# Start for a specific project
harness dashboard --cwd /path/to/project
```

---

## CI/CD Commands

### harness ci check

Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch).

```
harness ci check [options]
```

**Options:**

```
--skip <checks>          Comma-separated checks to skip (e.g., entropy,docs)
--fail-on <severity>     Fail on severity level: error (default) or warning
```

**Examples:**

```bash
# Run all CI checks
harness ci check

# Skip entropy and docs checks
harness ci check --skip entropy,docs

# Fail on warnings too
harness ci check --fail-on warning
```

---

### harness ci init

Generate CI configuration for harness checks.

```
harness ci init [options]
```

**Options:**

```
--platform <platform>    CI platform: github, gitlab, or generic
--checks <list>          Comma-separated list of checks to include
```

**Examples:**

```bash
# Generate GitHub Actions workflow
harness ci init --platform github

# Generate with specific checks
harness ci init --platform gitlab --checks validate,deps,docs
```

---

## Performance Commands

### harness perf bench

Run benchmarks via vitest bench.

```
harness perf bench [glob]
```

**Arguments:**

```
[glob]                   Glob pattern to filter benchmark files
```

**Examples:**

```bash
# Run all benchmarks
harness perf bench

# Run benchmarks matching a pattern
harness perf bench "src/**/*.bench.ts"
```

---

### harness perf baselines

Manage performance baselines (show, update, compare).

```
harness perf baselines
```

---

### harness perf critical-paths

Show resolved critical path set from annotations and graph inference.

```
harness perf critical-paths
```

---

### harness perf report

Generate a full performance report with metrics, trends, and hotspots.

```
harness perf report
```

---

## Update Command

### harness update

Update all @harness-engineering packages to the latest version.

```
harness update [options]
```

**Options:**

```
--version <semver>       Pin @harness-engineering/cli to a specific version
```

**Examples:**

```bash
# Update to latest
harness update

# Pin to a specific version
harness update --version 1.5.0
```

---

## Graph Commands

### harness scan

Scan project and build knowledge graph.

```
harness scan [path]
```

**Arguments:**

```
[path]                   Project root path (default: .)
```

**Examples:**

```bash
# Scan current project
harness scan

# Scan a specific path
harness scan /path/to/project
```

---

### harness ingest

Ingest data into the knowledge graph.

```
harness ingest [options]
```

**Options:**

```
--source <name>          Source to ingest: code, knowledge, git, jira, slack
--all                    Run all sources (code, knowledge, git, and configured connectors)
--full                   Force full re-ingestion
```

**Examples:**

```bash
# Ingest code structure
harness ingest --source code

# Ingest all sources
harness ingest --all

# Force full re-ingestion
harness ingest --all --full
```

---

### harness query

Query the knowledge graph.

```
harness query <rootNodeId> [options]
```

**Arguments:**

```
<rootNodeId>             Starting node ID (required)
```

**Options:**

```
--depth <n>              Max traversal depth (default: 3)
--types <types>          Comma-separated node types to include
--edges <edges>          Comma-separated edge types to include
--bidirectional          Traverse both directions
```

**Examples:**

```bash
# Query from a specific node
harness query src/services/user-service.ts

# Query with depth and type filters
harness query src/index.ts --depth 5 --types file,function --edges imports
```

---

### harness graph status

Show knowledge graph statistics.

```
harness graph status
```

---

### harness graph export

Export the knowledge graph.

```
harness graph export [options]
```

**Options:**

```
--format <format>        Output format: json or mermaid (required)
```

**Examples:**

```bash
# Export as JSON
harness graph export --format json

# Export as Mermaid diagram
harness graph export --format mermaid
```

---

## Hooks Commands

### harness hooks init

Install Claude Code hook configurations into the current project. Copies hook scripts to `.harness/hooks/` and merges hook entries into `.claude/settings.json`.

```
harness hooks init [options]
```

**Options:**

```
--profile <profile>      Hook profile: minimal, standard, or strict (default: standard)
```

**Profiles:**

- **minimal** — Safety floor: `block-no-verify`
- **standard** — Balanced enforcement (default): all minimal hooks plus `protect-config`, `quality-gate`, `pre-compact-state`, `adoption-tracker`, `telemetry-reporter`
- **strict** — Full enforcement: all standard hooks plus `cost-tracker`, `sentinel-pre`, `sentinel-post`

**Examples:**

```bash
# Install with default (standard) profile
harness hooks init

# Install strict profile
harness hooks init --profile strict

# Output as JSON
harness hooks init --json
```

---

### harness hooks list

Show installed hooks and the active profile.

```
harness hooks list
```

**Examples:**

```bash
# List installed hooks
harness hooks list

# List as JSON
harness hooks list --json
```

---

### harness hooks add

Add a single hook without changing the active profile.

```
harness hooks add <hook-name>
```

**Arguments:**

```
<hook-name>              Hook name or alias (e.g., sentinel)
```

**Examples:**

```bash
# Add a specific hook
harness hooks add sentinel
```

---

### harness hooks remove

Remove all harness-managed hooks from the current project. Deletes `.harness/hooks/` and cleans hook entries from `.claude/settings.json`.

```
harness hooks remove
```

**Examples:**

```bash
# Remove all harness hooks
harness hooks remove

# Remove and get JSON output
harness hooks remove --json
```

---

## Exit Codes

The CLI uses the following exit codes:

```
0       Success
1       Validation failed
2       General error
```

Use exit codes in scripts:

```bash
harness validate
if [ $? -ne 0 ]; then
  echo "Validation failed"
  exit 1
fi
```

---

## Troubleshooting

### Command Not Recognized

Ensure the CLI is installed and in your PATH:

```bash
npx harness --help
which harness
```

### Configuration Not Found

Specify the config path explicitly:

```bash
harness validate --config=/path/to/harness.config.json
```

### See Also

- [Configuration Reference](./configuration.md)
- [CLI Commands (auto-generated)](./cli-commands.md)

---

_Last Updated: 2026-04-06_
