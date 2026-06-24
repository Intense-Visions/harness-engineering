<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# CLI Command Reference

Complete reference for all `harness` CLI commands and subcommands. See the [Features Overview](../guides/features-overview.md) for narrative documentation.

## Top-Level Commands

### `harness add <type> <name>`

Add a component to the project

**Arguments:**

- `type` (required) — Component type (layer, module, doc, skill, persona)
- `name` (required) — Component name

### `harness advise-skills`

Content-based skill recommendations for a spec

**Options:**

- `--spec-path` — Path to the spec (proposal.md)
- `--thorough` — Include Consider tier in output
- `--top` — Max skills per tier (default 5)
- `--json` — Output as JSON

### `harness align-design-system`

Apply codemods for safe DRIFT-T001/T002/T003 findings and emit suggestions for DRIFT-T004 + all DRIFT-P\*. Runs standalone (invokes detect-design-drift internally) or pipeline (reads pipeline.driftFindings from .harness/handoff.json).

**Options:**

- `--dry-run` — Compute diffs without writing files. Default: write.
- `-f, --files` — Optional file/glob scope (standalone mode only — passed to detect-design-drift).
- `--mode` — standalone (default) or pipeline (read findings from handoff.json) (default: "standalone")
- `--design-strictness` — Override design.strictness: strict | standard | permissive
- `--revert` — Inverse-apply the most-recent batch recorded at .harness/align/last-batch.json. Skips files edited externally since the apply.

### `harness audit-protected`

Report all harness-ignore protected code regions

### `harness backfill-skill-provenance`

Stamp `provenance: user-authored` on every catalog skill missing the field (one-shot migration)

**Options:**

- `--root` — Project root containing agents/skills/ (default: current working directory)

### `harness blueprint [path]`

Generate a self-contained, interactive blueprint of the codebase

**Arguments:**

- `path` (optional) — Path to the project root

**Options:**

- `-o, --output` — Output directory (default: "docs/blueprint")

### `harness check-arch`

Check architecture assertions against baseline and thresholds

**Options:**

- `--update-baseline` — Capture current state as new baseline
- `--module` — Check a single module

### `harness check-deps`

Validate dependency layers and detect circular dependencies

### `harness check-design`

