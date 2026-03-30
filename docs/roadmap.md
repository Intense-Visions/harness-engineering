---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-03-30
last_synced: 2026-03-28T22:45:00Z
last_manual_edit: 2026-03-30
---

# Roadmap

## v1.0 Foundation

### Core Library Design & Modules

- **Status:** done
- **Spec:** docs/changes/core-library-design/proposal.md
- **Summary:** Core library architecture with validation, context engineering, architectural constraints, entropy management, and agent feedback modules
- **Blockers:** none
- **Plan:** docs/plans/2026-03-11-phase1-foundation-and-docs.md

### Module 1: Validation

- **Status:** done
- **Spec:** docs/changes/core-library-design/proposal.md
- **Summary:** Schema validation engine for harness configuration and project artifacts
- **Blockers:** none
- **Plan:** docs/plans/2026-03-11-module1-validation.md

### Module 2: Context Engineering

- **Status:** done
- **Spec:** docs/changes/core-library-implementation/proposal.md
- **Summary:** Context assembly and management for AI agent interactions
- **Blockers:** none
- **Plan:** docs/plans/2026-03-12-module2-context-engineering.md

### Module 3: Architectural Constraints

- **Status:** done
- **Spec:** docs/changes/architectural-constraints/proposal.md
- **Summary:** Layer boundary enforcement and dependency rule validation
- **Blockers:** none
- **Plan:** docs/plans/2026-03-12-module3-architectural-constraints.md

### Module 4: Entropy Management

- **Status:** done
- **Spec:** docs/changes/entropy-management/proposal.md
- **Summary:** Codebase entropy detection including dead code, drift, and pattern violations
- **Blockers:** none
- **Plan:** docs/plans/2026-03-12-module4-entropy-management.md

### Module 5: Agent Feedback

- **Status:** done
- **Spec:** docs/changes/agent-feedback/proposal.md
- **Summary:** Structured feedback loops between AI agents and harness validation
- **Blockers:** none
- **Plan:** docs/plans/2026-03-12-module5-agent-feedback.md

### CLI & Tooling

- **Status:** done
- **Spec:** docs/changes/cli-tooling/proposal.md
- **Summary:** CLI package for running harness commands and automation tooling
- **Blockers:** none
- **Plan:** docs/plans/2026-03-12-phase2-cli.md

### Agent Skills

- **Status:** done
- **Spec:** docs/changes/agent-skills/proposal.md
- **Summary:** Skill system enabling AI agents to execute structured workflows
- **Blockers:** none
- **Plan:** docs/plans/2026-03-13-agent-skills.md

### ESLint Plugin

- **Status:** done
- **Spec:** docs/changes/eslint-plugin/proposal.md
- **Summary:** ESLint plugin for enforcing harness architectural constraints in code
- **Blockers:** none
- **Plan:** docs/plans/2026-03-13-eslint-plugin.md

### Linter Generator

- **Status:** done
- **Spec:** docs/changes/linter-generator/proposal.md
- **Summary:** Dynamic linter configuration generation from harness project constraints
- **Blockers:** none
- **Plan:** docs/plans/2026-03-13-linter-gen.md

### Framework-Inspired Enhancements

- **Status:** done
- **Spec:** docs/changes/framework-inspired-enhancements/proposal.md
- **Summary:** Enhancements drawn from competitor framework research (Spec Kit, BMAD, etc.)
- **Blockers:** none
- **Plan:** docs/plans/2026-03-14-framework-inspired-enhancements.md

### Pattern Adoption

- **Status:** done
- **Spec:** docs/changes/pattern-adoption/proposal.md
- **Summary:** Adoption of proven patterns from framework research into harness core
- **Blockers:** none
- **Plan:** docs/plans/2026-03-14-pattern-adoption.md

### Templates & Agents

- **Status:** done
- **Spec:** docs/changes/templates-and-agents/proposal.md
- **Summary:** Project templates and agent persona definitions for common workflows
- **Blockers:** none
- **Plan:** docs/plans/2026-03-14-phase3-templates-and-agents.md

### Rich Skill Format

- **Status:** done
- **Spec:** docs/changes/rich-skill-format/proposal.md
- **Summary:** Structured skill format with YAML metadata, phases, gates, and cognitive modes
- **Blockers:** none
- **Plan:** docs/plans/2026-03-14-rich-skill-format.md

## v1.0 Distribution

### Examples & Documentation

- **Status:** done
- **Spec:** docs/changes/examples-and-docs/proposal.md
- **Summary:** Example projects and comprehensive documentation for onboarding
- **Blockers:** none
- **Plan:** docs/plans/2026-03-15-examples-and-docs.md

### Framework Research Round 3

- **Status:** done
- **Spec:** docs/changes/framework-research-round-3/proposal.md
- **Summary:** Third round of competitive framework analysis driving final v1 enhancements
- **Blockers:** none
- **Plan:** docs/plans/2026-03-15-framework-research-round-3.md

### Research Roadmap Groups A-E

- **Status:** done
- **Spec:** docs/changes/research-roadmap/proposal.md
- **Summary:** Implementation of 20 prioritized research recommendations across 5 theme groups
- **Blockers:** none
- **Plan:** docs/plans/2026-03-16-group-a-review-system.md

### Release Readiness

- **Status:** done
- **Spec:** docs/changes/release-readiness-prep/proposal.md
- **Summary:** Audit and preparation for general consumption including packaging and docs
- **Blockers:** none
- **Plan:** docs/plans/2026-03-16-release-readiness.md

### MCP Setup & Documentation

- **Status:** done
- **Spec:** docs/changes/mcp-setup/proposal.md
- **Summary:** MCP server setup documentation and scaffolding for tool integration
- **Blockers:** none
- **Plan:** none

### Slash Command Generation

- **Status:** done
- **Spec:** docs/changes/slash-command-generation/proposal.md
- **Summary:** Automatic slash command generation for Claude Code and Gemini CLI from skills
- **Blockers:** none
- **Plan:** docs/plans/2026-03-16-slash-command-generation.md

### MCP Server Expansion

- **Status:** done
- **Spec:** docs/changes/mcp-server-expansion/proposal.md
- **Summary:** Expanding MCP server with additional harness tools and capabilities
- **Blockers:** none
- **Plan:** docs/plans/2026-03-16-mcp-server-expansion.md

### Day-to-Day Workflow Tutorial

- **Status:** done
- **Spec:** docs/changes/day-to-day-workflow-tutorial/proposal.md
- **Summary:** Step-by-step tutorial for common developer workflows using harness
- **Blockers:** none
- **Plan:** docs/plans/2026-03-17-day-to-day-workflow-tutorial.md

### CLI Self-Update

- **Status:** done
- **Spec:** docs/changes/cli-self-update/proposal.md
- **Summary:** Self-update command for the harness CLI to pull latest versions
- **Blockers:** none
- **Plan:** docs/plans/2026-03-17-cli-self-update.md

## v2.0 Knowledge Graph & Personas

### Knowledge Graph System

- **Status:** done
- **Spec:** none
- **Summary:** 10-phase graph-based knowledge system replacing file-based context with structured relationships
- **Blockers:** none
- **Plan:** docs/plans/2026-03-18-graph-foundation-plan.md

### Project-Local Skill Discovery

- **Status:** done
- **Spec:** docs/changes/project-local-skill-discovery/proposal.md
- **Summary:** Automatic discovery and loading of project-specific skills from local directories
- **Blockers:** none
- **Plan:** docs/plans/2026-03-18-project-local-skill-discovery-plan.md

### Code Reviewer Persona

- **Status:** done
- **Spec:** docs/changes/code-reviewer-persona/proposal.md
- **Summary:** Specialized AI persona for multi-phase code review with conditional steps
- **Blockers:** none
- **Plan:** docs/plans/2026-03-18-code-reviewer-persona-plan.md

### Executor Personas

- **Status:** done
- **Spec:** docs/changes/executor-personas/proposal.md
- **Summary:** Task executor and parallel coordinator personas for plan execution
- **Blockers:** none
- **Plan:** none

### Agent Definition Generator

- **Status:** done
- **Spec:** docs/changes/agent-definition-generator/proposal.md
- **Summary:** Generates agent definitions for persona-based routing in Claude Code and Gemini CLI
- **Blockers:** none
- **Plan:** docs/plans/2026-03-18-agent-definition-generator-plan.md

## v2.0 Advanced Features

### Security: First-Class Concern

- **Status:** done
- **Spec:** docs/changes/security-first-class/proposal.md
- **Summary:** Elevating code security to a first-class harness concern with scanning, review, and enforcement
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-security-scanner-core-plan.md

### State Streams

- **Status:** done
- **Spec:** docs/changes/state-streams/proposal.md
- **Summary:** Multi-session isolation for independent work items with scoped state management
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-state-streams-plan.md

### Performance Enforcement

- **Status:** done
- **Spec:** docs/changes/performance-enforcement/proposal.md
- **Summary:** Performance budgets, benchmark management, and regression detection
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-performance-enforcement-part1-plan.md

### Health Analyst Security Integration

- **Status:** done
- **Spec:** docs/changes/health-analyst-security/proposal.md
- **Summary:** Integrating security scanning into the codebase health analyst workflow
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-health-analyst-security-plan.md

### Autopilot

- **Status:** done
- **Spec:** docs/changes/autopilot/proposal.md
- **Summary:** Autonomous phase execution loop chaining planning, execution, verification, and review
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-autopilot-plan.md

### Release Readiness Skill

- **Status:** done
- **Spec:** docs/changes/release-readiness/proposal.md
- **Summary:** Skill for auditing npm release readiness with maintenance checks and auto-fixes
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-release-readiness-skill.md

### Design System Skills

- **Status:** done
- **Spec:** docs/changes/design-system-skills/proposal.md
- **Summary:** Design token generation, palette selection, typography, and component generation skills
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-design-system-phase1-shared-foundation-plan.md

### Autopilot Session Scoping

- **Status:** done
- **Spec:** docs/changes/autopilot-session-scoping/proposal.md
- **Summary:** Per-spec session directories for isolated autopilot state management
- **Blockers:** none
- **Plan:** docs/plans/2026-03-19-autopilot-session-scoping-phase1-skill-md-plan.md

### i18n & Localization Skills

- **Status:** done
- **Spec:** docs/changes/i18n-localization-skills/proposal.md
- **Summary:** Internationalization scanning, translation lifecycle management, and process injection
- **Blockers:** none
- **Plan:** docs/plans/2026-03-20-i18n-core-skill-plan.md

### Spec & Plan Soundness Review

- **Status:** done
- **Spec:** docs/changes/spec-plan-soundness-review/proposal.md
- **Summary:** Deep soundness analysis of specs and plans with auto-fix and convergence loops
- **Blockers:** none
- **Plan:** docs/plans/2026-03-20-autofix-convergence-plan.md

### Update Check Notification

- **Status:** done
- **Spec:** docs/changes/update-check-notification/proposal.md
- **Summary:** Version update checking with CLI notification and configuration options
- **Blockers:** none
- **Plan:** docs/plans/2026-03-20-update-checker-core-plan.md

## v2.0 Pipeline Unification

### Unified Code Review Pipeline

- **Status:** done
- **Spec:** docs/changes/unified-code-review-pipeline/proposal.md
- **Summary:** Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel agents
- **Blockers:** none
- **Plan:** docs/plans/2026-03-20-pipeline-skeleton-plan.md

### Detection & Remediation

- **Status:** done
- **Spec:** docs/changes/detection-remediation-dead-code-architecture/proposal.md
- **Summary:** Unified detection-to-remediation flow for dead code removal and architecture violation fixes
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-detection-remediation-plan.md

### Development Loop Chaining

- **Status:** done
- **Spec:** docs/changes/development-loop-chaining/proposal.md
- **Summary:** Chaining development loops (brainstorm, plan, execute, review) into continuous workflows
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-development-loop-chaining-plan.md

### Graph Fallback Implementation

- **Status:** done
- **Spec:** docs/changes/graph-fallback-implementation/proposal.md
- **Summary:** Graceful degradation when graph database is unavailable with file-based fallbacks
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-graph-fallback-implementation-plan.md

### Interaction Surface Abstraction

- **Status:** done
- **Spec:** docs/changes/interaction-surface-abstraction/proposal.md
- **Summary:** Abstracting interaction surfaces to support Claude Code, Gemini CLI, and future platforms
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-interaction-surface-abstraction-plan.md

### Performance Pipeline Unification

- **Status:** done
- **Spec:** docs/changes/performance-pipeline-unification/proposal.md
- **Summary:** Unifying performance checks into a single pipeline with budget enforcement
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-performance-pipeline-unification-plan.md

### Security Pipeline Unification

- **Status:** done
- **Spec:** docs/changes/security-pipeline-unification/proposal.md
- **Summary:** Unifying security scanning into a single pipeline with OWASP baseline
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-security-pipeline-unification-plan.md

### Unified Documentation Pipeline

- **Status:** done
- **Spec:** docs/changes/unified-documentation-pipeline/proposal.md
- **Summary:** Automated documentation drift detection, coverage validation, and alignment
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-unified-documentation-pipeline-plan.md

