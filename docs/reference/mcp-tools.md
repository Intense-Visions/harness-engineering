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

### `validate_strategy`

Validate STRATEGY.md at the project root. Returns { present, valid, error? }. Soft-fails (valid: true) when absent — STRATEGY.md is an optional anchor, not a hard requirement.

**Parameters:**

- `path` (string, required) — Project root directory

## Code Navigation

### `code_outline`

Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.

**Parameters:**

- `path` (string, required) — Absolute file path or directory path. When a directory, outlines all supported files within it.
- `glob` (string, optional) — Optional glob pattern to filter files (e.g. "_.ts", "src/\*\*/_.py"). Only used when path is a directory.
- `offset` (number, optional) — Number of file entries to skip (pagination, directory mode only). Default: 0. Files are sorted by modification time desc.
- `limit` (number, optional) — Max file entries to return (pagination, directory mode only). Default: 30.

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
- `offset` (number, optional) — Number of anomaly entries to skip (pagination). Default: 0. Anomalies are sorted by Z-score desc.
- `limit` (number, optional) — Max anomaly entries to return (pagination). Default: 30.

### `detect_constraint_emergence`

Cluster recurring violations by pattern and suggest new constraint rules. When N similar violations appear in M weeks, suggests emergent architectural norms learned from team behavior.

**Parameters:**

- `path` (string, required) — Path to project root
- `windowWeeks` (number, optional) — Time window in weeks to analyze (default: 4)
- `minOccurrences` (number, optional) — Minimum number of similar violations to trigger a suggestion (default: 3)
- `category` (string, optional) — Optional filter by constraint category

### `detect_drift`

Detect design-system drift in source: hardcoded values where tokens exist (token bypass) and raw HTML primitives where a registered design-system component exists (primitive adoption). Composes with harness check-design as the 3rd verifier alongside audit-anatomy and design-craft.

**Parameters:**

- `path` (string, required) — Project root path
- `mode` (string, optional) — Both modes equivalent in v1 (no slow patterns yet).
- `files` (array, optional) — Optional explicit file list to scope the scan.
- `designStrictness` (string, optional) — Overrides design.strictness from harness.config.json.
- `rules` (object, optional) — Per-rule enable flags.

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

### `generate_blueprint`

Scan a project and return its blueprint data (modules, hotspots, dependencies). Returns the scan results as JSON without writing files.

**Parameters:**

- `path` (string, required) — Path to project root directory

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

### `acceptance_eval`

Pre-execution LLM-judgment: does a spec carry measurable, testable, complete acceptance criteria? The upstream twin of outcome_eval. Reads the spec's success/acceptance section, emits a confidence-rated AcceptanceVerdict (MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE) with criteriaFindings (a, advisory), coverageFindings (b, advisory) and a rationale. Authority is DERIVED in TypeScript, never trusted from the LLM: a high-confidence NOT_MEASURABLE is blocking; every other verdict is advisory. testGlobs/testContent are optional evidence for (b) — omitting them degrades coverage findings to advisory-empty but never affects the measurability gate.

**Parameters:**

- `specPath` (string, required) — Absolute or repo-relative path to the spec markdown to judge
- `testGlobs` (array, optional) — Optional globs locating test files; their contents supply the (b) coverage evidence. Ignored when testContent is provided. Absolute globs are recommended; relative globs resolve against the MCP server cwd.
- `testContent` (string, optional) — Optional pre-collected test snippets (the (b) evidence). Takes precedence over testGlobs.
- `model` (string, optional) — Optional model override for the acceptance-eval LLM call

### `acquire_compound_lock`

Acquire a per-category compound lock at `.harness/locks/compound-<category>.lock` under the project root. Returns `{ acquired, token, lockPath }` on success or `{ acquired: false, error, holderPid, lockPath }` on contention. The returned token must be passed to release_compound_lock when the write completes. Categories must be one of the documented bug-track/knowledge-track categories.

**Parameters:**

- `path` (string, required) — Project root directory
- `category` (string, required) — Solution category (e.g., 'build-errors', 'architecture-patterns'). See packages/core/src/solutions/schema.ts for the full list.

### `advise_skills`

Content-based skill recommendations for a spec or feature description. Returns tiered matches with purpose and timing guidance.

**Parameters:**

