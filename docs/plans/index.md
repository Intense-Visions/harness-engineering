# Implementation Plans

Detailed technical specifications and execution plans for Harness Engineering features. Each plan follows the naming pattern `YYYY-MM-DD-<feature>-plan.md` and includes goals, architecture, file structure, and implementation checklists.

## Where plans live

Plans are filed **alongside the proposal they execute**, under
[`../changes/<change>/plans/`](../changes/). This page is the chronological
index across every change folder; it is not the storage location. A plan
authored before a change folder existed still sits directly in this
directory.

## How to Use

- **Before implementing**, check if a plan exists for your feature
- Plans are created from proposals in [`../changes/`](../changes/)
- Plans drive execution via the `/harness:execution` skill

## Plans in this directory

- [cross-domain-build-order-2026-08-27](./cross-domain-build-order-2026-08-27.md) — Build order for the 117 cross-domain ideation roadmap items

## Plans by Phase

### Phase 1: Foundation & Docs (2026-03-11)

- [phase1-foundation-and-docs](../changes/framework-bootstrap/plans/2026-03-11-phase1-foundation-and-docs.md) — Overall phase plan
- [module1-validation](../changes/framework-bootstrap/plans/2026-03-11-module1-validation.md) — File structure, config, and commit validation
- [module2-context-engineering](../changes/framework-bootstrap/plans/2026-03-12-module2-context-engineering.md) — AGENTS.md and documentation coverage
- [module3-architectural-constraints](../changes/framework-bootstrap/plans/2026-03-12-module3-architectural-constraints.md) — Layer enforcement and circular deps
- [module4-entropy-management](../changes/framework-bootstrap/plans/2026-03-12-module4-entropy-management.md) — Drift, dead code, pattern violations
- [module5-agent-feedback](../changes/agent-feedback/plans/2026-03-12-module5-agent-feedback.md) — Self-review, peer review, telemetry

### Phase 2: CLI (2026-03-12)

- [phase2-cli](../changes/framework-bootstrap/plans/2026-03-12-phase2-cli.md) — CLI commands and MCP server

### Phase 3: Templates & Agents (2026-03-14)

- [phase3-templates-and-agents](../changes/framework-bootstrap/plans/2026-03-14-phase3-templates-and-agents.md) — Project templates and agent definitions
- [agent-skills](../changes/agent-skills/plans/2026-03-13-agent-skills.md) — Skill system implementation
- [eslint-plugin](../changes/eslint-plugin/plans/2026-03-13-eslint-plugin.md) — ESLint constraint rules
- [linter-gen](../changes/linter-gen/plans/2026-03-13-linter-gen.md) — YAML-to-ESLint generator
- [rich-skill-format](../changes/rich-skill-format/plans/2026-03-14-rich-skill-format.md) — SKILL.md + skill.yaml format
- [pattern-adoption](../changes/pattern-adoption/plans/2026-03-14-pattern-adoption.md) — Framework pattern adoption
- [framework-inspired-enhancements](../changes/framework-inspired-enhancements/plans/2026-03-14-framework-inspired-enhancements.md) — Enhancements from other frameworks
- [examples-and-docs](../changes/examples-and-docs/plans/2026-03-15-examples-and-docs.md) — Progressive tutorial examples

### Review Groups (2026-03-16)

- [group-a-review-system](../changes/research-roadmap/plans/2026-03-16-group-a-review-system.md) — Code review pipeline
- [group-b-principles-conventions](../changes/research-roadmap/plans/2026-03-16-group-b-principles-conventions.md) — Standards and conventions
- [group-c-skill-system](../changes/research-roadmap/plans/2026-03-16-group-c-skill-system.md) — Skill format and execution
- [group-d-context-engineering](../changes/research-roadmap/plans/2026-03-16-group-d-context-engineering.md) — Context assembly and filtering
- [group-e-workflow-gates](../changes/research-roadmap/plans/2026-03-16-group-e-workflow-gates.md) — Workflow gates and checks

### MCP & Skills (2026-03-16 – 2026-03-17)