### Unified Project Roadmap

- **Status:** done
- **Spec:** docs/changes/unified-project-roadmap/proposal.md
- **Summary:** Roadmap management system with interactive creation, sync, and MCP integration
- **Blockers:** none
- **Plan:** docs/plans/2026-03-21-roadmap-core-types-parser-plan.md

### Cross-Platform Enforcement

- **Status:** done
- **Spec:** docs/changes/cross-platform-enforcement/proposal.md
- **Summary:** Cross-platform support with ESLint rules, platform parity tests, and 3-OS CI matrix enforcement
- **Blockers:** none
- **Plan:** none

### Agent Workflow Acceleration

- **Status:** done
- **Spec:** docs/changes/agent-workflow-acceleration/proposal.md
- **Summary:** Composite MCP tools, structured decision UX, and tool consolidation reducing agent round-trips from 10-15 to 3-5 calls
- **Blockers:** none
- **Plan:** none

### Harness v2 Patterns

- **Status:** done
- **Spec:** docs/changes/harness-v2-patterns/proposal.md
- **Summary:** Design patterns and conventions for harness v2 architecture
- **Blockers:** none
- **Plan:** none

## Current Work

### Merge MCP into CLI

- **Status:** done
- **Spec:** docs/changes/merge-mcp-into-cli/proposal.md
- **Summary:** Eliminate standalone mcp-server package by moving source into CLI with unified binary and paths
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-phase1-move-and-rewire-plan.md

### Roadmap Pipeline Sync

- **Status:** done
- **Spec:** docs/changes/roadmap-pipeline-sync/proposal.md
- **Summary:** Embed automatic roadmap status updates into brainstorming, execution, and autopilot skills
- **Blockers:** none
- **Plan:** none

### Orchestrator Package Implementation

- **Status:** done
- **Spec:** docs/changes/orchestrator/proposal.md
- **Summary:** Long-running daemon that polls issue trackers, dispatches coding agents in isolated workspaces, with Ink TUI and HTTP API observability
- **Blockers:** none
- **Plan:** docs/plans/2026-03-24-orchestrator-foundation-plan.md

### Efficient Context Pipeline

- **Status:** done
- **Spec:** docs/changes/efficient-context-pipeline/proposal.md
- **Summary:** Reduce token waste through session-scoped state, lean agent dispatch, token-budgeted learnings, session summaries, and a learnings-driven feedback loop
- **Blockers:** none
- **Plan:** docs/plans/2026-03-26-phase1-session-scoped-state-plan.md

### Multi-Language Framework Templates

- **Status:** done
- **Spec:** docs/changes/multi-language-templates/proposal.md
- **Summary:** Extend template system to support 10 frameworks across 5 languages (TS/JS, Python, Go, Rust, Java) with auto-detection, existing project overlay, and language manifest
- **Blockers:** none
- **Plan:** docs/plans/2026-03-27-phase1-engine-foundation-plan.md

### AI Foundations Integration: Session Memory & Evidence Enforcement

- **Status:** done
- **Spec:** docs/changes/ai-foundations-integration/proposal.md
- **Summary:** Upgrade manage_state with accumulative session-scoped sections and establish evidence-based claims standard across all skills with review gate verification
- **Blockers:** none
- **Plan:** docs/plans/2026-03-27-wave1-1-schema-types-plan.md

### Autopilot Final Review Gate

- **Status:** done
- **Spec:** docs/changes/autopilot-final-review-gate/proposal.md
- **Summary:** FINAL_REVIEW state in autopilot state machine — holistic code review of all cumulative changes before PR creation, catching cross-phase issues and cumulative scope concerns
- **Blockers:** none
- **Plan:** docs/plans/2026-03-28-state-machine-plumbing-plan.md

### Force-Multiplier Integrations (Tier 1)

- **Status:** planned
- **Spec:** .harness/architecture/force-multiplier-integrations/ADR-001.md
- **Summary:** Zero-config MCP peer integrations (Context7, Sequential Thinking) and high-value connectors (Perplexity, Playwright, E2B) via Bidirectional Knowledge Bridge architecture
- **Blockers:** none
- **Plan:** none

### CI Pipeline Hardening

- **Status:** done
- **Spec:** docs/changes/ci-pipeline-hardening/proposal.md
- **Summary:** Codecov integration, ratchet-only coverage baselines for all packages, Vitest benchmarks with 10% regression gates for core and graph, and post-publish smoke test — practice the standards harness enforces on others
- **Blockers:** none
- **Plan:** docs/plans/2026-03-28-phase1-coverage-output-plan.md

