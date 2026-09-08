# Reference: packages / cli / 13

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/commands/api-craft.ts

[`packages/cli/src/commands/api-craft.ts`](/packages/cli/src/commands/api-craft.ts)

Registers `harness api-craft`, the CLI entry for the craft pipeline's API-quality critic: it discovers a project's OpenAPI documents and route/handler definitions (or takes an explicit `--files` / `--routes-dir` / `--spec-file` scope), runs the LLM-judgment critique behind nine API rubrics, and renders the findings.

**Exports:** `createApiCraftCommand`

## packages/cli/src/commands/check-deployment.ts

[`packages/cli/src/commands/check-deployment.ts`](/packages/cli/src/commands/check-deployment.ts)

Registers `harness check-deployment`, the deploy-readiness gate. It detects the project's deployment surface through a node filesystem adapter over the pure core engine, evaluates the gate, and turns hard violations into a non-zero exit — abstaining loudly (never a false green) when no deployment configuration exists and reporting a distinct message when the gate is explicitly disabled in config.

**Exports:** `runCheckDeployment`, `createCheckDeploymentCommand`

## packages/cli/src/commands/check-operational-drift.ts

[`packages/cli/src/commands/check-operational-drift.ts`](/packages/cli/src/commands/check-operational-drift.ts)

The git/fs command layer for `harness check-operational-drift`: resolves the base ref (explicit `--base`, else the merge-base with `origin/HEAD`, with shallow-checkout fallbacks), collects the changed files and base/head configs, and feeds them to the pure detector so an operational-policy change made without an accompanying ADR is flagged (advisory by default, non-zero under a blocking severity).

**Exports:** `RunGit`, `resolveBaseRef`, `collectChangedFiles`, `CheckOperationalDriftOptions`, `CheckOperationalDriftResult`, `runCheckOperationalDrift`, `createCheckOperationalDriftCommand`

## packages/cli/src/commands/check-vocabulary.ts

[`packages/cli/src/commands/check-vocabulary.ts`](/packages/cli/src/commands/check-vocabulary.ts)

Registers `harness check-vocabulary`, which fails the build when deprecated or renamed canonical terms reappear in skills and docs prose. Resolves the `vocabulary` config block (an absent block behaves as an enabled-but-ruleless gate that passes trivially), scans the configured paths, and reports violations.

**Exports:** `runCheckVocabulary`, `createCheckVocabularyCommand`

## packages/cli/src/commands/cli-ergonomics-craft.ts

[`packages/cli/src/commands/cli-ergonomics-craft.ts`](/packages/cli/src/commands/cli-ergonomics-craft.ts)

Registers `harness cli-ergonomics-craft`, the craft pipeline's command-line-quality critic: discovers a project's own command definitions (or an explicit `--files` / `--commands-dir` scope) and critiques each against seven ergonomics rubrics — predictable names, task-oriented help, actionable errors, sane defaults, scannable output, composability, and guarded destructive actions.

**Exports:** `createCliErgonomicsCraftCommand`

## packages/cli/src/commands/code-craft.ts

[`packages/cli/src/commands/code-craft.ts`](/packages/cli/src/commands/code-craft.ts)

Registers `harness code-craft`, the craft pipeline's readability critic. Walks `packages/*/src` (or an explicit file/package scope), critiques each function, method, and class against seven code-quality rubrics under caps for files and units-per-file, and delegates identifier-level naming to naming-craft.

**Exports:** `createCodeCraftCommand`

## packages/cli/src/commands/comprehend.ts

[`packages/cli/src/commands/comprehend.ts`](/packages/cli/src/commands/comprehend.ts)

Registers `harness comprehend`, which compiles and maintains the per-module comprehension substrate. Resolves a mode from the flags — `--changed` (default, recompile only modules owning git-diffed files), `--all` (backfill), `--check` (token-free CI backstop that reports source-stale units and semantic present-to-absent regressions since a ref), `--refresh` (token-gated single-writer CI regeneration), `--stats` (served-vs-raw token savings) — resolves or refuses a provider under `--static`, and optionally stages the compiled shards for the pre-commit hook.

