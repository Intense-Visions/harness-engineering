# @harness-engineering/cli

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
