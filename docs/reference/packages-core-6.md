# Reference: packages / core / 6

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/dictionary/codebook.ts

[`packages/core/src/dictionary/codebook.ts`](/packages/core/src/dictionary/codebook.ts)

The governed, versioned codebook behind trained context dictionaries: binds each term's label-derived handle to a verified definition, bumps the version and retains prior history when a definition drifts, and answers deterministic expansion plus stale/pinned-reference audit queries.

**Exports:** `CODEBOOK_SCHEMA_VERSION`, `CodebookEntry`, `CodebookHistoryRecord`, `Codebook`, `HANDLE_PREFIX`, `definitionHash`, `deriveHandle`, `TermBinding`, `verifyEntry`, `emptyCodebook`, `reconcileCodebook`, `expand`, `StaleReference`, `PinnedReference`, `auditStaleReferences`

## packages/core/src/dictionary/membership.ts

[`packages/core/src/dictionary/membership.ts`](/packages/core/src/dictionary/membership.ts)

Decides dictionary membership by measurement: scores each mined term against a `frequency x length` amortization threshold with hysteresis and emits an enter / retain / retire decision, with no hand-curated allow or deny list in the path.

**Exports:** `MembershipStatus`, `MembershipConfig`, `DEFAULT_MEMBERSHIP_CONFIG`, `netSaving`, `MembershipDecision`, `decideMembership`, `liveLabelsFromDecisions`

## packages/core/src/dictionary/mine.ts

[`packages/core/src/dictionary/mine.ts`](/packages/core/src/dictionary/mine.ts)

Mines recurring labeled spans out of a corpus of past assembled contexts and scores each candidate term by `frequency x length` — the quantity that decides whether binding a span to a short handle ever pays for itself. Pure and IO-free; the corpus arrives pre-segmented into labeled spans.

**Exports:** `CorpusSpan`, `CorpusDocument`, `MinedTerm`, `MineConfig`, `DEFAULT_MINE_CONFIG`, `normalizeSpanText`, `mineRecurringSpans`

## packages/core/src/entropy/path-aliases.ts

[`packages/core/src/entropy/path-aliases.ts`](/packages/core/src/entropy/path-aliases.ts)

Loads tsconfig `paths` aliases and expands an aliased import specifier into candidate absolute paths, so dead-code analysis stops reporting alias-only-reachable files as dead.

**Exports:** `PathAlias`, `loadPathAliases`, `resolveAliasCandidates`

## packages/core/src/fleet/lane-state-isolation.ts

[`packages/core/src/fleet/lane-state-isolation.ts`](/packages/core/src/fleet/lane-state-isolation.ts)

Computes a fleet lane's sandboxed user-global state directory under its own worktree and the `CLAUDE_CONFIG_DIR` env delta that redirects writers into it, so a lane cannot write through the worktree boundary into the operator's real `~/.claude`. Pure: paths and an env delta, no I/O.

**Exports:** `LANE_STATE_DIRNAME`, `resolveLaneStateDir`, `resolveLaneClaudeConfigDir`, `LaneStateEnvOverride`, `buildLaneStateEnvOverride`, `applyLaneStateEnv`

## packages/core/src/gate-loss/accumulate.ts

[`packages/core/src/gate-loss/accumulate.ts`](/packages/core/src/gate-loss/accumulate.ts)

Rolls per-gate loss datapoints up into total and per-gate aggregates — excluding degraded readings from the aggregate but counting them separately — and detects the rising-loss leading-indicator alarm.

**Exports:** `accumulateLoss`, `detectLossAlarm`

## packages/core/src/gate-loss/compute.ts

[`packages/core/src/gate-loss/compute.ts`](/packages/core/src/gate-loss/compute.ts)

Computes the continuous quadratic (Taguchi) loss for one thresholded gate measurement, normalizing to a unit-free proximity and clamping degenerate or non-finite inputs to a large-but-finite `degraded` result rather than emitting `NaN`/`Infinity`.

**Exports:** `MAX_PROXIMITY`, `computeGateLoss`, `computeGateLosses`

## packages/core/src/hooks/canary-review-hooks.ts

[`packages/core/src/hooks/canary-review-hooks.ts`](/packages/core/src/hooks/canary-review-hooks.ts)

Auto-wires canary's test detectors into autopilot's REVIEW and FINAL_REVIEW hook points alongside `harness-code-reviewer`. A canary default whose skill is not installed is silently skipped and reported in the denominator, while an unresolvable user-declared hook still hard-halts.