**Exports:** `ComprehendMode`, `resolveMode`, `CompileScope`, `resolveChangedScope`, `resolveCompileProvider`, `formatCompiledUnits`, `stageCompiledUnits`, `resolveStaticOnlyPosture`, `createComprehendCommand`

## packages/cli/src/commands/comprehension-merge-driver.ts

[`packages/cli/src/commands/comprehension-merge-driver.ts`](/packages/cli/src/commands/comprehension-merge-driver.ts)

Registers the internal, git-invoked `harness comprehension-merge-driver`, which git calls with `%O %A %B %P` to merge comprehension `_module.md` shards: it keeps the ours shard when that shard is source-fresh (preserving its semantic half) and otherwise recompiles the static half from the working-tree source, writing the result to the ours path. A `try/finally` makes the exit-0 guarantee structural so a merge is never blocked.

**Exports:** `createComprehensionMergeDriverCommand`

## packages/cli/src/commands/distortion.ts

[`packages/cli/src/commands/distortion.ts`](/packages/cli/src/commands/distortion.ts)

Registers `harness distortion`, a report-only rate-distortion ablation harness. Its `fit` subcommand reads newline-delimited ablation-replay observations (a malformed line is a hard error rather than a silent drop), fits a task-conditioned sensitivity matrix over information class by task class, optionally folds in the refinement-demand log as an advisory prior, and writes the model as JSON plus an optional Markdown report. It never touches the live compaction path.

**Exports:** `createDistortionCommand`

## packages/cli/src/commands/docs-craft.ts

[`packages/cli/src/commands/docs-craft.ts`](/packages/cli/src/commands/docs-craft.ts)

Registers `harness docs-craft`, the craft pipeline's documentation critic and the ceiling counterpart to the rule-based doc floor. Walks `docs/` (or an explicit file scope) and critiques each page against seven rubrics — teaches rather than describes, order matches the reader's mental model, examples earn their place, prose is alive, API docs predict the response, a stranger reaches the same understanding, and the page is scannable.

**Exports:** `createDocsCraftCommand`

## packages/cli/src/commands/holiday-confidence.ts

[`packages/cli/src/commands/holiday-confidence.ts`](/packages/cli/src/commands/holiday-confidence.ts)

Registers `harness holiday-confidence`, the composed "if the senior disappears for two weeks, what holds?" KPI: the percentage of PRs merged in a rolling window (default 30 days) that cleared all four unwatched-safety gates — multi-persona review fired, outcome-eval did not fail, no baseline auto-update, no curated signal in breach. Wires the real graph store and signal gatherer (both best-effort, never throwing) into the signals-package computation and renders the result.

**Exports:** `createHolidayConfidenceCommand`

## packages/cli/src/commands/init-minimal.ts

[`packages/cli/src/commands/init-minimal.ts`](/packages/cli/src/commands/init-minimal.ts)

Implements the `minimal` init tier — the documented floor of the adoption ladder, mapped one-to-one to the five-item Minimum Viable Harness. Unlike the full `--level` scaffold it skips the strategy interview and design system, writes exactly the five load-bearing artifacts (degrading gracefully with a note when one cannot be scaffolded), and prints an explicit ordered upgrade path so a later higher-tier init is purely additive.

**Exports:** `MinimalInitOptions`, `MinimalArtifact`, `MinimalInitResult`, `runMinimalInit`, `buildUpgradePath`, `printMinimalInitSuccess`

## packages/cli/src/commands/operational-drift.ts

[`packages/cli/src/commands/operational-drift.ts`](/packages/cli/src/commands/operational-drift.ts)

The pure detection engine behind `harness check-operational-drift`. Given a changed-file list plus base and head config objects — no git, no filesystem — it answers one question: did a watched operational-policy surface (hook profiles, the pre-commit skip list, config threshold values, baseline-update policy) change without an ADR being added or modified in the same diff? Ships the default watch policy and the glob, deep-equality, and threshold-path helpers the command layer composes.

**Exports:** `OperationalDriftSeverity`, `OperationalDriftPolicy`, `DEFAULT_OPERATIONAL_DRIFT_POLICY`, `OperationalDriftFinding`, `normalizeRel`, `getByPath`, `deepEqual`, `changedThresholdPaths`, `OperationalDriftDetection`, `detectOperationalDrift`

