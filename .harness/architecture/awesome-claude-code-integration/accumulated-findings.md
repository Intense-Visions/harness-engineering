# Accumulated Findings: Awesome Claude Code Resource Analysis

**Date:** 2026-03-29/30
**Agents run:** 16 deep-dive agents across 23 resources
**Status:** Complete

---

## Master Finding Index

Every actionable finding extracted from 23 resources, organized by what harness could adopt. Each finding has a unique ID for ranking.

---

### Category A: Security & Safety

**A1. Prompt injection scanning (from parry)**
6-layer defense-in-depth: unicode analysis → Aho-Corasick substring matching (80 phrases, 10 languages) → recursive encoding decode (base64/hex/URL/HTML/ROT13 with Shannon entropy) → secret detection (40+ regex patterns) → tree-sitter AST exfil detection → ML classification (DeBERTa ONNX ~10ms). Fail-closed design. Taint model blocks ALL tools on confirmed injection.

- **Integration**: Install parry-guard as Claude Code hook (zero code, immediate) OR port Aho-Corasick patterns + secret regexes to TypeScript (medium effort)
- **Effort**: Tiny (hook) / Medium (port)

**A2. Container sandboxing for orchestrator (from Container Use/Dagger)**
13 MCP tools for isolated environments. Immutable container state (content-addressed). Git-branch isolation per environment. Secret backends (1Password, Vault, env, file). No TS SDK — integrate via MCP client over stdio.

- **Integration**: Spawn `container-use stdio`, implement MCP client wrapper mapping to `ContainerBackend` interface
- **Effort**: Small (~1-2 days for MCP client)

**A3. False-positive verification workflow (from Trail of Bits fp-check)**
Structured FP verification: claim clarification → two paths (standard linear vs deep multi-phase) → evidence-based determination. Mandatory rejection of FP rationalizations. 3-tier confidence (confirmed/likely/needs_review).

- **Integration**: New skill `harness:fp-verify` between security scan and suppression
- **Effort**: Small (markdown skill)

**A4. "Rationalizations to Reject" pattern (from Trail of Bits)**
Every security skill has explicit lists of shortcuts the AI must refuse, with rebuttals. Example: "The compiler won't optimize away the wipe" → Reality: "Compilers routinely optimize away dead stores."

- **Integration**: Add `## Rationalizations to Reject` section to harness security skills (tdd, verification, architecture-enforcement)
- **Effort**: Tiny (prose additions)

**A5. Supply-chain risk auditor (from Trail of Bits)**
6-factor dependency risk evaluation: single maintainer, unmaintained, low popularity, dangerous features, CVE history, missing security contact. Systematic evaluation of every dependency.

- **Integration**: New skill `harness:supply-chain-audit` adapted from ToB format
- **Effort**: Small-Medium

**A6. Insecure defaults / fail-open detection (from Trail of Bits)**
Traces whether missing env vars cause silent degradation to weak defaults. Fail-open vs fail-secure distinction. Pattern scanning misses this class.

- **Integration**: Add check categories to `SecurityScanner`
- **Effort**: Small

**A7. API footgun detection / sharp-edges (from Trail of Bits)**
Finds dangerous API designs: weak algorithm selection, stringly-typed security, silent failures, configuration cliffs. Design-level security analysis.

- **Integration**: New skill or enhancement to `harness:security-review`
- **Effort**: Small-Medium

**A8. AST-based command safety with 130 handler modules (from Dippy)**
Hand-written recursive-descent bash parser (Parable, MIT, 14K+ tests). Three-decision model (allow/ask/deny). 130+ per-CLI handlers classifying subcommands as read-only vs mutating. Handles pipes, subshells, command substitution, heredocs, wrapper stripping, delegate pattern.

- **Integration**: Study handler modules for orchestrator command approval; potentially call Dippy via subprocess or port key handlers
- **Effort**: Medium (subprocess) / Large (port)

**A9. Prompt injection taint model (from parry)**
`.parry-tainted` file blocks ALL tools until manual removal. Confirmed injection in PostToolUse triggers taint. Session-level quarantine.

- **Integration**: Adopt taint concept for harness sessions processing external input (issues, PRs)
- **Effort**: Small

---

