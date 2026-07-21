# @harness-engineering/intelligence

## 0.10.0

### Minor Changes

- fac4261: perf(triage): suppress reasoning traces on the report levers via Ollama-native think:false (~10× faster)

  Reasoning models (Qwen3 et al.) emit a `<think>` trace that Ollama's OpenAI-compatible `/v1`
  endpoint neither suppresses nor bounds — it ignores `/no_think`, `think:false`, and
  `chat_template_kwargs`. For the triage report's structured-extraction levers (complexity
  tie-break, open-decisions) that trace is pure latency with no quality gain — verified: the same
  `moderate/high` verdict and the same surfaced decisions with thinking on or off.
  - New per-request `AnalysisRequest.disableThinking` flag (advisory, best-effort).
  - When set, `OpenAICompatibleAnalysisProvider` takes Ollama's NATIVE `/api/chat` with
    `think:false` (schema enforced via native `format`, output bounded by `num_predict`). Any
    failure — a non-Ollama endpoint (vLLM / LM Studio have no `/api/chat`), network, or parse —
    falls back to the OpenAI-compatible path, which is always correct. The optimization can never
    break a working call.
  - The tie-break and open-decisions levers opt in; the brainstorm fork generator does NOT (its
    open-ended reasoning genuinely benefits from thinking).

  Measured on qwen3:32b: a single-item report dropped from ~2m03s to ~11.6s.

### Patch Changes

- 4bd325b: feat(analyses): consume guardian diff-coverage findings from `.harness/analyses/` (#914)

  Define a harness-owned, tolerant, advisory `GuardianAnalysis` contract
  (`schema: harness.guardian.diff-coverage`) plus a degrade-safe reader that lists
  `.harness/analyses/`, selects guardian records by discriminator, validates with
  zod, and skips unknown/malformed shapes without ever throwing. Wire it into three
  review consumers:
  - `outcome_eval` folds the guardian signal into the verdict rationale (never
    affects TS-derived authority).
  - `pre-merge-brief` surfaces a Guardian diff-coverage section and adds flagged
    records to "Worth your eyes".
  - `harness-code-review` (the 7-phase `runReviewPipeline`) surfaces the guardian
    summary as an advisory context file on every review bundle the agents receive.
    Read caller-side at the CLI layer (`run_code_review` MCP tool + `agent review`
    command) and passed in as plain data, so `@harness-engineering/core` never
    depends on `@harness-engineering/intelligence`.

  A missing/empty/malformed archive leaves every consumer byte-identical to today.

- fac4261: fix(triage): don't label a deferred open-decisions lever as "no provider (offline)"

  The cheap-first report holds obviously-out-of-band items (scope-too-large, not-in-band) before
  spending an LLM call, so their open-decisions lever runs without a provider and printed
  `open-decisions: no provider (offline)` — misleading, since a provider WAS available and the
  lever was simply deferred, not missing/mis-configured.

  New `ProbeDeps.modelDeferred` hint (threaded through `triageIssue`): when a model is available
  but its levers were deferred for a cheap pass, the reason reads `not evaluated (item held before
the model pass)`. A genuinely offline run (`--offline` / no provider wired) still reads
  `no provider (offline)`. Wording only — the lever value stays `unknown` and the gate never
  dispatches on an unread lever either way.

- fac4261: fix(triage): health-check the pool model pick + reject truncated native output

  Two silent-degradation fixes surfaced by an adversarial review of the local-model path:
  - **Pool pick now health-checks against the endpoint's `/v1/models`** (`triage-pool.ts`). Before,
    the CLI returned the top-ranked `pool.json` entry without verifying the endpoint serves it — so
    a model `ollama rm`'d out-of-band, or a pool copied onto a host whose `pi` endpoint is
    vLLM/LM-Studio (different model ids), got baked in as the model, every LLM lever 404'd, and the
    report silently fell back to the static path while _claiming_ a model ran. It now picks the
    highest-ranked candidate the endpoint actually serves and otherwise falls back to the config
    list — true parity with the live `LocalModelResolver` (rank, then intersect with the probe).
    Also guards a corrupt empty-string `ollamaName`.
  - **Native `think:false` path rejects truncated output** (`openai-compatible.ts`). It now throws
    on Ollama's `done_reason: 'length'` (mirroring the compat path's `finish_reason === 'length'`
    guard) so a `format`-constrained partial-but-parseable body isn't returned as complete — it
    falls back to the compat path instead. Added tests for the native fallback branches
    (truncation, schema-invalid body, missing content).

- fac4261: fix(triage): stop truncating reasoning-model output — the LLM levers now produce real verdicts

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

- Updated dependencies [1de3ce4]
- Updated dependencies [84bd986]
- Updated dependencies [77815a8]
- Updated dependencies [0c9a304]
- Updated dependencies [c4c1dd3]
- Updated dependencies [af503e4]
- Updated dependencies [fac4261]
- Updated dependencies [3e5f0ca]
- Updated dependencies [a0ef808]
- Updated dependencies [545e818]
- Updated dependencies [3b2b8ba]
- Updated dependencies [f460e42]
- Updated dependencies [e3bd99e]
- Updated dependencies [84bd986]
- Updated dependencies [f8c9dd9]
  - @harness-engineering/types@0.24.0
  - @harness-engineering/graph@0.11.10