- [mcp-server-expansion](../changes/mcp-server-expansion/plans/2026-03-16-mcp-server-expansion.md) — Expand MCP tool surface
- [slash-command-generation](../changes/slash-command-generation/plans/2026-03-16-slash-command-generation.md) — Auto-generate slash commands
- [release-readiness](../changes/release-readiness-prep/plans/2026-03-16-release-readiness.md) — Release readiness skill
- [ci-cd-issue-tracker-integration](../changes/ci-cd-issue-tracker-integration/plans/2026-03-17-ci-cd-issue-tracker-integration-plan.md) — CI/CD integration
- [cli-self-update](../changes/cli-self-update/plans/2026-03-17-cli-self-update.md) — CLI self-update mechanism
- [day-to-day-workflow-tutorial](../changes/day-to-day-workflow-tutorial/plans/2026-03-17-day-to-day-workflow-tutorial.md) — Daily workflow tutorial

### Knowledge Graph (2026-03-18)

- [graph-foundation](../changes/graph-context-system/plans/2026-03-18-graph-foundation-plan.md) — Graph data model and storage
- [graph-knowledge-layer](../changes/graph-context-system/plans/2026-03-18-graph-knowledge-layer-plan.md) — Knowledge ingestion layer
- [graph-context-assembly](../changes/graph-context-system/plans/2026-03-18-graph-context-assembly-plan.md) — Context assembly from graph
- [graph-mcp-integration](../changes/graph-context-system/plans/2026-03-18-graph-mcp-integration-plan.md) — MCP tools for graph queries
- [graph-connectors-cli](../changes/graph-context-system/plans/2026-03-18-graph-connectors-cli-plan.md) — CLI commands for graph connectors
- [graph-constraint-migration](../changes/graph-context-system/plans/2026-03-18-graph-constraint-migration-plan.md) — Migrate constraints to graph
- [graph-entropy-migration](../changes/graph-context-system/plans/2026-03-18-graph-entropy-migration-plan.md) — Migrate entropy analysis to graph
- [graph-tier1-skills](../changes/graph-context-system/plans/2026-03-18-graph-tier1-skills-plan.md) — Tier 1 graph skills
- [graph-tier2-connectors](../changes/graph-context-system/plans/2026-03-18-graph-tier2-connectors-plan.md) — Tier 2 external connectors
- [graph-new-skills-personas](../changes/graph-context-system/plans/2026-03-18-graph-new-skills-personas-plan.md) — New graph skills and personas
- [graph-deprecation-docs](../changes/graph-context-system/plans/2026-03-18-graph-deprecation-docs-plan.md) — Deprecation documentation

### Autopilot & Pipelines (2026-03-19 – 2026-03-21)

- [autopilot](../changes/autopilot/plans/2026-03-19-autopilot-plan.md) — Autonomous phase execution
- [performance-enforcement](../changes/performance-enforcement/plans/2026-03-19-performance-enforcement-part1-plan.md) — Performance budgets (part 1)
- [performance-enforcement-part2](../changes/performance-enforcement/plans/2026-03-19-performance-enforcement-part2-plan.md) — Performance budgets (part 2)
- [security-scanner-core](../changes/security-first-class/plans/2026-03-19-security-scanner-core-plan.md) — Security scanning foundation
- [state-streams](../changes/state-streams/plans/2026-03-19-state-streams-plan.md) — Event-driven state streams
- [unified-code-review](../changes/unified-code-review-pipeline/plans/2026-03-21-unified-code-review-pipeline-plan.md) — Multi-agent code review
- [unified-documentation](../changes/unified-documentation-pipeline/plans/2026-03-21-unified-documentation-pipeline-plan.md) — Documentation health pipeline
- [soundness-review](../changes/spec-plan-soundness-review/plans/2026-03-21-soundness-review-plan.md) — Spec and plan soundness review

### Design System (2026-03-19)