- `path` (string, optional) — Project root path (defaults to cwd)
- `specPath` (string, required) — Path to the spec file (proposal.md), relative to project root
- `thorough` (boolean, optional) — Include Consider tier in output
- `top` (number, optional) — Max skills per tier (default 5 apply, 10 reference)

### `align_design_system`

Apply codemods for DRIFT-T001/T002/T003 (hex/font/spacing tokens) where pre-flight classifier deems the change safe; emit precise suggestions for DRIFT-T004 (deprecated tokens) and all DRIFT-P\* (primitive adoption). Runs standalone (invokes detect-design-drift internally) or as the FIX step in a pipeline (reads pipeline.driftFindings from handoff.json).

**Parameters:**

- `path` (string, required) — Project root path
- `dryRun` (boolean, optional) — Compute diffs without writing to disk. Default: false (write is the default).
- `files` (array, optional) — Optional file scope (standalone mode passes through to detect-design-drift).
- `designStrictness` (string, optional) — Overrides design.strictness from harness.config.json.
- `mode` (string, optional) — standalone (default): runs detect internally. pipeline: reads pipeline.driftFindings from .harness/handoff.json and writes pipeline.fixesApplied back.
- `fixBatch` (array, optional) — Optional list of finding keys (CODE@file:line) to limit application to a subset. Honored in pipeline mode.
- `revert` (boolean, optional) — When true, inverse-applies the most-recent batch recorded at .harness/align/last-batch.json instead of detecting + classifying + applying. Skips files edited externally since the apply.

### `analyze_diff`

Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage

**Parameters:**

- `diff` (string, required) — Git diff string to analyze
- `path` (string, optional) — Path to project root (enables graph-enhanced analysis)
- `forbiddenPatterns` (array, optional) — List of regex patterns that are forbidden in the diff
- `maxFileSize` (number, optional) — Maximum number of lines changed per file before flagging
- `maxFileCount` (number, optional) — Maximum number of changed files before flagging

### `audit_anatomy`

Audit components for anatomy completeness. Emits ANAT-D* findings for component definitions missing required slots/states (e.g., Button missing `content`). In v1 vertical slice runs the Button convention only; pattern-presence checks (ANAT-P*) return empty pending follow-up.

**Parameters:**

- `path` (string, required) — Project root path
- `mode` (string, optional) — fast = conventions only (cheap AST scan). full = conventions + patterns. In v1 both modes run conventions only because pattern engine is not yet wired.
- `files` (array, optional) — Optional explicit file list (paths or globs) to scope the audit.
- `designStrictness` (string, optional) — Overrides design.strictness from harness.config.json.
- `catalog` (array, optional) — Optional subset of catalog entries to run.

### `audit_brand`

Audit brand-semantics violations: tokens used in forbidden contexts per their $extensions.harness.brand metadata (BRAND-T\*), and UI copy containing voice.forbidden_phrases from DESIGN.md ## Brand Rules (BRAND-V001). 4th verifier composed by harness check-design.

**Parameters:**

- `path` (string, required) — Project root path
- `mode` (string, optional) — Both modes equivalent in v1 (no slow patterns yet).
- `files` (array, optional) — Optional explicit file list to scope the scan.
- `designStrictness` (string, optional) — Overrides design.strictness from harness.config.json.
- `rules` (object, optional) — Per-rule enable flags.

### `canary_probe`

Probe availability of the optional canary test CLI (canary-test-cli). Returns { status: "available" | "degraded", version?, reason? } where reason is one of not-installed | binary-missing | exec-failed | bad-output. Never errors when canary is absent — call it before surfacing canary-backed steps so the audit can degrade gracefully.

### `canary_recommend_framework`

Classify a test prompt with canary and recommend a framework (deterministic, no API key). Returns { status, test_type, framework, file_extension, reasoning[], alternatives[] }. Degrades to a { status: "degraded" } sentinel when canary is unavailable.

**Parameters:**

- `prompt` (string, required) — Natural-language description of the test to scaffold, e.g. "end-to-end login flow in the browser".

### `compact`

Compact content, resolve intents into aggregated packed responses, or re-compress prior tool output. Returns a packed envelope with source attribution and reduction metadata.

**Parameters:**

