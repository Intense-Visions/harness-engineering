# @harness-engineering/cli

## 1.8.0

### Minor Changes

- Upgrade `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags for the unified 7-phase review pipeline
- Add update-check hooks with startup background check and notification helpers
- Read `updateCheckInterval` from project config in update-check hooks
- Add `parseConventionalMarkdown` utility for interaction surface patterns

### Patch Changes

- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/core@0.9.0
  - @harness-engineering/types@0.2.0

## 1.7.0

### Minor Changes

- Remove `harness-mcp` binary from CLI package to break cyclic dependency with `@harness-engineering/mcp-server`. The `harness-mcp` binary is now provided exclusively by `@harness-engineering/mcp-server`. Users who install the CLI globally should also install `npm install -g @harness-engineering/mcp-server` for MCP server support.
- Remove `@harness-engineering/mcp-server` from production dependencies

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 1.6.2

### Patch Changes

- Bundle workspace packages into CLI dist so global install works without sibling packages

## 1.6.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1

## 1.6.0

### Minor Changes

- Add agent definition generator for persona-based routing
- Add 5 new graph-powered skills: harness-impact-analysis, harness-dependency-health, harness-hotspot-detector, harness-test-advisor, harness-knowledge-mapper
- Add 2 new personas: Graph Maintainer, Codebase Health Analyst
- Update all 12 Tier-1/Tier-2 skill SKILL.md files with graph-aware context gathering notes
- Add graph refresh steps to 8 code-modifying skills
- Add platform parity lint rule (platform-parity.test.ts) ensuring claude-code and gemini-cli skills stay in sync
- Update 3 existing personas with graph skill references

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 1.5.0

### Minor Changes

- Discover project-local skills in `generate-slash-commands` by default instead of only finding built-in global skills
  - New `--include-global` flag merges built-in skills alongside project skills
  - Project skills take precedence over global skills on name collision
  - Falls back to global skills when run outside a project (backward compatible)
  - Helpful message when no skills are found with guidance on `--include-global` and `create-skill`
- Export `SkillSource` type from package index

### Patch Changes

- Fix `create-skill` to scaffold with both `claude-code` and `gemini-cli` platforms by default

## 1.4.0

### Patch Changes

- Fix `update` command to use `@latest` per package instead of a single version

## 1.3.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.7.0

## 1.2.2

### Patch Changes

- Fix slash command descriptions not appearing in Claude Code by moving YAML frontmatter to line 1

## 1.2.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

- Updated dependencies [dc88a2e]
  - @harness-engineering/core@0.6.0

## 1.1.1

### Patch Changes

- Fix setup-mcp to write Claude Code config to .mcp.json (not .claude/settings.json), add Gemini trusted folder support, fix package name to @harness-engineering/mcp-server, and export CLI functions for MCP server integration.

## 1.1.0

### Minor Changes

- Add setup-mcp command and auto-configure MCP server during init for Claude Code and Gemini CLI

## 1.0.2

### Patch Changes

- Bundle agents (skills + personas) into dist for global install support

## 1.0.1

### Patch Changes

- Bundle templates into dist for global install support