### Category B: Developer Experience

**B1. Usage/cost tracking from JSONL (from ccflare/ccusage)**
Claude Code stores token data in `~/.claude/projects/**/*.jsonl`. Assistant entries contain `message.usage` with input/output/cache_creation/cache_read tokens. Cost via LiteLLM pricing database (community-maintained, 24h cache). Deduplicate by `message.id + requestId`.

- **Integration**: Extend `TokenUsage` type, build `harness usage daily/session/current` CLI commands
- **Effort**: Small (~2-3 days)

**B2. Agent config linting — 385 rules (from agnix)**
Rust-based linter covering CLAUDE.md quality, agent frontmatter, hooks JSON, skill validation, MCP configs, prompt engineering anti-patterns. Auto-fix with confidence ratings. IDE integrations (VS Code, JetBrains, Neovim). Catches: oversized CLAUDE.md, invalid hooks, unreachable skills, generic instructions, weak language.

- **Integration**: Hybrid — `harness validate --agent-configs` shells out to agnix when available, falls back to ~20 ported TS rules
- **Effort**: Small-Medium

**B3. Hook authoring scaffolding (from claude-hooks)**
Template-based code generator using oclif. Generates typed payload interfaces for all 8 hook events (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, PreCompact, Notification). Wires into settings.json automatically.

- **Integration**: Build `harness generate hooks` with composable presets (--preset tdd/security/lint/audit). Target Node.js (not Bun).
- **Effort**: Medium

**B4. Mechanical TDD enforcement via hooks (from TDD Guard)**
PreToolUse hook intercepts Write/Edit/MultiEdit. AST test counting via `@ast-grep/napi` (7 languages). Single-test allowance (Red phase). AI validator for TDD compliance. PostToolUse lint handler for Refactor phase. Toggle on/off mid-session.

- **Integration**: Enhance `harness:tdd` with hook-based guard mode + AST counting. Offer as `harness generate hooks --preset tdd`.
- **Effort**: Medium

**B5. Desktop notifications for long-running ops (from CC Notify)**
macOS `terminal-notifier` on Stop/Notification hooks. Tracks duration via SQLite. VS Code jump on click. ~280 lines Python.

- **Integration**: Cross-platform via `node-notifier`. Add to autopilot/orchestrator completion events.
- **Effort**: Tiny

**B6. Full-text session search with TUI (from recall)**
Tantivy full-text indexing of JSONL sessions. Phrase boosting (10x exact match). Recency-weighted ranking (7-day half-life). Background incremental indexing. Scope toggle (project vs global). 50ms debounce. Resume integration.

- **Integration**: `harness sessions search` with Tantivy-equivalent (lunr/minisearch/SQLite FTS5). Index session metadata: phase, persona, skill, plan_id.
- **Effort**: Medium

**B7. Git stash-based auto-checkpointing (from claudekit)**
Non-destructive: `git stash create` + `git stash store` (invisible to working directory). Auto-triggers on Stop/SubagentStop. Max 10 checkpoints with cleanup. Manual restore via commands.

- **Integration**: Add as hook preset `harness generate hooks --preset checkpoint`
- **Effort**: Small

**B8. Codebase map auto-injection (from claudekit)**
Auto-generates structural map at session start (UserPromptSubmit hook). Updates on file changes (PostToolUse). DSL format showing functions/classes/imports + tree format for directory structure.

- **Integration**: Could enhance `gather_context` with auto-injected structural overview
- **Effort**: Small-Medium

**B9. Comment replacement detection (from claudekit)**
PostToolUse hook detects when code is replaced with placeholder comments ("// rest of implementation here", "// ... existing code"). Guards against common Claude laziness failure mode.

- **Integration**: Add as hook preset or integrate into code-review pipeline
- **Effort**: Tiny

**B10. Multi-platform config distribution (from Rulesync)**
Converts between 30+ AI tool config formats. Canonical `.rulesync/` source → fan-out to Claude, Cursor, Windsurf, Copilot, Cline, Kiro, etc. 7 feature types (rules, ignore, MCP, commands, subagents, skills, hooks).

- **Integration**: Emit `.rulesync/` canonical format from `harness init` for instant multi-platform reach
- **Effort**: Small-Medium

---