- [phase1-shared-foundation](../changes/design-system-skills/plans/2026-03-19-design-system-phase1-shared-foundation-plan.md) — Shared foundation
- [phase2-graph-schema](../changes/design-system-skills/plans/2026-03-19-design-system-phase2-graph-schema-plan.md) — Graph schema
- [phase3-foundation-skills](../changes/design-system-skills/plans/2026-03-19-design-system-phase3-foundation-skills-plan.md) — Foundation skills
- [phase4-aesthetic-skill](../changes/design-system-skills/plans/2026-03-19-design-system-phase4-aesthetic-skill-plan.md) — Aesthetic evaluation
- [phase5-implementation-skills](../changes/design-system-skills/plans/2026-03-19-design-system-phase5-implementation-skills-plan.md) — Implementation skills
- [phase6-integration](../changes/design-system-skills/plans/2026-03-19-design-system-phase6-integration-plan.md) — Integration
- [phase7-validation](../changes/design-system-skills/plans/2026-03-19-design-system-phase7-validation-plan.md) — Validation

### Update Checker (2026-03-20)

- [update-checker-core](../changes/update-check-notification/plans/2026-03-20-update-checker-core-plan.md) — Core update checking
- [update-checker-cli](../changes/update-check-notification/plans/2026-03-20-update-checker-cli-plan.md) — CLI integration
- [update-checker-config](../changes/update-check-notification/plans/2026-03-20-update-checker-config-plan.md) — Configuration
- [update-checker-mcp](../changes/update-check-notification/plans/2026-03-20-update-checker-mcp-plan.md) — MCP tool
- [update-checker-edge-cases](../changes/update-check-notification/plans/2026-03-20-update-checker-edge-cases-plan.md) — Edge case handling

### i18n (2026-03-20)

- [i18n-core-skill](../changes/i18n-localization-skills/plans/2026-03-20-i18n-core-skill-plan.md) — Core i18n skill
- [i18n-knowledge-base](../changes/i18n-localization-skills/plans/2026-03-20-i18n-knowledge-base-plan.md) — Knowledge base
- [i18n-process-skill](../changes/i18n-localization-skills/plans/2026-03-20-i18n-process-skill-plan.md) — Process management
- [i18n-workflow-skill](../changes/i18n-localization-skills/plans/2026-03-20-i18n-workflow-skill-plan.md) — Workflow automation
- [i18n-integration-wiring](../changes/i18n-localization-skills/plans/2026-03-20-i18n-integration-wiring-plan.md) — Integration wiring

### Roadmap System (2026-03-21 – 2026-03-23)

- [roadmap-core-types-parser](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-core-types-parser-plan.md) — Core types and parser
- [roadmap-sync-engine](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-sync-engine-plan.md) — Sync engine
- [roadmap-mcp-tool-crud](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-mcp-tool-crud-plan.md) — MCP CRUD tools
- [roadmap-remaining-commands](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-remaining-commands-plan.md) — CLI commands
- [roadmap-skill-creation](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-skill-creation-plan.md) — Roadmap skill
- [roadmap-integration-hooks](../changes/unified-project-roadmap/plans/2026-03-21-roadmap-integration-hooks-plan.md) — Integration hooks

### Architecture & Graph Extensions (2026-03-22 – 2026-03-24)

- [arch-assertion-types](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-types-plan.md) — Assertion type system
- [arch-assertion-config](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-config-plan.md) — Configuration
- [arch-assertion-collectors](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-collectors-plan.md) — Metric collectors
- [arch-assertion-matchers](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-matchers-plan.md) — Assertion matchers
- [arch-assertion-baseline](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-baseline-plan.md) — Baseline management
- [arch-assertion-cli](../changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-cli-plan.md) — CLI commands
- [arch-assertion-integration](../changes/architecture-assertion-framework/plans/2026-03-24-arch-assertion-integration-plan.md) — Integration

### Natural Language Queries (2026-03-23)

- [nlq-types-scaffolding](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-types-scaffolding-plan.md) — Type scaffolding
- [nlq-intent-classifier](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-intent-classifier-plan.md) — Intent classification
- [nlq-entity-extractor](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-entity-extractor-plan.md) — Entity extraction
- [nlq-entity-resolver](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-entity-resolver-plan.md) — Entity resolution
- [nlq-orchestrator](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-orchestrator-plan.md) — Query orchestration
- [nlq-response-formatter](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-response-formatter-plan.md) — Response formatting
- [nlq-mcp-tool](../changes/natural-language-graph-queries/plans/2026-03-23-nlq-mcp-tool-plan.md) — MCP tool integration