**Exports:** `CANARY_REVIEW_DETECTORS`, `CANARY_REVIEW_EVENTS`, `CANARY_REVIEW_HOST_SKILL`, `SkillAvailability`, `CanaryReviewDetectorPlan`, `planCanaryReviewDetectors`, `resolveCanaryReviewHooks`, `resolveReviewHooksWithCanary`

## packages/core/src/hooks/hook-context.ts

[`packages/core/src/hooks/hook-context.ts`](/packages/core/src/hooks/hook-context.ts)

Defines the hook input-context contract and renders it three ways — `HARNESS_*` environment variables for command hooks, a JSON stdin payload for structured consumers, and brief lines for dispatched skill hooks. Absent values produce an unset key, never an empty placeholder.

**Exports:** `HookContext`, `buildHookEnv`, `buildHookStdinPayload`, `buildHookBriefLines`

## packages/core/src/hooks/skill-lifecycle.ts

[`packages/core/src/hooks/skill-lifecycle.ts`](/packages/core/src/hooks/skill-lifecycle.ts)

The cross-skill lifecycle hook framework behind the `skillHooks` config block: validates event keys against the `before|after|on:<event>` grammar, normalizes skill / command / prompt entries, derives per-event default blocking behavior, and resolves the hooks configured for one host skill.

**Exports:** `SkillHookEntry`, `SkillHooksForSkill`, `SkillHooksConfig`, `SkillHooksConfigHolder`, `NormalizedHook`, `SKILL_HOOK_EVENT_KEY_RE`, `defaultBlocking`, `resolveSkillHooks`

## packages/core/src/identity/ulid.ts

[`packages/core/src/identity/ulid.ts`](/packages/core/src/identity/ulid.ts)

Self-contained ULID generation and validation — a 48-bit millisecond timestamp plus 80 bits of randomness in Crockford base32, monotonic within a millisecond and dependency-free.

**Exports:** `generateUlid`, `isValidUlid`, `ulidTime`

## packages/core/src/metabolism/classify.ts

[`packages/core/src/metabolism/classify.ts`](/packages/core/src/metabolism/classify.ts)

Classifies one token-spend event as `basal`, `anabolic`, or `unattributable` from the outcome linkage telemetry already carries, separating pure maintenance burn from spend that produced a new artifact, decision, or verified fact. Pure — no I/O and no clock.

**Exports:** `SpendClass`, `SPEND_CLASSES`, `SpendOutcome`, `SpendEvent`, `MetabolismConfig`, `DEFAULT_MAINTENANCE_CLASSES`, `DEFAULT_METABOLISM_CONFIG`, `classifySpend`

## packages/core/src/metabolism/evaluate.ts

[`packages/core/src/metabolism/evaluate.ts`](/packages/core/src/metabolism/evaluate.ts)

Validates the spend classifier against a hand-labeled sample and publishes per-class precision, recall, and support alongside the overall confusion rates.

**Exports:** `LabeledSpendEvent`, `PerClassRates`, `ClassifierEvaluation`, `evaluateClassifier`

## packages/core/src/metrics/denominate.ts

[`packages/core/src/metrics/denominate.ts`](/packages/core/src/metrics/denominate.ts)

The metric constructor: the single way to build a `DenominatedMetric` envelope from a numerator, a denominator, and a population definition — throwing `MetricContractError` rather than emitting a scalar whose population is unstated.

**Exports:** `MetricContractError`, `MetricViolation`, `DenominateInput`, `denominate`, `unknownPopulation`, `census`, `describePopulation`

## packages/core/src/metrics/verdict.ts

[`packages/core/src/metrics/verdict.ts`](/packages/core/src/metrics/verdict.ts)

Reduces a set of denominated metrics to a converged / abstained / unknown outcome, enforcing that a run which examined an empty population has abstained rather than passed.

**Exports:** `MetricOutcome`, `MetricVerdictOptions`, `MetricVerdict`, `verdictForMetrics`

## packages/core/src/model-sentinel/evaluate.ts

[`packages/core/src/model-sentinel/evaluate.ts`](/packages/core/src/model-sentinel/evaluate.ts)

Orchestrates one model-update regression sentinel cycle — snapshot, detect drift against the last-seen snapshot, append a record only on the initial baseline or an actual change — plus the acknowledgement path that re-pins the baseline by appending rather than rewriting history.

**Exports:** `evaluateModelSentinel`, `acknowledgeModelDrift`, `hasUnacknowledgedMaterialDrift`

## packages/core/src/parallelization/ownership.ts