- `path` (string, optional) — Path to project root
- `content` (string, optional) — Content string to compact directly (Mode A)
- `intent` (string, optional) — Intent description — aggregates context via graph search then packs (Mode B)
- `ref` (object, optional) — Re-compress prior tool output with source attribution (Mode C)
- `strategies` (array, optional) — Strategies to apply (default: structural + truncate)
- `tokenBudget` (number, optional) — Token budget for compacted output (default: 2000)

### `compute_blast_radius`

Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.

**Parameters:**

- `path` (string, required) — Path to project root
- `file` (string, optional) — File path (relative to project root) to simulate failure for
- `nodeId` (string, optional) — Node ID to simulate failure for
- `probabilityFloor` (number, optional) — Minimum cumulative probability to continue traversal (default 0.05)
- `maxDepth` (number, optional) — Maximum BFS depth (default 10)
- `mode` (string, optional) — Response density: compact returns summary + top 10 highest-risk nodes, detailed returns full layered cascade chain. Default: compact

### `copy_craft`

LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, CLI output strings, commit subjects, PR descriptions, code comments. Third craft-pipeline ceiling skill; 8 seed rubrics. Graceful degradation when git/gh prereqs absent.

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional source file/glob scope
- `surfaces` (array, optional) — Restrict to specific surfaces (default: all 6)
- `maxFiles` (number, optional) — Cap source file count (default: 100)
- `maxItemsPerFile` (number, optional) — Cap per-file items (default: 20)
- `commitsSince` (string, optional) — Commit window for git log (default: '1 month ago')
- `prLimit` (number, optional) — PR count cap (default: 20)

### `design_craft`

Run the harness-design-craft skill: CRITIQUE / POLISH / BENCHMARK phases over a project's components. Fast-mode CRITIQUE iterates the v1 seed of 10 rubrics (hierarchy-clarity, typography-craft, motion-quality, color-confidence, density-rhythm, restraint, polish-details, copy-voice, interaction-craft, brand-coherence), POLISH iterates the 7 seed patterns (spring-physics, skeleton-content-matched, stagger-timing, page-transition-crossfade, fluid-type-scale, progressive-corner-rounding, focus-ring-craft), BENCHMARK iterates the 8 seed exemplars covering EmptyState (Linear resolved register + Notion instructional register), LoadingState (Stripe preview register + Vercel narrative register), CommandPalette, ErrorState, Modal, and Button.

**Parameters:**

- `path` (string, required) — Project root path
- `mode` (string, optional) — fast (code-only LLM critique) or deep (vision critique of rendered screenshots — requires `captures`).
- `phases` (array, optional) — Subset of phases to run. Defaults to all three.
- `files` (array, optional) — Optional file scoping. Each entry is a path relative to project root.
- `autoCapture` (string, optional) — B' detect-and-offer behavior when preconditions are missing. MVP: only "skip" is fully implemented.
- `designStrictness` (string, optional) — Overall design strictness (passed through to harness-design when chained).
- `benchmarkTargets` (array, optional) — BENCHMARK target descriptors. Each entry needs at minimum { file, component }; optional componentType narrows exemplar selection.
- `captures` (array, optional) — Deep-mode (vision) captures: rendered component screenshots. Required when mode="deep" and the critique phase runs. Each entry: { file, image, component? }, where `image` is a path to a PNG/JPEG/WebP screenshot (the CLI does not render components itself).

### `dispatch_skills`

Recommend an optimal skill sequence based on what changed in the codebase. Combines health signals with change-type and domain detection from git diffs. Returns an annotated sequence with parallel-safe flags, estimated impact, and dependency info.

**Parameters:**

- `path` (string, optional) — Project root path (defaults to cwd)
- `files` (array, optional) — Changed file paths (auto-detected from git diff if omitted)
- `commitMessage` (string, optional) — Commit message for change-type detection (auto-detected from git log if omitted)
- `fresh` (boolean, optional) — Force a fresh health snapshot capture (default: false, uses cached)
- `limit` (number, optional) — Maximum number of skills to return (default: 5)
- `trigger` (string, optional) — Filter to skills declaring this trigger (e.g. on_pr, on_commit, on_milestone, on_task_complete, on_refactor, on_review). Only skills whose triggers array includes this value are returned.

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
- `section` (string, optional) — Section to paginate. When provided, offset/limit apply within this section only and the response contains only { section, items, pagination, meta }. Note: section=graphContext requires mode=detailed (summary mode has no paginatable blocks). When omitted, returns the full response.
- `offset` (number, optional) — Number of items to skip within the section (pagination). Default: 0. Requires section param.
- `limit` (number, optional) — Max items to return within the section (pagination). Default: 20. Requires section param.

