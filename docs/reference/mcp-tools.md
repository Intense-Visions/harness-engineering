<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# MCP Tools Reference

Complete reference for all harness MCP (Model Context Protocol) tools.
These tools are available to AI agents via the harness MCP server.

## Checkers & Validators

### `assess_project`

Run all project health checks in parallel and return a unified report. Checks: validate, dependencies, docs, entropy, security, performance, lint.

### `check_dependencies`

Validate layer boundaries and detect circular dependencies

### `check_docs`

Analyze documentation coverage and/or validate knowledge map integrity

### `check_performance`

Run performance checks: structural complexity, coupling metrics, and size budgets

### `check_phase_gate`

Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document

### `check_task_independence`

Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.

### `validate_cross_check`

Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness

### `validate_linter_config`

Validate a harness-linter.yml configuration file

### `validate_project`

Run all validation checks on a harness engineering project

## Code Navigation

### `code_outline`

Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.

### `code_search`

Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.

### `code_unfold`

Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.

## Data & Updates

### `add_component`

Add a component (layer, doc, or component type) to the project using the harness CLI

### `update_perf_baselines`

Update performance baselines from benchmark results. Run benchmarks first via CLI.

## Detection & Prediction

### `detect_entropy`

Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.

### `detect_stale_constraints`

Detect architectural constraint rules that have not been violated within a configurable time window. Surfaces stale constraints as candidates for removal or relaxation.

### `predict_conflicts`

Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.

## Generators & Creators

### `create_self_review`

Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns

### `create_skill`

Scaffold a new harness skill with skill.yaml and SKILL.md

### `generate_agent_definitions`

Generate agent definition files from personas for Claude Code and Gemini CLI

### `generate_linter`

Generate an ESLint rule from YAML configuration

### `generate_persona_artifacts`

Generate runtime config, AGENTS.md fragment, and CI workflow from a persona

### `generate_slash_commands`

Generate native slash commands for Claude Code and Gemini CLI from harness skill metadata

## Other

### `analyze_diff`

Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage

### `gather_context`

Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, project validation, and session sections. Runs constituents in parallel.

### `init_project`

Scaffold a new harness engineering project from a template

### `request_peer_review`

Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.

## Queries & Search

### `get_critical_paths`

List performance-critical functions from @perf-critical annotations and graph inference

### `get_perf_baselines`

Read current performance baselines from .harness/perf/baselines.json

### `search_skills`

Search the skill catalog for domain-specific skills. Returns ranked results based on keyword and stack-signal matching. Use this to discover catalog skills that are not loaded as slash commands.

## Runners & Reviewers

### `review_changes`

Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.

### `run_agent_task`

Run an agent task using the harness CLI

### `run_code_review`

Run the unified 7-phase code review pipeline: gate, mechanical checks, context scoping, parallel agents, validation, deduplication, and output.

### `run_persona`

Execute all steps defined in a persona and return aggregated results

### `run_security_scan`

Run the built-in security scanner on a project or specific files. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities.

### `run_skill`

Load and return the content of a skill (SKILL.md), optionally with project state context

## State & Management

### `emit_interaction`

Emit a structured interaction (question, confirmation, phase transition, or batch decision) for round-trip communication with the user

### `list_personas`

List available agent personas

### `list_streams`

List known state streams with branch associations and last-active timestamps

### `manage_roadmap`

Manage the project roadmap: show, add, update, remove, sync features, or query by filter. Reads and writes docs/roadmap.md.

### `manage_state`

Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff
