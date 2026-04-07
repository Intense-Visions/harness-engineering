# Discovery: agent-skills Comparative Analysis

## 1. What problem are you solving?

Identify architectural patterns, practices, and insights in Addy Osmani's `agent-skills` (https://github.com/addyosmani/agent-skills) that meet or exceed harness engineering, with the goal of strengthening harness by adopting proven external patterns.

## 2. Hard constraints

- Harness engineering is the primary project; changes must not break existing skill contracts
- MCP server is the runtime backbone; any "degraded mode" is additive, not replacing MCP
- 83 existing skills must remain backward-compatible with any schema changes
- Skill authoring spec (`harness-skill-authoring`) governs the format

## 3. Soft preferences

- Minimize churn — prefer additive changes over rewrites
- Maintain harness's depth advantage (verification tiers, cognitive modes, state management)
- Adopt only patterns with clear, measurable benefit
- Keep skill format machine-parseable (YAML frontmatter + structured Markdown)

## 4. What has already been considered?

- Competitor framework research exists in memory (`reference_competitor_frameworks.md`) covering Spec Kit, BMAD, Claude Flow, and others
- Harness already has Red Flags and Rationalizations to Reject sections in some skills, but not standardized
- Multi-platform support was not previously prioritized

## 5. What does success look like in 6 months?

- Every harness skill includes anti-rationalization tables, improving agent compliance
- Skills degrade gracefully without MCP, expanding adoption to non-MCP environments
- Context budgets prevent token bloat as skill count grows past 100
- Protected code regions prevent accidental modification of critical code during refactoring
