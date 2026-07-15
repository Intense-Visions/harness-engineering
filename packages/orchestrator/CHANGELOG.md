# @harness-engineering/orchestrator

## 0.16.0

### Minor Changes

- 2880b3a: feat(lmlm): probe + store per-model agentic tool-calling capability; require it for build routing

  The pool ranked local models purely on benchmark scores, so a model that can't drive an agentic
  build (it emits tool calls as TEXT the coding-agent SDK can't parse — e.g. qwen2.5-coder:7b) could
  rank top and silently no-op a build. Bake the capability into the pool so selection is aware of it:
  - **`probeToolCalling`** (`local-models`) — cheap-first: gate on Ollama `/api/show` `capabilities`
    (free; no `tools` ⇒ `false` with no inference), then one `/v1` tool-schema call to confirm the
    model actually emits native `tool_calls` (catches the "claims tools but emits text" false
    positive). Any failure ⇒ `undefined` (unknown ⇒ fail-open). The single-call FORMAT probe is
    deterministic, unlike the flaky multi-turn agentic loop.
  - **`PoolEntry.toolCalling?`** — additive, round-trips via the existing clone/loader; written once
    per model by the scheduler re-score (an injected probe seam) and never re-probed once decided.
  - **`poolStateToCandidates(state, profile, { requireToolCalling })`** — excludes entries known not
    to tool-call (`false`), keeping `true` + unprobed (`undefined`, fail-open).
  - **`LocalModelResolver`** requires tool-calling for AGENTIC (tier) use-cases only — a build never
    routes to a text-only model; triage/classification (which needs no tool-calling) is untouched.
  - The orchestrator binds the probe to the local backend endpoint when starting the refresh
    scheduler.

  Verified live: the probe returns `false` for qwen2.5-coder:7b and `true` for qwen3:8b / qwen3:32b.
  This makes the config-ordering fallback a belt-and-suspenders rather than the primary guard.

- ef62251: Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`). Rather than paraphrasing the workflow inline, that template is a thin indirection shim that delivers the REAL skills over bash: the pi agent runs `harness skill run <name> --autonomous` (which prints the verbatim `SKILL.md`, no MCP required) and follows a `/harness:X` → `harness skill run harness-X` redirect. The new `--autonomous` flag on `harness skill run` prepends an autonomous-decider preamble so a headless agent runs each skill (including brainstorming) at full rigor but decides every fork itself and records it in the spec — with a PR-flag safety valve for low-confidence and strategy-contradiction forks, and no mid-run human pause; absent the flag, skill-run output is byte-identical to before. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071/0072.
- 723072d: fix(triage): select the local model from the LMLM pool (reasoning-ranked), not the static config list

  `harness roadmap triage` resolved its local model from `agent.backends.local.model[0]` — a
  fixed, hand-maintained list — so triage could stay pinned to a weak model even after the Local
  Model Lifecycle Manager pool had installed and ranked a stronger one. The live orchestrator does
  not have this problem: its `LocalModelResolver` derives candidates from the pool via
  `poolStateToCandidates(snapshot, profile)`. This brings the same pool-first pick to the one-shot
  CLI triage path so the CLI and live agents agree on the model.
  - The report/brainstorm now prefer the pool's top-ranked model for the **`reasoning`** profile
    (the triage gate's safety rests on reasoning-grade complexity judgment). In a real dogfood run,
    this flipped an item the weak model mis-read as `trivial`/dispatchable to a correct
    `moderate` → held-to-human — without any config change.
  - The static `agent.backends.*.model` list remains the documented **fallback** for pool-less
    adopters and non-Ollama backends; a missing/empty/broken pool degrades to it silently (never an
    error). An explicit `--model` still wins; explicit cloud (`intelligence.provider`) backends
    ignore the local pool pick.
  - Orchestrator now re-exports the pool-state primitives (`PoolStateStore`,
    `poolStateToCandidates`, `DEFAULT_POOL_STATE_PATH`, `PoolState`, `RankProfile`) so the CLI reads
    the persisted pool without a new CLI→local-models package edge.

### Patch Changes

- 723072d: fix(orchestrator): register the local provider credential so PiBackend can actually run a local build

  `PiBackend` handed the pi-coding-agent SDK an inline model under a synthetic `harness-local`
  provider but never registered a credential for it. The SDK resolves auth by PROVIDER (auth.json /
  env / runtime override) — the model's `headers`/`apiKey` fields do NOT satisfy that gate — so a
  local build failed immediately with "No API key found for harness-local" unless an operator had
  manually run `/login`. This silently blocked the entire local-model build path out of the box.

  `startSession` now creates an in-memory `AuthStorage`, registers the endpoint's key for
  `harness-local` via `setRuntimeApiKey` (the configured `apiKey`, or `ollama` — Ollama ignores the
  value; a real key is threaded through for vLLM/LM-Studio deployments that enforce one), and passes
  it to `createAgentSession`.

  Found by a live end-to-end test: with this fix a local model (qwen3:32b via Ollama) drives a real
  agentic build — `write` + `bash` tool calls producing a correct, self-verified module.

- 723072d: fix(triage): don't label a deferred open-decisions lever as "no provider (offline)"

  The cheap-first report holds obviously-out-of-band items (scope-too-large, not-in-band) before
  spending an LLM call, so their open-decisions lever runs without a provider and printed
  `open-decisions: no provider (offline)` — misleading, since a provider WAS available and the
  lever was simply deferred, not missing/mis-configured.

  New `ProbeDeps.modelDeferred` hint (threaded through `triageIssue`): when a model is available
  but its levers were deferred for a cheap pass, the reason reads `not evaluated (item held before
the model pass)`. A genuinely offline run (`--offline` / no provider wired) still reads
  `no provider (offline)`. Wording only — the lever value stays `unknown` and the gate never
  dispatches on an unread lever either way.

- 723072d: fix(triage): stop truncating reasoning-model output — the LLM levers now produce real verdicts

  The complexity tie-break, the open-decisions lever, and the brainstorm fork generator each
  capped the model at a tiny `max_tokens` (256 / 512 / 512). A reasoning model (Qwen3 et al.)
  emits a `<think>` trace BEFORE the JSON, so those caps truncated mid-reasoning →
  `finish_reason: length` → empty content. The failure was then swallowed:
  - `llmTiebreak` catches the error and returns a hardcoded `{ level: 'moderate', confidence: 'low' }`,
  - the open-decisions lever degrades to `unknown`,
  - the brainstorm fork halts as `error`.

  So on a reasoning model the triage levers never ran on the real output — the "verdict" was a
  fail-safe fallback that only _looked_ like a judgment. Non-reasoning models (which emit no think
  trace) fit the tiny caps and masked the bug.

  Raised each cap to 4096. `max_tokens` is a ceiling, not a target — a non-reasoning model still
  stops at ~14 tokens — so this is free on the fast path and only spends tokens when a model
  actually reasons. Verified end-to-end: on Qwen3 the semantic-read lever now returns a real
  `simple/high` (was the `moderate/low` fallback) and the open-decisions lever surfaces real
  decisions (was `assessment failed`).

- Updated dependencies [2880b3a]
- Updated dependencies [ef62251]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
  - @harness-engineering/local-models@0.6.0
  - @harness-engineering/types@0.23.0
  - @harness-engineering/intelligence@0.9.0
  - @harness-engineering/core@0.37.1
  - @harness-engineering/graph@0.11.9

## 0.15.1

### Patch Changes

- Updated dependencies [f5cbdec]
  - @harness-engineering/intelligence@0.8.0

## 0.15.0

### Minor Changes

- eb74585: feat(triage): roadmap auto-triage — four-gate closed-loop autonomous dispatch (default-off)

  Adds an opt-in system that scores roadmap items, autonomously dispatches the ones it
  can confidently and cheaply scope, and routes everything needing human judgment to a
  human. Entirely default-off (`roadmap.autoTriage.enabled`, byte-identical when off).

  Four gates, ascending in evidence:
  - **Scoping probe** (`intelligence/triage`): four corroborating levers (graph-grounded
    scope / semantic read / open-decisions / precedent). Fail-closed — any `unknown`
    lever holds to a human.
  - **Autonomous brainstorm**: compact fork-loop on the local SEL model; halts unless
    per-fork `confidence==='high'`, hardened with N-sample self-consistency (unstable
    recommendation → forced low). Produces a spec or a halt handoff; executes nothing.
  - **Dispatch + ratchet stage 1**: marks items for the existing orchestrator pickup
    (no new dispatch path); nothing executes without an explicit human go.
  - **Post-diff retrospective**: extends the AMR 4c quality feeder — grades the actual
    diff against the pre-dispatch prediction, blocks+escalates mispredicts, records the
    outcome. Closes the loop; the precedent lever and evidence-gated ratchet (capped at
    v1 stage 2 — no auto-merge) self-calibrate from recorded outcomes.

  New CLI: `harness roadmap triage` (read-only report), `--brainstorm`, and
  `triage approve`. New config section `roadmap.autoTriage`.

### Patch Changes

- cf3420a: fix(routing): `harness routing trace` shows the AMR-effective backend, not the identity default

  `trace --complexity <level>` displayed `decision.backendName` — the identity/default
  chain pick — as the "Backend", so a `trivial` task under AMR showed `primary`/claude
  even though it routes to the `fast`/local backend (the `$0` cost already reflected
  local, making Backend↔cost inconsistent). The trace handler already computed the
  tier-selected backend (`costedBackendName` via the same `selectCheapestQualifying`
  real dispatch uses); the CLI just ignored it and the server didn't return its type.
  - Server: the trace response now also carries `costedBackendType` alongside
    `costedBackendName`.
  - CLI: under a `--complexity`/`--risk` dry-run, the `Backend:` line shows the
    tier-selected backend + type (what real dispatch would use), and notes when AMR
    overrides the identity pick. Non-AMR traces are unchanged.

  Routing behavior itself was always correct — this is a display/observability fix so
  `trace` reflects what the orchestrator actually dispatches.

- Updated dependencies [eb74585]
  - @harness-engineering/types@0.22.0
  - @harness-engineering/core@0.37.0
  - @harness-engineering/intelligence@0.7.0
  - @harness-engineering/graph@0.11.8
  - @harness-engineering/local-models@0.5.2

## 0.14.0

### Minor Changes

- 4cf05b1: fix(orchestrator): wire the AMR config-file surface — accept backend `capabilities` + `routing.policy`

  AMR's types (`BackendDef.capabilities`, `RoutingConfig.policy`) and the engine that
  reads them shipped, but the config-file Zod validators were never extended, so a
  config carrying them was **rejected** ("Unrecognized key(s)") by both `harness
validate` and the orchestrator loader — you could not enable AMR from
  `harness.config.json` / `harness.orchestrator.md` at all (only via the runtime
  `PUT /api/v1/routing/policy` endpoint). The AMR guide's config-file example was
  therefore aspirational.
  - `BackendDefSchema` gains an optional `capabilities` (`BackendCapabilitiesSchema`:
    tier / costPer1kTokens / privacyClass / contextWindow / vision? / toolUse?),
    `.strict()` so config typos fail loudly.
  - `RoutingConfigSchema` gains an optional `policy` (`RoutingPolicySchema`).
  - The `PUT /routing/policy` route now **imports** the canonical `RoutingPolicySchema`
    instead of its own copy, so the config-file and HTTP-endpoint validation can never
    drift again. (The route-local copy had a 3-value `privacyFloor` enum, silently
    **missing `pooled-isolated`** — now fixed as a side effect.)
  - Additive + default-off: a config without `capabilities`/`policy` validates and
    behaves byte-identically. A compile-time guard + a full-config `validateWorkflowConfig`
    round-trip test (the front door that was never exercised) pin the fix.

## 0.13.0

### Minor Changes

- 681e173: feat(adaptive-model-routing): provider-neutral capability-tier routing (AMR Phases 1–4)

  Adds Adaptive Model Routing — provider-neutral, capability-tier-based backend
  selection driven by task complexity — behind a **default-off** gate. It is fully
  **opt-in**: with no `routing.policy` in `harness.config.json`, `AdaptiveRouter`
  is never constructed, the complexity classifier never runs, and routing is
  byte-identical to the shipped `BackendRouter` (no new spans, LLM calls, or latency).
  - **types**: additive `BackendCapabilities`, `ComplexityVerdict`, `RoutingRequest`,
    `RoutingPolicy`, `RoutingError` (codes `privacy-no-match` / `escalation-exhausted`);
    optional `capabilities?` on `BackendDef`; optional `complexity` / `tierRequired` /
    `estCostUsd` on `RoutingDecision`. `RoutingValue` is **not** widened — tier resolution
    lives entirely in the AMR layer (backward-compatible). `RoutingError` is now the single
    error family for AMR routing failures: the orchestrator's `PrivacyNoMatch` extends it
    (carrying `code: 'privacy-no-match'`), so it is catchable/narrowable as either — a
    backward-compatible refinement (`PrivacyNoMatch` is still an `Error` with the same
    `name`/`code`).
  - **intelligence**: a complexity cascade (static pass → `fast` LLM tie-break →
    confidence-gated `standard` escalation) emitting a `ComplexityVerdict`, plus pure
    `deriveRequiredTier` resolution (matrix → D5 blast-radius `strong` veto →
    low-confidence up-bump → D8 budget clamp → D10 escalation floor). The LLM never
    influences the final tier.
  - **orchestrator**: `AdaptiveRouter` wraps `BackendRouter` (which is unchanged), a
    capability registry + cheapest-qualifying selection that fails **closed** on
    privacy/allowlist exclusion, enriched `routing:decision` telemetry, and a vertical
    `EscalationState` (D10/SC16) that climbs a coherence unit's floor tier on repeated
    quality failures (monotonic, `strong`-capped). Live dispatch routes through
    `AdaptiveRouter` only when a `routing.policy` is present. Both routing hard-fails now
    **surface to a human** via the `needs-human` interaction queue (not just a log): a
    fail-closed `PrivacyNoMatch` at the dispatch boundary emits a distinct
    `routing:no-tier-match` steward escalation (never recorded as a transport failure, never
    fed to escalation) and, because it is deterministic (config-driven privacy floor /
    allowlist that cannot succeed on re-dispatch), is **terminal** — the unit moves to the
    `canceled` lane with no retry enqueued rather than looping through escalate-then-retry.
    An exhausted `strong`-ceiling re-crossing emits `routing:escalation-exhausted`
    (D10 hard-fail-to-human).
  - **cli**: `harness routing trace --complexity <level> --risk <band>` dry-runs a
    routing decision (prints derived tier + chosen backend without dispatching), with
    client-side enum validation.

  Split-routing (D6/SC4) and the live quality-gate fan-in into escalation (Phase 4c)
  are deferred — see `docs/changes/adaptive-model-routing/proposal.md` "Deferred
  follow-ups". No behavior changes for existing single-backend or multi-backend
  configs.

- 42f771f: feat(orchestrator): split-routing `expects` narrows the prior-stage text channel (4b)

  `expects` was declared, schema-valid, and documented on workflow stages but had no
  runtime effect — the text channel threaded _every_ prior stage's output into
  _every_ later stage's prompt. This activates it as a sound, opt-in filter:
  - **Runtime:** a stage that declares `expects: <label>` now receives **only** that
    one upstream artifact in its prompt (instead of all priors) — leaner prompts and
    a smaller prompt-injection surface. Omitting `expects` keeps the full-priors
    default, byte-identical to before. If the named producer emitted no output, the
    channel is simply empty (never a crash).
  - **Config-load validation:** a new cross-field refinement on
    `StagedWorkflowDeclSchema` rejects an `expects` that does not name a `produces`
    from an **earlier** stage (catches label typos, forward references, and
    self-references), with the error path pointed at the offending `stages[i].expects`.

  Note on scope: this deliberately does **not** add file-path artifact threading.
  All stages share one worktree, so files a stage writes are already on disk for
  later stages; a `produces: { files: [...] }` manifest would only add a redundant
  hint. The real gap was that `expects` did nothing — now it does.

- f004f04: feat(orchestrator): opt-in LLM spec-satisfaction verdict for single-agent escalation (4c v2)

  Adds the second sound quality-verdict source named in ADR 0069 — an LLM
  spec-satisfaction (outcome-eval) judgment — behind a new **default-off** flag
  `routing.policy.acceptanceEval.enabled`. It complements the always-on
  baseline-relative security-defect feeder shipped earlier.
  - On a normal single-agent exit, **after** the cheap security scan comes back clean
    (so a defect never wastes a model call), the orchestrator runs the shared
    `OutcomeEvaluator` over the introduced diff vs the spec's success-criteria
    section and feeds `quality-fail` **only** on a high-confidence NOT_SATISFIED
    verdict (`authority === 'blocking'`, derived in TypeScript — an LLM-forged
    `authority` is stripped at the evaluator's strict-parse boundary).
  - **Conservative + guarded:** SATISFIED / INCONCLUSIVE / lower-confidence /
    no-spec / no-provider / empty-diff / any error → neutral (never a premature
    `quality-pass`). Fully no-op when AMR is off or the flag is unset.
  - **No new model plumbing:** reuses the SEL-layer `AnalysisProvider` the live
    complexity classifier already builds inline (ADR 0069's "orchestrator can't run a
    model inline" no longer holds). New surface is minimal: a `WorkspaceManager.getIntroducedDiffText`
    raw-diff accessor (merge-base relative, seeded overlay excluded via git pathspec),
    a pure `outcomeVerdictToQualityFail` mapper, and the `acceptanceEval` policy field.

  Still deferred: escalation on general logic quality beyond security defects +
  spec-satisfaction. `RoutingPolicy` gains `acceptanceEval?: { enabled; model? }`
  (also accepted on `PUT /api/v1/routing/policy`).

- d8df71d: AMR single-agent quality escalation is now live (completes ADR 0069). The
  escalation mechanism + seam were already complete; this adds the _sound_
  quality-verdict source that was missing: a **baseline-relative** security scan of
  the diff a single-agent dispatch introduced.

  On a normal single-agent exit, when AMR is active, the orchestrator scans only the
  **added lines** of the agent's changes (working-tree diff vs the merge-base of the
  worktree and the base ref, so a base branch that advanced mid-dispatch never
  attributes other merges to the agent; the seeded handoff overlay is excluded). A
  **new error-severity** security finding on an added line → `quality-fail`, which
  climbs the coherence unit's escalation floor. This is sound (not approximate)
  because every security rule is single-line, so per-added-line matching yields
  exactly the findings the agent introduced — pre-existing patterns never count.

  Success stays escalation-neutral (never a premature `quality-pass`, per ADR 0069).
  Fully guarded — any git/scan error degrades to neutral, never breaking completion —
  and a **no-op when AMR is off** (dispatch stays byte-identical). Staged workflows
  already escalate on their per-stage gate; this is the single-agent equivalent.

  Adds `WorkspaceManager.getIntroducedDiff` and `SecurityScanner.scanFileContent`
  (fileGlob-aware in-memory scanning).

- ec649e6: feat(adaptive-model-routing): D8 hard budget cap — force `fast` / surface to a steward at the cap

  Turns the AMR budget from a purely soft, single-step degrade into a cap that
  actually bites at 100% of `capUsd`, while staying **opt-in / default-off** (no
  `routing.policy.budget` ⇒ dispatch is byte-identical).
  - **Hard floor (`degrade`/`pause`):** at/above `capUsd`, the tier is forced all the
    way to `fast` (not just one step). Sound because it only ever routes _cheaper_
    than the existing soft clamp, and it sits **below** the D5 blast-radius veto, so a
    security-forced `strong` task still stays `strong`. `pause` behaves as `degrade`
    here — true blocking admission remains deferred.
  - **`human` mode:** at/above the cap, `AdaptiveRouter.route()` throws a fail-closed
    `RoutingError('budget-exhausted')` **before** selecting a backend (an un-routed
    dispatch spends nothing). The dispatch boundary surfaces the unit once to a
    steward as `routing:budget-exhausted` and drives it terminal — no auto-retry into
    the same cap (mirrors the `privacy-no-match` terminal path). Raise `capUsd` via
    `PUT /api/v1/routing/policy` and re-queue to resume.
  - **Observability:** `RoutingBudgetStatus` gains an `exhausted` flag; `harness
routing status` shows an `EXHAUSTED` state once spend crosses the cap.

  Behavior change to note in release notes: existing `budget` policies that were
  only ever degrading one step will now force `fast` (or surface to a steward, for
  `human`) once spend reaches the cap. It remains a lagging cap under concurrency —
  not an admission gate.

- abbaa89: AMR operator observability. Adds a live routing status surface so operators
  running adaptive routing can see spend, degradation, and escalation — previously
  only routing _decisions_ were inspectable.
  - **`GET /api/v1/routing/status`** (`read-telemetry`) — the live operator view:
    whether AMR is active, budget **spend-vs-cap** (using the monotonic accumulator
    that actually drives the D8 clamp, not the telemetry ring sum), the coherence
    units that have climbed their escalation floor, and the active provider
    allowlist. Always 200; an inactive payload when AMR is off.
  - **`harness routing status`** — renders that payload (budget bar, `DEGRADING`
    flag, escalated-unit table, allowlist).
  - **`harness routing telemetry`** — renders the existing `/routing/telemetry`
    projection with a per-tier distribution and per-decision cost breakdown.

  New: `AdaptiveRouter.getStatus()`, `Orchestrator.getRoutingStatus()`,
  `EscalationState.climbedUnits()`, and the `RoutingStatus` / `RoutingBudgetStatus`
  / `RoutingEscalationUnit` types. Read-only; no dispatch behavior change.

- ea36b3c: AMR Phase 5 — orchestrator routing endpoints (closes the Shuttle mutual-deferral seam).

  Adds the harness side of the routing control-plane contract so the Shuttle SaaS
  control plane can push per-container policy and drain telemetry against a real
  orchestrator (was mock-only):
  - **`PUT /api/v1/routing/policy`** (`admin` scope) — Zod-validates a `RoutingPolicy`
    and hot-swaps the live `AdaptiveRouter` via `Orchestrator.ingestRoutingPolicy`,
    preserving accumulated `EscalationState` climbed floors across the update. An
    empty `{}` policy restores default-off. Returns 204.
  - **`GET /api/v1/routing/telemetry`** (`read-telemetry` scope) — projects the
    enriched routing-decision ring into the Shuttle wire shape
    (`{ decisions, spentUsd }`, `RoutingTelemetry`/`RoutingTelemetryDecision`),
    fixing the cross-repo `RoutingDecision` mismatch that would have drained zero rows.
  - **`RoutingPolicy.allowedProviders`** — new optional provider-type allowlist; wires
    the previously-dormant `selectCheapestQualifying` allowlist branch (fail-closed).

  Default-off is preserved: with no policy pushed, `adaptiveRouter` stays `null` and
  dispatch is byte-identical. All additive — existing routing/dispatch behavior is
  unchanged.

- d40e0a0: Make the AMR budget clamp (D8) live. `AdaptiveRouter` now keeps a monotonic
  spend accumulator — the sum of `estCostUsd` over every routing decision — and
  `route()` reads it before deriving a tier, so `deriveRequiredTier`'s budget
  clamp fires as spend accrues. Previously the router's `budgetState` was an
  un-wired `{ spentUsd: 0 }` stub, so a `routing.policy.budget` had no effect at all.

  This is a **soft degrade signal, not a hard ceiling**, and only affects
  orchestrators with a `budget` set (opt-in):
  - **Lagging under concurrency.** The clamp reads spend accrued from prior
    dispatches; a burst of concurrent dispatches can overshoot `capUsd` before the
    clamp engages. It nudges routing cheaper as spend climbs — it does not gate
    admission.
  - **Single-step degrade.** Budget pressure lowers the tier by exactly one step
    and never below the D5 blast-radius veto floor (a sensitive-path task stays
    `strong` regardless of overspend).
  - **Monotonic** (deliberately not the bounded `projectTelemetry` ring-sum) so a
    long run can't evict early spend and un-clamp. Persists across `setPolicy`, so
    lowering `capUsd` mid-run clamps immediately and irreversibly.

  With no budget the accumulator still advances but the clamp no-ops (routing
  unchanged). New `AdaptiveRouter.getSpentUsd()` returns the effective spend.

- 787e033: Complete split-routing (4b): real per-stage prompt rendering + prior-output
  threading. The workflow stage-execution engine previously passed each stage the
  bare **skill name** as its prompt and threaded nothing between stages (`priorOutputs`
  returned `{}`). Now:
  - Each stage gets a **rendered prompt** (the work item + the stage's skill/role +
    the outputs of prior stages) via a pure `PromptRenderer` bound in
    `buildWorkflowContext` (no layer-cycle). The engine falls back to the skill name
    only when no renderer is present (fake/legacy contexts), so behavior is
    byte-identical there.
  - Each stage's **final assistant message** is captured (from the runner's last
    `result` event, the same extraction the single-agent path uses) into a new
    `StageRun.output`, and threaded to later stages keyed by the stage's `produces`
    label (D4 **text**-artifact threading).

  File-artifact threading (`produces`/`expects` as workspace paths) remains a
  separate, deferred contract — the text channel covers the common case.

- 0c8e2ac: feat(split-routing): workflow stage-execution engine with per-stage AMR routing (AMR Phase 4b)

  Adds split-routing — a declarative multi-stage workflow engine that runs a
  coherence unit's stages sequentially on one worktree, routing each stage
  independently through Adaptive Model Routing — behind a **doubly-opt-in,
  default-off** gate. With no `>= 2`-stage workflow declared in `agent.workflows`
  _and_ no `routing.policy` set, `dispatchIssue` is **byte-identical** to the shipped
  single-agent path (SC4): `workflowFor` is a pure, side-effect-free matcher, so
  calling it on every dispatch cannot change non-workflow behavior.
  - **types**: additive `WorkflowStep` / `WorkflowExecutionPlan` / `StageRun`
    (per-stage `sessionId` + `tokens` for per-stage cost capture) and
    `StagedWorkflowDecl` / `WorkflowConfig.workflows` (the declarative producer with
    optional `match` grain and per-stage `stageDeadlineMs`). No existing type is
    widened.
  - **orchestrator**: the `executeWorkflow` engine (`execute-workflow.ts`) driving
    `AgentRunner.runSession` per stage with engine-owned per-stage
    session/recorder/abort/tokens; per-stage `route()` sharing one `coherenceUnit`
    with a **cumulative** `EscalationState` floor; separated failure mechanisms
    (retry cap-1 at a bumped tier, mid-workflow transport error = terminal without
    wiping completed-stage artifacts, per-stage deadline); an atomic single-exit
    lifecycle guaranteeing exactly one claim / lane entry / terminal transition per
    unit for every exit path (all-pass, stage terminal-fail, engine throw) with no
    orphaned `running`/`claimed` (SC5). Live dispatch enters the engine only when a
    `>= 2`-stage workflow matches and a `routing.policy` is present; `workflowFor` is
    the single match authority (returns the plan plus the matched decl's
    `stageDeadlineMs`). `AdaptiveRouter` / `BackendRouter` remain byte-unchanged (SC8).

  Per-stage prompt rendering and D4 `produces → expects` artifact-context threading
  are **stubbed** in this phase — `runStageSession` passes the bare `step.skill` as
  the prompt and `priorOutputs` returns `{}`, so stages currently operate off the
  shared worktree file-state with a skill-name prompt. Real per-stage `PromptRenderer`
  invocation + structured output threading, plus parallel stages, stage-local
  retry-in-place, partial-resume, and rich auto-producers are follow-ups — see
  `docs/changes/split-routing/proposal.md` "Deferred follow-ups". No behavior changes
  for existing single-agent or single-stage configs.

### Patch Changes

- ede964d: Reduce cyclomatic complexity across dashboard pages/components, local-models,
  orchestrator, and cli hooks via behavior-preserving extraction. No public API,
  CLI contract, or runtime behavior changes; security-sensitive sentinel hooks
  verified byte-identical in their detection rules. Resolves 18 baselined
  architecture complexity violations and clears three new complexity regressions.
- ee1f44a: Fix a persistent SEC-INJ-001 false positive that reddened the `harness` CI check
  on `main` and every branch off it. The security scanner's `eval/Function`
  pattern (`/\beval\s*\(/`) matched the prose substring `eval (` in a code comment
  (`execute-workflow.ts`: "Phase 3 gate eval (SC6-c)"), flagging it as
  error-severity arbitrary-code-execution. Reworded the comment to "gate
  evaluation" — no behavior change; the security check now passes cleanly.
- Updated dependencies [681e173]
- Updated dependencies [f004f04]
- Updated dependencies [d8df71d]
- Updated dependencies [ec649e6]
- Updated dependencies [abbaa89]
- Updated dependencies [ea36b3c]
- Updated dependencies [ede964d]
- Updated dependencies [787e033]
- Updated dependencies [0c8e2ac]
  - @harness-engineering/intelligence@0.6.0
  - @harness-engineering/types@0.21.0
  - @harness-engineering/core@0.36.0
  - @harness-engineering/local-models@0.5.1
  - @harness-engineering/graph@0.11.7

## 0.12.0

### Minor Changes

- db24d89: fix(lmlm): async model install with WebSocket download progress

  Operator model install (`POST /api/v1/local-models/pool/install`) now returns
  `202 { disposition: 'installing' }` as soon as the pull is accepted and streams
  byte-level download progress plus the terminal outcome over a new
  `local-models:install` WebSocket topic, instead of blocking the HTTP response for
  the entire `ollama pull`.

  This fixes the `502 Orchestrator proxy error: fetch failed (cause: Headers Timeout
Error)` that a multi-GB pull triggered — the dashboard reverse-proxy's undici
  `headersTimeout` (~5 min) fired because no response headers were sent until the
  pull completed. The Recommendations panel now renders a live download progress bar
  and surfaces retryable install errors.

  Approving an `add`/`swap` model **proposal** (`POST /api/v1/proposals/:id/approve`)
  also installs the target, so it shares the same async treatment: it returns `202`
  and streams the download over `local-models:install`, and the Pending Proposals row
  shows the same progress bar instead of hanging the Approve button until the proxy
  times out. (`evict` approvals and rejects stay synchronous.)

  The Recommendations panel also gains a **Refresh** button that triggers a
  force-refresh tick (`POST /api/v1/local-models/refresh`) to recompute
  recommendations on demand and refetch the panel.

  Fixes a refresh-tick ordering bug where the pool was diffed against the ranking
  **before** the re-ranked scores were written back. A freshly-installed member
  enters the pool at `currentScore: 0` until its first re-rank, so diffing first
  produced phantom swap proposals justified as "replace a pool member scoring 0"
  (and inflated `scoreDelta`s). The tick now re-scores the pool before diffing.

- eb8435f: fix(lmlm): resilient model installs — resumable pulls, restart recovery, and lineage scoring

  Three follow-ups to the async operator install (#775):
  - **Resumable pulls.** `OllamaInstallAdapter` gains opt-in retry-with-resume
    (`maxPullRetries` / `pullRetryBackoffMs` / `pullRetryMaxBackoffMs`; the
    orchestrator enables 5). A multi-GB `ollama pull` that loses its `/api/pull`
    stream mid-download — most often the host sleeping mid-install — re-issues the
    pull (ollama resumes from cached blobs) instead of dead-ending in an error. The
    budget counts consecutive non-progressing attempts, so any forward byte progress
    resets it; a canceled request or a missing model still fails fast.
  - **Restart recovery.** A model add/swap approval marks its proposal `installing`
    (new `ModelProposalStatus`) for the duration of the pull. If the orchestrator
    restarts mid-download, startup finds the `installing` proposals and re-drives them
    — `onApproveModelProposal` is idempotent, so ollama resumes the pull (or no-ops if
    it already finished) and progress streams to a reconnecting dashboard. The status
    reverts to `open` on a retryable failure, and the approve route rejects a
    re-approve while `installing`.
  - **Lineage score interpolation.** A candidate with no direct benchmark used to
    floor to `score: 0` while labelled `evidence: 'interpolated'` (a misnomer), so real
    models like `Qwen/Qwen3-8B-GGUF` showed "score 0 · interpolated" and churned the
    pool once installed. The ranker now infers a score from same-series siblings by
    parameter count (linear in size, clamped to the measured range, dampened by `'low'`
    benchmark confidence so it never outranks a direct measurement); only a series with
    no measured sibling still scores 0.

- 134b055: feat(lmlm): live HuggingFace candidate discovery on startup + Refresh button

  The recommendation candidate list was a bundled, human-curated `candidates.json`
  imported statically at build. The orchestrator now refreshes it **live from
  HuggingFace** — on startup (in the background, non-blocking) and on the operator's
  **Refresh** button — while keeping the frozen list as the offline-safe fallback.
  - New `discoverCandidates()` in `@harness-engineering/local-models` composes the
    existing HF client + GGUF parser and **merges the curated `ollamaName`/`family`
    tags** from the frozen snapshot back in — the HF API doesn't carry them, and a
    candidate without an `ollamaName` isn't installable, so an un-mappable model is
    dropped rather than surfaced as a broken row.
  - The orchestrator seeds the recommender from the frozen list immediately, then
    swaps in live results when discovery returns; `POST /api/v1/local-models/candidates/refresh`
    re-discovers + re-seeds + re-ranks on demand. Fail-closed: any HF error or empty
    result keeps the current candidates.
  - The dashboard **Refresh** button now triggers the live refresh (one button = "get
    the latest").
  - Discovery defaults to a no-op on the `Orchestrator` (so tests make no network
    calls); the CLI's `orchestrator run` wires the real implementation.

  Delivers the `lmlm-live-hf-candidate-discovery` roadmap item. Note: discovery
  refreshes/ranks the **curated** model set — onboarding a brand-new installable
  model still needs its `ollamaName` mapping added (a deliberate curation boundary).

- caf3d70: feat(lmlm): wire pi (LM Studio) backend into runtime feedback + warming

  The pool-consumption work landed runtime feedback (LRU `lastUsedAt` + circuit
  breaker) and model warming for the `local` (Ollama) backend only; the `pi`
  (LM Studio / OpenAI-compatible) backend had freshness but not these. This closes
  the gap so both backends behave identically:
  - `PiBackend` gains `onModelUsed` / `onModelFailed` seams, fired best-effort with
    the session's resolved model on turn success / failure (or timeout). The
    orchestrator's existing `getModelUsageHooksFor` binding now flows to `pi`, so a
    completed pi turn stamps `lastUsedAt` and clears the resolver's circuit breaker,
    and a failed pi turn feeds the breaker.
  - Warming now covers `pi` via `defaultWarmModelViaCompletion` — a 1-token chat
    completion that JIT-loads the model, since LM Studio has no `keep_alive`
    primitive. `local` keeps using Ollama's native `keep_alive`.

  Both hooks are best-effort (a throwing hook never breaks a turn) and only fire
  when a model name is resolved.

- be3c714: feat(lmlm): consume pooled models freshly — event-driven refresh, live analysis model, score-seed, runtime feedback, task-aware selection, warming

  The pool install side was fast, but consumption was pull-based and static: a
  newly installed model wasn't used by agents for up to a poll cycle and by the
  analysis pipeline never (until restart), a fresh entry sat at `currentScore: 0`,
  runtime outcomes didn't feed back, and selection ignored the ranker's per-task
  profiles. This wires the pool through to inference.
  - **Freshness loop** — `LocalModelResolver.refresh()` debounce-re-probes on a
    `local-models:pool` mutation, so an install/swap is resolvable in seconds. The
    analysis provider reads its model live per request (`getModel` seam) instead of
    snapshotting once at construction, unless the operator pinned a layer model.
  - **Score-seed** — an installed pool entry seeds `currentScore` from its ranked
    score rather than `0`, so an explicitly-installed model isn't buried until the
    next re-rank.
  - **Runtime feedback** — `lastUsedAt` is stamped on real inference; a model that
    fails N consecutive inferences is deprioritized until it recovers.
  - **Task-aware selection** — per-profile pool scoring (general/coding/reasoning)
    routes each use-case to its best-fit pooled model, degrading to composite score
    when the benchmark snapshot lacks profile tags.
  - **Warming** — the resolver best-effort warms a newly selected model
    (`keep_alive`) so the next dispatch isn't a cold start.

  See `docs/changes/lmlm-pool-consumption/proposal.md` and the task-aware selection
  ADR under `docs/knowledge/decisions/`.

### Patch Changes

- Updated dependencies [7527285]
- Updated dependencies [db24d89]
- Updated dependencies [f3a4d31]
- Updated dependencies [eb8435f]
- Updated dependencies [134b055]
- Updated dependencies [f3a4d31]
- Updated dependencies [be3c714]
  - @harness-engineering/core@0.35.0
  - @harness-engineering/local-models@0.5.0
  - @harness-engineering/types@0.20.0
  - @harness-engineering/intelligence@0.5.0
  - @harness-engineering/graph@0.11.6

## 0.11.2

### Patch Changes

- d0ccf48: fix(lmlm): estimate on-disk size for operator install instead of a pre-pull inspect

  The Recommendations "Install" action 404'd on every model with a misleading "no longer available on HuggingFace" error. The route built the install proposal with `diskImpactGb: 0`, which drove the pool to resolve the on-disk size via `installer.inspect` (ollama `/api/show`) — a call that only succeeds for models already pulled locally, so a fresh install target always 404'd into `failed_target_missing` before the download began. The route now sizes the proposal via `estimateDiskGb` from the matched candidate (params + quant), matching the automated proposal engine, so the install proceeds to the pull.

## 0.11.1

### Patch Changes

- d4c77d6: security: remediate open Dependabot advisories
  - dashboard: bump `react-router` to `^7.15.1` (fixes HIGH RCE via vendored turbo-stream and `__manifest` DoS) and `vite` to `^6.4.3`.
  - orchestrator: bump `liquidjs` to `^10.26.0` (fixes CRITICAL RCE) and `@earendil-works/pi-coding-agent` to `^0.79.0` (fixes HIGH local privilege escalation).
  - Root `pnpm.overrides` sweep the remaining transitive advisories (undici, hono, qs, shell-quote, tmp, js-yaml, brace-expansion, protobufjs, @babel/core, uuid, vite@6, @grpc/grpc-js); dev-only, vitepress-pinned residuals are recorded in `auditExceptions`.

## 0.11.0

### Minor Changes

- bae23ad: feat(lmlm): install & remove models directly from the dashboard panel

  Adds operator-initiated pool mutation to the LMLM dashboard — an **Install**
  action on Recommendations rows and a **Remove** action on Pool-card members — so
  the operator no longer has to hand-edit config or use the CLI.
  - **Backend:** two convenience routes, `POST /api/v1/local-models/pool/install`
    and `POST /api/v1/local-models/pool/remove`, gated by the same
    `manage-proposals` scope as approve/reject. Both are modeled as user-initiated
    **auto-approved model proposals**, reusing the existing `onApproveModelProposal`
    core — so the pool guards (`not_allowed`/`budget_exceeded` → `409`), the
    in-use evict-deferral (`202 deferred`), and the audit trail all apply, and
    proposals remain the single pool-mutation channel (ADR 0011).
  - **Dashboard:** an Install button per recommendation (an already-pooled model
    shows "installed"), a Remove button per pool member (with a "removes after the
    current run" note when the model is in use). Byte-level pull progress over WS
    is a deferred enhancement; install shows an indeterminate "Installing…" state.
  - **Types:** `PoolInstallRequest`, `PoolRemoveRequest`, `PoolMutationDisposition`,
    `PoolMutationResult`.

- a9c8994: feat(lmlm): wire pool bounds seed + candidate source so the Local Models cards populate

  Completes the two deferred wiring gaps that left the dashboard's Pool and
  Recommendations cards permanently empty when LMLM is enabled.
  - **Pool bounds seed (Phase 1):** the orchestrator now applies the operator's
    configured `localModels.pool` bounds (disk budget + org/family allowlist) to
    the pool store on startup, after `PoolStateStore.load()` so declarative config
    wins over stale persisted bounds. Previously `PoolManager.configurePool()` had
    no caller and the pool defaulted to `diskBudgetGb: 0`, blocking every install.
  - **Candidate source (Phase 2):** a new `candidates` module in
    `@harness-engineering/local-models` — a GGUF→`RankerCandidate` parser, a
    bundled human-curated frozen candidate snapshot (offline-safe, deterministic),
    and an allowlist-aware selector — feeds the recommender, which was previously
    constructed with an empty candidate list. Live HuggingFace discovery runs in a
    new on-demand `scripts/refresh-model-candidates.mjs` generator (fail-closed),
    never in CI.
  - **Recommendations card formatting:** VRAM and tok/s render to one decimal and
    scores as whole numbers, instead of leaking full float precision (e.g.
    `44.15923222899437 GB` → `44.2 GB`).

### Patch Changes

- Updated dependencies [bae23ad]
- Updated dependencies [a9c8994]
- Updated dependencies [cfc06d2]
  - @harness-engineering/types@0.19.0
  - @harness-engineering/local-models@0.4.0
  - @harness-engineering/core@0.34.1
  - @harness-engineering/graph@0.11.5
  - @harness-engineering/intelligence@0.4.3

## 0.10.0

### Minor Changes

- 965cfd3: Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
  manager + Ollama installer in the new `@harness-engineering/local-models`
  package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
  backward-compatible on read) in types + the shared proposal store in core;
  background refresh scheduler with silent drift reconciliation, the
  `/api/v1/local-models/*` read routes, kind-aware approve/reject, and
  `local-models:{pool,proposal}` WS topics in the orchestrator; and the
  `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
  CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.

### Patch Changes

- Updated dependencies [965cfd3]
  - @harness-engineering/local-models@0.3.0
  - @harness-engineering/types@0.18.0
  - @harness-engineering/core@0.34.0
  - @harness-engineering/graph@0.11.4
  - @harness-engineering/intelligence@0.4.2

## 0.9.2

### Patch Changes

- Updated dependencies [fc0220f]
- Updated dependencies [3d772e9]
  - @harness-engineering/core@0.33.0
  - @harness-engineering/types@0.17.0
  - @harness-engineering/graph@0.11.3
  - @harness-engineering/intelligence@0.4.1

## 0.9.1

### Patch Changes

- Updated dependencies [abcd026]
- Updated dependencies [52a2410]
- Updated dependencies [0c3d8ed]
  - @harness-engineering/core@0.32.1

## 0.9.0

### Minor Changes

- 854b142: Event-sourced state model with a deterministic reducer (#598).

  Replaces the mutated `.harness/state.json` with an append-only event log
  (`state.events.jsonl`) + a deterministic reducer composed of pure projections
  (`coreState` / `lanes` / `audit`) + a materialized snapshot (`state.snapshot.json`).
  Concurrent writers append lock-free with a collision-free `(seq, writerId)` total
  order, eliminating the last-write-wins clobbering of the previous read-modify-write
  model. Legacy `state.json` is migrated via a one-time `state_imported` genesis event.

  Adds an explicit guarded lane state machine for orchestrator/autopilot task lanes
  (`planned → claimed → in_progress → in_review → done`, plus `blocked`/`canceled`)
  with dependency, evidence-for-terminal, and forced-transition guards; the
  orchestrator persists lane transitions durably via the core log.

  Subsumes the Append-Only Session Audit Trail (GH-580): verbatim user input and
  approval prompt/response pairs are captured as audit events. The born-deduplicated
  `events.jsonl` is retired — the observability timeline now derives from the audit
  projection, and skill-lifecycle telemetry is relocated to
  `.harness/metrics/skill-events.jsonl`.

  BREAKING (internal): the deprecated `saveState`/`loadState` exports are removed;
  all state reads/writes now flow through the event-sourced store.

- 4df8934: Add an on-demand maintenance pipeline: `harness maintenance run [taskId...]` and the `/harness:maintenance-pipeline` skill.

  The command runs the maintenance that is actually **overdue** (computed from each task's cron schedule + `history.json`) in a **report-first**, infra-free sweep — no orchestrator, gateway, or `ClaimManager` required. `--all`/`--only`/`--skip` scope selection, `--json` emits a consolidated `ConsolidatedReport` (also written to `.harness/maintenance/last-run-summary.json`), and exit codes are CI-friendly (`0` completed, `1` a task failed to execute, `2` invalid invocation).

  Built on a single shared executor: a `mode: 'report' | 'fix'` parameter on `TaskRunner` (default `fix` leaves cron unchanged), a `selectTasks` overdue/eligibility selector with an `excludeFromHumanSweep` flag on task definitions, and a shared `runHarnessCheck` core used by both the CLI and the cron scheduler. `--fix` dispatches the real maintenance agent dispatcher when an `agent.backends` backend is configured, and skips honestly otherwise.

  This work also corrected pre-existing bugs that affected the cron scheduler too: maintenance check commands now resolve through the harness binary (previously ENOENT), check-execution failures are reported as `failure` instead of being masked as `success`, and two misconfigured built-in checks (`cross-check`, `stale-constraints`) gained real read-only CLI subcommands. ADRs 0049 (one executor, two callers) and 0050 (report-first on-demand) document the design.

- 863df8f: Phase 4 of the roadmap shard store: route every roadmap writer and content
  reader through `RoadmapStore`.

  In sharded mode (`docs/roadmap.d/` present) each logical mutation now rewrites
  exactly one shard file (conflict-free by construction) and regenerates the
  aggregate; in monolith mode the on-disk `docs/roadmap.md` is byte-for-byte
  unchanged. Every writer captures `before = structuredClone(roadmap)` and
  persists via `applyRoadmapDiff(store, before, after)`, so only the rows that
  actually changed are written.

  Migrated onto the store:
  - `manage_roadmap` (add / update / remove / promote / sync / groom) and the
    show/query readers, preserving the unblock-only cascade, async external sync,
    and first-claim-wins refusal.
  - `autoSyncRoadmap` and `sync-engine` `fullSync` (now takes a project root) with
    per-shard writeback; the assignee-lifecycle invariant holds on every write.
  - Content readers: `prediction-engine`, `publish-analyses`, `sync-analyses`.
  - Dashboard roadmap reader (`gather/roadmap`) and content writers
    (`routes/actions` claim + status).
  - Orchestrator roadmap writers (`/api/roadmap/append` and the
    `RoadmapTrackerAdapter` claim / release / mark-complete), preserving
    compare-and-set, idempotency, and the RMH005 assignee invariant.

  Behavioral note — prediction engine: routing the roadmap read through the store
  also corrected the path it reads from (`<root>/roadmap.md` →
  `<root>/docs/roadmap.md`). Previously `computeSpecImpacts` always failed to load
  and returned no impacts, so spec-impact adjustments were effectively dead; the
  engine now folds spec impacts into the adjusted forecasts (and warning
  severities) as originally designed.

  New core APIs: `RoadmapStore.removeFeature`, `resolveRoadmapStore` /
  `resolveRoadmapStoreForFile` (mode-detection factories), `applyRoadmapDiff`,
  `roadmapAggregatePath`, and a node-fs roadmap IO adapter.

  The read-source guard (invariant R) is tightened to also catch DYNAMIC-path
  readers/writers — code that threads a `roadmapPath`/`roadmapFile` variable into a
  raw filesystem read/write rather than spelling the `roadmap.md` literal — and its
  allowlist has shrunk to its permanent floor (store + regenerator + factory, the
  git/merge tooling, and non-content path references).

### Patch Changes

- 97b55db: Add a real `LinearGraphQLClient`, replacing the `LinearGraphQLStub` that only `console.log`ged the query and returned an empty object. The client POSTs the operation to Linear's GraphQL endpoint (`https://api.linear.app/graphql`, overridable) with the API key in the `Authorization` header, and normalizes all three failure modes — transport throw, non-2xx HTTP (with a truncated body), and a GraphQL `errors` array — into a single `Err`, returning `Ok(data)` on success. `fetch` is injectable for testing. `LinearGraphQLStub` is retained but `@deprecated`.

  Scope note: this is the authenticated GraphQL transport. Wiring a full `linear` tracker _kind_ (mapping Linear issues to `TrackedFeature` and implementing the tracker-client interface) is a larger follow-up that builds on this client.

- 924490c: Wire the maintenance `AgentDispatcher` to a real agent session. It was a stub that only logged "skill dispatch integration pending" and returned `{ producedCommits: false, fixed: 0 }`, so agent/skill-based maintenance tasks silently did nothing while the check/command runners worked.

  A new `createAgentDispatcher` (extracted to `maintenance/agent-dispatcher.ts` for unit-testability) resolves the named backend from `agent.backends` via `createBackend`, drives a multi-turn `AgentRunner` session over the skill prompt in the worktree, and measures the outcome by diffing `HEAD` before/after — commit count (`git rev-list --count`), not the agent's self-report, is the source of truth for `fixed`/`producedCommits`. An unknown/unconfigured backend name degrades to a logged no-op instead of crashing the scheduler.

- 4790454: Extract a shared `makeBackendResolver` helper (orchestrator package) used by both the CLI's `harness maintenance run --fix` backend resolution and the orchestrator's `createMaintenanceTaskRunner`, removing the duplicated `name → createBackend(def) | null` resolve logic that could drift. Behavior is unchanged.
- 757bfac: Implement `Last-Event-ID` reconnection for the `GET /api/v1/events` SSE stream, which was deferred ("clients lose events across reconnects"). Previously each frame carried a _random_ `id`, so a reconnecting client's `Last-Event-ID` pointed at nothing replayable.

  A per-bus `SseEventLog` is now the single subscriber to the event bus: it stamps every event with a monotonic, gap-free sequence id, keeps the most recent events in a bounded in-memory ring buffer (default 1024), and fans them out to connected streams. A client that reconnects with `Last-Event-ID: <seq>` (browser `EventSource` sends this automatically) replays every buffered event strictly after that id — with no gap and no duplicate — before live delivery resumes. A non-numeric/absent `Last-Event-ID` (e.g. a legacy client) resumes live with no replay. The buffer is in-memory and bounded, so a server restart or an outage longer than the buffer simply resumes live from the next event, exactly like a first-time connection; the wire contract is unchanged so a durable store can replace the ring buffer later.

- Updated dependencies [854b142]
- Updated dependencies [d80871f]
- Updated dependencies [09524aa]
- Updated dependencies [c68b780]
- Updated dependencies [4df8934]
- Updated dependencies [645f21e]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
  - @harness-engineering/core@0.32.0
  - @harness-engineering/intelligence@0.4.0
  - @harness-engineering/types@0.16.2
  - @harness-engineering/graph@0.11.2

## 0.8.4

### Patch Changes

- 32bc061: feat(roadmap): assignee means "who is executing" — set at execution, not selection

  Establish the invariant **`assignee ≠ null ⟺ status == in-progress`**, owned by a
  single core authority (`packages/core/src/roadmap/assignee-lifecycle.ts`), so the
  roadmap assignee always names the _current executor_ (human or machine) and never a
  future-intended owner.
  - **New core authority** exports `isMachineAssignee`, `assigneeInvariantHolds`,
    `isClaimableBy`, `claim` (compare-and-set, first-claim-wins), `release`, and
    `setStatus` (auto-clears the assignee on any transition away from in-progress).
  - **roadmap-pilot** no longer writes the assignee at selection; **harness-execution**
    claims at execution start (stopping cleanly when identity is unresolvable). This fixes
    the orchestrator silently skipping pilot-touched items.
  - **Machine claims never use the GitHub assignee field**: outbound sync drops the
    authenticated-user launder, inbound sync never clobbers a live `orchestrator-*` claim.
    The dead `getAuthenticatedUser` path is removed.
  - **Enforcement:** new health rule **RMH005** fails `harness validate` on any
    non-in-progress row carrying an assignee; `groom` auto-clears such rows.
  - The orchestrator completion path and inbound status sync now route status changes
    through `setStatus()`, so a completed/synced row releases its machine claim instead of
    leaving an invariant-violating `done`+`orchestrator-*` row. `manage_roadmap update`
    surfaces a refused claim explicitly (`claimed: false`, `isError`) under first-claim-wins.

  See ADR-0045 (`docs/knowledge/decisions/0045-assignee-is-an-execution-claim.md`).

- e16d5fa: fix(orchestrator): batch open-PR checks to avoid exhausting GitHub's API rate limit

  `filterCandidatesWithOpenPRs` issued one `gh pr list --search "closes #N"` query
  per candidate on every tick. Every `gh pr list` form is served by GitHub's GraphQL
  API and draws from the shared ~5000/hr budget, so the per-issue fan-out exhausted
  the limit on busy boards. Once exhausted, every check threw, the fail-open path
  passed all candidates through, and PR-guarded issues were redispatched (duplicate
  work).

  Checks are now batched: one `gh pr list --repo X --state open --json body` call
  per distinct repo (via `fetchOpenPRClosures`), with closing-issue references parsed
  locally — collapsing N requests/tick into one per repo. Identifier-only candidates
  keep the per-candidate `--head` lookup; non-GitHub externalId candidates now
  correctly fall back to branch lookup instead of always passing through. Fail-open
  behavior is preserved.

- Updated dependencies [32bc061]
  - @harness-engineering/core@0.31.0

## 0.8.3

### Patch Changes

- 8e8e7c1: fix(orchestrator): seed brainstorm handoff artifacts into fresh worktrees

  New worktrees are checked out from a committed remote ref (e.g. `origin/main`),
  so they did not inherit the uncommitted artifacts of the brainstorm →
  orchestrator handoff — the proposal under `.harness/proposals/` and the promoted
  row in `docs/roadmap.md`. A dispatched agent saw the roadmap entry (the tracker
  reads the live working tree) but could not find its proposal and stalled.

  `WorkspaceManager.ensureWorkspace` now seeds those paths from the root working
  tree into each fresh worktree (best-effort: missing sources skipped, copy
  failures swallowed). Seed paths default to `['.harness/proposals',
'docs/roadmap.md']`, are overridable via the new `WorkspaceConfig.seedPaths`,
  and the orchestrator derives the roadmap entry from the configured tracker
  `filePath` so a non-default roadmap location is still carried over.

- Updated dependencies [8e8e7c1]
  - @harness-engineering/types@0.16.1
  - @harness-engineering/core@0.30.1
  - @harness-engineering/graph@0.11.1
  - @harness-engineering/intelligence@0.3.1

## 0.8.2

### Patch Changes

- a6f7cd3: Migrate Gemini backend from the deprecated `@google/generative-ai@0.24.1` to `@google/genai@^2.0.4`. Upstream stopped publishing the old package. Public API of `GeminiBackend` is unchanged. Wraps the new `chunk.text` getter in a per-chunk try (the new SDK throws on non-text chunks like function calls), preserves accumulated token counters in the error path, and adds an empty-key guard to `healthCheck` to match `startSession`.
- Updated dependencies [8128981]
- Updated dependencies [9bbf0a3]
- Updated dependencies [d11e2e6]
- Updated dependencies [07c399b]
- Updated dependencies [4b2f910]
- Updated dependencies [f5ec94d]
- Updated dependencies [ca706f5]
  - @harness-engineering/core@0.30.0
  - @harness-engineering/intelligence@0.3.0

## 0.8.1

### Patch Changes

- 1cc843b: Fix HTTP 403 on `POST /api/chat`. Commit 261c4afc (2026-05-14) flipped the orchestrator scope check from default-permit to default-deny, but `/api/chat` was never added to `requiredScopeForRoute` — every chat request, including admin in unauth-dev mode, was hitting the unmapped-route 403 branch and breaking the dashboard "Discuss the escalation…" panel. Maps `/api/chat` (and the rewrite target `/api/chat-proxy`) to `trigger-job`, and broadens the chat-proxy handler URL match to accept both names so the `/api/v1/chat-proxy` alias no longer falls through to 404. Includes regression tests in `scopes.test.ts` covering both paths.
- ee2f6a0: Close stall-detector gap for zero-event agents.

  The stall detector in `asyncTick` short-circuited when `session?.lastTimestamp` was null, with the comment "still initializing." This left no upper bound on initialization: any dispatched agent that emits zero session events (silent crash, broken backend stream, hung subprocess before first stdout) sat in `state.running` indefinitely. Over a long-running orchestrator process these zero-event entries accumulated until `running.size >= maxConcurrentAgents`, at which point `canDispatch` silently returned false for every new candidate and the roadmap appeared to be ignored. Restart wiped the in-memory map and dispatch resumed — matching the user-observed "restart fixes it" workaround.

  Extracts detection into a pure `detectStalledIssues` helper that falls back to `entry.startedAt` when `session.lastTimestamp` is null. Zero-event agents now stall-detect after `stallTimeoutMs` since dispatch and follow the existing retry/escalate path that removes them from `running`.

- Updated dependencies [c17ad8b]
- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [7353b60]
- Updated dependencies [318b878]
- Updated dependencies [af56053]
- Updated dependencies [aaefe1b]
  - @harness-engineering/core@0.29.0
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0
  - @harness-engineering/intelligence@0.2.7

## 0.8.0

### Minor Changes

- 1fd39a6: Re-export workflow Zod schemas (`BackendDefSchema`, `RoutingConfigSchema`, `RoutingValueSchema`) and local-model probe primitives (`defaultFetchModels`, `normalizeLocalModel`, `LocalModelResolver`, `LocalModelResolverOptions`, `ResolverLogger`) so the cli's unified craft LLM provider config and the craft skill family can validate `agent.backends` / `agent.routing` and resolve `/v1/models` against the same source of truth the orchestrator runtime uses. Additive API surface only.

### Patch Changes

- Updated dependencies [39bfd73]
  - @harness-engineering/core@0.28.2

## 0.7.0

### Minor Changes

- dcca2ce: Spec B (Granular Task→Backend Routing): per-skill + per-cognitive-mode routing axes with fallback chains, BackendRouter chain-walk emitting RoutingDecision records, config validator (hard error + warn semantics), dispatch-site wiring with `HARNESS_BACKEND_OVERRIDE` env hint, RoutingDecisionBus with bounded ring buffer, 3 HTTP routes + WS topic `routing:decision`, `harness routing {config,trace,decisions}` CLI + `harness skill run --backend`, dashboard `/routing` panel (4 cards + WS + polling fallback), 5 ADRs (0029-0033). RoutingValue schema widening is additive/non-breaking (scalar form preserves byte-identical pre-Spec-B behavior).

### Patch Changes

- bbc164f: Make harness skills and personas discoverable in Codex CLI, and fix a long-standing scanner false-positive flood.

  **@harness-engineering/cli** (minor): the Codex slash-command adapter now writes to `~/.codex/skills/<name>/SKILL.md` with the YAML frontmatter Codex's skill discovery requires; all 50 harness skills are reachable via `$harness-debugging`, `/skills`, and auto-trigger. The agent-definitions adapter emits real Codex subagent TOMLs at `~/.codex/agents/<name>.toml` (12 personas) so they appear in `/agent`. Both surfaces previously wrote dead files Codex ignored.

  **@harness-engineering/core** (patch): `SecurityScanner` now honors `// harness-ignore SEC-XXX: justification` on the line above the flagged code, matching the convention already in use across the repo. Previously only same-line annotations were recognized, so every prior-line annotation silently re-fired the suppressed rule.

  **@harness-engineering/orchestrator** / **@harness-engineering/dashboard** (patch): annotate the previously-flagged `JSON.parse` and `writeFile` sites with the explanatory `// harness-ignore` comments the scanner now reads correctly. No runtime behavior change.

  Also includes an infra fix to `.husky/pre-push` so nvm's Node takes precedence over Homebrew's on PATH (otherwise `better-sqlite3` fails to load under a newer Homebrew Node and blocks every push).

- 16048ad: Bump protobufjs to ^7.6.1, fast-xml-parser to >=5.7.0, ip-address to >=10.1.1 (and other transitive CVE fixes) via `pnpm.overrides` in root package.json.

  Clears 4 high CVEs (all protobufjs code-injection/prototype-pollution/DoS — vulnerable <=7.5.5) and several moderate CVEs that the existing `pnpm-workspace.yaml` `overrides:` block was failing to enforce — pnpm 8.x reads `pnpm.overrides` in `package.json` but ignores the same key in workspace.yaml.

  Direct dependency bumps surfaced by the pin: `vite ^6.3.0 -> ^6.4.2` in dashboard, `ws ^8.20.0 -> ^8.21.0` in orchestrator. Both are patch-level upstream fixes (path traversal, uninitialized memory disclosure).

  Updates `auditExceptions` to remove the 8 protobufjs entries that were documented as "blocked by @google/genai → protobufjs ^7.5.4 pin" — the actual constraint is `^7.5.4` (i.e., `>=7.5.4 <8.0.0`), which permits 7.6.1. The rationale was stale. Orchestrator and intelligence test suites pass under protobufjs 7.6.1; @google/genai@1.50.1 has no observable break.

  Audit summary: 19 advisories (4 high, 14 moderate, 1 low) -> 7 advisories (0 high, 6 moderate, 1 low). Remaining moderates are all transitive via vitepress (vite ^5 pin), turbo 2.9.6, or deep transitives (brace-expansion, uuid, qs) — separate effort if pursued.

- Updated dependencies [d1c9bda]
- Updated dependencies [bbc164f]
- Updated dependencies [573c23b]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/core@0.28.1
  - @harness-engineering/types@0.15.0
  - @harness-engineering/intelligence@0.2.6

## 0.6.1

### Patch Changes

- bce809f: Stop the file-backed roadmap orchestrator from claiming roadmap items already
  assigned to another developer or another orchestrator. `selectCandidates`
  now accepts an optional `selfAssignee` and skips items whose `assignee` is a
  third party. `RoadmapTrackerAdapter.claimIssue` no-ops the write when a
  third party currently holds the assignee, so the existing
  `ClaimManager.claimAndVerify` verify step reads back the unchanged file and
  returns `'rejected'` instead of silently overwriting the assignment.

## 0.6.0

### Minor Changes

- 4aa241f: Hermes Phase 2: Custom maintenance jobs + pre-launch OSV malware guard + disk hygiene

  Extends `MaintenanceScheduler` beyond the 21 built-in tasks with user-defined
  `customTasks` in `harness.orchestrator.md`. Adds a pre-launch OSV malware
  guard via `harness mcp-guard check`, and broadens `harness cleanup-sessions`
  into a per-target `.harness/` disk-hygiene sweep.

  **New surfaces:**
  - `CustomTaskDefinition` + `CheckScriptDefinition` + `OutputRetentionConfig` +
    `CleanupConfig` + `OsvGuardConfig` types (`@harness-engineering/types`).
  - `RunResult.origin: RunOrigin` discriminated provenance tag set by the
    scheduler / CLI / API / chain entry point.
  - `TaskOutputStore` persists per-run outputs to
    `.harness/maintenance/<task-id>/outputs/<iso>.json` with last-N + maxAgeDays
    retention. Default 50 runs / 30 days, overridable per-task.
  - `CheckScriptRunner` spawns arbitrary executables and parses a JSON status
    envelope (`{status, findings?, wakeAgent?, message?, outputs?}`) from the
    last non-empty stdout line.
  - `ContextResolver` injects `## Upstream context` (from `contextFrom`) and
    `## Reference skills` (from `inlineSkills`) into the agent prompt, with a
    warn-then-truncate token budget.
  - `validateCustomTasks` runs at orchestrator boot: cycle detection across the
    merged `contextFrom` graph, per-type required-field checks, skill / script
    existence (when injected), kebab-case task IDs, no-collision with built-ins.
  - `createOsvClient` (`@harness-engineering/core`) — OSV.dev REST client with
    24h disk cache (`.harness/cache/osv/`), fail-open default, `strict` mode.
  - `harness mcp-guard check [--strict] [--json]` CLI subcommand. Exits 2 on any
    `MAL-*` advisory match against an `.mcp.json` `mcpServers` `npx`-launched
    package. Suitable as a `pre-mcp-launch` hook from host plugin manifests.
  - `harness mcp-guard cache clear` subcommand.
  - `harness cleanup-sessions --all` / `--include` / `--exclude` extension.
    Default no-flag behavior unchanged. Registered targets: `sessions` (24h),
    `cache` (7d), `maintenance` (30d), `dashboard-state` (14d), `snapshots`
    (14d), `analyzer-output` (7d).
  - `harness maintenance list` / `harness maintenance show <task-id>` CLI
    subcommands.

  **Backwards compatibility:** All 21 built-in tasks run through the legacy
  `CheckCommandRunner` + `CommandExecutor` paths unchanged. New fields on
  `TaskDefinition` / `RunResult` / `MaintenanceConfig` are optional. The
  `harness maintenance run <task-id>` CLI subcommand and `/api/v1/jobs/maintenance/{id}/*`
  routes are deferred to a follow-up that lands alongside the Phase 0 Gateway API.

  **Knowledge artifacts:**
  - ADR 0015 — Custom maintenance task model.
  - `docs/knowledge/orchestrator/custom-maintenance-jobs.md`.
  - `docs/knowledge/cli/pre-launch-osv-guard.md`.

- c3653ff: Hermes Phase 4: Skill proposal / refinement loop with provenance + soundness gate

  Agent-emitted skill proposals routed through a review queue gated by a
  mechanical soundness check before promotion to the catalog. Closes the
  K1 killer-adoption row from the Hermes adoption meta-spec.

  **New surfaces:**
  - MCP tool `emit_skill_proposal` (tier `standard`) — writes
    `.harness/proposals/<id>.json` and emits `proposal.created`. Emit is
    non-blocking; the soundness gate fires on approve, not on emit.
  - CLI `harness proposals list|show|approve|reject` for queue management
    plus one-shot `harness backfill-skill-provenance` migration that
    stamps `provenance: user-authored` on every pre-Phase-4 catalog skill.
  - Dashboard `/s/proposals` page with inline content, gate findings,
    approve / reject / edit / run-gate actions; reviewer-UX budget < 30s
    per proposal.
  - Seven gateway routes under `/api/v1/proposals/*` (list / get /
    run-gate / approve / reject / edit) — reads use `read-status`,
    mutations require the new `manage-proposals` scope (8th entry in
    `SCOPE_VOCABULARY` and `TokenScopeSchema`).
  - Three lifecycle events (`proposal.created` / `approved` / `rejected`)
    fan out via the Phase 0 webhook bus and Phase 3 notification sinks
    with envelope derivers.
  - Maintenance task `proposal-provenance-backfill` (housekeeping #4,
    Feb 31 cron so the loop never fires automatically).

  **Strict invariants:** `kind` ↔ content shape (new-skill ⇒
  skillYaml+skillMd; refinement ⇒ targetSkill+diff); gate freshness
  < 24h before promotion; refinement edits must diverge from git HEAD
  before approval stamps provenance; provenance enum is closed
  (`community | agent-proposed | user-authored`, expansion requires ADR
  amendment).

  **Skills-mode soundness review degradation:** v1 ships mechanical
  structural checks (kebab-case name, parseable skill.yaml, SKILL.md
  bounds, unified-diff well-formedness). The full
  `harness:soundness-review --mode skill` vocabulary is a follow-up spec;
  both implementations share the same finding shape so the swap is
  purely additive.

  **Test coverage:** 75 new tests across five packages (types schema 15,
  core store + usage 9, MCP tool 8, CLI subcommand 6 + backfill 6,
  orchestrator gate 6 + promote 7 + events 4 + routes 10, envelope
  derivers 4 new rows). Existing scopes test passes with the new
  vocabulary entry.

  ADRs: 0016 (workflow), 0017 (token scope). Knowledge nodes:
  `skill-proposals.md`, `skill-provenance.md`. Spec + plan at
  `docs/changes/hermes-phase-4-skill-proposals/`.

  **Incidental fix:** Replaces a fixed 150ms wait in
  `packages/orchestrator/src/server/webhooks-integration.test.ts` with a
  poll loop. The fixed wait flaked under coverage instrumentation and
  blocked the Phase 4 pre-push hook.

### Patch Changes

- c94bac8: Harden `harness update` against empty `npm view` responses and migrate to the renamed `@earendil-works/pi-coding-agent` SDK.
  - `getLatestVersionAsync` now rejects when `npm view <pkg> dist-tags.latest`
    returns empty stdout. Previously a transient registry hiccup rendered as
    `cli: v2.4.5 → v` in the update banner; now the package is silently
    skipped by the caller's `Promise.allSettled`.
  - `@mariozechner/pi-coding-agent@^0.73.1` → `@earendil-works/pi-coding-agent@^0.74.1`
    (the maintainer renamed the package family). Eliminates 4 of 6 npm
    deprecation warnings during `harness update`. The 2 remaining
    (`prebuild-install`, `node-domexception`) are transitives through
    `better-sqlite3` and `@google/genai` respectively — out of our control
    until upstream bumps.

  No behavior change beyond the deprecation cleanup.

- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/types@0.14.0
  - @harness-engineering/core@0.28.0
  - @harness-engineering/intelligence@0.2.5

## 0.5.0

### Minor Changes

- 3d6e340: Hermes Phase 1: Session Search + Insights

  Adds a SQLite FTS5 full-text index over `.harness/sessions/` and
  `.harness/archive/sessions/`, plus an LLM-generated retrospective summary
  written to `<archive>/llm-summary.md` when a session is archived, plus a
  composite `harness insights` aggregator covering health / entropy / decay /
  attention / impact.

  **New CLI:**
  - `harness search "<query>"` — FTS5 + BM25 over indexed session memory.
  - `harness insights` — composite project report.

  **New MCP tools:**
  - `search_sessions` (tier: core)
  - `summarize_session` (tier: standard — LLM-spend implication)
  - `insights_summary` (tier: core)

  **New config (optional, all defaults are sensible):**

  ```jsonc
  {
    "sessions": {
      "search": { "indexedFileKinds": [...], "maxIndexBytesPerFile": 262144 },
      "summary": { "enabled": true, "inputBudgetTokens": 16000, "timeoutMs": 60000 }
    }
  }
  ```

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; `archiveSession()`'s second argument is optional.

  Dashboard Search + Insights pages are deferred to follow-up roadmap item
  `hermes-phase-1.1-dashboard-ui`. See
  `docs/changes/hermes-phase-1-session-search/proposal.md` and the
  companion ADR
  `docs/knowledge/decisions/0013-hermes-phase-1-session-memory-architecture.md`.

- 2481e59: Hermes Phase 3: Multi-sink notifications + doctor hardening

  Generalizes `CINotifier` into a `NotificationSink` interface, ships Slack
  (incoming-webhook) as the first concrete in-tree adapter, adds a
  `wrap_response` envelope formatter for platform-shape delivery, and extends
  `harness doctor` with four content-aware checks (hook syntax, baseline
  freshness, session-taint corruption, live pings).

  **New surfaces:**
  - `NotificationSink` interface + `eventTypeMatches` glob matcher
    (`@harness-engineering/core`).
  - `wrapResponse(event)` envelope formatter with per-event-type handlers
    (`@harness-engineering/core`).
  - `SlackSink` and `CIGithubSink` adapters
    (`@harness-engineering/core`).
  - `SinkRegistry` + `wireNotificationSinks` orchestrator wiring
    (`@harness-engineering/orchestrator`).
  - New config block on `WorkflowConfig.notifications` with Zod schemas
    exposed from `@harness-engineering/types`.
  - `harness notifications test` CLI subcommand
    (`@harness-engineering/cli`).
  - `harness doctor` gains hook-syntax, baseline-freshness, session-taint,
    and `--live` ping checks.

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; orchestrator boot constructs the registry only when
  `notifications.sinks` is non-empty.

  See `docs/changes/hermes-phase-3-notifications/proposal.md` for the
  full design.

- 2602530: Hermes Phase 5 — Dispatch Hardening.
  - Adds `IsolationTier` (`'none' | 'container' | 'remote-sandbox'`) as the fourth routing axis on `BackendRouter`. Configs may declare `routing.isolation.{none,container,remote-sandbox}` and tasks may issue `{ kind: 'isolation', tier }` queries.
  - Adds two new backend types: `SshBackendDef` (key-based SSH agent dispatch) and `ServerlessBackendDef` with the first `'oci'` adapter (`OciServerlessBackend` — cold-starts OCI images via `docker`/`podman`).
  - Adds per-task cost ceiling: `TaskDefinition.costCeiling = { maxUsd, warnAtPct? }` with abort-on-exceed. `RunResult.costUsd` records cumulative spend. `CostCeilingMonitor` (singleton, telemetry-driven) emits `'abort'` at the turn boundary when cumulative cost exceeds the ceiling; the dispatched task fails with `error === 'cost_ceiling_exceeded'`.
  - ADRs `0013-dispatch-isolation-tier` and `0014-cost-ceiling-policy` document the decisions.
  - Knowledge docs added under `docs/knowledge/orchestrator/` for dispatch-isolation, cost-ceiling, backends-ssh, and backends-serverless.

  No breaking changes. All existing routing use cases (`tier`, `intelligence`, `maintenance`, `chat`) resolve identically; configs without `routing.isolation` fall through to `routing.default`. Tasks without `costCeiling` execute as before.

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0
  - @harness-engineering/core@0.27.0
  - @harness-engineering/intelligence@0.2.4

## 0.4.6

### Patch Changes

- Updated dependencies [2724dfe]
  - @harness-engineering/core@0.26.4

## 0.4.5

### Patch Changes

- Updated dependencies [1796528]
  - @harness-engineering/core@0.26.3

## 0.4.4

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0
  - @harness-engineering/core@0.26.2
  - @harness-engineering/intelligence@0.2.3

## 0.4.3

### Patch Changes

- Updated dependencies [7ae0561]
  - @harness-engineering/core@0.26.1

## 0.4.2

### Patch Changes

- Updated dependencies [bed30c4]
- Updated dependencies [56176cd]
  - @harness-engineering/core@0.26.0

## 0.4.1

### Patch Changes

- 38fa742: fix(dashboard,orchestrator): surface `err.cause` in proxy 502s and reject WHATWG bad ports at startup (#287)

  The dashboard proxy was returning opaque `Orchestrator proxy error: fetch failed` 502s for every request when the orchestrator listened on a port the WHATWG fetch spec marks as "bad" (e.g. `10080`, `6000`, `6666`). `curl` does not enforce the bad-ports list, so the port appeared reachable from the shell — turning a one-line config fix into a multi-hour goose chase (see issue #287).

  **`@harness-engineering/core`:**
  - New `shared/port.ts` exports `WHATWG_BAD_PORTS` (frozen canonical list from [the fetch spec](https://fetch.spec.whatwg.org/#port-blocking)), `isBadPort(port)`, and `assertPortUsable(port, label?)`. `assertPortUsable` throws a clear, actionable error directing the user to choose a different port and linking the spec.

  **`@harness-engineering/dashboard`:**
  - `orchestrator-proxy.ts`: extracted `formatProxyErrorMessage(err)` that surfaces `err.cause.message` / `err.cause.code` alongside the base message. A `fetch failed` from a bad port now reads `Orchestrator proxy error: fetch failed (cause: bad port)`; `ECONNREFUSED`, `ENOTFOUND`, etc. are visible the same way.
  - `getOrchestratorTarget()` logs a one-time `console.error` at resolution time if the configured target port is on the bad-ports list, so the failure mode is announced at startup rather than only per-request.
  - `serve.ts`: calls `assertPortUsable(port, 'dashboard API')` before `serve()` so the dashboard refuses to start on an unreachable port.

  **`@harness-engineering/orchestrator`:**
  - `server/http.ts#start()`: calls `assertPortUsable(this.port, 'orchestrator')` before `httpServer.listen()` so the orchestrator refuses to start on a bad port. The `harness orchestrator start` flow now fails loudly with a clear message instead of starting, appearing healthy to `curl`, and silently breaking every dashboard request.

- Updated dependencies [38fa742]
- Updated dependencies [bb7658b]
  - @harness-engineering/core@0.25.0
  - @harness-engineering/graph@0.9.0
  - @harness-engineering/intelligence@0.2.2

## 0.4.0

### Minor Changes

- 287ca16: feat(roadmap): tracker-only roadmap mode (file-less)

  Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](https://github.com/Intense-Visions/harness-engineering/blob/main/docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

  **`@harness-engineering/core`:**
  - New `packages/core/src/roadmap/tracker/` submodule: `IssueTrackerClient` interface lifted from orchestrator, `createTrackerClient(config)` factory, body-metadata block parser/serializer, ETag store with LRU eviction, conflict-detection policy, and `GitHubIssuesTrackerAdapter` for file-less mode.
  - New `packages/core/src/roadmap/mode.ts` with `getRoadmapMode(config)` helper.
  - New `packages/core/src/roadmap/load-tracker-client-config.ts` (canonical home for tracker-config loading; replaces three duplicates in cli/dashboard/orchestrator).
  - New `packages/core/src/roadmap/migrate/` namespace: body-diff, history-event hashing, plan-builder, idempotent runner.
  - New `packages/core/src/validation/roadmap-mode.ts` with `validateRoadmapMode` enforcing `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.
  - New `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts` (priority + createdAt sort, deliberate D4 semantic break).
  - Config schema: `roadmap.mode: "file-backed" | "file-less"` (optional, defaults to `"file-backed"`).
  - Fixes pre-existing `TS2322` in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (`updateInternal` return shape) and `TS2379` in `packages/cli/src/commands/validate.ts` (call site against `RoadmapModeValidationConfig` widened to accept `undefined`).

  **`@harness-engineering/orchestrator`:**
  - New tracker kind `tracker.kind: "github-issues"` in workflow config selects `GitHubIssuesTrackerAdapter` (see ADR 0010 for the kind-schema decoupling rationale vs `roadmap.tracker.kind: "github"`).
  - `createTracker()` dispatches on `tracker.kind`; the Phase 4 stub at orchestrator constructor is removed.
  - Roadmap-status (S5) and roadmap-append (S6) endpoints translate `ConflictError` to HTTP `409 TRACKER_CONFLICT` shape; React surface lands in a follow-up.

  **`@harness-engineering/cli`:**
  - New `harness roadmap` command group with `harness roadmap migrate --to=file-less [--dry-run]` subcommand. One-shot, dry-run-capable, idempotent migration that creates GitHub issues for unmigrated features, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md`, and flips `roadmap.mode`.
  - `manage_roadmap` MCP tool is mode-aware: in file-less mode, dispatches through `IssueTrackerClient` instead of touching `docs/roadmap.md`.
  - `harness validate` runs the two new cross-cutting rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.

  **Documentation:**
  - Three ADRs added under `docs/knowledge/decisions/`: 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).
  - New knowledge domain `docs/knowledge/roadmap/` with three entries: `file-less-roadmap-mode` (business_concept), `tracker-as-source-of-truth` (business_rule), `roadmap-migration-to-file-less` (business_process).
  - `docs/guides/roadmap-sync.md` gains a `## File-less mode` section.
  - `docs/reference/configuration.md`, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, and `AGENTS.md` updated.
  - Migration walkthrough at `docs/changes/roadmap-tracker-only/migration.md` (shipped in Phase 5).
  - Proposal §F2 wording reworded to "best-effort detection" per Phase 2 D-P2-B.

### Patch Changes

- ed16b44: feat(roadmap): dashboard conflict UX for file-less roadmap mode (Phase 7 — file-less GA blocker)

  Closes the last file-less GA blocker by making HTTP 409 `TRACKER_CONFLICT` responses a first-class, accessible UX surface in the dashboard, and aligning the orchestrator's `roadmap-append` endpoint to emit the same conflict shape as the dashboard's claim endpoints (REV-P4-4, Option A).

  **`@harness-engineering/dashboard`:**
  - New `TrackerConflictBody` type, `isTrackerConflictBody` guard, and exported `CONFLICT_TOAST_TEMPLATE` constant in `src/shared/types.ts`.
  - New Zustand `toastStore` (`src/client/stores/toastStore.ts`) with single-toast supersession via a monotonic `seq` counter so repeat conflicts always re-trigger the refresh effect.
  - New `fetchWithConflict` helper (`src/client/utils/fetchWithConflict.ts`) returning a discriminated-union `{ ok: true, data } | { ok: false, status, conflict?, error? }` so every caller of an endpoint that can emit TRACKER_CONFLICT (S3, S5, S6) dispatches identically.
  - New `scrollToFeatureRow` helper (`src/client/utils/scrollToFeatureRow.ts`): smooth-scrolls the contested row into the viewport, focuses it, and applies a 2-second `data-conflict-highlight` pulse-ring (degraded fallback when the row is no longer in the DOM).
  - New `ConflictToastRegion` component (`src/client/components/ConflictToastRegion.tsx`) with `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, and an explicit Dismiss button.
  - `FeatureRow` now exposes `data-external-id="<externalId>"` and `tabIndex={-1}` on its root element so the conflict resolver can locate and focus the contested row without lifting refs.
  - `ClaimConfirmation` recognizes the TRACKER_CONFLICT shape: dispatches a toast event, closes via `onCancel`, and never invokes `onConfirm` on conflict.
  - `Analyze.tsx`'s "Add to roadmap" path is routed through a new `appendToRoadmap` helper that uses `fetchWithConflict`, so an S6 conflict surfaces via the same toast pathway.
  - `Roadmap.tsx` mounts `ConflictToastRegion`, handles the refetch via `GET /api/roadmap` with `cache: 'no-store'`, dispatches the override into a `refreshedData` state, and drives the smooth-scroll-and-focus on the next animation frame; the manual override is cleared on the next SSE `lastUpdated` tick so live updates resume.
  - CSS keyframes fallback for `data-conflict-highlight` ring animation in `index.css`.

  **`@harness-engineering/orchestrator`:**
  - `roadmap-append` (S6) now translates `ConflictError` from `client.create()` into HTTP `409 { error, code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint: 'reload-roadmap' }` (D-P7-A). Previously it emitted a generic 502. This closes REV-P4-4 by giving the dashboard a single uniform conflict shape across S3 (`/api/actions/roadmap/claim`), S5 (`/api/actions/roadmap-status`), and S6 (`/api/roadmap/append`).

  **Documentation:**
  - `docs/knowledge/dashboard/claim-workflow.md` gains a "Conflict UX" section describing the toast, auto-refetch, and scroll-to-row choreography for the file-less branch (step 4).

  **Roadmap status:** With Phase 7 landed, the `tracker-only` roadmap (file-less mode) is feature-complete; manual browser verification of the toast, screen-reader announcement, focus, and pulse-ring is operator-side QA.

- Updated dependencies [287ca16]
  - @harness-engineering/core@0.24.0

## 0.3.2

### Patch Changes

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8

## 0.3.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7
  - @harness-engineering/intelligence@0.2.1

## 0.3.0

### Minor Changes

- 8825aee: Local model fallback (Spec 1)

  `agent.localModel` may now be an array of model names; `LocalModelResolver` probes the configured local backend on a fixed interval and resolves the first available model from the list. Status is broadcast via WebSocket (`local-model:status`) and exposed at `GET /api/v1/local-model/status`. The dashboard surfaces an unhealthy-resolver banner on the Orchestrator page via the `useLocalModelStatus` hook.
  - **`@harness-engineering/types`** — `LocalModelStatus` type; `localModel` widened to `string | string[]`.
  - **`@harness-engineering/orchestrator`** — `LocalModelResolver` (probe lifecycle, idempotent loop, request timeout, overlap guard); `getModel` callback threaded through `LocalBackend` and `PiBackend` so backends read the resolved model at session/turn time instead of from raw config; `createAnalysisProvider` local branch routed through the resolver; `GET /api/v1/local-model/status` route and `local-model:status` WebSocket broadcast.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatus` hook (WebSocket primary, HTTP fallback); `LocalModelBanner` rendered on the Orchestrator page when the resolver reports unhealthy.

- 8825aee: Multi-backend routing (Spec 2)

  The orchestrator now accepts a named `agent.backends` map and a per-use-case `agent.routing` map, replacing the single `agent.backend` / `agent.localBackend` pair. Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Multi-local configurations are supported with one `LocalModelResolver` per backend. A single-runner dispatch path replaces the dual-runner split.
  - **`@harness-engineering/types`** — `BackendDef` union (`local` | `pi` | external types), `RoutingConfig`, `NamedLocalModelStatus`.
  - **`@harness-engineering/orchestrator`** — `BackendDefSchema` and `RoutingConfigSchema` (Zod); `migrateAgentConfig` shim for legacy `agent.backend` / `agent.localBackend` (warn-once at startup); `createBackend` factory; `BackendRouter` (use-case → backend resolution with intelligence-layer fallback); `AnalysisProviderFactory` (routed `BackendDef` → `AnalysisProvider`, distinct PESL provider); `OrchestratorBackendFactory` wrapping router + factory + container; `validateWorkflowConfig` SC15 enforcement; `Map<name, LocalModelResolver>` with per-resolver `NamedLocalModelStatus` broadcast; `GET /api/v1/local-models/status` array endpoint (singular `/local-model/status` retained as deprecated alias); `PiBackend` `timeoutMs` plumbed via `AbortController`.
  - **`@harness-engineering/intelligence`** — `IntelligencePipeline` accepts a distinct `peslProvider` so the SEL and PESL layers can resolve to different backends.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatuses` (renamed from singular) consumes `/api/v1/local-models/status` and merges `NamedLocalModelStatus[]` by `backendName`; the Orchestrator page renders one `LocalModelBanner` per unhealthy backend.

  **Deprecation:** `agent.backend` and `agent.localBackend` continue to work via the migration shim, which synthesizes `agent.backends.primary` / `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Hard removal lands in a follow-up release per ADR 0005.

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/types@0.11.0
  - @harness-engineering/intelligence@0.2.0
  - @harness-engineering/core@0.23.6

## 0.2.17

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5
  - @harness-engineering/intelligence@0.1.5

## 0.2.16

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4
  - @harness-engineering/intelligence@0.1.4

## 0.2.15

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/core@0.23.3
  - @harness-engineering/intelligence@0.1.3

## 0.2.14

### Patch Changes

- e3dc2e7: Add runtime validation for JSON.parse calls flagged by security scan
  - orchestrator: validate persisted maintenance history with Zod schema instead of bare Array.isArray check
  - dashboard: add structural type guards (object + discriminator check) before casting parsed WebSocket/SSE messages

## 0.2.13

### Patch Changes

- f62d6ab: Add `no-process-env-in-spawn` ESLint rule and fix env leak in chat-proxy
  - New rule detects `process.env` passed directly to child process spawn calls, preventing environment variable leaks
  - Fix env leak in orchestrator chat-proxy identified by the new rule

- f62d6ab: SSE streaming and chat-proxy fixes
  - Emit SSE events from CLI assistant message content blocks
  - Update chat-proxy tests to use streaming event format
  - Suppress unused mapContentBlock warning
  - Harden workspace cleanup guard against false escalations

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/intelligence@0.1.2
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 0.2.12

### Patch Changes

- refactor: decompose `orchestrator.ts` (1,882 → 1,313 lines) by extracting intelligence pipeline runner and completion handler into dedicated modules (`intelligence/pipeline-runner.ts`, `completion/handler.ts`)
- refactor: replace barrel imports from `./core/index` with direct imports from source modules (`state-machine`, `state-helpers`, `model-router`, `analysis-archive`, `analysis-comment`, `published-index`) to make dependency chains explicit
- refactor: introduce `OrchestratorContext` interface for shared dependency injection into extracted sub-services

## 0.2.11

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0
  - @harness-engineering/intelligence@0.1.1

## 0.2.10

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

## 0.2.9

### Patch Changes

- 1d0fdd8: Rename orchestrator config file from WORKFLOW.md to harness.orchestrator.md. The workflow loader error messages and default template reflect the new name.

## 0.2.8

### Patch Changes

- Harden orchestrator, rate limiter, and container security defaults.

  **@harness-engineering/orchestrator:**
  - Extract PR detection from `Orchestrator` into standalone `PRDetector` module
  - Fix rate-limiter stack overflow risk by replacing `Math.min(...spread)` with `reduce`
  - Ensure rate limit delays are always >= 1ms
  - Default container network to `none` and block privileged Docker flags
  - Fix stale claim detection: missing timestamp now treated as stale
  - Fix scheduler to only record `lastRunMinute` on task success
  - Add error handling for `ensureBranch`/`ensurePR`/agent dispatch in task-runner
  - Add resilient `rebase --abort` recovery in pr-manager

  **@harness-engineering/core:**
  - Fix `contextBudget` edge cases (zero total tokens, zero `originalSum` during redistribution)
  - Parse `npm audit` stdout on non-zero exit in `SecurityTimelineManager`
  - Add security rule tests (crypto, deserialization, express, go, network, node, path-traversal, react, xss)

  **@harness-engineering/cli:**
  - Break `StepResult` type cycle between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0

## 0.2.7

### Patch Changes

- Updated dependencies [802a1dd]
  - @harness-engineering/core@0.21.4

## 0.2.6

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/types@0.9.1

## 0.2.5

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/core@0.17.0

## 0.2.4

### Patch Changes

- Multi-platform MCP expansion, security hardening, and release readiness fixes

  **@harness-engineering/cli (minor):**
  - Multi-platform MCP support: add Codex CLI and Cursor to `harness setup-mcp`, `harness setup`, and slash command generation
  - Cursor tool picker with `--pick` and `--yes` flags using `@clack/prompts` for interactive tool selection
  - TOML MCP entry writer for Codex `.codex/config.toml` integration
  - Sentinel prompt injection defense hooks (`sentinel-pre`, `sentinel-post`) added to hook profiles
  - `--tools` variadic option for `harness mcp` command
  - Fix lint errors in hooks (no-misleading-character-class, unused imports, `any` types)
  - Fix cost-tracker hook field naming (snake_case → camelCase alignment)
  - Fix test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts

  **@harness-engineering/core (minor):**
  - Usage module: Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation
  - Security scanner: session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules
  - Security: false-positive verification gate replacing suppression checks, `parseHarnessIgnore` helper
  - Fix lint: eslint-disable for intentional zero-width character regex in injection patterns

  **@harness-engineering/types (minor):**
  - Add `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types for cost tracking
  - Export aggregate types from types barrel

  **@harness-engineering/orchestrator (patch):**
  - Integrate sentinel config scanning into dispatch pipeline
  - Fix conditional spread for optional line property

- Updated dependencies
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0

## 0.2.3

### Patch Changes

- **README added** — Architecture diagram, quick start guide, core concepts (event-sourced state machine, candidate selection, agent backends, workspace management), and full API reference.
- **Cross-platform path fix** — `GraphConstraintAdapter` path normalization for consistent separators.
- Updated dependencies
  - @harness-engineering/core@0.13.1

## 0.2.2

### Patch Changes

- Fix circular dependency between orchestrator and http server modules
- Updated dependencies
  - @harness-engineering/core@0.13.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0

## 0.2.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