## packages/cli/src/commands/orchestrator-black-box.ts

[`packages/cli/src/commands/orchestrator-black-box.ts`](/packages/cli/src/commands/orchestrator-black-box.ts)

Registers `harness orchestrator black-box`, which reads back the durable per-run forensic records the orchestrator's flight recorder writes under `.harness/black-box` (overridable with `--dir`). `list` enumerates runs newest-first; `show <runId>` renders provenance, per-unit verdicts with their convergence gate reasons, and actual tool use aggregated from the run's stream files.

**Exports:** `createBlackBoxCommand`

## packages/cli/src/commands/outcome-eval-ci.ts

[`packages/cli/src/commands/outcome-eval-ci.ts`](/packages/cli/src/commands/outcome-eval-ci.ts)

Registers `harness outcome-eval-ci`, the headless CI surface of the post-execution spec-satisfaction gate. Resolves the change (spec path, diff range, test output), runs the intelligence-package outcome evaluator, persists the `execution_outcome` node to the project graph so sha-keyed consumers such as the pre-merge brief can look it up, and converts the TypeScript-derived authority into an exit code — blocking only on a high-confidence NOT_SATISFIED under the default `--block-on blocking`. Missing spec, provider, diff, or persistence all degrade to an advisory INCONCLUSIVE and exit 0.

**Exports:** `OutcomeBlockOn`, `OUTCOME_BLOCK_ON_LEVELS`, `OutcomeEvaluatorLike`, `resolveSpecPath`, `OutcomeEvalCiOptions`, `OutcomeEvalCiResult`, `deriveExitCode`, `runOutcomeEvalCi`, `buildOutcomeBody`, `PostOutcome`, `emitOutcomeEvalCi`, `createOutcomeEvalCiCommand`

## packages/cli/src/commands/pre-merge-brief.ts

[`packages/cli/src/commands/pre-merge-brief.ts`](/packages/cli/src/commands/pre-merge-brief.ts)

Registers `harness pre-merge-brief`, which composes a senior-facing PR brief from the diff, a `review-ci` JSON verdict, a fresh signal snapshot, guardian analyses, and the head commit's outcome-eval verdict, ending in a "worth your eyes" section. Every input is optional and gathered defensively — a missing one degrades to an "unavailable" line — and `--comment` upserts the body as a sticky PR comment keyed on a hidden HTML marker.

**Exports:** `BRIEF_MARKER`, `BriefInputs`, `buildBriefBody`, `PostBrief`, `MarkedComment`, `upsertComment`, `defaultPostBrief`, `ReadFile`, `readReview`, `GatherSignals`, `gatherSignalsSafe`, `ReadGuardian`, `gatherGuardianSafe`, `OutcomeStore`, `loadOutcomeStore`, `findOutcomeVerdict`, `PreMergeBriefOptions`, `runPreMergeBrief`, `createPreMergeBriefCommand`

## packages/cli/src/commands/rehearse.ts

[`packages/cli/src/commands/rehearse.ts`](/packages/cli/src/commands/rehearse.ts)

Registers `harness rehearse`, which exercises an agent against a deliberately-broken fixture and scores how well it recovers. Loads the fixture catalog shipped under `templates/rehearsal-fixtures/`, lists the available fixtures and their planted failure modes, prints a single fixture manifest (what was planted, the expected fix, the scoring rubric), and scores a submitted recovery record.

**Exports:** `createRehearseCommand`

## packages/cli/src/commands/release-inventory.ts

[`packages/cli/src/commands/release-inventory.ts`](/packages/cli/src/commands/release-inventory.ts)

Registers `harness release-inventory`, which reports the merged-but-unreleased inventory — pending changesets and commits on the mainline that no published release tag covers yet — against a release-cadence threshold. This module is the node git and filesystem adapter plus renderer over the pure core engine; report-only by default, exiting non-zero on a breach only under `--strict`.

**Exports:** `RunGit`, `createGitPort`, `createFsPort`, `ReleaseInventoryOptions`, `runReleaseInventory`, `createReleaseInventoryCommand`