Run the design verifier suite (component-anatomy + design-craft critique). Mirrors `harness check-docs`. Single-pass; the convergence fix loop lives in the design-pipeline orchestrator (sub-project #5).

**Options:**

- `-m, --mode` — Audit mode: fast | full (default: "full")
- `-f, --files` — Optional file/glob scoping. Defaults to all project source files.

### `harness check-docs`

Check documentation coverage

**Options:**

- `--min-coverage` — Minimum coverage percentage (default: "80")

### `harness check-harness-strength`

Mechanically audit this project's harness setup against the 7 strength patterns

**Options:**

- `--severity` — Minimum severity threshold to display and gate on (default: "warning")
- `--mode` — Audit mode: adopter | toolkit (default: auto-detect)
- `--toolkit` — Force toolkit mode
- `--adopter` — Force adopter mode
- `--report-only` — Always exit 0 regardless of findings

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

- `--severity` — Minimum severity threshold (default: "warning")
- `--changed-only` — Only scan git-changed files

### `harness cleanup`

Detect entropy issues (doc drift, dead code, patterns)

**Options:**

- `-t, --type` — Issue type: drift, dead-code, patterns, all (default: "all")

### `harness cleanup-sessions`

Remove stale entries from .harness/. Default: only .harness/sessions/ (no write in 24h).

**Options:**

- `--dry-run` — List stale entries without deleting them
- `--path` — Project root path (default: ".")
- `--all` — Sweep every registered .harness/ target
- `--include` — Comma-separated target names (mutually-exclusive with --exclude/--all)
- `--exclude` — Comma-separated target names to skip

### `harness copy-craft`

LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, CLI output, commit subjects, PR descriptions, code comments. Third craft-pipeline ceiling skill. Graceful degradation when git/gh prereqs absent.

**Options:**

- `-f, --files` — Optional source file/glob scope
- `-s, --surfaces` — Restrict to: error / log / cli-output / commit / pr-description / comment
- `--max-files` — Cap source file count (default: 100)
- `--max-items-per-file` — Cap per-file item sampling (default: 20)
- `--commits-since` — Commit window (default: '1 month ago')
- `--pr-limit` — PR count cap (default: 20)

### `harness create-skill`

Scaffold a new skill with skill.yaml and SKILL.md

**Options:**

- `--name` — Skill name (kebab-case)
- `--description` — Skill description
- `--cognitive-mode` — Cognitive mode (adversarial-reviewer, constructive-architect, meticulous-implementer, diagnostic-investigator, advisory-guide, meticulous-verifier) (default: "constructive-architect")
- `--reads` — File patterns the skill reads
- `--produces` — What the skill produces
- `--pre-checks` — Pre-check commands
- `--post-checks` — Post-check commands

### `harness dashboard`

Start the Harness local web dashboard

**Options:**

- `--port` — Client dev server port (default: "3700")
- `--api-port` — API server port (default: "3701")
- `--orchestrator-url` — Orchestrator URL (default: http://localhost:8080)
- `--no-open` — Do not automatically open browser
- `--cwd` — Project directory (defaults to cwd)

### `harness design-pipeline`

Run the design-pipeline orchestrator: FRESHEN → DETECT → FIX → AUDIT → FILL → REPORT. Composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a single sequential pipeline with convergence-based remediation.

**Options:**

- `--fix` — Enable convergence-based remediation (default: detect + report only)
- `--no-freshen` — Skip the FRESHEN phase
- `--no-fill` — Skip the FILL phase (input bootstrap + craft polish)
- `--ci` — Non-interactive: safe fixes only, no prompts
- `-f, --files` — Optional file/glob scope passed to each verifier
- `-m, --mode` — Verifier mode: fast | full (default: "fast")
- `--design-strictness` — Override design.strictness: strict | standard | permissive

### `harness doctor`

Check environment health: Node, slash commands, MCP, integrations, integration credentials, hooks, baselines, sessions

### `harness fix-drift`

Auto-fix entropy issues (doc drift, dead code)

**Options:**

- `--no-dry-run` — Actually apply fixes (default is dry-run mode)

### `harness generate`

Generate all platform integrations (slash commands + agent definitions)

**Options:**

- `--platforms` — Target platforms (comma-separated) (default: "claude-code,gemini-cli")
- `--global` — Write to global directories
- `--include-global` — Include built-in global skills
- `--output` — Custom output directory
- `--dry-run` — Show what would change without writing
- `--yes` — Skip deletion confirmation prompts

### `harness generate-agent-definitions`

Generate agent definition files from personas for Claude Code, Gemini CLI, and Cursor

**Options:**

- `--platforms` — Target platforms (comma-separated) (default: "claude-code,gemini-cli")
- `--global` — Write to global agent directories
- `--output` — Custom output directory
- `--dry-run` — Show what would change without writing

### `harness generate-slash-commands`

Generate native commands for Claude Code, Gemini CLI, Codex CLI, and Cursor from skill metadata

**Options:**

- `--platforms` — Target platforms (comma-separated) (default: "claude-code,gemini-cli")
- `--global` — Write to global config directories
- `--include-global` — Include built-in global skills alongside project skills
- `--output` — Custom output directory
- `--skills-dir` — Skills directory to scan
- `--dry-run` — Show what would change without writing
- `--yes` — Skip deletion confirmation prompts
- `--cursor-mode` — For cursor platform: "rules" (.mdc with description/globs/alwaysApply, default) or "commands" (.md with name/description for plugin commands/ dir) (default: "rules")

### `harness impact-preview`

Show blast radius of staged changes using the knowledge graph

**Options:**

- `--detailed` — Show all affected files instead of top items
- `--per-file` — Show impact per staged file instead of aggregate
- `--path` — Project root (default: cwd)

### `harness ingest`

Ingest data into the knowledge graph

**Options:**

- `--source` — Source to ingest (code, knowledge, git, requirements, business-signals, jira, slack, ci, confluence, figma, miro)
- `--all` — Run all sources (code, knowledge, git, and configured connectors)
- `--full` — Force full re-ingestion

### `harness init`

Initialize a new harness-engineering project

**Options:**

- `-n, --name` — Project name
- `-l, --level` — Adoption level (basic, intermediate, advanced) (default: "basic")
- `-t, --template` — Specific template name (e.g. orchestrator)
- `--framework` — Framework overlay (nextjs)
- `--language` — Target language (typescript, python, go, rust, java)
- `-f, --force` — Overwrite existing files
- `-y, --yes` — Use defaults without prompting

### `harness insights`

Composite project report — health, entropy, decay, attention, impact.

**Options:**

- `--json` — Emit JSON to stdout instead of pretty text
- `--skip` — Comma-separated keys to skip (health,entropy,decay,attention,impact)

### `harness install <skill>`

Install skills from npm registry, local directory, or GitHub repository

**Arguments:**

- `skill` (required) — Skill name, @harness-skills/scoped package, or "." for bulk install

**Options:**

- `--version` — Semver range or exact version to install
- `--force` — Force reinstall even if same version is already installed
- `--from` — Install from local path, directory, or GitHub (github:owner/repo, https://github.com/owner/repo)
- `--global` — Install globally (~/.harness/skills/community/) for all projects
- `--registry` — Use a custom npm registry URL

### `harness install-constraints <source>`

Install a constraints bundle into the local harness config

**Arguments:**

- `source` (required) — Path to a .harness-constraints.json bundle file

**Options:**

- `--force-local` — Resolve all conflicts by keeping local values
- `--force-package` — Resolve all conflicts by using package values
- `--dry-run` — Show what would change without writing files
- `-c, --config` — Path to harness.config.json

### `harness knowledge-craft`

LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding decisions/). Fifth non-design craft-pipeline ceiling skill; 7 seed rubrics (load-bearing-fact, earns-graph-place, carries-forward-decision, …). Per-file critique.

**Options:**

- `-f, --files` — Optional file scope (overrides discovery)
- `--exclude-dirs` — Additional subdir names to skip (decisions is always excluded)
- `--max-files` — Cap entry count (default: 50)

### `harness knowledge-pipeline`

Run knowledge extraction, drift detection, and gap analysis

**Options:**

- `--fix` — Enable convergence-based auto-remediation (default: detect-only)
- `--ci` — Non-interactive mode — apply safe fixes only, report everything else
- `--domain` — Limit pipeline to a specific knowledge domain
- `--drift-check` — Exit 1 if unresolved drift exists (CI gate mode)
- `--analyze-images` — Enable vision model analysis of image files
- `--image-paths` — Comma-separated image file paths for analysis
- `--coverage` — Display per-domain coverage report
- `--check-contradictions` — Display cross-source contradiction report

### `harness mcp`

Start the MCP (Model Context Protocol) server on stdio

**Options:**

- `--tools` — Only register the specified tools (used by Cursor integration)
- `--tier` — Load a preset tool tier instead of all tools
- `--budget-tokens` — Auto-select tier to fit this baseline token budget

### `harness naming-craft`

LLM-judgment critique of identifier names (variables, functions, types, files). First craft-pipeline ceiling skill; uses curated rubric catalog from Martin/Beck/Karlton.

**Options:**

- `-f, --files` — Optional file/glob scope
- `-k, --kinds` — Restrict to variable / function / type / file (default: all)
- `--max-files` — Cap file count (default: 100)
- `--max-identifiers-per-file` — Cap per-file identifier sampling (default: 15)

### `harness predict`

Predict which architectural constraints will break and when

**Options:**

- `--category` — Filter to a single metric category
- `--no-roadmap` — Baseline only — skip roadmap spec impact
- `--horizon` — Forecast horizon in weeks (default: 12) (default: "12")

### `harness publish-analyses`

Publishes locally generated intelligence analyses to the external issue tracker (e.g., GitHub)

**Options:**

- `-d, --dir` — Workspace directory (default: current working directory)

### `harness query <rootNodeId>`

Query the knowledge graph

**Arguments:**

- `rootNodeId` (required) — Starting node ID

**Options:**

- `--depth` — Max traversal depth (default: "3")
- `--types` — Comma-separated node types to include
- `--edges` — Comma-separated edge types to include
- `--bidirectional` — Traverse both directions

### `harness recommend`

Recommend skills based on codebase health analysis

**Options:**

- `--no-cache` — Force fresh health snapshot
- `--top` — Max recommendations (default 5) (default: "5")

### `harness review-ci`

Run the tiered code-review gate (floor + optional LLM runner) for CI

**Options:**

- `--runner` — claude | gemini | antigravity | codex | cursor | local (omit = floor-only)
- `--block-on` — approve | comment | request-changes | none (default: "request-changes")
- `--diff` — git range (default: origin/<base>...HEAD)
- `--comment` — post verdict as a PR review (stubbed in this phase)
- `--json` — write the verdict artifact to this path

### `harness scan [path]`

Scan project and build knowledge graph

**Arguments:**

- `path` (optional) — Project root path

### `harness scan-config`

Scan CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml for prompt injection patterns

**Options:**

- `--path` — Target directory to scan (default: cwd)
- `--fix` — Strip high-severity patterns from files in-place

### `harness search <query>`

Full-text search over archived + live session content.

**Arguments:**

- `query` (required) — FTS5 query (bare words AND-joined; quotes/AND/OR/NOT/column: for advanced syntax)

**Options:**

- `-n, --limit` — Max results (default: "20")
- `--archived-only` — Skip live sessions, only search archived ones
- `--json` — Emit JSON to stdout instead of pretty text
- `--reindex` — Drop and rebuild the index from .harness/archive/sessions before searching
- `--file-kinds` — Comma-separated subset of {summary,learnings,failures,sections,llm_summary}

### `harness security-craft`

LLM-judgment critique of security posture (TS/JS source). Sixth non-design craft-pipeline ceiling skill (the final sub-project). AST-driven signal detection fires only on files with security-relevant constructs; conservative confidence defaults manage the FP risk inherent in judgment-based security.

**Options:**

- `-f, --files` — Optional file scope (overrides discovery)
- `-p, --packages` — Restrict to specific packages under packages/
- `--max-files` — Cap source-file count (default: 100)
- `--max-signals-per-file` — Cap per-file signal critique (default: 10)

### `harness setup`

Configure harness environment: slash commands, MCP, and more

### `harness setup-mcp`

Configure MCP server for AI agent integration

**Options:**

- `--client` — Client to configure (claude, gemini, codex, cursor, opencode, all) (default: "all")
- `--pick` — Launch interactive tool picker (Cursor only)
- `--yes` — Bypass interactive picker and use curated 25-tool set (Cursor only)

### `harness share [path]`

Extract and publish a constraints bundle from constraints.yaml

**Arguments:**

- `path` (optional) — Path to the project root

**Options:**

- `-o, --output` — Output directory for the bundle (default: ".")

### `harness spec-craft`

LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline ceiling skill; 7 seed rubrics from the spec-quality canon. Per-section critique.

**Options:**

- `-f, --files` — Optional spec file/glob scope
- `-k, --kinds` — Restrict to proposal / adr (default: both)
- `-s, --sections` — Restrict to specific canonical section names
- `--max-files` — Cap doc count (default: 50)
- `--max-sections-per-file` — Cap per-doc section critique (default: 10)

### `harness sync-analyses`

Pull published intelligence analyses from the external issue tracker into the local .harness/analyses/ directory

**Options:**

- `-d, --dir` — Workspace directory (default: current working directory)

### `harness sync-main`

Fast-forward the local default branch from origin (no-op on conflict)

**Options:**

- `--json` — Emit a SyncMainResult JSON object
- `--path` — Project root path (default: ".")

### `harness test-craft`

LLM-judgment critique of test quality across vitest/jest/mocha/playwright. Fourth craft-pipeline ceiling skill. Per-test critique with best-effort source pairing.

**Options:**

- `-f, --files` — Optional test file/glob scope
- `--frameworks` — Restrict to: vitest / jest / mocha / playwright
- `--max-files` — Cap test file count (default: 100)
- `--max-tests-per-file` — Cap per-file test critique (default: 20)
- `--no-source-pair` — Skip source-pairing resolution

### `harness traceability`

Show spec-to-implementation traceability from the knowledge graph

**Options:**

- `--spec` — Filter by spec file path
- `--feature` — Filter by feature name

### `harness uninstall <skill>`

Uninstall a community skill

**Arguments:**

- `skill` (required) — Skill name or @harness-skills/scoped package name

**Options:**

- `--force` — Remove even if other skills depend on this one

### `harness uninstall-constraints <name>`

Remove a previously installed constraints package

**Arguments:**

- `name` (required) — Name of the constraint package to uninstall

**Options:**

- `-c, --config` — Path to harness.config.json

### `harness update`

Update all @harness-engineering packages to the latest version

**Options:**

- `--version` — Pin @harness-engineering/cli to a specific version
- `--force` — Force update even if versions match
- `--regenerate` — Only regenerate slash commands and agent definitions (skip package updates)

### `harness validate`

Run all validation checks

**Options:**

- `--cross-check` — Run cross-artifact consistency validation
- `--agent-configs` — Validate agent configs (CLAUDE.md, hooks, skills) via agnix or built-in fallback rules
- `--strict` — Treat warnings as errors (applies to --agent-configs)
- `--agnix-bin` — Override the agnix binary path discovered on PATH

### `harness verify`

Verify project conventions (currently: branch naming). Works with or without a harness.config.json.

**Options:**

- `--branch` — Branch name to verify (defaults to HARNESS_BRANCH/GITHUB_HEAD_REF/current branch)
- `--json` — Emit machine-readable JSON output

## Adoption Commands

View skill adoption telemetry

### `harness adoption recent`

Show recent skill invocations

**Options:**

- `--limit` — Number of invocations to show (default: 20) (default: "20")

### `harness adoption skill <name>`

Show detail for a specific skill

### `harness adoption skills`

Show top skills by invocation count

**Options:**

- `--limit` — Number of skills to show (default: 20) (default: "20")

## Agent Commands

Agent orchestration commands

### `harness agent review`

Run unified code review pipeline on current changes

**Options:**

- `--comment` — Post inline comments to GitHub PR
- `--ci` — Enable eligibility gate, non-interactive output
- `--deep` — Add threat modeling pass to security agent
- `--no-mechanical` — Skip mechanical checks
- `--thorough` — Generate task-specific rubric before reading implementation
- `--isolated` — Two-stage review: spec-compliance then code-quality with disjoint context

### `harness agent run [task]`

Run an agent task

**Arguments:**

- `task` (optional) — Task to run (review, doc-review, test-review)

**Options:**

- `--timeout` — Timeout in milliseconds (default: "300000")
- `--persona` — Run a persona by name
- `--trigger` — Trigger context (auto, on_pr, on_commit, manual) (default: "auto")

## Ci Commands

CI/CD integration commands

### `harness ci check`

Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch)

**Options:**

- `--skip` — Comma-separated checks to skip (e.g., entropy,docs)
- `--fail-on` — Fail on severity level: error (default) or warning (default: "error")

### `harness ci init`

Generate CI configuration for harness checks

**Options:**

- `--platform` — CI platform: github, gitlab, or generic
- `--language` — Project language for build/lint/test steps
- `--checks` — Comma-separated list of checks to include

### `harness ci notify <report>`

Post CI check results to GitHub (PR comment or issue)

**Arguments:**

- `report` (required) — Path to CI check report JSON file (from harness ci check --json)

**Options:**

- `--target` — Notification target: pr-comment or issue
- `--pr` — PR number (required for pr-comment target)
- `--title` — Custom issue title (for issue target)
- `--labels` — Comma-separated labels for created issues

## Compound Commands

Compound (post-mortem playbook) commands

### `harness compound scan-candidates`

Scan recent fixes and hotspots for undocumented learnings; write candidate prompts

**Options:**

- `--lookback` — Lookback window (e.g. 7d, 14d). (default: "7d")
- `--non-interactive` — Emit single-line JSON status on stdout. Auto-detected when stdout is not a TTY.
- `--config` — Path to harness.config.json (default: "harness.config.json")
- `--output-path` — Override output file path (default: docs/solutions/.candidates/{YYYY-WW}.md)
- `--solutions-dir` — Solutions directory to cross-reference (default: "docs/solutions")

## Gateway Commands

Gateway API administration

### `harness gateway deliveries`

Inspect and manage webhook delivery queue

### `harness gateway token`

Manage Gateway API tokens

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

### `harness hooks add <hook-name>`

Add a hook without changing the profile

**Arguments:**

- `hook-name` (required) — Hook name or alias (e.g., sentinel)

### `harness hooks init`

Install Claude Code hook configurations into the current project

**Options:**

- `--profile` — Hook profile: minimal, standard, or strict (default: "standard")

### `harness hooks list`

Show installed hooks and active profile

### `harness hooks remove`

Remove harness-managed hooks from the current project

## Integrations Commands

Manage MCP peer integrations (add, list, remove, dismiss)

### `harness integrations add <name>`

Enable an MCP integration

**Arguments:**

- `name` (required) — Integration name (e.g. perplexity, augment-code)

### `harness integrations dismiss <name>`

Suppress doctor recommendations for an integration

**Arguments:**

- `name` (required) — Integration name (e.g. perplexity, augment-code)

### `harness integrations list`

Show all MCP integrations with status

### `harness integrations remove <name>`

Remove an MCP integration

**Arguments:**

- `name` (required) — Integration name (e.g. perplexity, augment-code)

## Learnings Commands

Learnings management commands

### `harness learnings prune`

Analyze global learnings for patterns, present improvement proposals, and archive old entries

**Options:**

- `--path` — Project root path (default: ".")
- `--stream` — Target a specific stream

## Linter Commands

Generate and validate ESLint rules from YAML config

### `harness linter generate`

Generate ESLint rules from harness-linter.yml

**Options:**

- `-c, --config` — Path to harness-linter.yml (default: "./harness-linter.yml")
- `-o, --output` — Override output directory
- `--clean` — Remove existing files before generating
- `--dry-run` — Preview without writing files
- `--json` — Output as JSON
- `--verbose` — Show detailed output

### `harness linter validate`

Validate harness-linter.yml config

**Options:**

- `-c, --config` — Path to harness-linter.yml (default: "./harness-linter.yml")
- `--json` — Output as JSON

## Maintenance Commands

Inspect built-in + custom maintenance tasks and their persisted outputs

### `harness maintenance list`

List all resolved maintenance tasks (built-in + customTasks)

**Options:**

- `--json` — Emit machine-readable JSON
- `--path` — Project root path (default: ".")

### `harness maintenance show <task-id>`

Show last N persisted runs for a task (from .harness/maintenance/[id]/outputs/)

**Options:**

- `--limit` — Number of runs to show (default: "5")
- `--json` — Emit machine-readable JSON
- `--path` — Project root path (default: ".")

## Mcp-guard Commands

Pre-launch OSV malware guard for MCP/npx packages

### `harness mcp-guard cache`

Manage the on-disk OSV advisory cache

### `harness mcp-guard check`

Check every MCP/npx package in .mcp.json against OSV.dev advisories

**Options:**

- `--strict` — Fail closed on network errors (default: fail-open)
- `--json` — Emit machine-readable JSON
- `--path` — Project root path (default: ".")

## Migrate Commands

Migrate legacy harness artifact locations to current layout

### `harness migrate backends`

Copy agent.backends (and routing) from harness.orchestrator.md into harness.config.json.

**Options:**

- `--dry-run` — Show what would change without writing
- `--force` — Overwrite existing agent.backends in harness.config.json

## Models Commands

Inspect and manage local LLM backends. Currently ships `probe`; LMLM phases add status/suggest/pool/proposals.

### `harness models probe`

Probe a local backend's /v1/models endpoint and report which configured model is loaded.

**Options:**

- `--backend` — Name of an entry in agent.backends. Defaults to the first local/pi entry.
- `--endpoint` — Override the backend endpoint (bypasses harness.config.json).
- `--api-key` — Override the API key.
- `--json` — Print machine-readable JSON instead of a human summary.

## Notifications Commands

Manage notification sinks (Slack and others)

### `harness notifications test <sink-id>`

Send a synthetic notification.test event through the named sink

**Arguments:**

- `sink-id` (required) — Sink id from harness.config.json `notifications.sinks[].id`

**Options:**

- `--message` — Override the default test message

## Orchestrator Commands

### `harness orchestrator run`

Run the orchestrator daemon

**Options:**

- `-w, --workflow` — Path to harness.orchestrator.md (default: "harness.orchestrator.md")
- `--headless` — Run without TUI (server-only mode for use with web dashboard)

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

**Arguments:**

- `name` (required) — Persona name (e.g., architecture-enforcer)

**Options:**

- `--output-dir` — Output directory (default: ".")
- `--only` — Generate only: ci, agents-md, runtime

### `harness persona list`

List available agent personas

## Proposals Commands

Skill-proposal review queue

### `harness proposals approve <id>`

Approve a proposal (runs the soundness-review gate then promotes). Requires the orchestrator to be running.

### `harness proposals list`

List skill proposals in the local queue

**Options:**

- `--status` — Filter by status — one of open | gate-running | gate-failed | approved | rejected | all (default: "open")

### `harness proposals reject <id>`

Reject a proposal with a one-line reason

**Options:**

- `--reason` — Why the proposal is being rejected

### `harness proposals show <id>`

Show a single proposal in full

## Pulse Commands

Pulse (read-side observability) commands

### `harness pulse run`

Run a pulse: query configured adapters, sanitize, assemble single-page report

**Options:**

- `--lookback` — Lookback window (e.g. 24h, 7d). Defaults to pulse.lookbackDefault.
- `--non-interactive` — Emit single-line JSON status on stdout instead of headlines+path. Auto-detected when stdout is not a TTY.
- `--config` — Path to harness.config.json (default: "harness.config.json")
- `--output-dir` — Directory to write the report into (default: "docs/pulse-reports")

## Roadmap Commands

Roadmap management

### `harness roadmap migrate`

Migrate the project roadmap to a different storage mode

**Options:**

- `--to` — Migration target (only "file-less" supported today)
- `--dry-run` — Print the migration plan without making any changes
- `--format` — Output format: "human" (default) or "json" (single JSON object for CI consumers) (default: "human")

## Routing Commands

Inspect routing config, trace decisions, and read recent dispatches

### `harness routing config`

Print active routing config and resolved fallback chains

**Options:**

- `--json` — Emit JSON to stdout instead of human-readable text

### `harness routing decisions`

List recent routing decisions from the orchestrator ring buffer (Spec B F8)

**Options:**

- `--skill` — Filter by useCase.skillName
- `--mode` — Filter by useCase.cognitiveMode
- `--backend` — Filter by chosen backendName
- `--last` — Limit to the N most recent decisions
- `--json` — Emit JSON to stdout instead of human-readable text

### `harness routing trace`

Dry-run a routing decision without dispatching (Spec B F7)

**Options:**

- `--skill` — Skill name to trace
- `--mode` — Cognitive mode to trace (or attach to --skill per spec D12)
- `--json` — Emit JSON to stdout instead of human-readable text

## Skill Commands

Skill management commands

### `harness skill create <name>`

Scaffold a new community skill

**Arguments:**

- `name` (required) — Skill name (kebab-case)

**Options:**

- `--description` — Skill description
- `--type` — Skill type: rigid or flexible (default: "flexible")
- `--platforms` — Comma-separated platforms (default: claude-code)
- `--triggers` — Comma-separated triggers (default: manual)
- `--output-dir` — Output directory (default: agents/skills/claude-code/)

### `harness skill info <name>`

Show metadata for a skill

**Arguments:**

- `name` (required) — Skill name (e.g., harness-tdd)

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

**Arguments:**

- `name` (required) — Skill name (e.g., harness-tdd)

**Options:**

- `--path` — Project root path for context injection
- `--complexity` — Rigor level: fast, standard, thorough (default: "standard")
- `--phase` — Start at a specific phase (for re-entry)
- `--party` — Enable multi-perspective evaluation
- `--backend` — Spec B: one-shot routing override forwarded to the orchestrator as HARNESS_BACKEND_OVERRIDE

### `harness skill search <query>`

Search for community skills on the @harness-skills registry

**Arguments:**

- `query` (required) — Search query

**Options:**

- `--platform` — Filter by platform (e.g., claude-code)
- `--trigger` — Filter by trigger type (e.g., manual, automatic)
- `--registry` — Use a custom npm registry URL

### `harness skill validate`

Validate all skill.yaml files and SKILL.md structure

## Snapshot Commands

Architecture timeline snapshot commands

### `harness snapshot capture`

Capture current architecture metrics as a timeline snapshot

### `harness snapshot list`

List all captured architecture snapshots

### `harness snapshot trends`

Show architecture metric trends over time

**Options:**

- `--last` — Number of recent snapshots to analyze (default: "10")
- `--since` — Show trends since ISO date

## State Commands

Project state management commands

### `harness state learn <message>`

Append a learning to .harness/learnings.md

**Arguments:**

- `message` (required) — The learning to record

**Options:**

- `--path` — Project root path (default: ".")
- `--stream` — Target a specific stream

### `harness state reset`

Reset project state (deletes .harness/state.json)

**Options:**

- `--path` — Project root path (default: ".")
- `--stream` — Target a specific stream
- `--yes` — Skip confirmation prompt

### `harness state show`

Show current project state

**Options:**

- `--path` — Project root path (default: ".")
- `--stream` — Target a specific stream

### `harness state streams`

Manage state streams

## Taint Commands

Manage sentinel session taint state

### `harness taint clear [sessionId]`

Clear session taint — removes taint file(s) and re-enables destructive operations

### `harness taint status [sessionId]`

Show current taint status for a session or all sessions

## Telemetry Commands

Telemetry identity and status management

### `harness telemetry identify`

Set or clear telemetry identity fields in .harness/telemetry.json

**Options:**

- `--project` — Project name
- `--team` — Team name
- `--alias` — User alias
- `--clear` — Remove all identity fields

### `harness telemetry status`

Show current telemetry consent state, install ID, and identity

**Options:**

- `--json` — Output as JSON

### `harness telemetry test`

Send a test event to PostHog and verify connectivity

## Usage Commands

Token usage and cost tracking

### `harness usage daily`

Show per-day token usage and cost

**Options:**

- `--days` — Number of days to show (default: 7, max: 90) (default: "7")

### `harness usage latest`

Show the most recently completed session cost summary

### `harness usage session <id>`

Show detailed token breakdown for a specific session

### `harness usage sessions`

List recent sessions with token usage and cost

**Options:**

- `--limit` — Number of sessions to show (default: 10, max: 100) (default: "10")