### Category C: Pattern & Process Improvements

**C1. Rationalization defense as first-class architecture (from Superpowers)**
Every discipline-enforcing skill has: Iron Laws (absolute rules), Red Flags (thoughts signaling violation), Common Rationalizations table (excuse → rebuttal). TDD for skill authoring: observe agent failing → write skill → observe new evasions → iterate.

- **Integration**: Add `## Iron Law`, `## Red Flags`, `## Common Rationalizations` sections to discipline-enforcing skills (tdd, verification, code-review, architecture-enforcement). Add `red_flags` YAML field to skill.yaml.
- **Effort**: Small (prose) / Medium (YAML schema)

**C2. Scratchpad delegation for token efficiency (from Context Engineering Kit)**
Agents write intermediate reasoning to disk files instead of conversation. Orchestrator reads only structured headers (VERDICT/SCORE/ISSUES). Keeps orchestrator context window clean.

- **Integration**: Instruct autopilot/planning agents to write analysis to `.harness/scratchpad/`. Parse structured verdict headers only.
- **Effort**: Small (prompt changes)

**C3. Meta-judge pre-generation (from Context Engineering Kit)**
Generate task-specific evaluation rubric BEFORE seeing implementation. Rubric persists across retry iterations for consistent evaluation. Prevents post-hoc rationalization.

- **Integration**: Add to `create_self_review` and code-review pipeline — dispatch rubric-generation agent in parallel with implementation.
- **Effort**: Medium

**C4. Commands-over-skills context loading (from Context Engineering Kit)**
Skill descriptions auto-load; command descriptions load on demand. Audit which skills need always-on descriptions vs on-demand loading.

- **Integration**: Restructure rarely-used skills as commands to reduce base context consumption
- **Effort**: Small (reorganization)

**C5. Structured error-to-lesson pipeline (from Compound Engineering)**
Two tracks (Bug/Knowledge) with typed taxonomies (root_cause, resolution_type enums). "What Didn't Work" sections. Prevention guidance. Active staleness detection auditing lessons against current code. 5-dimension semantic overlap scoring before creating new lessons.

- **Integration**: Extend learnings format with optional structured fields (root_cause, resolution_type). Add "tried_and_failed" dimension. Build `harnings:refresh-learnings` skill for staleness detection. Add semantic overlap check to `appendLearning`.
- **Effort**: Medium-Large

**C6. Learnings-researcher as always-on reviewer (from Compound Engineering)**
In every code review, automatically search learnings store for past issues related to current changes. Surface as "Known Pattern" flags with links.

- **Integration**: Integrate `loadBudgetedLearnings` into code-review pipeline with intent derived from changed files
- **Effort**: Small

**C7. Stage filtering / fast modes (from Context Engineering Kit)**
`--fast` runs 3 of 7 phases. `--one-shot` runs 2. `--skip` excludes specific phases. Explicit control over token expenditure vs quality tradeoff.

- **Integration**: Add `--fast` / `--thorough` flags to autopilot, planning, code-review skills
- **Effort**: Small

**C8. Rubric compression format (from Context Engineering Kit)**
Dense single-line weighted criteria: "Criterion (weight: 0.30) — Description. 1=Missing, 5=Excellent" instead of verbose rubric paragraphs.

- **Integration**: Adopt for review/validation prompts to reduce token overhead
- **Effort**: Tiny

**C9. Two-stage isolated review (from Superpowers)**
Separate spec-compliance reviewer from code-quality reviewer. Each gets fresh context. Prevents "marking your own homework."

- **Integration**: Split code-reviewer persona into spec-compliance + quality subagents
- **Effort**: Medium

**C10. TDD for skill authoring (from Superpowers)**
RED: Observe agent failing without the skill. GREEN: Write minimal skill. REFACTOR: Observe new evasions, add explicit counters. Closed-loop adversarial refinement.

- **Integration**: Add to `harness:skill-authoring` skill methodology
- **Effort**: Tiny (process documentation)

**C11. Uncertainty surfacing / clarification protocol (from ContextKit)**
AI identifies uncertainty markers in specs, proposes 2-4 answers per ambiguity, user selects. Resolves ambiguity BEFORE planning proceeds.

