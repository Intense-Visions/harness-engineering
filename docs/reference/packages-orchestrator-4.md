# Reference: packages / orchestrator / 4

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/orchestrator/src/agent/adaptive-router.ts

[`packages/orchestrator/src/agent/adaptive-router.ts`](/packages/orchestrator/src/agent/adaptive-router.ts)

Adaptive model router (AMR Phase 3) that wraps the shipped `BackendRouter` without modifying it: classifies each request, derives the required capability tier, picks the cheapest qualifying backend, and enriches the routing decision with complexity, required tier, and estimated cost, falling through to the identity/default chain when tier selection abstains.

**Exports:** `AdaptiveRouterDeps`, `AdaptiveRouter`

## packages/orchestrator/src/agent/analysis-env.ts

[`packages/orchestrator/src/agent/analysis-env.ts`](/packages/orchestrator/src/agent/analysis-env.ts)

Derives the `HARNESS_ANALYSIS_BASE_URL` / `HARNESS_ANALYSIS_MODEL` env vars from the THINKING-mode (reasoner) backend so the `acceptance_eval` / `outcome_eval` MCP tools can judge fully locally, and applies them to `process.env` at orchestrator startup.

**Exports:** `AnalysisEnv`, `deriveAnalysisEnv`, `applyAnalysisEnv`

## packages/orchestrator/src/agent/backends/child-stdin.ts

[`packages/orchestrator/src/agent/backends/child-stdin.ts`](/packages/orchestrator/src/agent/backends/child-stdin.ts)

Guards a spawned agent child's stdin: attaches the required `'error'` listener so a closed-pipe write (EPIPE, ECONNRESET, EOF, destroyed stream) is ignored instead of crashing the host process (#2298), while forwarding any other stdin error to the caller.

**Exports:** `isClosedPipeError`, `guardChildStdin`

## packages/orchestrator/src/agent/brainstorm-wiring.ts

[`packages/orchestrator/src/agent/brainstorm-wiring.ts`](/packages/orchestrator/src/agent/brainstorm-wiring.ts)

Orchestrator-side wiring for Roadmap Auto-Triage's autonomous brainstorm: supplies the real fork generator over the SEL `AnalysisProvider` with structured per-fork output and N=3 self-consistency sampling (forcing low confidence on any disagreement or off-menu answer), renders the resulting spec to docs, and re-scores the item through `triageIssue`.

**Exports:** `BRAINSTORM_RUBRIC`, `SelForkGeneratorOptions`, `makeSelForkGenerator`, `BrainstormWiringDeps`, `WiredBrainstormResult`, `brainstormInputFromIssue`, `runBrainstormForIssue`, `slugFor`, `renderSpecMarkdown`, `enrichIssueWithSpec`

## packages/orchestrator/src/agent/capability-registry.ts

[`packages/orchestrator/src/agent/capability-registry.ts`](/packages/orchestrator/src/agent/capability-registry.ts)

Builds the tier-selection capability registry from configured `agent.backends` plus LMLM pool candidates, and selects the cheapest backend meeting a tier, privacy floor, and allowlist; throws the fail-closed `PrivacyNoMatch` routing error when a privacy or allowlist constraint empties the candidate set.

**Exports:** `PrivacyNoMatch`, `SelectConstraints`, `selectCheapestQualifying`, `defaultPoolCapabilities`, `buildCapabilityRegistry`

## packages/orchestrator/src/agent/complexity-request.ts

[`packages/orchestrator/src/agent/complexity-request.ts`](/packages/orchestrator/src/agent/complexity-request.ts)

Derives the pre-diff, text-only routing signals (combined title/description length, attached-spec flag, measurable-acceptance heuristic, raw prompt) the adaptive router's live classifier consumes for an `Issue` at dispatch time, without fabricating diff signals.

**Exports:** `buildTaskText`

## packages/orchestrator/src/agent/cost-estimator.ts

[`packages/orchestrator/src/agent/cost-estimator.ts`](/packages/orchestrator/src/agent/cost-estimator.ts)

Pure pre-dispatch USD cost estimate for a backend: a fixed blended-token budget times the backend's `costPer1kTokens`, returning 0 for a backend with no capabilities block.

**Exports:** `estimateCost`

## packages/orchestrator/src/agent/escalation-state.ts

[`packages/orchestrator/src/agent/escalation-state.ts`](/packages/orchestrator/src/agent/escalation-state.ts)