[`packages/core/src/parallelization/ownership.ts`](/packages/core/src/parallelization/ownership.ts)

The cheap, graph-free parallel-safety forecast: tests whether two tasks' declared `owns:` path globs could match a common path, and reports the resulting per-pair ownership conflicts.

**Exports:** `pathsOverlap`, `OwnershipOverlap`, `OwnershipConflict`, `forecastOwnershipConflicts`

## packages/core/src/parallelization/plan.ts

[`packages/core/src/parallelization/plan.ts`](/packages/core/src/parallelization/plan.ts)

Builds the parallelization plan for a set of plan tasks — validates the task declarations, groups tasks into waves under graph-expanded or file-only conflict analysis, derives each wave's severity and firing decision (auto-dispatch / confirm / serialize), separates forced-serial and cyclic tasks into their own channels, and narrates the result.

**Exports:** `FiringDecision`, `WaveSeverity`, `ParallelizationWave`, `ParallelizationPlan`, `PlanParallelizationInput`, `PlanTaskValidation`, `buildTaskGraph`, `validatePlanTasks`, `waveSeverity`, `FiringRationale`, `classifyFiring`, `deriveFiring`, `narrate`, `planParallelization`

## packages/core/src/provenance/io.ts

[`packages/core/src/provenance/io.ts`](/packages/core/src/provenance/io.ts)

The IO half of the provenance reporter: walks `docs/solutions` and collects the `enforces:` links declared in each solution's frontmatter, silently skipping docs that declare none.

**Exports:** `collectSolutionEnforcements`

## packages/core/src/rate-distortion/ablation.ts

[`packages/core/src/rate-distortion/ablation.ts`](/packages/core/src/rate-distortion/ablation.ts)

Applies an ablation by returning a run's context with one information class removed, and drives an injected replay runner across the full ablation suite. Context transformation is pure; only the injected runner is effectful.

**Exports:** `applyAblation`, `ablationSuite`, `runAblationSuite`

## packages/core/src/rate-distortion/distortion-model.ts

[`packages/core/src/rate-distortion/distortion-model.ts`](/packages/core/src/rate-distortion/distortion-model.ts)

Fits a task-conditioned sensitivity matrix from ablation-replay observations: pairs each ablated observation with its run's baseline, reduces the rework deltas per (task class x information class) cell to a mean, sample standard deviation, and 95% confidence half-width, and classifies each cell sensitive / insensitive / inconclusive against a noise threshold.

**Exports:** `Sensitivity`, `CellSensitivity`, `DistortionModel`, `DEFAULT_SENSITIVITY_THRESHOLD`, `DEFAULT_MODEL_VERSION`, `FitOptions`, `classifySensitivity`, `fitDistortionModel`

## packages/core/src/rehearsal/catalog.ts

[`packages/core/src/rehearsal/catalog.ts`](/packages/core/src/rehearsal/catalog.ts)

Loads and validates rehearsal fixture manifests (`rehearsal.json`) from a fixtures root and looks one up by id, returning `Result` errors instead of throwing so a malformed fixture is reported rather than fatal.

**Exports:** `MANIFEST_FILENAME`, `loadManifest`, `loadCatalog`, `findFixture`

## packages/core/src/review/finding-integrity.ts

[`packages/core/src/review/finding-integrity.ts`](/packages/core/src/review/finding-integrity.ts)

Enforces two structural invariants at the point review findings are aggregated for emission: a finding's evidence must be consistent with the vulnerability class it claims, and its confidence may not exceed the ceiling its validation method allows. Mismatches are recorded and downgraded by default, never silently dropped.

**Exports:** `VulnerabilityClassSpec`, `VULNERABILITY_CLASS_SPECS`, `claimsVulnerabilityClass`, `checkEvidenceClassConsistency`, `ConfidenceBand`, `CONFIDENCE_CEILING_BY_VALIDATION`, `confidenceBand`, `confidenceCeiling`, `EvidenceMismatchAction`, `EnforceFindingIntegrityOptions`, `FindingIntegrityReport`, `emptyIntegrityReport`, `EnforceFindingIntegrityResult`, `enforceFindingIntegrity`, `mergeIntegrityReports`, `formatIntegritySummary`

## packages/core/src/rework/rework.ts

[`packages/core/src/rework/rework.ts`](/packages/core/src/rework/rework.ts)

Computes a per-surface rework rate from local git history, classifying `fix:` and revert commits against an injected planned-issue set. Report-only and roadmap-agnostic; reuses the shared scan-candidates git walker rather than introducing a second one.