### Migration Toolkit

- **Status:** planned
- **Spec:** none
- **Summary:** Config version codemods, breaking-change detection, and upgrade scripts for users moving between harness versions
- **Blockers:** none
- **Plan:** none

### Onboarding Funnel

- **Status:** done
- **Spec:** docs/changes/onboarding-funnel/proposal.md
- **Summary:** `harness setup` single-command environment configuration, `harness doctor` lightweight diagnostics, and first-run welcome message bridging the install-to-productivity gap for new users
- **Blockers:** none
- **Plan:** docs/plans/2026-03-28-first-run-detection-plan.md

### Runtime Enforcement Extensions

- **Status:** planned
- **Spec:** docs/changes/runtime-enforcement-extensions/proposal.md
- **Summary:** `harness hooks` CLI command with profile-based hook activation (minimal/standard/strict), plus 18 new security scanner rules for agent config auditing and MCP server security
- **Blockers:** none
- **Plan:** none

### Security Rule Test Coverage

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Unit tests for 8+ untested security rule implementations (crypto, XSS, path traversal, deserialization, network, stack-specific). Enforce coverage thresholds in CI as blockers, not warnings. [E9/E10]
- **Blockers:** none
- **Plan:** none

## v3.0 Graph Intelligence

### Graph Anomaly Detection

- **Status:** done
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Z-score outlier detection over complexity, coupling, fanIn/fanOut metrics plus articulation point identification via knowledge graph. New MCP tool: detect_anomalies. [C15]
- **Blockers:** none
- **Plan:** none

### Automatic Task Independence Detection

- **Status:** done
- **Spec:** docs/changes/task-independence-detection/proposal.md
- **Summary:** Pairwise file-overlap, import-chain, and call-graph reachability analysis to verify parallel tasks won't conflict. New MCP tool: check_task_independence. [F5]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-phase1-core-analyzer-plan.md

### Conflict Prediction

- **Status:** done
- **Spec:** docs/changes/conflict-prediction/proposal.md
- **Summary:** Returns conflict matrix with reasoning before parallel agent dispatch. Integrates into harness-parallel-agents skill. [F9]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-conflict-predictor-core-plan.md, docs/plans/2026-03-23-conflict-predictor-tests-plan.md, docs/plans/2026-03-23-conflict-predictor-integration-plan.md

### Natural Language Graph Queries

- **Status:** done
- **Spec:** docs/changes/natural-language-graph-queries/proposal.md
- **Summary:** English-to-ContextQL translation via scored multi-signal classifier enabling conversational codebase exploration. Ask 'what breaks if I change auth?' and get graph-backed answers with NL summaries. New MCP tool: ask_graph. No external LLM dependency — works on both Claude Code and Gemini CLI. [K7]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-nlq-\*.md

### Architecture Assertion Framework

- **Status:** done
- **Spec:** docs/changes/architecture-assertion-framework/proposal.md
- **Summary:** Assertion library for structural testing — assert module size, coupling limits, complexity ceilings. Compare against baselines and fail CI on architectural regression. [L3]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-arch-assertion-\*.md, docs/plans/2026-03-24-arch-assertion-integration-plan.md

### Pre-Commit Impact Preview

- **Status:** done
- **Spec:** docs/changes/pre-commit-impact-preview/proposal.md
- **Summary:** CLI command `harness impact-preview` showing blast radius of staged changes (affected files, tests, docs) with compact/detailed/per-file modes. Integrated into harness-pre-commit-review skill. [J6]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-23-impact-preview-cli-plan.md

### Constraint Deprecation Detection

- **Status:** done
- **Spec:** docs/changes/constraint-deprecation-detection/proposal.md
- **Summary:** First-class constraint rule nodes in the knowledge graph with lastViolatedAt timestamps, auto-populated from collectors via getRules(). New detect_stale_constraints MCP tool queries for constraints with no violations within a configurable window (default 30 days). [L2]
- **Blockers:** none
- **Plan:** none

## v3.0 Viral Flywheel

### harness:blueprint — Automated Architectural Learning

- **Status:** done
- **Spec:** docs/changes/harness-blueprint/proposal.md
- **Summary:** Generates interactive, offline-first HTML blueprints/courses of a codebase. Uses the Knowledge Graph for pedagogical ordering, impact-aware exercises, and code-to-English translations.
- **Blockers:** none
- **Plan:** none

