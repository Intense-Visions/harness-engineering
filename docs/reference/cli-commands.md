<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# CLI Command Reference

Complete reference for all `harness` CLI commands and subcommands.

## Top-Level Commands

### `harness add <type> <name>`

Add a component to the project

### `harness blueprint [path]`

Generate a self-contained, interactive blueprint of the codebase

**Options:**

- `-o, --output` — Output directory

### `harness check-arch`

Check architecture assertions against baseline and thresholds

**Options:**

- `--update-baseline` — Capture current state as new baseline
- `--module` — Check a single module

### `harness check-deps`

Validate dependency layers and detect circular dependencies

### `harness check-docs`

Check documentation coverage

**Options:**

- `--min-coverage` — Minimum coverage percentage

### `harness check-perf`

Run performance checks: structural complexity, coupling, and size budgets

**Options:**

- `--structural` — Run structural complexity checks only
- `--coupling` — Run coupling metric checks only
- `--size` — Run size budget checks only

### `harness check-phase-gate`

Verify that implementation files have matching spec documents

### `harness check-security`

Run lightweight security scan: secrets, injection, XSS, weak crypto

**Options:**

- `--severity` — Minimum severity threshold
- `--changed-only` — Only scan git-changed files

### `harness cleanup`

Detect entropy issues (doc drift, dead code, patterns)

**Options:**

- `-t, --type` — Issue type: drift, dead-code, patterns, all

### `harness create-skill`

Scaffold a new skill with skill.yaml and SKILL.md

**Options:**

- `--name` — Skill name (kebab-case)
- `--description` — Skill description
- `--cognitive-mode` — Cognitive mode (adversarial-reviewer, constructive-architect, meticulous-implementer, diagnostic-investigator, advisory-guide, meticulous-verifier)
- `--reads` — File patterns the skill reads
- `--produces` — What the skill produces
- `--pre-checks` — Pre-check commands
- `--post-checks` — Post-check commands

### `harness doctor`

Check environment health: Node version, slash commands, MCP configuration

### `harness fix-drift`

Auto-fix entropy issues (doc drift, dead code)

**Options:**

- `--no-dry-run` — Actually apply fixes (default is dry-run mode)

### `harness generate`

Generate all platform integrations (slash commands + agent definitions)

**Options:**

- `--platforms` — Target platforms (comma-separated)
- `--global` — Write to global directories
- `--include-global` — Include built-in global skills
- `--output` — Custom output directory
- `--dry-run` — Show what would change without writing
- `--yes` — Skip deletion confirmation prompts

### `harness generate-agent-definitions`

Generate agent definition files from personas for Claude Code and Gemini CLI

**Options:**

- `--platforms` — Target platforms (comma-separated)
- `--global` — Write to global agent directories
- `--output` — Custom output directory
- `--dry-run` — Show what would change without writing

### `harness generate-slash-commands`

Generate native slash commands for Claude Code and Gemini CLI from skill metadata

**Options:**

- `--platforms` — Target platforms (comma-separated)
- `--global` — Write to global config directories
- `--include-global` — Include built-in global skills alongside project skills
- `--output` — Custom output directory
- `--skills-dir` — Skills directory to scan
- `--dry-run` — Show what would change without writing
- `--yes` — Skip deletion confirmation prompts

### `harness impact-preview`

Show blast radius of staged changes using the knowledge graph

**Options:**

- `--detailed` — Show all affected files instead of top items
- `--per-file` — Show impact per staged file instead of aggregate
- `--path` — Project root (default: cwd)

### `harness ingest`

Ingest data into the knowledge graph

**Options:**

- `--source` — Source to ingest (code, knowledge, git, jira, slack)
- `--all` — Run all sources (code, knowledge, git, and configured connectors)
- `--full` — Force full re-ingestion

### `harness init`

Initialize a new harness-engineering project

**Options:**

- `-n, --name` — Project name
- `-l, --level` — Adoption level (basic, intermediate, advanced)
- `--framework` — Framework overlay (nextjs)
- `--language` — Target language (typescript, python, go, rust, java)
- `-f, --force` — Overwrite existing files
- `-y, --yes` — Use defaults without prompting

### `harness install <skill>`

Install a community skill from the @harness-skills registry

**Options:**

- `--force` — Force reinstall even if same version is already installed
- `--from` — Install from a local directory or .tgz file
- `--registry` — Use a custom npm registry URL

### `harness install-constraints <source>`

Install a constraints bundle into the local harness config

**Options:**

- `--force-local` — Resolve all conflicts by keeping local values
- `--force-package` — Resolve all conflicts by using package values
- `--dry-run` — Show what would change without writing files
- `-c, --config` — Path to harness.config.json

### `harness mcp`

Start the MCP (Model Context Protocol) server on stdio

### `harness query <rootNodeId>`

Query the knowledge graph

**Options:**

- `--depth` — Max traversal depth
- `--types` — Comma-separated node types to include
- `--edges` — Comma-separated edge types to include
- `--bidirectional` — Traverse both directions

### `harness scan [path]`

Scan project and build knowledge graph

### `harness setup`

Configure harness environment: slash commands, MCP, and more

### `harness setup-mcp`

Configure MCP server for AI agent integration

**Options:**

- `--client` — Client to configure (claude, gemini, all)

### `harness share [path]`

Extract and publish a constraints bundle from constraints.yaml

**Options:**

- `-o, --output` — Output directory for the bundle

### `harness uninstall <skill>`

Uninstall a community skill

**Options:**

- `--force` — Remove even if other skills depend on this one

### `harness uninstall-constraints <name>`

Remove a previously installed constraints package