**Exports:** `plannedIssuesFromExternalIds`, `classifyRework`, `computeRework`

## packages/core/src/rollback/classify.ts

[`packages/core/src/rollback/classify.ts`](/packages/core/src/rollback/classify.ts)

Classifies whether a merged PR can be safely reverted: probes a revert dry-run through the injected IO seam, skips when no changed files or no merge commit resolve, derives dependent merges from the later-merge set, and attaches context-only migration/irreversibility warnings that never flip `revertReady`.

**Exports:** `classifyRevert`

## packages/core/src/rollback/io.ts

[`packages/core/src/rollback/io.ts`](/packages/core/src/rollback/io.ts)

The injected IO seam for the rollback classifier — revert dry-run, merged-PR target resolution, and later-merge lookup — so the classifier stays pure and never reaches git or `gh` directly.

**Exports:** `ResolvedTarget`, `RollbackIO`

## packages/core/src/security/harness-ignore.ts

[`packages/core/src/security/harness-ignore.ts`](/packages/core/src/security/harness-ignore.ts)

Dependency-free parser for `// harness-ignore SEC-XXX-NNN` suppression annotations, returning the matched rule id and its optional justification. Kept free of the scanner's transitive dependencies so the review pipeline can reuse it.

**Exports:** `SuppressionMatch`, `parseHarnessIgnore`

## packages/core/src/security/scan-targets.ts

[`packages/core/src/security/scan-targets.ts`](/packages/core/src/security/scan-targets.ts)

One definition of which files a security scan may read — the source-extension list, the glob derived from it, and the default ignore set — replacing three drifted copies across `check-security`, the CI check orchestrator, and the dashboard's security gatherer.

**Exports:** `SECURITY_SCAN_EXTENSIONS`, `SECURITY_SCAN_GLOB`, `SECURITY_SCAN_DEFAULT_IGNORE`

## packages/core/src/security/secret-reference.ts

[`packages/core/src/security/secret-reference.ts`](/packages/core/src/security/secret-reference.ts)

Decides whether a matched secret value is a reference rather than a literal — a shell or env variable, a GitHub-Actions-style CI expression (`secrets.X`, `env.X`, `vars.X`), or a command substitution — so wiring a secret into an env var is not reported as a hardcoded-secret leak.

**Exports:** `isReferenceOnlySecretValue`, `extractQuotedSecretValue`

## packages/core/src/skills/required-sections.ts

[`packages/core/src/skills/required-sections.ts`](/packages/core/src/skills/required-sections.ts)

Canonical required-Markdown-section lists for shipped skills, imported by both the `harness skill validate` CLI validator and the skills structure test so the two gates cannot drift apart.

**Exports:** `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, `RIGID_SECTIONS`

## packages/core/src/solutions/scan-candidates/read-commits.ts

[`packages/core/src/solutions/scan-candidates/read-commits.ts`](/packages/core/src/solutions/scan-candidates/read-commits.ts)

Reads raw commits — sha, subject, full message body, and changed files — from local git history over a lookback window, capturing the body so callers can parse the `Closes #123` / `Refs #123` references that live there rather than in the subject.

**Exports:** `RawCommit`, `ReadCommitsOptions`, `readRawCommits`

## packages/core/src/state/event-sourcing/triage.ts

[`packages/core/src/state/event-sourcing/triage.ts`](/packages/core/src/state/event-sourcing/triage.ts)

Append-only roadmap auto-triage record store built on the event-sourced log: appends `triage_predicted` and `triage_outcome` events and folds them into per-item records keyed by external id, with a later append for the same item winning in the log's deterministic order.

**Exports:** `StoredVerdict`, `StoredPrediction`, `StoredOutcome`, `StoredTriageRecord`, `recordTriagePrediction`, `recordTriageOutcome`, `projectTriageRecords`, `loadTriageRecords`

## packages/core/src/state/graph-staleness.ts

[`packages/core/src/state/graph-staleness.ts`](/packages/core/src/state/graph-staleness.ts)

Stamps deletion-based learning staleness onto `learning` and `execution_outcome` nodes in a graph store, reusing the existing staleness detector so the flag is reachable from natural-language queries.

**Exports:** `GraphStalenessResult`, `FlagStaleLearningNodesOptions`, `flagStaleLearningNodes`

## packages/core/src/state/spill.ts

[`packages/core/src/state/spill.ts`](/packages/core/src/state/spill.ts)

