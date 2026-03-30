# Implementation Plans

Detailed technical specifications and execution plans for Harness Engineering features. Each plan follows the naming pattern `YYYY-MM-DD-<feature>-plan.md` and includes goals, architecture, file structure, and implementation checklists.

## How to Use

- **Before implementing**, check if a plan exists for your feature
- Plans are created from proposals in [`../changes/`](../changes/)
- Plans drive execution via the `/harness:execution` skill

## Plans by Phase

### Phase 1: Foundation & Docs (2026-03-11)

- [phase1-foundation-and-docs](./2026-03-11-phase1-foundation-and-docs.md) — Overall phase plan
- [module1-validation](./2026-03-11-module1-validation.md) — File structure, config, and commit validation
- [module2-context-engineering](./2026-03-12-module2-context-engineering.md) — AGENTS.md and documentation coverage
- [module3-architectural-constraints](./2026-03-12-module3-architectural-constraints.md) — Layer enforcement and circular deps
- [module4-entropy-management](./2026-03-12-module4-entropy-management.md) — Drift, dead code, pattern violations
- [module5-agent-feedback](./2026-03-12-module5-agent-feedback.md) — Self-review, peer review, telemetry

### Phase 2: CLI (2026-03-12)

- [phase2-cli](./2026-03-12-phase2-cli.md) — CLI commands and MCP server

### Phase 3: Templates & Agents (2026-03-14)

- [phase3-templates-and-agents](./2026-03-14-phase3-templates-and-agents.md) — Project templates and agent definitions
- [agent-skills](./2026-03-13-agent-skills.md) — Skill system implementation
- [eslint-plugin](./2026-03-13-eslint-plugin.md) — ESLint constraint rules
- [linter-gen](./2026-03-13-linter-gen.md) — YAML-to-ESLint generator
- [rich-skill-format](./2026-03-14-rich-skill-format.md) — SKILL.md + skill.yaml format
- [pattern-adoption](./2026-03-14-pattern-adoption.md) — Framework pattern adoption
- [framework-inspired-enhancements](./2026-03-14-framework-inspired-enhancements.md) — Enhancements from other frameworks
- [examples-and-docs](./2026-03-15-examples-and-docs.md) — Progressive tutorial examples

### Review Groups (2026-03-16)

- [group-a-review-system](./2026-03-16-group-a-review-system.md) — Code review pipeline
- [group-b-principles-conventions](./2026-03-16-group-b-principles-conventions.md) — Standards and conventions
- [group-c-skill-system](./2026-03-16-group-c-skill-system.md) — Skill format and execution
- [group-d-context-engineering](./2026-03-16-group-d-context-engineering.md) — Context assembly and filtering
- [group-e-workflow-gates](./2026-03-16-group-e-workflow-gates.md) — Workflow gates and checks

### MCP & Skills (2026-03-16 – 2026-03-17)

- [mcp-server-expansion](./2026-03-16-mcp-server-expansion.md) — Expand MCP tool surface
- [slash-command-generation](./2026-03-16-slash-command-generation.md) — Auto-generate slash commands
- [release-readiness](./2026-03-16-release-readiness.md) — Release readiness skill
- [ci-cd-issue-tracker-integration](./2026-03-17-ci-cd-issue-tracker-integration-plan.md) — CI/CD integration
- [cli-self-update](./2026-03-17-cli-self-update.md) — CLI self-update mechanism
- [day-to-day-workflow-tutorial](./2026-03-17-day-to-day-workflow-tutorial.md) — Daily workflow tutorial

### Knowledge Graph (2026-03-18)

- [graph-foundation](./2026-03-18-graph-foundation-plan.md) — Graph data model and storage
- [graph-knowledge-layer](./2026-03-18-graph-knowledge-layer-plan.md) — Knowledge ingestion layer
- [graph-context-assembly](./2026-03-18-graph-context-assembly-plan.md) — Context assembly from graph
- [graph-mcp-integration](./2026-03-18-graph-mcp-integration-plan.md) — MCP tools for graph queries
- [graph-connectors-cli](./2026-03-18-graph-connectors-cli-plan.md) — CLI commands for graph connectors
- [graph-constraint-migration](./2026-03-18-graph-constraint-migration-plan.md) — Migrate constraints to graph
- [graph-entropy-migration](./2026-03-18-graph-entropy-migration-plan.md) — Migrate entropy analysis to graph
- [graph-tier1-skills](./2026-03-18-graph-tier1-skills-plan.md) — Tier 1 graph skills
- [graph-tier2-connectors](./2026-03-18-graph-tier2-connectors-plan.md) — Tier 2 external connectors
- [graph-new-skills-personas](./2026-03-18-graph-new-skills-personas-plan.md) — New graph skills and personas
- [graph-deprecation-docs](./2026-03-18-graph-deprecation-docs-plan.md) — Deprecation documentation

