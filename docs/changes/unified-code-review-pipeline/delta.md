# Delta: Unified Code Review Pipeline — Phase 2 (Mechanical Exclusion Boundary)

## Changes to @harness-engineering/core

- [ADDED] `packages/core/src/review/` module — new review pipeline runtime code
- [ADDED] `MechanicalFinding` type — structured finding from mechanical checks (tool, file, line, ruleId, message, severity)
- [ADDED] `MechanicalCheckResult` type — aggregate result of all mechanical checks (pass, stopPipeline, findings, per-check status)
- [ADDED] `MechanicalCheckOptions` type — options for configuring mechanical check execution (projectRoot, config, skip, changedFiles)
- [ADDED] `runMechanicalChecks()` function — runs harness validate, check-deps, check-docs, and security scan; returns structured results
- [ADDED] `ExclusionSet` class — indexes mechanical findings by file for O(1) lookup; `isExcluded(file, lineRange)` method for Phase 5 consumption
- [ADDED] `buildExclusionSet()` factory function — creates ExclusionSet from MechanicalFinding array
- [MODIFIED] `packages/core/src/index.ts` — added `export * from './review'` barrel re-export

## Behavioral Changes

- [ADDED] When validate or check-deps fails, `MechanicalCheckResult.stopPipeline` is `true` — downstream pipeline phases should not execute
- [ADDED] When check-docs or security-scan produce findings, `stopPipeline` is `false` — findings recorded for exclusion only
- [ADDED] `ExclusionSet.isExcluded()` returns `true` for file-level findings (no line number) regardless of queried line range
- [ADDED] Security findings with severity `info` are mapped to `warning` severity in MechanicalFinding

# Delta: Unified Code Review Pipeline — Phase 3 (Context Scoping)

## Changes to @harness-engineering/core

- [ADDED] `ChangeType` type — `'feature' | 'bugfix' | 'refactor' | 'docs'`
- [ADDED] `ReviewDomain` type — `'compliance' | 'bug' | 'security' | 'architecture'`
- [ADDED] `ContextFile` interface — file path, content, reason, line count
- [ADDED] `CommitHistoryEntry` interface — sha, message, file
- [ADDED] `ContextBundle` interface — domain-scoped context with changed files, context files, commit history, and ratio metadata
- [ADDED] `DiffInfo` interface — structured diff information (changed/new/deleted files, line counts, per-file diffs)
- [ADDED] `GraphAdapter` interface — dependency inversion for graph queries (getDependencies, getImpact, isReachable)
- [ADDED] `ContextScopeOptions` interface — options for context scoping (projectRoot, diff, commitMessage, graph, conventionFiles, checkDepsOutput)
- [ADDED] `detectChangeType()` function — detects change type from commit prefix or diff heuristic
- [ADDED] `scopeContext()` function — assembles scoped context bundles for each review domain

## Behavioral Changes

- [ADDED] When commit message starts with `feat:`, `feature:`, change type is `feature`
- [ADDED] When commit message starts with `fix:`, `bugfix:`, change type is `bugfix`
- [ADDED] When commit message starts with `refactor:`, change type is `refactor`
- [ADDED] When commit message starts with `docs:`, `doc:`, change type is `docs`
- [ADDED] When no prefix found and all files are `.md`, change type is `docs`
- [ADDED] When no prefix found and new non-test files exist, change type is `feature`
- [ADDED] When no prefix found and ambiguous, change type defaults to `feature`
- [ADDED] When `GraphAdapter` is provided, context scoper uses graph queries for dependency traversal
- [ADDED] When `GraphAdapter` is absent, context scoper falls back to import grep, test file glob, and check-deps output
- [ADDED] Context budget follows 1:1 ratio rule (3:1 for diffs < 20 lines)
- [ADDED] Compliance domain always includes convention files (CLAUDE.md, AGENTS.md)
- [ADDED] Bug detection domain includes direct dependencies and test files
- [ADDED] Security domain includes security-relevant imports filtered by pattern
- [ADDED] Architecture domain includes reverse dependency impact from graph or import heuristic
