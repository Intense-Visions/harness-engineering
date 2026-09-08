# Reference: packages / core / 5

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/validation/merge-driver.ts

[`packages/core/src/validation/merge-driver.ts`](/packages/core/src/validation/merge-driver.ts)

Merge-driver doctor helper (Phase 3, roadmap shard store).

**Exports:** `needsMergeOursDriverWarning`

## packages/core/src/validation/pulse.ts

[`packages/core/src/validation/pulse.ts`](/packages/core/src/validation/pulse.ts)

**Exports:** `PulseConfigValidation`, `validatePulseConfig`

## packages/core/src/validation/roadmap-aggregate-drift.ts

[`packages/core/src/validation/roadmap-aggregate-drift.ts`](/packages/core/src/validation/roadmap-aggregate-drift.ts)

Roadmap aggregate-drift doctor (Phase 6, roadmap shard store).

**Exports:** `RoadmapAggregateDriftInput`, `RoadmapAggregateDriftResult`, `checkRoadmapAggregateDrift`

## packages/core/src/validation/roadmap-mode.ts

[`packages/core/src/validation/roadmap-mode.ts`](/packages/core/src/validation/roadmap-mode.ts)

**Exports:** `RoadmapModeValidationConfig`, `validateRoadmapMode`

## packages/core/src/validation/roadmap-read-source.ts

[`packages/core/src/validation/roadmap-read-source.ts`](/packages/core/src/validation/roadmap-read-source.ts)

Invariant R (read-source invariant) — Phase 3, roadmap shard store.

**Exports:** `ROADMAP_READ_ALLOWLIST`, `findRoadmapReadSourceViolations`

## packages/core/src/validation/solutions.ts

[`packages/core/src/validation/solutions.ts`](/packages/core/src/validation/solutions.ts)

**Exports:** `SolutionsDirValidation`, `validateSolutionsDir`

## packages/core/src/validation/strategy.ts

[`packages/core/src/validation/strategy.ts`](/packages/core/src/validation/strategy.ts)

**Exports:** `StrategyValidation`, `validateStrategy`

## packages/core/tests/fixtures/fs-utils-default-ignore/src/code.ts

[`packages/core/tests/fixtures/fs-utils-default-ignore/src/code.ts`](/packages/core/tests/fixtures/fs-utils-default-ignore/src/code.ts)

**Exports:** `userSource`

## packages/core/tests/fixtures/jsx-imports/src/components/Button.jsx

[`packages/core/tests/fixtures/jsx-imports/src/components/Button.jsx`](/packages/core/tests/fixtures/jsx-imports/src/components/Button.jsx)

**Exports:** `Button`

## packages/core/src/adoption/retrospective.ts

[`packages/core/src/adoption/retrospective.ts`](/packages/core/src/adoption/retrospective.ts)

Derives the skill-catalog retrospective from skill-invocation telemetry: ranks the most-invoked, most-failing, and abandoned-mid-workflow skills, flags skills inactive past a staleness window, reports catalog telemetry coverage, and renders the report as Markdown.

**Exports:** `RetrospectiveOptions`, `SkillRetroStat`, `RetrospectiveCoverage`, `RetrospectiveReport`, `isAbandonedMidWorkflow`, `getCatalogRetrospectiveReport`, `renderRetrospectiveMarkdown`

## packages/core/src/architecture/baseline-resolver.ts

[`packages/core/src/architecture/baseline-resolver.ts`](/packages/core/src/architecture/baseline-resolver.ts)

Resolves the architecture gate's comparison baseline from the base ref rather than the working-tree snapshot, and layers per-PR allowance files on top, so a branch that raises a metric no longer has to rewrite the shared `baselines.json` and re-conflict every other open PR.

**Exports:** `ArchBaselineSource`, `ArchBaselineFallback`, `ArchBaselineResolution`, `ResolveArchBaselineOptions`, `resolveArchBaseline`, `isWholeSnapshotContext`, `ArchAllowanceSchema`, `ArchAllowance`, `archAllowancesDir`, `ArchAllowanceCoverage`, `LoadAllowancesOptions`, `loadArchAllowances`, `AllowanceFilteredDiff`, `filterDiffByAllowances`, `archAllowanceSlug`, `writeArchAllowance`

## packages/core/src/architecture/exclude.ts

[`packages/core/src/architecture/exclude.ts`](/packages/core/src/architecture/exclude.ts)

Resolves and applies an architecture run's exclude globs. Patterns are additive on top of each collector's own built-in scoping and are matched against the project-relative POSIX path.

**Exports:** `resolveExcludePatterns`, `isExcluded`

## packages/core/src/ci/base-freshness.ts

[`packages/core/src/ci/base-freshness.ts`](/packages/core/src/ci/base-freshness.ts)

Classifies whether a green CI conclusion may be trusted as merge-ready or must be downgraded to `degraded` because the base branch has advanced past the base the run was actually tested against.

**Exports:** `BaseFreshnessTrust`, `BaseFreshnessInput`, `BaseFreshnessVerdict`, `classifyBaseFreshness`

## packages/core/src/ci/verdict-cache.ts

[`packages/core/src/ci/verdict-cache.ts`](/packages/core/src/ci/verdict-cache.ts)

Opt-in, content-addressed memoization cache for CI check verdicts: keys each check by a hash of its input closure (tracked source/config/docs, gate version, and config) and replays the stored verdict on an identical-input hit, with only the checks whose inputs that hash over-approximates declared memoizable.

**Exports:** `VerdictCacheConfig`, `DEFAULT_VERDICT_CACHE_DIR`, `GATE_VERSIONS`, `MEMOIZABLE_CHECKS`, `parseVerdictCacheConfig`, `computeConfigHash`, `computeProjectInputHash`, `computeVerdictKey`, `shouldCacheResult`, `VerdictCache`, `VerdictCacheStatsCollector`

## packages/core/src/compaction/detail-ceiling.ts

[`packages/core/src/compaction/detail-ceiling.ts`](/packages/core/src/compaction/detail-ceiling.ts)

Caps detailed-mode graph-retrieval payloads at a bounded item count, so a hub-node response truncates and reports that it truncated instead of serializing an unbounded neighborhood.

**Exports:** `DEFAULT_GRAPH_DETAIL_CEILING`, `BoundedItems`, `boundItems`

## packages/core/src/constraints/packs.ts

[`packages/core/src/constraints/packs.ts`](/packages/core/src/constraints/packs.ts)

Opt-in constraint packs — named bundles of blocking rules a project enables via `constraintPacks`, each declaring the lifecycle stages it is enforced at and resolving into security-rule severity overrides that an explicit project setting still wins over.

**Exports:** `ConstraintPackStageSpec`, `ConstraintPack`, `BUILT_IN_CONSTRAINT_PACKS`, `ResolvedConstraintPacks`, `getConstraintPack`, `resolveConstraintPacks`

## packages/core/src/deployment/evaluate.ts

[`packages/core/src/deployment/evaluate.ts`](/packages/core/src/deployment/evaluate.ts)

Evaluates a deployment surface against the deployment gate's rules into a blocked / pass / abstained / disabled result. Pure and synchronous: it reuses the in-memory security scanner for the non-waivable secret rule and never runs a deploy.

**Exports:** `evaluateDeploymentGate`

## packages/core/src/deployment/exit-code.ts

[`packages/core/src/deployment/exit-code.ts`](/packages/core/src/deployment/exit-code.ts)

Maps a deployment gate result onto the process exit-code contract (pass and disabled 0, blocked 1, abstained 3) as a plain number, because core cannot import the CLI's `ExitCode` enum.

**Exports:** `deriveExitCode`
