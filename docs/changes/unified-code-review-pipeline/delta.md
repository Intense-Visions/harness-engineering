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

# Delta: Unified Code Review Pipeline — Phase 8 (Model Tiering Config)

## Changes to @harness-engineering/core

- [ADDED] `ModelTierConfig` interface in `review/types.ts` — maps abstract tiers to concrete model identifier strings (all fields optional)
- [ADDED] `ModelProvider` type in `review/types.ts` — `'claude' | 'openai' | 'gemini'`
- [ADDED] `ProviderDefaults` type in `review/types.ts` — `Record<ModelProvider, ModelTierConfig>`
- [ADDED] `resolveModelTier()` function in `review/model-tier-resolver.ts` — resolves tier to model string via config, then provider defaults, then undefined
- [ADDED] `DEFAULT_PROVIDER_TIERS` constant in `review/model-tier-resolver.ts` — sensible defaults (claude: haiku/sonnet/opus, openai: gpt-4o-mini/gpt-4o/o1, gemini: flash/pro/ultra)
- [MODIFIED] `review/index.ts` — added exports for `ModelTierConfig`, `ModelProvider`, `ProviderDefaults`, `resolveModelTier`, `DEFAULT_PROVIDER_TIERS`

## Changes to @harness-engineering/cli

- [ADDED] `ModelTierConfigSchema` Zod schema in `config/schema.ts` — validates `{ fast?: string, standard?: string, strong?: string }`
- [ADDED] `ReviewConfigSchema` Zod schema in `config/schema.ts` — validates `{ model_tiers?: ModelTierConfigSchema }`
- [MODIFIED] `HarnessConfigSchema` — added optional `review: ReviewConfigSchema` field

## Behavioral Changes

- [ADDED] When `harness.config.json` contains `review.model_tiers`, the values are parsed and available to the review pipeline
- [ADDED] When `resolveModelTier` is called with config that has the tier mapped, it returns the configured model string
- [ADDED] When config is absent or does not map the tier, and a provider is specified, the resolver returns the provider default
- [ADDED] When no config and no provider, the resolver returns undefined (meaning "use current model" — no tiering)
