# Changes & Proposals

Design proposals for features, architectural decisions, and enhancements to the Harness Engineering toolkit. Each subdirectory contains a `proposal.md` describing the motivation, design, and implementation approach.

## How to Use

- **Before building a new feature**, check if a proposal already exists here
- **To propose a change**, create a new subdirectory with a descriptive name and add a `proposal.md`
- Proposals inform implementation plans in [`../plans/`](../plans/)

## Proposals by Category

### Core Library & Architecture

- [core-library-design](./core-library-design/) — Original design for the @harness-engineering/core package
- [core-library-implementation](./core-library-implementation/) — Implementation strategy for core modules
- [architectural-constraints](./architectural-constraints/) — Layer enforcement and boundary validation
- [architecture-assertion-framework](./architecture-assertion-framework/) — Assertion-based architecture testing
- [entropy-management](./entropy-management/) — Drift, dead code, and pattern violation detection
- [detection-remediation-dead-code-architecture](./detection-remediation-dead-code-architecture/) — Dead code detection and auto-remediation

### CLI & Developer Experience

- [cli-tooling](./cli-tooling/) — CLI commands and developer tooling
- [cli-self-update](./cli-self-update/) — Self-update mechanism for the CLI
- [mcp-server-expansion](./mcp-server-expansion/) — Expanding MCP tool surface
- [mcp-setup](./mcp-setup/) — Simplified MCP server configuration
- [merge-mcp-into-cli](./merge-mcp-into-cli/) — Consolidating MCP server into CLI package
- [update-check-notification](./update-check-notification/) — Notify users of available updates
- [onboarding-funnel](./onboarding-funnel/) — Progressive onboarding flow
- [day-to-day-workflow-tutorial](./day-to-day-workflow-tutorial/) — Tutorial for daily development workflows

### Skills & Agents

- [agent-skills](./agent-skills/) — Structured skill system for AI agents
- [rich-skill-format](./rich-skill-format/) — SKILL.md + skill.yaml format specification
- [domain-skill-tiers](./domain-skill-tiers/) — Tiered skill system (core, maintenance, catalog)
- [design-system-skills](./design-system-skills/) — Skills for design system management
- [agent-definition-generator](./agent-definition-generator/) — Auto-generate agent definitions
- [agent-feedback](./agent-feedback/) — Self-review, peer review, and feedback loops
- [agent-workflow-acceleration](./agent-workflow-acceleration/) — Speed up agent workflows
- [executor-personas](./executor-personas/) — Specialized execution personas
- [code-reviewer-persona](./code-reviewer-persona/) — Dedicated code review persona
- [slash-command-generation](./slash-command-generation/) — Auto-generate slash commands from skills
- [skill-marketplace](./skill-marketplace/) — Community skill discovery and installation
- [project-local-skill-discovery](./project-local-skill-discovery/) — Find skills local to a project

### Knowledge Graph

- [natural-language-graph-queries](./natural-language-graph-queries/) — Query the graph in plain English
- [graph-anomaly-detection](./graph-anomaly-detection/) — Detect anomalies via graph analysis
- [graph-fallback-implementation](./graph-fallback-implementation/) — Static analysis fallbacks when no graph
- [cross-project-knowledge-federation](./cross-project-knowledge-federation/) — Share knowledge across projects

### Pipelines & Workflows

- [autopilot](./autopilot/) — Autonomous phase execution loop
- [autopilot-auto-approve-plans](./autopilot-auto-approve-plans/) — Auto-approve plans in autopilot
- [autopilot-final-review-gate](./autopilot-final-review-gate/) — Final review gate for autopilot
- [autopilot-session-scoping](./autopilot-session-scoping/) — Session scoping for autopilot
- [unified-code-review-pipeline](./unified-code-review-pipeline/) — Multi-agent code review pipeline
- [unified-documentation-pipeline](./unified-documentation-pipeline/) — Documentation health pipeline
- [development-loop-chaining](./development-loop-chaining/) — Chain development loops together
- [ci-pipeline-hardening](./ci-pipeline-hardening/) — Hardening CI pipeline checks

### Security & Performance

- [security-first-class](./security-first-class/) — First-class security scanning
- [security-pipeline-unification](./security-pipeline-unification/) — Unified security pipeline
- [health-analyst-security](./health-analyst-security/) — Security-focused health analysis
- [runtime-enforcement-extensions](./runtime-enforcement-extensions/) — Runtime security enforcement via hooks
- [performance-enforcement](./performance-enforcement/) — Performance budgets and regression detection
- [performance-pipeline-unification](./performance-pipeline-unification/) — Unified performance pipeline
- [conflict-prediction](./conflict-prediction/) — Predict merge conflicts before they happen
- [pre-commit-impact-preview](./pre-commit-impact-preview/) — Preview impact of changes before commit
- [task-independence-detection](./task-independence-detection/) — Detect independent tasks for parallelization

### Constraints & Enforcement

- [constraint-sharing](./constraint-sharing/) — Share constraints across projects
- [constraint-deprecation-detection](./constraint-deprecation-detection/) — Detect deprecated constraints
- [cross-platform-enforcement](./cross-platform-enforcement/) — Enforce rules across claude-code and gemini-cli
- [eslint-plugin](./eslint-plugin/) — ESLint rules for constraint enforcement
- [linter-generator](./linter-generator/) — YAML-to-ESLint rule generation

### Templates & Examples

- [templates-and-agents](./templates-and-agents/) — Project scaffolding templates
- [multi-language-templates](./multi-language-templates/) — Templates for Go, Python, Rust, Java, and more
- [examples-and-docs](./examples-and-docs/) — Progressive tutorial examples
- [pattern-adoption](./pattern-adoption/) — Adoption patterns from other frameworks

### State, Roadmap & Integration

- [state-streams](./state-streams/) — Event-driven state streams
- [roadmap-pipeline-sync](./roadmap-pipeline-sync/) — Sync roadmaps with pipelines
- [unified-project-roadmap](./unified-project-roadmap/) — Unified roadmap management
- [ci-cd-issue-tracker-integration](./ci-cd-issue-tracker-integration/) — CI/CD and issue tracker integration
- [release-readiness](./release-readiness/) — Release readiness auditing
- [release-readiness-prep](./release-readiness-prep/) — Pre-release preparation

### Documentation & Context

- [efficient-context-pipeline](./efficient-context-pipeline/) — Token-efficient context assembly
- [spec-plan-soundness-review](./spec-plan-soundness-review/) — Soundness review for specs and plans
- [harness-blueprint](./harness-blueprint/) — Blueprint HTML documentation generation
- [inspirations-acknowledgments](./inspirations-acknowledgments/) — Framework inspirations and credits

### Platform & Infrastructure

- [interaction-surface-abstraction](./interaction-surface-abstraction/) — Abstract interaction surfaces across platforms
- [ai-foundations-integration](./ai-foundations-integration/) — Integration with AI foundation services
- [orchestrator](./orchestrator/) — Agent orchestration daemon
- [i18n-localization-skills](./i18n-localization-skills/) — Internationalization skills
- [research-roadmap](./research-roadmap/) — Research roadmap for future work
- [framework-research-round-3](./framework-research-round-3/) — Competitive framework analysis
- [framework-inspired-enhancements](./framework-inspired-enhancements/) — Enhancements inspired by other frameworks
- [harness-v2-patterns](./harness-v2-patterns/) — Next-generation patterns
- [claude-mem-patterns](./claude-mem-patterns/) — Memory patterns for Claude
- [remove-premature-deprecation-warnings](./remove-premature-deprecation-warnings/) — Clean up premature deprecation warnings

---

_Last Updated: 2026-03-30_