### Skill Marketplace

- **Status:** done
- **Spec:** docs/changes/skill-marketplace/proposal.md
- **Summary:** Community skill registry via @harness-skills/\* npm namespace. harness install/uninstall with dependency resolution, semver version ranges, bundled skill collision prevention. harness skill search with platform/trigger filters, harness skill create with README generation, harness skill publish with 6-check validation pipeline. Community skills integrate into slash command generation (project > community > global priority). [H1]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-24-skill-marketplace-install-plan.md

### Constraint Sharing

- **Status:** done
- **Spec:** docs/changes/constraint-sharing/proposal.md
- **Summary:** Export constraint subsets from harness.config.json as shareable bundles; import and merge with per-rule provenance tracking. [H3]
- **Blockers:** none
- **Plan:** docs/plans/2026-03-24-constraint-sharing-types-plan.md

### Architecture Decay Timeline

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Scheduled CI snapshots of constraint violations, complexity hotspots, dead code, coupling density, and test coverage stored as time-series graph nodes. Shows architecture stability trends over months with visualization. [J1]
- **Blockers:** none
- **Plan:** none

### Predictive Architecture Failure

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Extrapolate decay trends from timeline plus planned roadmap features to predict which constraints will break and when. Warns before architectural violations become reality. [J2]
- **Blockers:** Architecture Decay Timeline
- **Plan:** none

### Spec-to-Implementation Traceability

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Requirement-to-code mapping via enhanced phase gates with content validation, new graph edge types (requires, verified_by, tested_by), and coverage matrix showing which EARS-structured spec requirements have corresponding code and tests. [E2]
- **Blockers:** none
- **Plan:** none

### Skill Recommendation Engine

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Maps codebase characteristics (coupling score, test coverage, violation types, complexity distribution) to optimal skill sequences via decision-tree scoring. Recommends the right skills for the current codebase state. [D11]
- **Blockers:** none
- **Plan:** none

### Intelligent Skill Dispatch

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Change-triggered automatic skill selection. When files change, determines optimal skill+persona combination based on file hotspot data, change type, and historical skill effectiveness. Auto-composes multi-skill workflows. [L4]
- **Blockers:** Skill Recommendation Engine
- **Plan:** none

### Constraint Emergence from Patterns

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Clusters recurring violations by pattern. When N similar violations appear in M weeks, suggests a new constraint rule. Learns architectural norms from team behavior rather than requiring hand-coded rules. [L1]
- **Blockers:** none
- **Plan:** none

### Cascading Failure Simulation

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Probabilistic BFS traversal with failure probability annotations synthesized from change frequency. New tool: compute_blast_radius. Shows transitive downstream impact with confidence scores — not just direct dependencies but the full cascade chain. [C9]
- **Blockers:** none
- **Plan:** none

### Community Detection

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Label propagation algorithm over import/call graph to auto-discover natural module boundaries. Validates or challenges existing layer definitions by revealing the actual clustering in the codebase. [C6]
- **Blockers:** none
- **Plan:** none

## v3.0 Deep Intelligence

### Self-Improving Agent Skills

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Outcome attribution mapping review findings to actual bugs via issue tracker. Skill effectiveness baselines (like perf baselines). Dynamic prompt injection into skill preamble based on historical outcomes. Skills measurably improve over time. [D4/D5]
- **Blockers:** none
- **Plan:** none

### Cross-Project Knowledge Federation

- **Status:** deferred (Q3 2026)
- **Spec:** docs/changes/cross-project-knowledge-federation/proposal.md
- **Summary:** Decentralized knowledge sharing via package-native federation. PackageResolver interface for language-agnostic discovery. Four knowledge types (learnings, constraints, patterns, structural summaries) with visibility tags. Background sync via hooks + optional cron. [D2]
- **Blockers:** Constraint sharing must ship first (proves cross-project sharing patterns); needs 5+ active harness-managed projects for adoption density
- **Plan:** none

### Spec-to-Code Semantic Verification

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** EARS grammar parser for machine-verifiable requirements. Test assertion semantic analysis via Claude API. Detects gaps between what the spec says and what the tests actually assert. Extends spec-to-implementation traceability with behavioral matching. [E1]
- **Blockers:** Spec-to-Implementation Traceability
- **Plan:** none