### `init_project`

Scaffold a new harness engineering project from a template

**Parameters:**

- `path` (string, required) — Target directory
- `name` (string, optional) — Project name
- `level` (string, optional) — Adoption level (JS/TS only)
- `framework` (string, optional) — Framework overlay (e.g., nextjs, fastapi, gin)
- `language` (string, optional) — Target language

**CLI equivalent:** [`harness init`](cli-commands.md#harness-init)

### `insights_summary`

Composite report combining health, entropy, decay, attention, and impact.

**Parameters:**

- `path` (string, required) — Path to project root
- `skip` (array, optional) — Top-level keys to skip.

### `knowledge_craft`

LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding decisions/ — that is spec-craft territory). Fifth non-design craft-pipeline ceiling skill; 7 seed rubrics (load-bearing-fact, earns-graph-place, carries-forward-decision, …). Per-file critique. References graph taxonomy (business_fact / business_rule / business_concept / business_decision) inside rubrics without reading the graph. Emits 3-axis findings (tier x impact x confidence per ADR 0019).

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional file scope (overrides docs/knowledge/ discovery)
- `excludeDirs` (array, optional) — Extra subdir names to skip under docs/knowledge/ (decisions is always excluded)
- `maxFiles` (number, optional) — Cap entry count (default: 50)

### `naming_craft`

LLM-judgment critique of identifier names (variables, functions, types, files). First craft-pipeline ceiling skill; uses a curated rubric catalog seeded from Martin / Beck / Karlton. Emits 3-axis findings (tier x impact x confidence per ADR 0019). In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call naming_craft_finalize with the responses to get findings.

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional file/glob scope
- `kinds` (array, optional) — Restrict to specific identifier kinds (default: all)
- `maxFiles` (number, optional) — Cap file count (default: 100)
- `maxIdentifiersPerFile` (number, optional) — Cap per-file identifier sampling (default: 15)
- `mode` (string, optional) — 'in-session' (default): return prompts for the calling agent to answer, then call naming_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).
- `promptBudget` (number, optional) — Cap prompt count in in-session mode (default: 100)

### `naming_craft_finalize`

Finalize a naming_craft in-session run by submitting the calling agent's responses to the prompts collected by naming_craft. Returns the standard NamingCraftOutput with findings.

**Parameters:**

- `path` (string, required) — Project root path used in the collect call (must match)
- `runId` (string, required) — runId returned by the naming_craft collect call
- `responses` (array, required) — Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.

### `outcome_eval`

Post-execution LLM-judgment: did the implementation actually satisfy its spec? Reads the spec's acceptance section, the change diff, and test output, and emits a confidence-rated OutcomeVerdict (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) with a rationale and unmetCriteria. Ship authority is DERIVED in TypeScript, never trusted from the LLM: a high-confidence NOT_SATISFIED is blocking; every other verdict is advisory. The harness's first blocking post-execution spec-satisfaction gate. IMPORTANT: diff and testOutput are required — omitting them degrades the verdict to INCONCLUSIVE/advisory (never blocking), so the calling agent MUST supply them from the session (git diff + test-runner output). Each verdict persists as an execution_outcome node.

**Parameters:**

- `specPath` (string, required) — Absolute or repo-relative path to the spec markdown to judge against
- `diff` (string, required) — Unified diff of the change under judgment (e.g. `git diff` / `git diff &lt;base>...HEAD`). Required: an empty diff degrades the verdict to INCONCLUSIVE/advisory.
- `testOutput` (string, required) — Captured test-runner stdout+stderr. Required: empty/unparseable output is tolerated but degrades the verdict toward INCONCLUSIVE/advisory.
- `model` (string, optional) — Optional model override for the outcome-eval LLM call
- `path` (string, optional) — Project root used to resolve the knowledge graph (default: cwd)

### `read_strategy`