- **Integration**: Add "uncertainty surfacing" step to planning skill where planner flags unknowns instead of making assumptions
- **Effort**: Small

**C12. Incremental milestone commits (from ContextKit)**
Commit at every milestone marker in task list, not just at phase boundaries. Improves rollback granularity.

- **Integration**: Add mid-phase commit points to autopilot execution loop
- **Effort**: Small

**C13. Review-never-fixes separation (from RIPER)**
Review agent classifies deviations by severity but is FORBIDDEN from fixing anything. Must recommend switching to execute/plan mode for remediation. Clean separation of concerns.

- **Integration**: Enforce in harness verifier/reviewer personas — output findings only, never auto-fix
- **Effort**: Tiny (prompt change)

**C14. Read-only research phase (from RIPER)**
Explicit prohibition on "suggesting solutions" during research. Discovery separated from ideation prevents premature solution-jumping.

- **Integration**: Strengthen research phases in planning/architecture skills with explicit "no solutions" constraint
- **Effort**: Tiny (prompt change)

---

### Category D: Competitive Intelligence Patterns

**D1. Tiered MCP tool loading (from Claude Task Master)**
3 tiers: core (5K tokens), standard (10K), all (21K). Users trade context window for capability. Configurable via env var.

- **Integration**: Add tool tiers to harness MCP server — lightweight/standard/full
- **Effort**: Medium

**D2. Spec-driven 4-tier hierarchy (from sudocode)**
Specs → Issues → Agents → Artifacts. Bidirectional `[[SPEC-010]]` / `[[@ISSUE-001]]` linking. Agent feedback updates specs during execution (closed-loop).

- **Integration**: Study for roadmap/planning system enhancement. Bidirectional linking syntax is worth adopting.
- **Effort**: Large (architectural)

**D3. JSONL+SQLite dual storage (from sudocode)**
Human format (Markdown+YAML) + machine format (JSONL+SQLite). Bidirectional sync with 5-second debounce. Git-native persistence.

- **Integration**: Add SQLite query layer over harness state/sessions for faster programmatic access
- **Effort**: Medium-Large

**D4. findParallelGroups from dependency graph (from sudocode)**
Topological sort + automatic identification of concurrent execution opportunities from dependency metadata.

- **Integration**: Enhance `check_task_independence` MCP tool with graph-based parallel group detection
- **Effort**: Medium

**D5. Token efficiency mode with symbol tables (from SuperClaude)**
Explicit abbreviation systems (→ for "leads to", ✓ for done, etc.) claiming 30-50% token reduction. Dense formatting conventions.

- **Integration**: Study for skill prompt compression. May be too aggressive for readability.
- **Effort**: Tiny to experiment

**D6. Confidence-first gating (from SuperClaude)**

> 90% confidence → proceed. 70-89% → present alternatives. <70% → ask questions. Pre-implementation gate.

- **Integration**: Add confidence self-assessment step to planning/execution skills
- **Effort**: Small

**D7. Deep multi-hop research pipeline (from SuperClaude)**
Multi-hop autonomous web research with quality scoring (0.0-1.0), three planning strategies, depth levels. Case-based learning across sessions.

- **Integration**: Study for potential `harness:research` skill
- **Effort**: Medium-Large

**D8. Thinking level tuning per session (from claudekit)**
UserPromptSubmit hook configures Claude's reasoning depth based on prompt complexity.

- **Integration**: Add to hook presets
- **Effort**: Small

**D9. Mandatory triage routing (from claudekit)**
All problems go through triage expert before specialist delegation.

- **Integration**: Add triage step to autopilot/orchestrator dispatch
- **Effort**: Small

**D10. File guard with multi-format ignore (from claudekit)**
Merges `.agentignore`, `.aiignore`, `.cursorignore` patterns for unified sensitive file protection.

- **Integration**: Adopt unified ignore pattern in harness workspace management
- **Effort**: Small

---

## Summary Statistics

- **Total findings:** 43
- **Category A (Security):** 9 findings
- **Category B (DX):** 10 findings
- **Category C (Patterns):** 14 findings
- **Category D (Competitive):** 10 findings
- **Effort breakdown:** Tiny (10), Small (14), Medium (12), Large (4), Small-Medium (3)
