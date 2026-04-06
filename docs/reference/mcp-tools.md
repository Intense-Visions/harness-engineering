<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# MCP Tools Reference

Complete reference for all harness MCP (Model Context Protocol) tools. These tools are available to AI agents via the harness MCP server. See the [Features Overview](../guides/features-overview.md) for narrative documentation.

## Checkers & Validators

### `assess_project`

Run all project health checks in parallel and return a unified report. Checks: validate, dependencies, docs, entropy, security, performance, lint.

**Parameters:**

- `path` (string, required) — Path to project root
- `checks` (array, optional) — Which checks to run (default: all)
- `mode` (string, optional) — Response density. Default: summary

### `check_dependencies`

Validate layer boundaries and detect circular dependencies

**Parameters:**

- `path` (string, required) — Path to project root

**CLI equivalent:** [`harness check-deps`](cli-commands.md#harness-check-deps)

### `check_docs`

Analyze documentation coverage and/or validate knowledge map integrity

**Parameters:**

- `path` (string, required) — Path to project root
- `domain` (string, optional) — Domain/module to check
- `scope` (string, optional) — Scope of check: 'coverage' (doc coverage), 'integrity' (knowledge map validation), 'all' (both). Default: 'coverage'

**CLI equivalent:** [`harness check-docs`](cli-commands.md#harness-check-docs)

### `check_performance`

Run performance checks: structural complexity, coupling metrics, and size budgets

**Parameters:**

- `path` (string, required) — Path to project root
- `type` (string, optional) — Type of performance check (default: all)

**CLI equivalent:** [`harness check-perf`](cli-commands.md#harness-check-perf)

### `check_phase_gate`

Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document

**Parameters:**

- `path` (string, required) — Path to project root directory

### `check_task_independence`

Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.

**Parameters:**

- `path` (string, required) — Path to project root
- `tasks` (array, required) — Tasks to check. Each task has an id and a list of file paths.
- `depth` (number, optional) — Expansion depth (0=file-only, 1=default, 2-3=thorough)
- `edgeTypes` (array, optional) — Edge types for graph expansion. Default: imports, calls, references
- `mode` (string, optional) — summary omits overlap details. Default: detailed

### `check_traceability`

Check requirement-to-code-to-test traceability for a spec or all specs

**Parameters:**

- `path` (string, required) — Path to project root
- `spec` (string, optional) — Specific spec file path to check
- `feature` (string, optional) — Feature name filter
- `mode` (string, optional) — Response density: summary returns coverage stats only, detailed returns full requirement list. Default: summary

### `validate_cross_check`

Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness

**Parameters:**

- `path` (string, required) — Path to project root directory
- `specsDir` (string, optional) — Specs directory relative to project root (default: docs/specs)
- `plansDir` (string, optional) — Plans directory relative to project root (default: docs/plans)

### `validate_linter_config`

Validate a harness-linter.yml configuration file

**Parameters:**

- `configPath` (string, required) — Path to harness-linter.yml

**CLI equivalent:** [`harness linter validate`](cli-commands.md#harness-linter-validate)

### `validate_project`

Run all validation checks on a harness engineering project

**Parameters:**

- `path` (string, required) — Path to project root directory

**CLI equivalent:** [`harness validate`](cli-commands.md#harness-validate)

## Code Navigation

### `code_outline`

Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.

**Parameters:**

- `path` (string, required) — Absolute file path or directory path. When a directory, outlines all supported files within it.
- `glob` (string, optional) — Optional glob pattern to filter files (e.g. "_.ts", "src/\*\*/_.py"). Only used when path is a directory.

### `code_search`

Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.

**Parameters:**

- `query` (string, required) — Symbol name or substring to search for (case-insensitive).
- `directory` (string, required) — Absolute path to directory to search in.
- `glob` (string, optional) — Optional glob pattern to filter files (e.g. "\*.ts").

### `code_unfold`

Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.

**Parameters:**

- `path` (string, required) — Absolute path to the file.
- `symbol` (string, optional) — Name of the symbol to extract (function, class, type, etc.). Mutually exclusive with startLine/endLine.
- `startLine` (number, optional) — Start line number (1-indexed). Used with endLine for range extraction. Mutually exclusive with symbol.
- `endLine` (number, optional) — End line number (1-indexed, inclusive). Used with startLine for range extraction.

## Data & Updates

### `add_component`

Add a component (layer, doc, or component type) to the project using the harness CLI

**Parameters:**

- `path` (string, required) — Path to project root directory
- `type` (string, required) — Type of component to add
- `name` (string, required) — Name of the component to add

**CLI equivalent:** [`harness add`](cli-commands.md#harness-add-type-name)

### `ingest_source`

Ingest sources into the project knowledge graph. Supports code analysis, knowledge documents, git history, or all at once.

**Parameters:**

- `path` (string, required) — Path to project root
- `source` (string, required) — Type of source to ingest

**CLI equivalent:** [`harness ingest`](cli-commands.md#harness-ingest)

### `update_perf_baselines`

Update performance baselines from benchmark results. Run benchmarks first via CLI.

**Parameters:**

- `path` (string, required) — Path to project root
- `commitHash` (string, required) — Current commit hash for baseline tracking
- `results` (array, required) — Array of benchmark results to save as baselines

**CLI equivalent:** [`harness perf baselines`](cli-commands.md#harness-perf-baselines)

## Detection & Prediction

### `detect_anomalies`

Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph

**Parameters:**

- `path` (string, required) — Path to project root
- `threshold` (number, optional) — Z-score threshold (default 2.0)
- `metrics` (array, optional) — Metrics to analyze (default: cyclomaticComplexity, fanIn, fanOut, hotspotScore, transitiveDepth)

### `detect_entropy`

Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.

**Parameters:**

- `path` (string, required) — Path to project root
- `type` (string, optional) — Type of entropy to detect (default: all)
- `autoFix` (boolean, optional) — When true, apply fixes after analysis. Default: false (analysis only)
- `dryRun` (boolean, optional) — Preview fixes without applying (only used when autoFix is true)
- `fixTypes` (array, optional) — Specific fix types to apply (default: all safe types). Only used when autoFix is true.
- `mode` (string, optional) — Response density: summary returns issue counts and top issues per category, detailed returns full findings. Default: detailed

**CLI equivalent:** [`harness cleanup`](cli-commands.md#harness-cleanup)

### `detect_stale_constraints`

Detect architectural constraint rules that have not been violated within a configurable time window. Surfaces stale constraints as candidates for removal or relaxation.

**Parameters:**

- `path` (string, required) — Path to project root
- `windowDays` (number, optional) — Number of days without violation to consider a constraint stale (default: 30)
- `category` (string, optional) — Optional filter by constraint category

### `predict_conflicts`

Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.

**Parameters:**

- `path` (string, required) — Path to project root
- `tasks` (array, required) — Tasks to check. Each task has an id and a list of file paths.
- `depth` (number, optional) — Expansion depth (0=file-only, 1=default, 2-3=thorough)
- `edgeTypes` (array, optional) — Edge types for graph expansion. Default: imports, calls, references
- `mode` (string, optional) — summary omits overlap details from conflicts. Default: detailed

### `predict_failures`

Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.

**Parameters:**

- `path` (string, required) — Path to project root
- `horizon` (number, optional) — Forecast horizon in weeks (default: 12)
- `category` (string, optional) — Filter to a single metric category
- `includeRoadmap` (boolean, optional) — Include roadmap spec impact in forecasts (default: true)

## Generators & Creators

### `create_self_review`

Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns

**Parameters:**

- `path` (string, required) — Path to project root
- `diff` (string, required) — Git diff string to review
- `customRules` (array, optional) — Optional custom rules to apply during review
- `maxFileSize` (number, optional) — Maximum number of lines changed per file before flagging
- `maxFileCount` (number, optional) — Maximum number of changed files before flagging

### `create_skill`

Scaffold a new harness skill with skill.yaml and SKILL.md

**Parameters:**

- `path` (string, required) — Path to project root directory
- `name` (string, required) — Skill name in kebab-case (e.g., my-new-skill)
- `description` (string, required) — Skill description
- `cognitiveMode` (string, optional) — Cognitive mode (default: constructive-architect)

**CLI equivalent:** [`harness skill create`](cli-commands.md#harness-skill-create-name)

### `generate_agent_definitions`

Generate agent definition files from personas for Claude Code and Gemini CLI

**Parameters:**

- `global` (boolean, optional) — Write to global agent directory
- `platform` (string, optional) — Target platform (default: all)
- `dryRun` (boolean, optional) — Preview without writing

**CLI equivalent:** [`harness generate-agent-definitions`](cli-commands.md#harness-generate-agent-definitions)

### `generate_linter`

Generate an ESLint rule from YAML configuration

**Parameters:**

- `configPath` (string, required) — Path to harness-linter.yml
- `outputDir` (string, optional) — Output directory for generated rule

**CLI equivalent:** [`harness linter generate`](cli-commands.md#harness-linter-generate)

### `generate_persona_artifacts`

Generate runtime config, AGENTS.md fragment, and CI workflow from a persona

**Parameters:**

- `name` (string, required) — Persona name (e.g., architecture-enforcer)
- `only` (string, optional) — Generate only a specific artifact type

**CLI equivalent:** [`harness persona generate`](cli-commands.md#harness-persona-generate-name)

### `generate_slash_commands`

Generate native slash commands for Claude Code and Gemini CLI from harness skill metadata

**Parameters:**

- `platforms` (string, optional) — Comma-separated platforms: claude-code,gemini-cli (default: both)
- `global` (boolean, optional) — Write to global config directories (~/.claude/commands/, ~/.gemini/commands/)
- `output` (string, optional) — Custom output directory
- `skillsDir` (string, optional) — Skills directory to scan
- `includeGlobal` (boolean, optional) — Include built-in global skills alongside project skills
- `dryRun` (boolean, optional) — Show what would change without writing files

**CLI equivalent:** [`harness generate-slash-commands`](cli-commands.md#harness-generate-slash-commands)

## Other

### `analyze_diff`

Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage

**Parameters:**

- `diff` (string, required) — Git diff string to analyze
- `path` (string, optional) — Path to project root (enables graph-enhanced analysis)
- `forbiddenPatterns` (array, optional) — List of regex patterns that are forbidden in the diff
- `maxFileSize` (number, optional) — Maximum number of lines changed per file before flagging
- `maxFileCount` (number, optional) — Maximum number of changed files before flagging

### `compute_blast_radius`

Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.

**Parameters:**

- `path` (string, required) — Path to project root
- `file` (string, optional) — File path (relative to project root) to simulate failure for
- `nodeId` (string, optional) — Node ID to simulate failure for
- `probabilityFloor` (number, optional) — Minimum cumulative probability to continue traversal (default 0.05)
- `maxDepth` (number, optional) — Maximum BFS depth (default 10)
- `mode` (string, optional) — Response density: compact returns summary + top 10 highest-risk nodes, detailed returns full layered cascade chain. Default: compact

### `dispatch_skills`

Recommend an optimal skill sequence based on what changed in the codebase. Combines health signals with change-type and domain detection from git diffs. Returns an annotated sequence with parallel-safe flags, estimated impact, and dependency info.

**Parameters:**

- `path` (string, optional) — Project root path (defaults to cwd)
- `files` (array, optional) — Changed file paths (auto-detected from git diff if omitted)
- `commitMessage` (string, optional) — Commit message for change-type detection (auto-detected from git log if omitted)
- `fresh` (boolean, optional) — Force a fresh health snapshot capture (default: false, uses cached)
- `limit` (number, optional) — Maximum number of skills to return (default: 5)

### `gather_context`

Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, project validation, and session sections. Runs constituents in parallel.

**Parameters:**

- `path` (string, required) — Path to project root
- `intent` (string, required) — What the agent is about to do (used for graph context search)
- `skill` (string, optional) — Current skill name (filters learnings by skill)
- `tokenBudget` (number, optional) — Approximate token budget for graph context (default 4000)
- `include` (array, optional) — Which constituents to include (default: all)
- `includeEvents` (boolean, optional) — Include recent events timeline. Default: true when session is provided, false otherwise. Can also be controlled via include array.
- `mode` (string, optional) — Response density. Default: summary
- `learningsBudget` (number, optional) — Token budget for learnings slice (default 1000). Separate from graph tokenBudget.
- `session` (string, optional) — Session slug for session-scoped state. When provided, state/learnings/handoff/failures are read from .harness/sessions/&lt;session>/ instead of .harness/. Omit for global fallback.
- `depth` (string, optional) — Retrieval depth for learnings. "index" returns one-line summaries, "summary" (default) returns full entries, "full" returns entries with linked context.

### `init_project`

Scaffold a new harness engineering project from a template

**Parameters:**

- `path` (string, required) — Target directory
- `name` (string, optional) — Project name
- `level` (string, optional) — Adoption level (JS/TS only)
- `framework` (string, optional) — Framework overlay (e.g., nextjs, fastapi, gin)
- `language` (string, optional) — Target language

**CLI equivalent:** [`harness init`](cli-commands.md#harness-init)

### `recommend_skills`

Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.

**Parameters:**

- `path` (string, optional) — Project root path (defaults to cwd)
- `noCache` (boolean, optional) — Force fresh health snapshot even if cache is fresh
- `top` (number, optional) — Max recommendations to return (default 5)

### `request_peer_review`

Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.

**Parameters:**

- `path` (string, required) — Path to project root
- `agentType` (string, required) — Type of agent to use for the peer review
- `diff` (string, required) — Git diff string to review
- `context` (string, optional) — Optional additional context for the reviewer

## Queries & Search

### `ask_graph`

Ask a natural language question about the codebase knowledge graph. Supports questions about impact ("what breaks if I change X?"), finding entities ("where is the auth middleware?"), relationships ("what calls UserService?"), explanations ("what is GraphStore?"), and anomalies ("what looks wrong?"). Returns a human-readable summary and raw graph data.

**Parameters:**

- `path` (string, required) — Path to project root
- `question` (string, required) — Natural language question about the codebase

### `find_context_for`

Find relevant context for a given intent by searching the graph and expanding around top results. Returns assembled context within a token budget.

**Parameters:**

- `path` (string, required) — Path to project root
- `intent` (string, required) — Description of what context is needed for
- `tokenBudget` (number, optional) — Approximate token budget for results (default 4000)

### `get_critical_paths`

List performance-critical functions from @perf-critical annotations and graph inference

**Parameters:**

- `path` (string, required) — Path to project root

**CLI equivalent:** [`harness perf critical-paths`](cli-commands.md#harness-perf-critical-paths)

### `get_decay_trends`

Get architecture decay trends over time. Returns stability score history and per-category trend analysis from timeline snapshots. Use to answer questions like "is the architecture decaying?" or "which metrics are getting worse?"

**Parameters:**

- `path` (string, required) — Path to project root
- `last` (number, optional) — Number of recent snapshots to analyze (default: 10)
- `since` (string, optional) — Show trends since this ISO date (e.g., 2026-01-01)
- `category` (string, optional) — Filter to a single metric category

### `get_impact`

Analyze the impact of changing a node or file. Returns affected tests, docs, code, and other nodes grouped by type.

**Parameters:**

- `path` (string, required) — Path to project root
- `nodeId` (string, optional) — ID of the node to analyze impact for
- `filePath` (string, optional) — File path (relative to project root) to analyze impact for
- `mode` (string, optional) — Response density: summary returns impacted file count by category + highest-risk items, detailed returns full impact tree. Default: detailed

### `get_perf_baselines`

Read current performance baselines from .harness/perf/baselines.json

**Parameters:**

- `path` (string, required) — Path to project root

**CLI equivalent:** [`harness perf baselines`](cli-commands.md#harness-perf-baselines)

### `get_relationships`

Get relationships for a specific node in the knowledge graph, with configurable direction and depth.

**Parameters:**

- `path` (string, required) — Path to project root
- `nodeId` (string, required) — ID of the node to get relationships for
- `direction` (string, optional) — Direction of relationships to include (default both)
- `depth` (number, optional) — Traversal depth (default 1)
- `mode` (string, optional) — Response density: summary returns neighbor counts by type + direct neighbors only, detailed returns full traversal. Default: detailed

### `query_graph`

Query the project knowledge graph using ContextQL. Traverses from root nodes outward, filtering by node/edge types.

**Parameters:**

- `path` (string, required) — Path to project root
- `rootNodeIds` (array, required) — Node IDs to start traversal from
- `maxDepth` (number, optional) — Maximum traversal depth (default 3)
- `includeTypes` (array, optional) — Only include nodes of these types
- `excludeTypes` (array, optional) — Exclude nodes of these types
- `includeEdges` (array, optional) — Only traverse edges of these types
- `bidirectional` (boolean, optional) — Traverse edges in both directions (default false)
- `pruneObservability` (boolean, optional) — Prune observability nodes like spans/metrics/logs (default true)
- `mode` (string, optional) — Response density: summary returns node/edge counts by type + top 10 nodes by connectivity, detailed returns full arrays. Default: detailed

**CLI equivalent:** [`harness query`](cli-commands.md#harness-query-rootnodeid)

### `search_similar`

Search the knowledge graph for nodes similar to a query string using keyword and semantic fusion.

**Parameters:**

- `path` (string, required) — Path to project root
- `query` (string, required) — Search query string
- `topK` (number, optional) — Maximum number of results to return (default 10)
- `mode` (string, optional) — Response density: summary returns top 5 results with scores only, detailed returns top 10+ with full metadata. Default: detailed

### `search_skills`

Search the skill catalog for domain-specific skills. Returns ranked results based on keyword, name, description, and stack-signal matching. Use this to discover catalog skills that are not loaded as slash commands.

**Parameters:**

- `query` (string, required) — Natural language or keyword query to search for skills
- `path` (string, optional) — Project root path (defaults to cwd)
- `platform` (string, optional) — Target platform (defaults to claude-code)

## Runners & Reviewers

### `review_changes`

Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.

**Parameters:**

- `path` (string, required) — Path to project root
- `diff` (string, optional) — Raw git diff string. If omitted, auto-detects from git.
- `depth` (string, required) — Review depth: quick, standard, or deep
- `mode` (string, optional) — Response density. Default: summary

### `run_agent_task`

Run an agent task using the harness CLI

**Parameters:**

- `task` (string, required) — Task to run
- `path` (string, optional) — Path to project root directory
- `timeout` (number, optional) — Timeout in milliseconds

**CLI equivalent:** [`harness agent run`](cli-commands.md#harness-agent-run-task)

### `run_code_review`

Run the unified 7-phase code review pipeline: gate, mechanical checks, context scoping, parallel agents, validation, deduplication, and output.

**Parameters:**

- `path` (string, required) — Path to project root
- `diff` (string, required) — Git diff string to review
- `commitMessage` (string, optional) — Most recent commit message (for change-type detection)
- `comment` (boolean, optional) — Post inline comments to GitHub PR (requires prNumber and repo)
- `ci` (boolean, optional) — Enable eligibility gate and non-interactive output
- `deep` (boolean, optional) — Add threat modeling pass to security agent
- `noMechanical` (boolean, optional) — Skip mechanical checks (useful if already run)
- `prNumber` (number, optional) — PR number (required for --comment and CI gate)
- `repo` (string, optional) — Repository in owner/repo format (required for --comment)

### `run_persona`

Execute all steps defined in a persona and return aggregated results

**Parameters:**

- `persona` (string, required) — Persona name (e.g., architecture-enforcer)
- `path` (string, optional) — Path to project root
- `trigger` (string, optional) — Trigger context for step filtering (default: auto)
- `dryRun` (boolean, optional) — Preview without side effects

### `run_security_scan`

Run the built-in security scanner on a project or specific files. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities.

**Parameters:**

- `path` (string, required) — Path to project root
- `files` (array, optional) — Optional list of specific files to scan. If omitted, scans all source files.
- `strict` (boolean, optional) — Override strict mode — promotes all warnings to errors

**CLI equivalent:** [`harness check-security`](cli-commands.md#harness-check-security)

### `run_skill`

Load and return the content of a skill (SKILL.md), optionally with project state context

**Parameters:**

- `skill` (string, required) — Skill name (e.g., harness-tdd)
- `path` (string, optional) — Path to project root for state context injection
- `complexity` (string, optional) — Rigor level: fast (minimal), standard (default), thorough (full)
- `phase` (string, optional) — Start at a specific phase (re-entry)
- `party` (boolean, optional) — Enable multi-perspective evaluation

**CLI equivalent:** [`harness skill run`](cli-commands.md#harness-skill-run-name)

## State & Management

### `emit_interaction`

Emit a structured interaction (question, confirmation, phase transition, or batch decision) for round-trip communication with the user

**Parameters:**

- `path` (string, required) — Path to project root
- `type` (string, required) — Type of interaction
- `stream` (string, optional) — State stream for recording (auto-resolves from branch if omitted)
- `session` (string, optional) — Session slug for session-scoped handoff (takes priority over stream when provided)
- `question` (object, optional) — Question payload (required when type is question)
- `confirmation` (object, optional) — Confirmation payload (required when type is confirmation)
- `transition` (object, optional) — Transition payload (required when type is transition)
- `batch` (object, optional) — Batch decision payload (required when type is batch)

### `list_personas`

List available agent personas

**CLI equivalent:** [`harness persona list`](cli-commands.md#harness-persona-list)

### `list_streams`

List known state streams with branch associations and last-active timestamps

**Parameters:**

- `path` (string, required) — Path to project root

**CLI equivalent:** [`harness state streams`](cli-commands.md#harness-state-streams)

### `manage_roadmap`

Manage the project roadmap: show, add, update, remove, sync features, or query by filter. Reads and writes docs/roadmap.md.

**Parameters:**

- `path` (string, required) — Path to project root
- `action` (string, required) — Action to perform
- `feature` (string, optional) — Feature name (required for add, update, remove)
- `milestone` (string, optional) — Milestone name (required for add; optional filter for show)
- `status` (string, optional) — Feature status (required for add; optional for update; optional filter for show)
- `summary` (string, optional) — Feature summary (required for add; optional for update)
- `spec` (string, optional) — Spec file path (optional for add/update)
- `plans` (array, optional) — Plan file paths (optional for add/update)
- `blocked_by` (array, optional) — Blocking feature names (optional for add/update)
- `assignee` (string, optional) — Assignee username/email (optional for update). Tracks assignment history.
- `filter` (string, optional) — Query filter: "blocked", "in-progress", "done", "planned", "backlog", or "milestone:&lt;name>" (required for query)
- `apply` (boolean, optional) — For sync action: apply proposed changes (default: false, preview only)
- `force_sync` (boolean, optional) — For sync action: override human-always-wins rule

### `manage_state`

Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff

**Parameters:**

- `path` (string, required) — Path to project root
- `action` (string, required) — Action to perform
- `learning` (string, optional) — Learning text to record (required for learn)
- `skillName` (string, optional) — Skill name associated with the entry
- `outcome` (string, optional) — Outcome associated with the learning
- `description` (string, optional) — Failure description (required for failure)
- `failureType` (string, optional) — Type of failure (required for failure)
- `handoff` (object, optional) — Handoff data to save (required for save-handoff)
- `stream` (string, optional) — Stream name to target (auto-resolves from branch if omitted)
- `session` (string, optional) — Session slug for session-scoped state (takes priority over stream when provided)
- `section` (string, optional) — Session section name (terminology, decisions, constraints, risks, openQuestions, evidence)
- `authorSkill` (string, optional) — Name of the skill authoring the entry (required for append_entry)
- `content` (string, optional) — Entry content text (required for append_entry)
- `entryId` (string, optional) — ID of the entry to update (required for update_entry_status)
- `newStatus` (string, optional) — New status for the entry: active, resolved, or superseded (required for update_entry_status)

**CLI equivalent:** [`harness state show`](cli-commands.md#harness-state-show)