### Trust Scoring for Agent Output

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Explicit confidence model per review finding: validation method (mechanical > graph > heuristic) x evidence quality x cross-agent agreement x historical accuracy. Every finding shows a visible confidence percentage for human triage. [E6]
- **Blockers:** none
- **Plan:** none

### Skill Effectiveness Tracking

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Links review findings to actual bugs via git history and issue tracker. Builds effectiveness baselines per skill per task type. Feeds back into prompt selection. Quantifies which skills produce good outcomes and which need calibration. [D3/D9]
- **Blockers:** none
- **Plan:** none

### Anti-Pattern Inference

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Failure feature extraction and clustering to auto-discover constraints from project history. Identifies patterns like 'when files matching X are changed without updating Y, failures occur 80% of the time.' Learned constraints, not hand-coded ones. [D7]
- **Blockers:** none
- **Plan:** none

### Architectural Debt Quantification

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Cost model mapping violation types to developer-hours based on historical fix times. Compound interest calculation for deferred fixes. ROI scoring that translates abstract code quality into concrete dollar amounts. [J4]
- **Blockers:** none
- **Plan:** none

### Developer Velocity Analysis

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Git history temporal analysis, PR/review time integration, and friction zone identification. Identifies which codebase areas slow development most and quantifies the productivity gains from targeted refactoring. [K1]
- **Blockers:** none
- **Plan:** none

### Multi-Language Support

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Tree-sitter integration for Python, Go, Rust, and Java parsing. Language-agnostic constraint enforcement. Cross-language dependency tracking in knowledge graph. Same architectural rules apply regardless of implementation language. [B1/B6]
- **Blockers:** none
- **Plan:** none

### Persistent Agent Specialization

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Agent memory system tracking task-type performance over time. Specialization scoring and dynamic persona weighting. Agents develop expertise in specific codebase areas through accumulated experience. [F10]
- **Blockers:** none
- **Plan:** none

### Security Posture Timeline

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Security metric snapshots over time with supply chain monitoring and vulnerability time-to-fix analysis. Tracks whether the codebase is getting more or less secure over months with trend attribution. [L6]
- **Blockers:** none
- **Plan:** none

### Agent Effectiveness Introspection

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Domain-specific accuracy tracking and blind spot detection with automatic persona switching triggers. Identifies where agents consistently fail and routes to better-suited personas automatically. [L7]
- **Blockers:** none
- **Plan:** none

## v3.0 Supporting Work

### Community Infrastructure

- **Status:** planned
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Discord community server, built-with-harness showcase gallery, social media presence, educational content series, GitHub Sponsors/Open Collective, and contribution gamification with badges and milestones. [H2/H4-H8]
- **Blockers:** none
- **Plan:** none

### Domain Skill Tiers & Catalog System

- **Status:** done
- **Spec:** docs/changes/domain-skill-tiers/proposal.md
- **Summary:** Three-tier skill loading (30 always-loaded slash commands, 43 catalog-only discoverable via search_skills, 6 dependency-only), intelligent dispatcher, and 30 new domain skills covering backend, infrastructure, reliability, auth, compliance, testing, soft domains, data engineering, ML/AI, and mobile. Cross-platform (Claude Code + Gemini CLI).
- **Blockers:** none
- **Plan:** docs/plans/2026-03-27-tier-infrastructure-plan.md

### Platform Expansion

- **Status:** backlog
- **Spec:** .harness/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** VS Code extension with sidebar and skill launcher, multi-CI recipes (GitLab, Jenkins, CircleCI, Azure DevOps), per-package config overrides for monorepos, and config inheritance chain (global to org to project to package). [B3/B7-B9]
- **Blockers:** none
- **Plan:** none

## Backlog

### CI/CD & Issue Tracker Integration

- **Status:** backlog
- **Spec:** docs/changes/ci-cd-issue-tracker-integration/proposal.md
- **Summary:** Automated CI/CD pipeline and issue tracker integration for harness workflows
- **Blockers:** none
- **Plan:** docs/plans/2026-03-17-ci-cd-issue-tracker-integration-plan.md

### Skill Discipline Upgrades

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Add Rationalizations to Reject, Iron Laws, Red Flags, review-never-fixes, read-only research, TDD skill authoring, rubric compression, uncertainty surfacing, and comment replacement guards across 8+ discipline-enforcing skills. Inspired by Trail of Bits and Superpowers patterns. [ACE-Batch1]
- **Blockers:** none
- **Plan:** none