### Autopilot & Pipelines (2026-03-19 – 2026-03-21)

- [autopilot](./2026-03-19-autopilot-plan.md) — Autonomous phase execution
- [performance-enforcement](./2026-03-19-performance-enforcement-part1-plan.md) — Performance budgets (part 1)
- [performance-enforcement-part2](./2026-03-19-performance-enforcement-part2-plan.md) — Performance budgets (part 2)
- [security-scanner-core](./2026-03-19-security-scanner-core-plan.md) — Security scanning foundation
- [state-streams](./2026-03-19-state-streams-plan.md) — Event-driven state streams
- [unified-code-review](./2026-03-21-unified-code-review-pipeline-plan.md) — Multi-agent code review
- [unified-documentation](./2026-03-21-unified-documentation-pipeline-plan.md) — Documentation health pipeline
- [soundness-review](./2026-03-21-soundness-review-plan.md) — Spec and plan soundness review

### Design System (2026-03-19)

- [phase1-shared-foundation](./2026-03-19-design-system-phase1-shared-foundation-plan.md) — Shared foundation
- [phase2-graph-schema](./2026-03-19-design-system-phase2-graph-schema-plan.md) — Graph schema
- [phase3-foundation-skills](./2026-03-19-design-system-phase3-foundation-skills-plan.md) — Foundation skills
- [phase4-aesthetic-skill](./2026-03-19-design-system-phase4-aesthetic-skill-plan.md) — Aesthetic evaluation
- [phase5-implementation-skills](./2026-03-19-design-system-phase5-implementation-skills-plan.md) — Implementation skills
- [phase6-integration](./2026-03-19-design-system-phase6-integration-plan.md) — Integration
- [phase7-validation](./2026-03-19-design-system-phase7-validation-plan.md) — Validation

### Update Checker (2026-03-20)

- [update-checker-core](./2026-03-20-update-checker-core-plan.md) — Core update checking
- [update-checker-cli](./2026-03-20-update-checker-cli-plan.md) — CLI integration
- [update-checker-config](./2026-03-20-update-checker-config-plan.md) — Configuration
- [update-checker-mcp](./2026-03-20-update-checker-mcp-plan.md) — MCP tool
- [update-checker-edge-cases](./2026-03-20-update-checker-edge-cases-plan.md) — Edge case handling

### i18n (2026-03-20)

- [i18n-core-skill](./2026-03-20-i18n-core-skill-plan.md) — Core i18n skill
- [i18n-knowledge-base](./2026-03-20-i18n-knowledge-base-plan.md) — Knowledge base
- [i18n-process-skill](./2026-03-20-i18n-process-skill-plan.md) — Process management
- [i18n-workflow-skill](./2026-03-20-i18n-workflow-skill-plan.md) — Workflow automation
- [i18n-integration-wiring](./2026-03-20-i18n-integration-wiring-plan.md) — Integration wiring

### Roadmap System (2026-03-21 – 2026-03-23)

- [roadmap-core-types-parser](./2026-03-21-roadmap-core-types-parser-plan.md) — Core types and parser
- [roadmap-sync-engine](./2026-03-21-roadmap-sync-engine-plan.md) — Sync engine
- [roadmap-mcp-tool-crud](./2026-03-21-roadmap-mcp-tool-crud-plan.md) — MCP CRUD tools
- [roadmap-remaining-commands](./2026-03-21-roadmap-remaining-commands-plan.md) — CLI commands
- [roadmap-skill-creation](./2026-03-21-roadmap-skill-creation-plan.md) — Roadmap skill
- [roadmap-integration-hooks](./2026-03-21-roadmap-integration-hooks-plan.md) — Integration hooks

### Architecture & Graph Extensions (2026-03-22 – 2026-03-24)