Read and parse STRATEGY.md at the project root. Returns { present, valid, doc?, error? } where doc is the parsed StrategyDoc when present and valid. Combines validate_strategy + parseStrategyDoc + asStrategyDoc in one call.

**Parameters:**

- `path` (string, required) — Project root directory

### `recommend_skills`

Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.

**Parameters:**

- `path` (string, optional) — Project root path (defaults to cwd)
- `noCache` (boolean, optional) — Force fresh health snapshot even if cache is fresh
- `top` (number, optional) — Max recommendations to return (default 5)
- `recentFiles` (array, optional) — Recently edited files for knowledge skill path-matching

### `release_compound_lock`

Release a previously-acquired compound lock by its token. Returns { released: true } when the token matches a live handle; { released: false, error } otherwise. Idempotent: calling twice with the same token is not an error after the first release.

**Parameters:**

- `token` (string, required) — Token returned by acquire_compound_lock

### `request_peer_review`

Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.

**Parameters:**

- `path` (string, required) — Path to project root
- `agentType` (string, required) — Type of agent to use for the peer review
- `diff` (string, required) — Git diff string to review
- `context` (string, optional) — Optional additional context for the reviewer

### `security_craft`

LLM-judgment critique of security posture (TS/JS source). Sixth non-design craft-pipeline ceiling skill; the final sub-project (#10 of 10). 8 seed rubrics: trust-boundary-respected, least-authority-honored, defense-in-depth, assumed-adversary-realistic, data-flow-annotated, fail-closed-not-open, secret-handling-shape, authz-before-action. AST-driven signal detection (only files with security-relevant constructs are critiqued — http handlers, middleware, auth APIs, child_process/eval, fs writes, raw queries, network egress, secret handling). Conservative confidence defaults manage the FP risk inherent in judgment-based security. Emits 3-axis findings (tier x impact x confidence per ADR 0019).

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional file scope (overrides discovery)
- `packages` (array, optional) — Restrict to specific packages under packages/
- `maxFiles` (number, optional) — Cap source-file count (default: 100)
- `maxSignalsPerFile` (number, optional) — Cap per-file signal critique (default: 10)

### `seed_pulse_from_strategy`

Read STRATEGY.md at the project root and extract pulse-config seed values: product `name` and `## Key metrics` bullet items. Returns `{ name, keyMetrics, warnings }`. Defensive: every failure mode degrades to a non-empty warnings array rather than throwing.

**Parameters:**

- `path` (string, required) — Project root directory

### `spec_craft`

LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline ceiling skill; 7 seed rubrics from the spec-quality canon. Per-section critique with rubric-to-section mapping. Emits 3-axis findings (tier x impact x confidence per ADR 0019).

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional spec file/glob scope
- `kinds` (array, optional) — Restrict to specific spec kinds (default: both)
- `sections` (array, optional) — Restrict to canonical section names (e.g., decisions, scope)
- `maxFiles` (number, optional) — Cap doc count (default: 50)
- `maxSectionsPerFile` (number, optional) — Cap per-doc section critique (default: 10)

### `subscribe_webhook`

Subscribe to outbound webhook fan-out via POST /api/v1/webhooks. Returns the secret once. Requires subscribe-webhook scope.

**Parameters:**

- `url` (string, required) — https URL to POST events to
- `events` (array, required) — Event-type globs (e.g. ["maintenance.completed", "interaction.*"])

### `summarize_session`

Generate or regenerate the LLM `llm-summary.md` for an archived session.

**Parameters:**

- `path` (string, required) — Path to project root
- `sessionId` (string, required) — Archived session id (basename of the directory inside .harness/archive/sessions/)
- `force` (boolean, optional) — If true, overwrite an existing llm-summary.md. Default: false (no-op when present).

### `test_craft`

LLM-judgment critique of test quality across vitest/jest/mocha/playwright. Fourth craft-pipeline ceiling skill; 8 seed rubrics. Per-test critique with optional source pairing for contract-vs-implementation rubrics.

**Parameters:**

- `path` (string, required) — Project root path
- `files` (array, optional) — Optional test file/glob scope
- `frameworks` (array, optional) — Restrict to specific frameworks (default: all four)
- `maxFiles` (number, optional) — Cap test file count (default: 100)
- `maxTestsPerFile` (number, optional) — Cap per-file test critique (default: 20)
- `sourcePair` (boolean, optional) — Resolve source file under test for richer prompt context (default: true)

### `trigger_maintenance_job`

Trigger a maintenance task ad-hoc via POST /api/v1/jobs/maintenance. Requires trigger-job scope.

**Parameters:**

- `taskId` (string, required) — Registered maintenance task identifier (e.g. cleanup-sessions)
- `params` (object, optional) — Optional task-specific parameters

### `write_pulse_config`

Write a `pulse:` block into harness.config.json at the project root, preserving every other top-level key. Validates against PulseConfigSchema first; does not touch disk on schema failure. Writes harness.config.json.bak on first call only. Atomic via temp-file + rename.

**Parameters:**

- `path` (string, required) — Project root directory
- `config` (object, required) — PulseConfig to persist (must match PulseConfigSchema)
- `configPath` (string, optional) — Override path to harness.config.json. Defaults to &lt;project-root>/harness.config.json. Pass an absolute path or a path relative to the project root.
- `skipBackup` (boolean, optional) — When true, do not write harness.config.json.bak (default: false)

### `write_strategy`

Write a StrategyDoc to STRATEGY.md at the project root. Validates against StrategyDocSchema first; does not touch disk on schema failure. Writes STRATEGY.md.bak on first overwrite (idempotent). Atomic via temp-file + rename.

**Parameters:**

- `path` (string, required) — Project root directory
- `doc` (object, required) — StrategyDoc to persist (must match StrategyDocSchema)
- `skipBackup` (boolean, optional) — When true, do not write STRATEGY.md.bak (default: false)

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
- `offset` (number, optional) — Number of trend entries to skip (pagination). Default: 0. Trends are sorted by decay magnitude (absolute delta) desc. Ignored when category is set (category filter returns a single entry).
- `limit` (number, optional) — Max trend entries to return (pagination). Default: 20. Ignored when category is set (category filter returns a single entry).

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
- `offset` (number, optional) — Number of edges to skip (pagination). Default: 0. Edges are sorted by weight (confidence desc).
- `limit` (number, optional) — Max edges to return (pagination). Default: 50.

### `get_security_trends`

Get security posture trends showing how security score, findings, and supply chain metrics are changing over time.

**Parameters:**

- `path` (string, required) — Path to project root
- `last` (number, optional) — Return trends from the last N snapshots
- `since` (string, optional) — Return trends since this ISO date (e.g. 2025-01-01)

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
- `offset` (number, optional) — Number of nodes to skip (pagination). Default: 0. Nodes are sorted by connectivity (edge count desc).
- `limit` (number, optional) — Max nodes to return (pagination). Default: 50.

**CLI equivalent:** [`harness query`](cli-commands.md#harness-query-rootnodeid)

### `search_sessions`

Full-text search over archived + live session content (FTS5/BM25).

**Parameters:**

- `path` (string, required) — Path to project root
- `query` (string, required) — FTS5 query (bare words AND-joined)
- `limit` (number, optional) — Max results (default 20)
- `archivedOnly` (boolean, optional) — Only search archived sessions (skip live).
- `fileKinds` (array, optional) — Subset of file kinds to search.

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
- `offset` (number, optional) — Number of results to skip (default 0)
- `limit` (number, optional) — Maximum results to return (default 5)

## Runners & Reviewers

### `review_changes`

Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.

**Parameters:**

- `path` (string, required) — Path to project root
- `diff` (string, optional) — Raw git diff string. If omitted, auto-detects from git.
- `depth` (string, required) — Review depth: quick, standard, or deep
- `mode` (string, optional) — Response density. Default: summary
- `offset` (number, optional) — Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (error > warning > info).
- `limit` (number, optional) — Max findings to return (pagination). Default: 20.

### `run_agent_task`

Run an agent task using the harness CLI

**Parameters:**

- `task` (string, required) — Task to run
- `path` (string, optional) — Path to project root directory
- `timeout` (number, optional) — Timeout in milliseconds

**CLI equivalent:** [`harness agent run`](cli-commands.md#harness-agent-run-task)

### `run_ci_checks`

Run CI/CD validation checks on a harness project. Returns pass/fail results per check with issues. Checks: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability.

**Parameters:**

- `path` (string, required) — Path to project root directory
- `checks` (array, optional) — Subset of checks to run (default: all)

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
- `depth` (string, optional) — Override Phase 3.5 depth calibration. "deep" forces all conditional subagents (adversarial, typescript-strict, frontend-races).
- `prNumber` (number, optional) — PR number (required for --comment and CI gate)
- `repo` (string, optional) — Repository in owner/repo format (required for --comment)
- `offset` (number, optional) — Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (critical > important > suggestion).
- `limit` (number, optional) — Max findings to return (pagination). Default: 20.

### `run_design_pipeline`

Run the design-pipeline orchestrator: FRESHEN -> DETECT -> FIX -> AUDIT -> FILL -> REPORT. Composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a phased pipeline with convergence-based remediation.

**Parameters:**

- `path` (string, required) — Project root path
- `fix` (boolean, optional) — Enable convergence-based remediation
- `noFreshen` (boolean, optional) — Skip FRESHEN phase
- `noFill` (boolean, optional) — Skip FILL phase
- `ci` (boolean, optional) — Non-interactive: safe fixes only, no prompts
- `mode` (string, optional) — Verifier mode passed to each composed verifier
- `files` (array, optional) — Optional file/glob scope
- `designStrictness` (string, optional) — Override design.strictness

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
- `autoInject` (boolean, optional) — When true, returns only the Instructions section (before ## Details) for knowledge skills

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

### `emit_skill_proposal`

Emit a skill proposal (new-skill or refinement) into the review queue. Writes `.harness/proposals/<id>.json` and returns the queue URL. The proposal does not gate the agent — soundness-review runs at approval time.

**Parameters:**

- `path` (string, required) — Path to project root
- `kind` (string, required) — new-skill = full content; refinement = unified-diff against targetSkill
- `targetSkill` (string, optional) — Existing skill name (required when kind is refinement)
- `proposedBy` (string, required) — Agent identifier, e.g. "claude-code:harness-execution"
- `justification` (string, required) — Why this skill / refinement is worth promoting (20–2000 chars)
- `sessionId` (string, optional) — Originating session id (optional)
- `taskId` (string, optional) — Originating maintenance task id (optional)
- `content` (object, required) — Proposal content. new-skill ⇒ skillYaml+skillMd; refinement ⇒ diff

### `list_gateway_tokens`

List Gateway API tokens via GET /api/v1/auth/tokens. Secrets are redacted. Requires admin scope.

### `list_personas`

List available agent personas

**CLI equivalent:** [`harness persona list`](cli-commands.md#harness-persona-list)

### `list_streams`

List known state streams with branch associations and last-active timestamps

**Parameters:**

- `path` (string, required) — Path to project root

**CLI equivalent:** [`harness state streams`](cli-commands.md#harness-state-streams)

### `manage_roadmap`

Manage the project roadmap: show, add, update, remove, promote, sync, groom features, or query by filter. Reads and writes docs/roadmap.md. The "promote" action transitions an existing row toward planned (backlog→planned) and links its spec atomically — creating a new planned row under the "Intake" lane if the feature does not exist — returning a structured RoadmapPromoteResult envelope. The "groom" action tidies the roadmap: it demotes unactionable planned rows (no spec & no plan) to backlog and moves completed features into docs/roadmap-archive.md, returning the list of changes.

**Parameters:**

- `path` (string, required) — Path to project root
- `action` (string, required) — Action to perform
- `feature` (string, optional) — Feature name (required for add, update, remove, promote)
- `milestone` (string, optional) — Milestone name (required for add; optional filter for show)
- `status` (string, optional) — Feature status (required for add; optional for update; optional filter for show)
- `summary` (string, optional) — Feature summary (required for add; optional for update)
- `spec` (string, optional) — Spec file path (optional for add/update; required for promote)
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
- `taskId` (string, optional) — Task id (required for task-transition)
- `toLane` (string, optional) — Target lane (required for task-transition)
- `dependsOn` (array, optional) — Dependency task ids; when set, the task is registered before transitioning
- `evidence` (array, optional) — PR/commit/test refs (required to enter done)
- `force` (boolean, optional) — Force an off-table transition (requires actor+reason)
- `actor` (string, optional) — Actor for a forced transition
- `reason` (string, optional) — Reason for a forced transition

**CLI equivalent:** [`harness state show`](cli-commands.md#harness-state-show)