Offloads over-threshold tool output to a file under the session state directory and returns a stable, followup-readable locator, with `readSpill` / `searchSpill` to recover or search it in a later turn. Output under the threshold passes through inline, unchanged.

**Exports:** `SPILL_DIR`, `DEFAULT_SPILL_THRESHOLD_BYTES`, `SPILL_THRESHOLD_ENV`, `SPILL_LOCATOR_SCHEME`, `SpillOptions`, `SpillPassthrough`, `SpillWritten`, `SpillResult`, `SpillSearchMatch`, `SpillSearchResult`, `resolveSpillThreshold`, `spillIfNeeded`, `readSpill`, `searchSpill`

## packages/core/src/telemetry-synthesis/synthesize.ts

[`packages/core/src/telemetry-synthesis/synthesize.ts`](/packages/core/src/telemetry-synthesis/synthesize.ts)

Pure composer that folds already-read adoption, usage, effectiveness, outcome, and insights inputs into a single telemetry synthesis. Every input including `now` is passed in, so the CLI composition root keeps core free of any graph or intelligence dependency.

**Exports:** `OutcomeNodeLike`, `SynthesisInputs`, `ComposeSynthesisOptions`, `composeSynthesis`

## packages/core/src/waypoint/checkpoint.ts

[`packages/core/src/waypoint/checkpoint.ts`](/packages/core/src/waypoint/checkpoint.ts)

Per-segment shipper high-water marks stored beside the spool: records the last ULID known to have landed for each segment and derives the still-unshipped lines, never deleting, truncating, or rewriting a spool segment.

**Exports:** `CHECKPOINT_FILENAME`, `ShipCheckpoint`, `EMPTY_CHECKPOINT`, `readCheckpoint`, `writeCheckpoint`, `advanceMark`, `unshippedLines`, `eventIdOf`

## packages/core/src/waypoint/rejected-log.ts

[`packages/core/src/waypoint/rejected-log.ts`](/packages/core/src/waypoint/rejected-log.ts)

Append-only dead-letter log of permanently-refused events, written beside the spool it describes, so the shipper can advance past an event the ledger will never accept without either wedging the queue or silently dropping the signal.

**Exports:** `REJECTED_FILENAME`, `RejectedRecord`, `rejectedLogPath`, `recordRejected`, `countRejected`

## packages/core/src/waypoint/scrub.ts

[`packages/core/src/waypoint/scrub.ts`](/packages/core/src/waypoint/scrub.ts)

Best-effort client-side redaction of secret-shaped substrings in an event's `data` string values before it is spooled. Advisory only — the authoritative, fail-closed scrub happens at ingest — and envelope attributes are left unrewritten.

**Exports:** `REDACTED`, `ScrubOutcome`, `bestEffortScrub`

## packages/core/src/waypoint/shipper.ts

[`packages/core/src/waypoint/shipper.ts`](/packages/core/src/waypoint/shipper.ts)

Ships spooled `sdlc.*` events to the Waypoint ledger's ingest endpoint in batches, advancing progress from the per-event `results` array rather than guessing which events landed, retrying network and 5xx failures with exponential backoff while treating 400 and 401 as configuration faults, and routing permanent refusals to the dead-letter log.

**Exports:** `DEFAULT_BATCH_SIZE`, `IngestResultKind`, `IngestEventResult`, `IngestReportBody`, `hasLanded`, `isTerminal`, `RejectedEvent`, `ShipReport`, `ShipFetch`, `ShipOptions`, `ShipError`, `ingestUrl`, `shipSpool`, `countUnshipped`

## packages/core/src/waypoint/spool.ts

[`packages/core/src/waypoint/spool.ts`](/packages/core/src/waypoint/spool.ts)

The file-backed repo-local `sdlc.*` spool: one JSON-Lines segment per writing process, bounded at a cap that drops the oldest line and counts drops in a sidecar, with appends that never throw and never fail the originating harness operation — plus segment reading and ULID-ordered merging for consumers.

**Exports:** `DEFAULT_MAX_EVENTS`, `FileSpoolOptions`, `FileSpool`, `readSpoolSegments`, `mergeSegments`

## packages/core/src/waypoint/ulid.ts

[`packages/core/src/waypoint/ulid.ts`](/packages/core/src/waypoint/ulid.ts)

ULID generation and validation for `sdlc.*` event identity and idempotency keys, with time and randomness as injected ports (safe defaults) so the factory is deterministic under test.

**Exports:** `ULID_LENGTH`, `isUlid`, `UlidFactoryOptions`, `createUlidFactory`