### Prompt Injection Defense

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Document parry-guard hook installation for orchestrator users processing untrusted external input (issues, PRs, Slack). Implement session taint model with 30-minute auto-expire. Add CLAUDE.md scanning for cloned repos before orchestrator plan execution. [ACE-A1/A9]
- **Blockers:** none
- **Plan:** none

### Context Efficiency Pipeline

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** --fast/--thorough flags for autopilot, planning, and code-review skills. Scratchpad delegation (agent reasoning to .harness/scratchpad/ instead of conversation context). Learnings integration in code review with >0.7 relevance gating. Confidence-first gating for planning. Commands-over-skills context audit. Incremental milestone commits in autopilot. Inspired by Context Engineering Kit and Compound Engineering. [ACE-Batch3]
- **Blockers:** none
- **Plan:** none

### Usage & Cost Tracking

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Extend TokenUsage type with cacheCreationTokens, cacheReadTokens, model, costUSD. Read Claude Code JSONL sessions from ~/.claude/projects/\*_/_.jsonl. LiteLLM pricing database with 24h cache and static fallback. CLI commands: harness usage daily, harness usage session, harness usage current (live burn rate). Focus on orchestrator/team aggregation. Inspired by ccflare and ccusage. [ACE-B1]
- **Blockers:** none
- **Plan:** none

### Agent Config Validation

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** harness validate --agent-configs with agnix hybrid approach — shell out to agnix binary when available (385 rules), fall back to ~20 highest-value TypeScript rules (broken agents, invalid hooks, unreachable skills, oversized CLAUDE.md). Ship .agnix.toml template in harness init. [ACE-B2]
- **Blockers:** none
- **Plan:** none

### Security Skill Deepening

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** FP verification gate requiring justification for harness-ignore suppressions. Insecure defaults / fail-open detection in SecurityScanner. New harness:supply-chain-audit skill with 6-factor dependency risk evaluation. API footgun / sharp-edges checks narrowed to known dangerous patterns (deprecated crypto, unsafe deserialization, TOCTOU). Adapted from Trail of Bits security skills. [ACE-Batch4]
- **Blockers:** none
- **Plan:** none

### Hook Authoring & TDD Guard

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** harness generate hooks command with opinionated presets: --preset tdd (AST test counting via @ast-grep/napi, hook-based Red-Green-Refactor enforcement), --preset security (parry integration, file guard), --preset checkpoint (git stash auto-save on Stop), --preset audit (session logging). Node.js target for broad compatibility. Inspired by claude-hooks and TDD Guard. [ACE-B3/B4]
- **Blockers:** none
- **Plan:** none

### Container Sandboxing

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Start with Docker --read-only + --user flags for simple orchestrator sandboxing. Evaluate Container Use (Dagger) MCP client as upgrade path — 13 MCP tools, immutable container state, git-branch isolation. Implement ContainerBackend interface alongside existing ClaudeBackend. Secret backends via 1Password, Vault, env vars. [ACE-A2]
- **Blockers:** Orchestrator Package Implementation
- **Plan:** none

### Session Search & DX Tooling

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** harness sessions search with SQLite FTS5 indexing — searchable by phase, persona, skill, plan_id, content. Phrase boosting with recency-weighted ranking. Desktop notification hooks via node-notifier for autopilot/orchestrator completion. Git stash auto-checkpoint hook preset (non-destructive, max 10 with cleanup). Inspired by recall and CC Notify. [ACE-B5/B6/B7]
- **Blockers:** none
- **Plan:** none

### Structured Learnings Enhancement

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Optional root_cause and tried_and_failed fields for learning entries. Semantic overlap check (5-dimension scoring) before creating new entries — prevents near-duplicate learnings with different wording. Active staleness detection auditing learnings against current code state. Learnings-researcher as always-on reviewer in code review pipeline. Inspired by Compound Engineering Plugin. [ACE-C5/C6]
- **Blockers:** none
- **Plan:** none

### Advanced Review Pipeline

- **Status:** planned
- **Spec:** .harness/architecture/awesome-claude-code-integration/ADR-001.md
- **Summary:** Meta-judge pre-generation for --thorough review mode (task-specific rubric before seeing implementation). Two-stage isolated review splitting spec-compliance from code-quality with separate context. findParallelGroups algorithm for automatic parallelization from dependency graphs. Tiered MCP tool loading (core/standard/full, measure first). Triage routing for orchestrator dispatch. Inspired by Context Engineering Kit, Superpowers, sudocode, and Claude Task Master. [ACE-Batch6]
- **Blockers:** none
- **Plan:** none