## 0.9.0

### Minor Changes

- 723072d: perf(triage): suppress reasoning traces on the report levers via Ollama-native think:false (~10× faster)

  Reasoning models (Qwen3 et al.) emit a `<think>` trace that Ollama's OpenAI-compatible `/v1`
  endpoint neither suppresses nor bounds — it ignores `/no_think`, `think:false`, and
  `chat_template_kwargs`. For the triage report's structured-extraction levers (complexity
  tie-break, open-decisions) that trace is pure latency with no quality gain — verified: the same
  `moderate/high` verdict and the same surfaced decisions with thinking on or off.
  - New per-request `AnalysisRequest.disableThinking` flag (advisory, best-effort).
  - When set, `OpenAICompatibleAnalysisProvider` takes Ollama's NATIVE `/api/chat` with
    `think:false` (schema enforced via native `format`, output bounded by `num_predict`). Any
    failure — a non-Ollama endpoint (vLLM / LM Studio have no `/api/chat`), network, or parse —
    falls back to the OpenAI-compatible path, which is always correct. The optimization can never
    break a working call.
  - The tie-break and open-decisions levers opt in; the brainstorm fork generator does NOT (its
    open-ended reasoning genuinely benefits from thinking).

  Measured on qwen3:32b: a single-item report dropped from ~2m03s to ~11.6s.

### Patch Changes

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

- 723072d: fix(triage): health-check the pool model pick + reject truncated native output

  Two silent-degradation fixes surfaced by an adversarial review of the local-model path:
  - **Pool pick now health-checks against the endpoint's `/v1/models`** (`triage-pool.ts`). Before,
    the CLI returned the top-ranked `pool.json` entry without verifying the endpoint serves it — so
    a model `ollama rm`'d out-of-band, or a pool copied onto a host whose `pi` endpoint is
    vLLM/LM-Studio (different model ids), got baked in as the model, every LLM lever 404'd, and the
    report silently fell back to the static path while _claiming_ a model ran. It now picks the
    highest-ranked candidate the endpoint actually serves and otherwise falls back to the config
    list — true parity with the live `LocalModelResolver` (rank, then intersect with the probe).
    Also guards a corrupt empty-string `ollamaName`.
  - **Native `think:false` path rejects truncated output** (`openai-compatible.ts`). It now throws
    on Ollama's `done_reason: 'length'` (mirroring the compat path's `finish_reason === 'length'`
    guard) so a `format`-constrained partial-but-parseable body isn't returned as complete — it
    falls back to the compat path instead. Added tests for the native fallback branches
    (truncation, schema-invalid body, missing content).

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

- Updated dependencies [ef62251]
  - @harness-engineering/types@0.23.0
  - @harness-engineering/graph@0.11.9

## 0.8.0

### Minor Changes