### Constraint Sharing (2026-03-24 – 2026-03-25)

- [constraint-sharing-types](../changes/constraint-sharing/plans/2026-03-24-constraint-sharing-types-plan.md) — Type definitions
- [constraint-sharing-bundle](../changes/constraint-sharing/plans/2026-03-24-constraint-sharing-bundle-plan.md) — Bundle format
- [constraint-sharing-bundle-extraction](../changes/constraint-sharing/plans/2026-03-24-constraint-sharing-bundle-extraction-plan.md) — Bundle extraction
- [constraint-sharing-merge](../changes/constraint-sharing/plans/2026-03-24-constraint-sharing-merge-plan.md) — Merge strategy
- [constraint-sharing-lockfile](../changes/constraint-sharing/plans/2026-03-24-constraint-sharing-lockfile-plan.md) — Lockfile management
- [constraint-sharing-install](../changes/constraint-sharing/plans/2026-03-25-constraint-sharing-install-plan.md) — Install command
- [constraint-sharing-uninstall](../changes/constraint-sharing/plans/2026-03-25-constraint-sharing-uninstall-plan.md) — Uninstall command

### Orchestrator (2026-03-24)

- [orchestrator-foundation](../changes/orchestrator/plans/2026-03-24-orchestrator-foundation-plan.md) — Orchestrator core
- [orchestrator-io-adapters](../changes/orchestrator/plans/2026-03-24-orchestrator-io-adapters-plan.md) — I/O adapters
- [orchestrator-wiring](../changes/orchestrator/plans/2026-03-24-orchestrator-wiring-plan.md) — Component wiring
- [orchestrator-observability-cli](../changes/orchestrator/plans/2026-03-24-orchestrator-observability-cli-plan.md) — Observability and CLI

### Multi-Language Templates (2026-03-27)

- [phase1-engine-foundation](../changes/multi-language-templates/plans/2026-03-27-phase1-engine-foundation-plan.md) — Template engine
- [phase2-language-base-templates](../changes/multi-language-templates/plans/2026-03-27-phase2-language-base-templates-plan.md) — Language base templates
- [phase3-jsts-framework-overlays](../changes/multi-language-templates/plans/2026-03-27-phase3-jsts-framework-overlays-plan.md) — JS/TS framework overlays
- [phase4-non-js-framework-overlays](../changes/multi-language-templates/plans/2026-03-27-phase4-non-js-framework-overlays-plan.md) — Non-JS framework overlays
- [phase5-integration-polish](../changes/multi-language-templates/plans/2026-03-27-phase5-integration-polish-plan.md) — Integration and polish

### Recent (2026-03-28 – 2026-03-30)

- [harness-doctor-command](../changes/onboarding-funnel/plans/2026-03-28-harness-doctor-command-plan.md) — Doctor diagnostic command
- [harness-setup-command](../changes/onboarding-funnel/plans/2026-03-28-harness-setup-command-plan.md) — Setup command
- [ast-code-navigation](../changes/claude-mem-patterns/plans/2026-03-29-ast-code-navigation-plan.md) — AST-based code navigation
- [progressive-disclosure](../changes/claude-mem-patterns/plans/2026-03-29-progressive-disclosure-plan.md) — Progressive disclosure UX
- [phase1-security-rule-categories](../changes/runtime-enforcement-extensions/plans/2026-03-30-phase1-security-rule-categories-plan.md) — Security rule categories
- [phase2-hook-scripts](../changes/runtime-enforcement-extensions/plans/2026-03-30-phase2-hook-scripts-plan.md) — Hook scripts
- [phase3-hooks-cli-command](../changes/runtime-enforcement-extensions/plans/2026-03-30-phase3-hooks-cli-command-plan.md) — Hooks CLI command

---

_Last Updated: 2026-09-05_
