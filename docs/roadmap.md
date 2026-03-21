---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-03-21
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

### Harness v2 Patterns

- **Status:** done
- **Spec:** docs/changes/harness-v2-patterns/proposal.md
- **Summary:** Design patterns and conventions for harness v2 architecture
- **Blockers:** none
- **Plan:** none

## Backlog

### CI/CD & Issue Tracker Integration

- **Status:** backlog
- **Spec:** docs/changes/ci-cd-issue-tracker-integration/proposal.md
- **Summary:** Automated CI/CD pipeline and issue tracker integration for harness workflows
- **Blockers:** none
- **Plan:** docs/plans/2026-03-17-ci-cd-issue-tracker-integration-plan.md
