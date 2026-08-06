<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# MCP Tools Reference

Complete reference for all harness MCP (Model Context Protocol) tools. These tools are available to AI agents via the harness MCP server. See the [Features Overview](../guides/features-overview.md) for narrative documentation.

## Checkers & Validators

### `assess_project`

Run all project health checks in parallel and return a unified report. Checks: validate, dependencies, docs, entropy, security, performance, lint.

### `check_dependencies`

Validate layer boundaries and detect circular dependencies

**CLI equivalent:** [`harness check-deps`](cli-commands.md#harness-check-deps)

### `check_docs`

Analyze documentation coverage and/or validate knowledge map integrity

**CLI equivalent:** [`harness check-docs`](cli-commands.md#harness-check-docs)

### `check_performance`

Run performance checks: structural complexity, coupling metrics, and size budgets

**CLI equivalent:** [`harness check-perf`](cli-commands.md#harness-check-perf)

### `check_phase_gate`

Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document

### `check_task_independence`

Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.

### `check_traceability`

Check requirement-to-code-to-test traceability for a spec or all specs

### `validate_cross_check`

Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness

### `validate_linter_config`

Validate a harness-linter.yml configuration file

**CLI equivalent:** [`harness linter validate`](cli-commands.md#harness-linter-validate)

### `validate_project`

Run all validation checks on a harness engineering project

**CLI equivalent:** [`harness validate`](cli-commands.md#harness-validate)

### `validate_strategy`

## Code Navigation

### `code_craft`

LLM-judgment critique of code quality / readability — the ceiling counterpart to the

### `code_craft_finalize`

Finalize a code_craft in-session run by submitting the calling agent

### `code_outline`

Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.

### `code_search`

Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.

### `code_unfold`

Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.

## Data & Updates

### `add_component`

Add a component (layer, doc, or component type) to the project using the harness CLI

**CLI equivalent:** [`harness add`](cli-commands.md#harness-add)

### `ingest_source`

Ingest sources into the project knowledge graph. Supports code analysis, knowledge documents, git history, or all at once.

**CLI equivalent:** [`harness graph ingest`](cli-commands.md#harness-graph-ingest)

### `update_perf_baselines`

Update performance baselines from benchmark results. Run benchmarks first via CLI.

**CLI equivalent:** [`harness perf baselines`](cli-commands.md#harness-perf-baselines)

## Detection & Prediction

### `detect_anomalies`

Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph

### `detect_constraint_emergence`

Cluster recurring violations by pattern and suggest new constraint rules. When N similar violations appear in M weeks, suggests emergent architectural norms learned from team behavior.

### `detect_drift`

Detect design-system drift in source: hardcoded values where tokens exist (token bypass)

### `detect_entropy`

Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.

**CLI equivalent:** [`harness cleanup`](cli-commands.md#harness-cleanup)

### `detect_stale_constraints`

Detect architectural constraint rules that have not been violated within a configurable time window. Surfaces stale constraints as candidates for removal or relaxation.

### `predict_conflicts`

Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.

### `predict_failures`

Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.

## Generators & Creators

### `create_self_review`

Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns

### `create_skill`

Scaffold a new harness skill with skill.yaml and SKILL.md

**CLI equivalent:** [`harness skill create`](cli-commands.md#harness-skill-create)

### `generate_agent_definitions`

Generate agent definition files from personas for Claude Code and Gemini CLI

**CLI equivalent:** [`harness generate-agent-definitions`](cli-commands.md#harness-generate-agent-definitions)

### `generate_blueprint`

Scan a project and return its blueprint data (modules, hotspots, dependencies). Returns the scan results as JSON without writing files.

### `generate_linter`

Generate an ESLint rule from YAML configuration

**CLI equivalent:** [`harness linter generate`](cli-commands.md#harness-linter-generate)

### `generate_persona_artifacts`

Generate runtime config, AGENTS.md fragment, and CI workflow from a persona

**CLI equivalent:** [`harness persona generate`](cli-commands.md#harness-persona-generate)

### `generate_slash_commands`

Generate native slash commands for Claude Code and Gemini CLI from harness skill metadata

**CLI equivalent:** [`harness generate-slash-commands`](cli-commands.md#harness-generate-slash-commands)

## Other

### `acceptance_eval`

Pre-execution LLM-judgment: does a spec carry measurable, testable, complete

### `acquire_compound_lock`

Acquire a per-category compound lock at

### `advise_skills`

Content-based skill recommendations for a spec or feature description. Returns tiered matches with purpose and timing guidance.

### `align_design_system`

Apply codemods for DRIFT-T001/T002/T003 (hex/font/spacing tokens) where pre-flight

### `analyze_diff`

Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage

### `api_craft`

LLM-judgment critique of API quality — the ceiling counterpart to rule-based API checks

### `api_craft_finalize`

Finalize an api_craft in-session run by submitting the calling agent

### `audit_anatomy`

Audit components for anatomy completeness. Emits ANAT-D\* findings for component definitions

### `audit_brand`

Audit brand-semantics violations: tokens used in forbidden contexts per their

### `canary_probe`

Probe availability of the optional canary test CLI (canary-test-cli). Returns

### `canary_recommend_framework`

Classify a test prompt with canary and recommend a framework (deterministic, no API key).

### `cli_ergonomics_craft`

LLM-judgment critique of CLI ergonomics quality — the ceiling counterpart to mechanical CLI

### `cli_ergonomics_craft_finalize`

Finalize a cli_ergonomics_craft in-session run by submitting the calling agent

### `compact`

Compact content, resolve intents into aggregated packed responses, or re-compress prior tool output. Returns a packed envelope with source attribution and reduction metadata.

### `compute_blast_radius`

Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.

### `copy_craft`

LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines,

### `design_craft`

Run the harness-design-craft skill: CRITIQUE / POLISH / BENCHMARK phases over a project

### `dispatch_skills`

Recommend an optimal skill sequence based on what changed in the codebase. Combines health signals with change-type and domain detection from git diffs. Returns an annotated sequence with parallel-safe flags, estimated impact, and dependency info.

### `docs_craft`

LLM-judgment critique of documentation quality — the ceiling counterpart to the rule-based

### `edit_file`

Make a surgical, exact-string edit to a single existing file: replace old_string with new_string. Prefer this over shell redirection (cat >, echo >>) or apply_patch, which corrupt files. old_string must appear EXACTLY ONCE (include enough surrounding context to be unique) unless replace_all is true. Fails without writing if old_string is missing or ambiguous, so you can retry with more context. Does not create files.

### `gather_context`

Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, project validation, and session sections. Runs constituents in parallel.

### `init_project`

Scaffold a new harness engineering project from a template

**CLI equivalent:** [`harness init`](cli-commands.md#harness-init)

### `insights_summary`

Composite report combining health, entropy, decay, attention, and impact.

### `knowledge_craft`

LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding

### `naming_craft`

LLM-judgment critique of identifier names (variables, functions, types, files).

### `naming_craft_finalize`

Finalize a naming_craft in-session run by submitting the calling agent

### `outcome_eval`

Post-execution LLM-judgment: did the implementation actually satisfy its spec?

### `plan_parallelization`

Plan safe parallel execution for a set of plan tasks. Builds a task DAG from dependsOn plus glob-aware file/owns overlap, wave-groups it, annotates each wave with conflict severity and a firing decision, and returns a ParallelizationPlan (waves, serialized, cyclic, ownershipForecast, narration). ownershipForecast is a cheap deterministic list of task pairs whose declared owns:[paths] overlap.

### `read_strategy`

### `recommend_skills`

Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.

### `release_compound_lock`

### `request_peer_review`

Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.

### `security_craft`

LLM-judgment critique of security posture (TS/JS source). Sixth non-design

### `seed_pulse_from_strategy`

Read STRATEGY.md at the project root and extract pulse-config seed values: product

### `spec_craft`

LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline

### `subscribe_webhook`

Subscribe to outbound webhook fan-out via POST /api/v1/webhooks. Returns the secret once. Requires subscribe-webhook scope.

### `summarize_session`

Generate or regenerate the LLM

### `test_craft`

LLM-judgment critique of test quality across vitest/jest/mocha/playwright/pytest. Fourth

### `trigger_maintenance_job`

Trigger a maintenance task ad-hoc via POST /api/v1/jobs/maintenance. Requires trigger-job scope.

### `write_pulse_config`

Write a

### `write_strategy`

Write a StrategyDoc to STRATEGY.md at the project root. Validates against StrategyDocSchema first; does not touch disk on schema failure. Writes STRATEGY.md.bak on first overwrite (idempotent). Atomic via temp-file + rename.

## Queries & Search

### `ask_graph`

Ask a natural language question about the codebase knowledge graph.

### `find_context_for`

Find relevant context for a given intent by searching the graph and expanding around top results. Returns assembled context within a token budget.

### `get_critical_paths`

List performance-critical functions from @perf-critical annotations and graph inference

**CLI equivalent:** [`harness perf critical-paths`](cli-commands.md#harness-perf-critical-paths)

### `get_decay_trends`

Get architecture decay trends over time. Returns stability score history and per-category trend analysis from timeline snapshots. Use to answer questions like

### `get_impact`

Analyze the impact of changing a node or file. Returns affected tests, docs, code, and other nodes grouped by type.

### `get_perf_baselines`

Read current performance baselines from .harness/perf/baselines.json

**CLI equivalent:** [`harness perf baselines`](cli-commands.md#harness-perf-baselines)

### `get_relationships`

Get relationships for a specific node in the knowledge graph, with configurable direction and depth.

### `get_security_trends`

Get security posture trends showing how security score, findings, and supply chain metrics are changing over time.

### `query_graph`

Query the project knowledge graph using ContextQL. Traverses from root nodes outward, filtering by node/edge types.

**CLI equivalent:** [`harness graph query`](cli-commands.md#harness-graph-query)

### `search_sessions`

Full-text search over archived + live session content (FTS5/BM25).

### `search_similar`

Search the knowledge graph for nodes similar to a query string using keyword and semantic fusion.

### `search_skills`

Search the skill catalog for domain-specific skills. Returns ranked results based on keyword, name, description, and stack-signal matching. Use this to discover catalog skills that are not loaded as slash commands.

## Runners & Reviewers

### `review_changes`

Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.

### `run_agent_task`

Run an agent task using the harness CLI

**CLI equivalent:** [`harness agent run`](cli-commands.md#harness-agent-run)

### `run_ci_checks`

Run CI/CD validation checks on a harness project. Returns pass/fail results per check with issues. Checks: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability.

### `run_code_review`

Run the unified 7-phase code review pipeline: gate, mechanical checks, context scoping, parallel agents, validation, deduplication, and output.

### `run_design_pipeline`

Run the design-pipeline orchestrator: FRESHEN -> DETECT -> FIX -> AUDIT -> FILL -> REPORT.

### `run_persona`

Execute all steps defined in a persona and return aggregated results

### `run_security_scan`

Run the built-in security scanner on a project or specific files. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities.

**CLI equivalent:** [`harness check-security`](cli-commands.md#harness-check-security)

### `run_skill`

Load and return the content of a skill (SKILL.md), optionally with project state context

**CLI equivalent:** [`harness skill run`](cli-commands.md#harness-skill-run)

## State & Management

### `emit_interaction`

Emit a structured interaction (question, confirmation, phase transition, or batch decision) for round-trip communication with the user

### `emit_skill_proposal`

Emit a skill proposal (new-skill or refinement) into the review queue. Writes

### `list_gateway_tokens`

List Gateway API tokens via GET /api/v1/auth/tokens. Secrets are redacted. Requires admin scope.

### `list_personas`

List available agent personas

**CLI equivalent:** [`harness persona list`](cli-commands.md#harness-persona-list)

### `list_streams`

List known state streams with branch associations and last-active timestamps

**CLI equivalent:** [`harness state streams`](cli-commands.md#harness-state-streams)

### `manage_roadmap`

Manage the project roadmap: show, add, update, remove, promote, sync, groom features, or query by filter. Reads and writes the project roadmap (sharded or single-file). The

### `manage_state`

Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff

**CLI equivalent:** [`harness state show`](cli-commands.md#harness-state-show)
