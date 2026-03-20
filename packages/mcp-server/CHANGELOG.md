# @harness-engineering/mcp-server

## 0.5.3

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `typescript` ^5.3.3
- Updated dependencies
  - @harness-engineering/cli@1.7.0
  - @harness-engineering/graph@0.2.2

## 0.5.2

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.6.2

## 0.5.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1
  - @harness-engineering/cli@1.6.1

## 0.5.0

### Minor Changes

- Wire MCP tools to use knowledge graph when available
  - `detect_entropy`: loads graph and passes drift/dead-code data to `EntropyAnalyzer`
  - `apply_fixes`: same graph-enhanced entropy analysis
  - `check_dependencies`: loads graph and passes dependency data to `validateDependencies()`
  - `check_docs`: loads graph and passes coverage data to `checkDocCoverage()`
  - `create_self_review`: loads graph for impact analysis and harness check data
  - `analyze_diff`: new optional `path` parameter enables graph-enhanced analysis
  - `request_peer_review`: pre-assembles graph context into review metadata
- All graph loading is optional — tools fall back to existing behavior when no graph exists

### Patch Changes

- Fix tool count in server tests (30 → 31)
- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 0.4.0

### Minor Changes

- Add `includeGlobal` parameter to `generate_slash_commands` MCP tool to support merging built-in skills alongside project-local skills

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.5.0

## 0.3.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.1.0
  - @harness-engineering/core@0.7.0
  - @harness-engineering/cli@1.3.0

## 0.3.2

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.2.2

## 0.3.1

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
  - @harness-engineering/cli@1.2.1
  - @harness-engineering/types@0.0.1

## 0.2.0

### Minor Changes

- Expand MCP server from 15 to 23 tools and 4 to 5 resources. New tools: manage_state, manage_handoff, create_self_review, analyze_diff, request_peer_review, check_phase_gate, validate_cross_check, create_skill. Enhanced: detect_entropy (type filter), apply_fixes (suggestions). New resource: harness://state.

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.1.1

## 0.1.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.1.0

## 0.1.2

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.0.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/cli@1.0.1