**Options:**

- `-c, --config` — Path to harness.config.json

### `harness update`

Update all @harness-engineering packages to the latest version

### `harness validate`

Run all validation checks

**Options:**

- `--cross-check` — Run cross-artifact consistency validation

## Agent Commands

Agent orchestration commands

### `harness agent review`

Run unified code review pipeline on current changes

**Options:**

- `--comment` — Post inline comments to GitHub PR
- `--ci` — Enable eligibility gate, non-interactive output
- `--deep` — Add threat modeling pass to security agent
- `--no-mechanical` — Skip mechanical checks

### `harness agent run [task]`

Run an agent task

**Options:**

- `--timeout` — Timeout in milliseconds
- `--persona` — Run a persona by name
- `--trigger` — Trigger context (auto, on_pr, on_commit, manual)

## Ci Commands

CI/CD integration commands

### `harness ci check`

Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch)

**Options:**

- `--skip` — Comma-separated checks to skip (e.g., entropy,docs)
- `--fail-on` — Fail on severity level: error (default) or warning

### `harness ci init`

Generate CI configuration for harness checks

**Options:**

- `--platform` — CI platform: github, gitlab, or generic
- `--checks` — Comma-separated list of checks to include

## Graph Commands

Knowledge graph management

### `harness graph export`

Export graph

**Options:**

- `--format` — Output format (json, mermaid)

### `harness graph status`

Show graph statistics

## Hooks Commands

Manage Claude Code hook configurations

### `harness hooks init`

Install Claude Code hook configurations into the current project

**Options:**

- `--profile` — Hook profile: minimal, standard, or strict

### `harness hooks list`

Show installed hooks and active profile

### `harness hooks remove`

Remove harness-managed hooks from the current project

## Integrations Commands

Manage MCP peer integrations (add, list, remove, dismiss)

### `harness integrations add <name>`

Enable an MCP integration

### `harness integrations dismiss <name>`

Suppress doctor recommendations for an integration

### `harness integrations list`

Show all MCP integrations with status

### `harness integrations remove <name>`

Remove an MCP integration

## Learnings Commands

Learnings management commands

### `harness learnings prune`

Analyze global learnings for patterns, present improvement proposals, and archive old entries

**Options:**

- `--path` — Project root path
- `--stream` — Target a specific stream

## Linter Commands

Generate and validate ESLint rules from YAML config

### `harness linter generate`

Generate ESLint rules from harness-linter.yml

**Options:**

- `-c, --config` — Path to harness-linter.yml
- `-o, --output` — Override output directory
- `--clean` — Remove existing files before generating
- `--dry-run` — Preview without writing files
- `--json` — Output as JSON
- `--verbose` — Show detailed output

### `harness linter validate`

Validate harness-linter.yml config

**Options:**

- `-c, --config` — Path to harness-linter.yml
- `--json` — Output as JSON

## Orchestrator Commands

### `harness orchestrator run`

Run the orchestrator daemon

**Options:**

- `-w, --workflow` — Path to WORKFLOW.md

## Perf Commands

Performance benchmark and baseline management

### `harness perf baselines`

Manage performance baselines

### `harness perf bench [glob]`

Run benchmarks via vitest bench

### `harness perf critical-paths`

Show resolved critical path set (annotations + graph inference)

### `harness perf report`

Full performance report with metrics, trends, and hotspots

## Persona Commands

Agent persona management commands

### `harness persona generate <name>`

Generate artifacts from a persona config

**Options:**

- `--output-dir` — Output directory
- `--only` — Generate only: ci, agents-md, runtime

### `harness persona list`

List available agent personas

## Skill Commands

Skill management commands

### `harness skill create <name>`

Scaffold a new community skill

**Options:**

- `--description` — Skill description
- `--type` — Skill type: rigid or flexible
- `--platforms` — Comma-separated platforms (default: claude-code)
- `--triggers` — Comma-separated triggers (default: manual)
- `--output-dir` — Output directory (default: agents/skills/claude-code/)

### `harness skill info <name>`

Show metadata for a skill

### `harness skill list`

List available skills

**Options:**

- `--installed` — Show only community-installed skills
- `--local` — Show only project-local skills
- `--all` — Show all skills (default)

### `harness skill publish`

Validate and publish a skill to @harness-skills on npm

**Options:**

- `--dry-run` — Run validation and generate package.json without publishing
- `--dir` — Skill directory (default: current directory)
- `--registry` — Use a custom npm registry URL

### `harness skill run <name>`

Run a skill (outputs SKILL.md content with context preamble)

**Options:**

- `--path` — Project root path for context injection
- `--complexity` — Rigor level: fast, standard, thorough
- `--phase` — Start at a specific phase (for re-entry)
- `--party` — Enable multi-perspective evaluation

### `harness skill search <query>`

Search for community skills on the @harness-skills registry

**Options:**

- `--platform` — Filter by platform (e.g., claude-code)
- `--trigger` — Filter by trigger type (e.g., manual, automatic)
- `--registry` — Use a custom npm registry URL

### `harness skill validate`

Validate all skill.yaml files and SKILL.md structure

## State Commands

Project state management commands

### `harness state learn <message>`

Append a learning to .harness/learnings.md

**Options:**

- `--path` — Project root path
- `--stream` — Target a specific stream

### `harness state reset`

Reset project state (deletes .harness/state.json)

**Options:**

- `--path` — Project root path
- `--stream` — Target a specific stream
- `--yes` — Skip confirmation prompt

### `harness state show`

Show current project state

**Options:**

- `--path` — Project root path
- `--stream` — Target a specific stream

### `harness state streams`

Manage state streams