## packages/cli/src/commands/rework.ts

[`packages/cli/src/commands/rework.ts`](/packages/cli/src/commands/rework.ts)

Registers `harness rework`, which reports the per-surface rework rate from git history over a lookback window, splitting planned from unplanned churn. The planned-issue set is resolved best-effort from roadmap shard `External-ID`s here in the CLI (keeping core roadmap-agnostic) and injected into the core computation; a missing roadmap degrades to classifying all rework as unplanned. Report-only, with a truncatable human table and an untruncated `--json` report.

**Exports:** `ReworkCommandOptions`, `runReworkCommand`, `createReworkCommand`

## packages/cli/src/commands/rollback.ts

[`packages/cli/src/commands/rollback.ts`](/packages/cli/src/commands/rollback.ts)

Registers `harness rollback`, the post-ship revert circuit breaker (propose-only in v1). `evaluate` resolves a merged PR over injected IO and GitHub seams, classifies it for revert-readiness, composes a labeled revert PR when it is ready, and writes a breadcrumb event linked into the graph; `sweep` reads the signal timeline and proposes reverts for threshold crossings.

**Exports:** `RollbackEvaluateArgs`, `RollbackEvaluateDeps`, `runRollbackEvaluate`, `referencesTargetPr`, `createGhSeam`, `summarizeSweepReport`, `RollbackSweepCommandDeps`, `runRollbackSweepCommand`, `createRollbackCommand`

## packages/cli/src/commands/skill-regression.ts

[`packages/cli/src/commands/skill-regression.ts`](/packages/cli/src/commands/skill-regression.ts)

Registers `harness skill-regression`, the golden-fixture quality gate for skills. For each fixture (a canonical input, a rubric, and a recorded golden baseline score) it scores candidate skill outputs semantically against the rubric — an LLM rules each criterion, TypeScript computes the score — and marks the skill REGRESSED when the aggregate score@k falls below `baseline.score - tolerance`. Ship authority is derived in TypeScript from verdict and confidence; the gate is advisory by default and blocks only under `--block-on regressed`, degrading to INCONCLUSIVE and exit 0 on a missing provider, missing fixtures directory, or malformed payload.

**Exports:** `SkillRegressionBlockOn`, `SKILL_REGRESSION_BLOCK_ON`, `DEFAULT_FIXTURES_DIR`, `SkillRegressionEvaluatorLike`, `LoadedFixture`, `loadFixtures`, `resolveCandidates`, `SkillRegressionResult`, `deriveExitCode`, `SkillRegressionOptions`, `runSkillRegression`, `buildSkillRegressionBody`, `createSkillRegressionCommand`

## packages/cli/src/commands/validate-scope.ts

[`packages/cli/src/commands/validate-scope.ts`](/packages/cli/src/commands/validate-scope.ts)

Derives the changed surface that scopes `harness validate --changed` / `--affected`. Computes the files differing from the merge-base with the default branch (or an explicit `--since <ref>`) plus uncommitted and untracked working-tree changes, then filters that list to the design surface so only the expensive file-walking audits (drift detection, brand compliance) are narrowed while the cheap fixed-scope checks still always run. Opt-in by design: a scoped run never re-validates unchanged files, so it must not be the sole gate before a merge or release.

**Exports:** `SCOPED_WALKERS`, `ChangedSurface`, `deriveChangedSurface`, `filterToDesignSurface`

## packages/cli/src/commands/waypoint.ts

[`packages/cli/src/commands/waypoint.ts`](/packages/cli/src/commands/waypoint.ts)

Registers `harness waypoint`, the sanctioned code seam through which skill-driven fleet workers emit `sdlc.*` events for artifacts they write in prose rather than in TypeScript: `record-provenance <file>` and `record-handoff <file>` spool one event each, and `status` reports spool health (segments, event counts, drops, oldest event age). Every subcommand is a no-op that exits 0 with an explanatory note when no `waypoint.sink` is configured, so fleets can call it unconditionally.

**Exports:** `INGEST_TOKEN_ENV`, `createWaypointCommand`