- f5cbdec: fix(triage): wire the local SEL model into the plain report, add single-item targeting, and distinguish over-large scope

  Three dogfooding fixes to `harness roadmap triage` (still entirely default-off behind
  `roadmap.autoTriage.enabled`):
  - **Live provider in the plain report (efficiently).** The read-only report now resolves
    the SEL provider the same way `--brainstorm` does (local-first, free) and runs the
    semantic-read + open-decisions levers on the local model for a REAL verdict — so items
    are no longer perpetually held as "no provider (offline)". It stays cheap: the graph
    scope + static complexity levers run first for every item, and the LLM levers fire ONLY
    for still-plausible candidates (scope resolved+bounded AND static band trivial|simple).
    Obviously-complex / over-large / unresolved items are held via the cheap path with no
    model call. A new `--offline` flag forces the pure static path. When no provider
    resolves, behavior degrades gracefully to the previous offline path (never an error).
  - **Single-item / limited targeting.** New `--only <substring>` (case-insensitive title
    match) and `--limit <n>` flags, honored by BOTH the plain report and `--brainstorm`, so
    a single item can be triaged in isolation. `--brainstorm` additionally gates the actual
    brainstorm to plausible candidates so it no longer brainstorms items that would only halt.
  - **`scope-too-large` hold reason.** Items whose entities RESOLVE but whose blast radius
    exceeds `boundedScopeMax` were mislabeled `unresolved-scope` (which reads as "no entity
    resolved"). They now carry a distinct `scope-too-large` `HoldReason` / `EscalationCategory`;
    `unresolved-scope` is reserved for the truly-no-entity-resolved case.

## 0.7.0

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

- Updated dependencies [eb74585]
  - @harness-engineering/types@0.22.0
  - @harness-engineering/graph@0.11.8

## 0.6.0

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

### Patch Changes

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

- Updated dependencies [681e173]
- Updated dependencies [f004f04]
- Updated dependencies [ec649e6]
- Updated dependencies [abbaa89]
- Updated dependencies [ea36b3c]
- Updated dependencies [787e033]
- Updated dependencies [0c8e2ac]
  - @harness-engineering/types@0.21.0
  - @harness-engineering/graph@0.11.7

## 0.5.0

### Minor Changes

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

- Updated dependencies [db24d89]
- Updated dependencies [eb8435f]
- Updated dependencies [be3c714]
  - @harness-engineering/types@0.20.0
  - @harness-engineering/graph@0.11.6

## 0.4.3

### Patch Changes

- Updated dependencies [bae23ad]
  - @harness-engineering/types@0.19.0
  - @harness-engineering/graph@0.11.5

## 0.4.2

### Patch Changes

- Updated dependencies [965cfd3]
  - @harness-engineering/types@0.18.0
  - @harness-engineering/graph@0.11.4

## 0.4.1

### Patch Changes

- Updated dependencies [3d772e9]
  - @harness-engineering/types@0.17.0
  - @harness-engineering/graph@0.11.3

## 0.4.0

### Minor Changes

- d80871f: Add the harness-pm persona plus the acceptance-eval skill, MCP tool, and intelligence module — the upstream twin of outcome-eval that gates specs on measurable acceptance criteria. acceptance-eval resolves a spec's acceptance section, critiques observability/testability/completeness (advisory `criteriaFindings`), flags user-visible behaviors with no covering test (advisory `coverageFindings`), and emits a confidence-rated `AcceptanceVerdict` (`MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE`). Merge authority is derived in TypeScript via `deriveAcceptanceAuthority` and never read from the LLM: a high-confidence `NOT_MEASURABLE` blocks; every other verdict is advisory. Exposed as the `mcp__harness__acceptance_eval` MCP tool and the `harness-pm` persona (triggered `on_pr` for `docs/changes/**`).

### Patch Changes

- Updated dependencies [4df8934]
- Updated dependencies [863df8f]
  - @harness-engineering/types@0.16.2
  - @harness-engineering/graph@0.11.2

## 0.3.1

### Patch Changes

- Updated dependencies [8e8e7c1]
  - @harness-engineering/types@0.16.1
  - @harness-engineering/graph@0.11.1

## 0.3.0

### Minor Changes

- 9bbf0a3: Add `createCanaryAdapter` — a total, gracefully-degrading boundary around the deterministic `canary` test CLI (`canary-test-cli`, declared as an optionalDependency). Exposes `probe()` (availability with a full degrade matrix: not-installed / binary-missing / exec-failed / bad-output), `recommendFramework(prompt)` (→ `canary recommend --json`), and `reviewTest(path, framework?)` (→ `canary review-test --json`), all zod-validated and never throwing on a missing or misbehaving CLI. The exec seam is injectable (`CanaryExec`) for testing. Phase 1 of the canary-test-integration spec; skill wiring and docs follow in later phases.
- f5ec94d: Add `harness:outcome-eval` — an LLM-judgment skill that produces a structured, confidence-rated verdict on whether an implementation satisfied its spec.
  - New `packages/intelligence/src/outcome-eval/` module: `OutcomeEvaluator` (mirrors `PeslSimulator`), a `.strict()` `verdictSchema`, a fence-aware spec-section resolver (Success Criteria → user-visible-behavior → Overview), a conservative-confidence prompt, and the false-positive-critical `deriveAuthority` mapping — authority is always derived in TypeScript and never read from the LLM. `evaluate()` is degrade-safe: provider/parse/missing-spec failures resolve to INCONCLUSIVE/advisory and never throw at the blocking gate.
  - Each `evaluate()` persists exactly one `execution_outcome` node via `ExecutionOutcomeConnector` (additive, backward-compatible `metadata` pass-through), consumable by the effectiveness scorer.
  - New `outcome_eval` MCP tool (`@harness-engineering/cli`) makes the skill genuinely invocable, constructing a real `AnalysisProvider` + `GraphStore` and returning the TS-derived verdict.
  - Wired into the orchestrator as step 6.5 (between Code Review and Ship): a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. ADRs 0037 (tiered confidence→authority) and 0038 (execution_outcome provenance) document the decisions.

## 0.2.7

### Patch Changes

- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [318b878]
- Updated dependencies [aaefe1b]
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0

## 0.2.6

### Patch Changes

- Updated dependencies [d1c9bda]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/types@0.15.0

## 0.2.5

### Patch Changes

- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/types@0.14.0

## 0.2.4

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0

## 0.2.3

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0

## 0.2.2

### Patch Changes

- Updated dependencies [bb7658b]
  - @harness-engineering/graph@0.9.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0

## 0.2.0

### Minor Changes

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

## 0.1.5

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1

## 0.1.4

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0

## 0.1.2

### Patch Changes

- f62d6ab: Resolve architecture complexity violations and release readiness audit fixes
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/types@0.10.1

## 0.1.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @harness-engineering/types@0.10.0