Vertical escalation state (D10): a per-coherence-unit quality-failure counter that raises the unit's floor capability tier one step after the Nth consecutive quality failure, monotonic and capped at `strong` so it cannot loop or thrash.

**Exports:** `EscalationState`

## packages/orchestrator/src/agent/live-classify.ts

[`packages/orchestrator/src/agent/live-classify.ts`](/packages/orchestrator/src/agent/live-classify.ts)

Binds the real intelligence `classify` cascade into the adaptive router's `classify(req)` seam as a pre-diff classification, using an optional `AnalysisProvider` tie-break and degrading to the offline static verdict (or a conservative `{moderate, low}` when no task text exists) without throwing.

**Exports:** `makeLiveClassify`

## packages/orchestrator/src/agent/quality-verdict.ts

[`packages/orchestrator/src/agent/quality-verdict.ts`](/packages/orchestrator/src/agent/quality-verdict.ts)

Single-agent quality-verdict source (ADR 0069): parses the ADDED lines of a unified diff into hunks, scans only those lines for introduced security defects so pre-existing patterns never count, and maps an outcome-eval verdict to a quality failure for escalation.

**Exports:** `IntroducedHunk`, `parseIntroducedHunks`, `hasIntroducedSecurityDefect`, `outcomeVerdictToQualityFail`

## packages/orchestrator/src/agent/subprocess-env.ts

[`packages/orchestrator/src/agent/subprocess-env.ts`](/packages/orchestrator/src/agent/subprocess-env.ts)

Subprocess air-gap: builds an allowlisted environment for a spawned agent CLI (runtime plumbing vars, provider credentials, `HARNESS_*` vars, and configurable extensions) instead of passing the full parent `process.env`, so unrelated secrets are dropped; also owns the opt-in lane state-isolation toggle that redirects a lane's `~/.claude` into a per-lane sandbox.

**Exports:** `SUBPROCESS_ENV_ALLOW_VAR`, `SUBPROCESS_ENV_PASSTHROUGH_VAR`, `LANE_STATE_ISOLATION_VAR`, `isLaneStateIsolationEnabled`, `BuildSubprocessEnvOptions`, `SubprocessEnvResult`, `isEnvKeyAllowed`, `buildSubprocessEnv`

## packages/orchestrator/src/agent/triage-mark.ts

[`packages/orchestrator/src/agent/triage-mark.ts`](/packages/orchestrator/src/agent/triage-mark.ts)

Roadmap Auto-Triage dispatch marker: for each human-approved item it attaches the generated spec to the roadmap feature (keeping it `planned`) and records the pre-dispatch prediction, making the item eligible for the existing pickup loop without dispatching it, setting an assignee, or stealing a claim; a no-op when disabled.

**Exports:** `TriageMarkItem`, `TriageMarkConfig`, `RecordPrediction`, `TriageMarkDeps`, `MarkSkipReason`, `MarkSkip`, `TriageMarkResult`, `markApprovedForDispatch`

## packages/orchestrator/src/agent/triage-outcome.ts

[`packages/orchestrator/src/agent/triage-outcome.ts`](/packages/orchestrator/src/agent/triage-outcome.ts)

Roadmap Auto-Triage post-diff retrospective: derives post-diff complexity signals (files, layers, blast radius) from the introduced diff, classifies at full strength, compares the result to the stored prediction, records the graded outcome, and provides a precedent lookup over recorded outcomes.

**Exports:** `StoredOutcomeRecord`, `signalsFromDiff`, `layerOfPath`, `RetrospectiveDeps`, `RetrospectiveResult`, `runRetrospective`, `TriageOutcomeInputLike`, `buildTriageOutcomeInput`, `precedentLookupFromStored`

## packages/orchestrator/src/agent/triage-wiring.ts

[`packages/orchestrator/src/agent/triage-wiring.ts`](/packages/orchestrator/src/agent/triage-wiring.ts)

Orchestrator-side wiring for the pure triage scoping probe: builds a `ProbeInput` from an `Issue`, implements the `GraphScope` seam (raw string to graph node plus `CascadeSimulator` blast radius) over a `GraphStore`, runs `triageIssue`, and re-exports the intelligence ranking helpers.

**Exports:** `buildProbeInput`, `makeGraphScope`, `TriageWiringDeps`, `triageIssue`, `rankTriageCandidates`, `pilotScore`, `RankableCandidate`, `TriageVerdict`