- [arch-assertion-types](./2026-03-23-arch-assertion-types-plan.md) — Assertion type system
- [arch-assertion-config](./2026-03-23-arch-assertion-config-plan.md) — Configuration
- [arch-assertion-collectors](./2026-03-23-arch-assertion-collectors-plan.md) — Metric collectors
- [arch-assertion-matchers](./2026-03-23-arch-assertion-matchers-plan.md) — Assertion matchers
- [arch-assertion-baseline](./2026-03-23-arch-assertion-baseline-plan.md) — Baseline management
- [arch-assertion-cli](./2026-03-23-arch-assertion-cli-plan.md) — CLI commands
- [arch-assertion-integration](./2026-03-24-arch-assertion-integration-plan.md) — Integration

### Natural Language Queries (2026-03-23)

- [nlq-types-scaffolding](./2026-03-23-nlq-types-scaffolding-plan.md) — Type scaffolding
- [nlq-intent-classifier](./2026-03-23-nlq-intent-classifier-plan.md) — Intent classification
- [nlq-entity-extractor](./2026-03-23-nlq-entity-extractor-plan.md) — Entity extraction
- [nlq-entity-resolver](./2026-03-23-nlq-entity-resolver-plan.md) — Entity resolution
- [nlq-orchestrator](./2026-03-23-nlq-orchestrator-plan.md) — Query orchestration
- [nlq-response-formatter](./2026-03-23-nlq-response-formatter-plan.md) — Response formatting
- [nlq-mcp-tool](./2026-03-23-nlq-mcp-tool-plan.md) — MCP tool integration

### Constraint Sharing (2026-03-24 – 2026-03-25)

- [constraint-sharing-types](./2026-03-24-constraint-sharing-types-plan.md) — Type definitions
- [constraint-sharing-bundle](./2026-03-24-constraint-sharing-bundle-plan.md) — Bundle format
- [constraint-sharing-bundle-extraction](./2026-03-24-constraint-sharing-bundle-extraction-plan.md) — Bundle extraction
- [constraint-sharing-merge](./2026-03-24-constraint-sharing-merge-plan.md) — Merge strategy
- [constraint-sharing-lockfile](./2026-03-24-constraint-sharing-lockfile-plan.md) — Lockfile management
- [constraint-sharing-install](./2026-03-25-constraint-sharing-install-plan.md) — Install command
- [constraint-sharing-uninstall](./2026-03-25-constraint-sharing-uninstall-plan.md) — Uninstall command

### Orchestrator (2026-03-24)

- [orchestrator-foundation](./2026-03-24-orchestrator-foundation-plan.md) — Orchestrator core
- [orchestrator-io-adapters](./2026-03-24-orchestrator-io-adapters-plan.md) — I/O adapters
- [orchestrator-wiring](./2026-03-24-orchestrator-wiring-plan.md) — Component wiring
- [orchestrator-observability-cli](./2026-03-24-orchestrator-observability-cli-plan.md) — Observability and CLI

### Multi-Language Templates (2026-03-27)

- [phase1-engine-foundation](./2026-03-27-phase1-engine-foundation-plan.md) — Template engine
- [phase2-language-base-templates](./2026-03-27-phase2-language-base-templates-plan.md) — Language base templates
- [phase3-jsts-framework-overlays](./2026-03-27-phase3-jsts-framework-overlays-plan.md) — JS/TS framework overlays
- [phase4-non-js-framework-overlays](./2026-03-27-phase4-non-js-framework-overlays-plan.md) — Non-JS framework overlays
- [phase5-integration-polish](./2026-03-27-phase5-integration-polish-plan.md) — Integration and polish

### Recent (2026-03-28 – 2026-03-30)

- [harness-doctor-command](./2026-03-28-harness-doctor-command-plan.md) — Doctor diagnostic command
- [harness-setup-command](./2026-03-28-harness-setup-command-plan.md) — Setup command
- [ast-code-navigation](./2026-03-29-ast-code-navigation-plan.md) — AST-based code navigation
- [progressive-disclosure](./2026-03-29-progressive-disclosure-plan.md) — Progressive disclosure UX
- [phase1-security-rule-categories](./2026-03-30-phase1-security-rule-categories-plan.md) — Security rule categories
- [phase2-hook-scripts](./2026-03-30-phase2-hook-scripts-plan.md) — Hook scripts
- [phase3-hooks-cli-command](./2026-03-30-phase3-hooks-cli-command-plan.md) — Hooks CLI command

---

_Last Updated: 2026-03-30_
