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

## Project Commands

### harness init

Initialize a new Harness Engineering project.

```
harness init [options]
```

**Options:**

```
-n, --name <name>       Project name
-l, --level <level>     Project level
--framework             Include framework scaffolding
-f, --force             Overwrite existing files
-y, --yes               Skip confirmation prompts
```

**Examples:**

```bash
# Initialize with defaults (interactive)
harness init

# Initialize with a specific name and level
harness init --name my-project --level 3

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
--cross-check           Enable cross-check validation
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

## Entropy and Drift Commands

### harness cleanup

Detect entropy issues such as documentation drift, dead code, and inconsistent patterns.

```
harness cleanup [options]
```

**Options:**

```
-t, --type <type>       Type of entropy to check (doc-drift, dead-code, patterns, all). Default: all
```

**Examples:**

```bash
# Detect all entropy issues
harness cleanup

# Check only for documentation drift
harness cleanup --type doc-drift

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

## Agent Commands

### harness agent run

Run an agent task.

```
harness agent run [options]
```

**Options:**

```
--timeout <ms>          Timeout in milliseconds
--persona <name>        Agent persona to use
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

Run self-review on current changes.

```
harness agent review
```

**Examples:**

```bash
# Review current changes
harness agent review
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
--only <type>           Generate only a specific artifact type
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
harness skill list
```

---

### harness skill run

Run a skill, outputting SKILL.md content with a context preamble.

```
harness skill run <name> [options]
```

**Options:**

```
--path <path>           Project path
--complexity <level>    Complexity level
--phase <name>          Phase name
--party                 Enable party mode
```

**Examples:**

```bash
# Run a skill
harness skill run code-review

# Run with complexity and phase context
harness skill run implementation --complexity high --phase build
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

| Option        | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `--dry-run`   | Run validation and generate package.json without publishing |
| `--dir <dir>` | Skill directory (default: current directory)                |

Runs a 6-check pre-publish validation pipeline: schema validation, required fields, SKILL.md sections, version bump, name guard, dependency check.

#### Examples

```bash
# Dry run to check validation
harness skill publish --dry-run

# Publish from a specific directory
harness skill publish --dir ./my-skill
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
--path <path>           Project path
```

---

### harness state reset

Reset project state.

```
harness state reset [options]
```

**Options:**

```
--path <path>           Project path
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
--path <path>           Project path
```

**Examples:**

```bash
# Record a learning
harness state learn "Circular deps in data layer resolved by extracting interfaces"
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
--client <client>       Target AI client to configure
```

**Examples:**

```bash
# Set up MCP integration
harness setup-mcp

# Set up for a specific client
harness setup-mcp --client claude
```

---

### harness generate-slash-commands

Generate native slash commands for Claude Code and Gemini CLI from skill metadata.

```
harness generate-slash-commands [options]
```

**Options:**

```
--platforms <platforms>  Target platforms (e.g., claude, gemini)
--global                Install commands globally
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
harness generate-slash-commands --platforms claude --dry-run

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

## CI/CD Commands

### harness ci check

Run all harness checks for CI (validate, deps, docs, entropy, phase-gate).

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

- **minimal** — Lightweight set of hooks for basic enforcement
- **standard** — Balanced set of hooks for typical projects (default)
- **strict** — Full enforcement with all available hook scripts

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

---

_Last Updated: 2026-03-30_
