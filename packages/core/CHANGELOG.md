# Changelog

## 0.8.0

### Minor Changes

- Graph-enhanced context assembly (Phase 4)
  - `contextBudget()`: optional graph-density-aware token allocation
  - `contextFilter()`: optional graph-driven phase filtering
  - `generateAgentsMap()`: optional graph-topology generation
  - `checkDocCoverage()`: optional graph-based coverage analysis
  - Deprecation warnings on `validateAgentsMap()` and `validateKnowledgeMap()`
- Graph-enhanced entropy detection (Phase 5)
  - `EntropyAnalyzer.analyze()`: optional graph mode skips snapshot rebuild
  - `detectDocDrift()`: optional graph-based stale edge detection
  - `detectDeadCode()`: optional graph-based reachability analysis
- Graph-enhanced constraint checking (Phase 6)
  - `buildDependencyGraph()`: optional graph data bypasses file parsing
  - `validateDependencies()`: optional graph data skips parser health check and file globbing
  - `detectCircularDepsInFiles()`: optional graph data skips file parsing
  - New `GraphDependencyData` type in constraints
- Graph-enhanced feedback system (Phase 7)
  - `analyzeDiff()`: optional graph impact data for test coverage and scope analysis
  - `ChecklistBuilder.withHarnessChecks()`: optional graph data replaces placeholder harness checks
  - `createSelfReview()`: optional graph data passthrough to builder and analyzer
  - New `GraphImpactData` and `GraphHarnessCheckData` types

### Patch Changes

- Move `EntropyError` definition to `shared/errors.ts` to break circular import
- All graph enhancements use optional trailing parameters — existing behavior unchanged when not provided

## 0.7.0

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
  - @harness-engineering/types@0.1.0

## 0.6.0

### Minor Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

### Patch Changes

- Updated dependencies [dc88a2e]
  - @harness-engineering/types@0.0.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-12

### Added

- **Entropy Management Module** - Tools for detecting and fixing codebase entropy
  - `EntropyAnalyzer` - Main orchestrator for entropy analysis
  - `buildSnapshot()` - Build CodebaseSnapshot for efficient multi-pass analysis
  - `detectDocDrift()` - Documentation drift detection (API signatures, examples, structure)
  - `detectDeadCode()` - Dead code detection (files, exports, unused imports)
  - `detectPatternViolations()` - Pattern violation detection (config-based)
  - `createFixes()` - Generate safe, auto-applicable fixes
  - `applyFixes()` - Apply fixes with backup support
  - `generateSuggestions()` - Generate suggestions for manual fixes
  - `validatePatternConfig()` - Zod schema validation for pattern configs
- Levenshtein distance fuzzy matching for drift detection
- BFS reachability analysis for dead code detection
- Minimatch-based glob pattern matching

### Changed

- Updated VERSION to 0.4.0

## [0.3.0] - 2026-03-12

### Added

- **Architectural Constraints Module** - Tools for enforcing layered architecture
  - `defineLayer()` - Create layer definitions with dependency rules
  - `validateDependencies()` - Validate imports respect layer boundaries
  - `detectCircularDeps()` - Detect cycles using Tarjan's SCC algorithm
  - `detectCircularDepsInFiles()` - Standalone cycle detection from files
  - `createBoundaryValidator()` - Create Zod-based boundary validators
  - `validateBoundaries()` - Validate multiple boundaries at once
- **Parser Abstraction Layer** - Reusable AST parsing infrastructure
  - `TypeScriptParser` - Full AST parsing for TypeScript files
  - `LanguageParser` interface for multi-language support
  - Import/export extraction with type-only import detection
- Parser health checks with configurable fallback behavior

### Changed

- Updated VERSION to 0.3.0

## [0.2.0] - 2026-03-12

### Added

- **Context Engineering Module** - Tools for AGENTS.md validation and generation
  - `validateAgentsMap()` - Parse and validate AGENTS.md structure
  - `checkDocCoverage()` - Analyze documentation coverage for code files
  - `validateKnowledgeMap()` - Check integrity of all documentation links
  - `generateAgentsMap()` - Auto-generate AGENTS.md from project structure
  - `extractMarkdownLinks()` - Extract markdown links from content
  - `extractSections()` - Extract sections from markdown content
- Required sections validation for harness-engineering projects
- Documentation gap identification with importance levels
- Broken link detection with fix suggestions

### Changed

- Updated VERSION to 0.2.0

## [0.1.0] - 2026-03-12

### Added

- Core validation framework with extensible validator architecture
- Schema-based validation with Zod integration
- Composite validation with sequential and parallel execution
- Rule-based validation system
- File pattern matching with glob support
- Configuration validation
- Type definitions for all exports
- Comprehensive unit test coverage (>80%)
- ESM and CommonJS build outputs
- TypeScript type declarations

### Changed

- N/A (Initial release)

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

[0.4.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.4.0
[0.3.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.3.0
[0.2.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.2.0
[0.1.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.1.0
