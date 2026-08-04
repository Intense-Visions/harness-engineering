---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-08-04
last_synced: 2026-08-04T19:50:51.000Z
last_manual_edit: 2026-06-27T12:51:51.967Z
---

# Roadmap

## Intake

### LMLM Phases 4–9: wire the engine to operator surfaces

- **Status:** done
- **Spec:** docs/changes/local-model-lifecycle-manager/proposal.md
- **Summary:** DELIVERED (PR #753, merged + released). Wired the previously-dormant `@harness-engineering/local-models` engine to operator surfaces across CLI, orchestrator, and dashboard — Phases 4–9: (4) `LocalModelResolver` consumes pool state, (5) discriminated `ProposalSchema` (`kind: skill|model`) + model-proposal engine/handlers/CLI, (6) background scheduler + drift reconciliation, (7) HTTP routes + WS topics + notification sinks + S1 dispatch-safe eviction, (8) read-only dashboard panel, (9) ADRs 0058–0062 + operator guide. Corrects the accidental `done` on #386 (which was flipped during a bulk archive-split after only Phase 3c). Known limitation: the autonomous swap-proposal loop is inert until the live-HF candidate parser lands — see follow-up `lmlm-live-hf-candidate-discovery`; manual `harness models`, resolver-from-pool, and drift reconciliation all work today.
- **Blockers:** —
- **Plan:** docs/changes/local-model-lifecycle-manager/plans/
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#996

### LMLM: live-HF candidate discovery (make the autonomous loop live)

- **Status:** planned
- **Spec:** —
- **Summary:** Surfaced by the LMLM Phases 4–9 wiring PR. The background scheduler, drift reconciliation, proposal engine, routes/WS/sinks, and dashboard are all wired end-to-end, but the orchestrator seeds `createNativeRecommender` with an **empty candidate set** because the Phase-2 live-HuggingFace→`RankerCandidate` parser was never built. Consequence: the autonomous swap-proposal loop emits **nothing in production** (manual `harness models`, resolver-from-pool, and drift reconciliation all work today). Build the HF model-list → `RankerCandidate[]` parser (repo → sizeB/activeB/quant enumeration) and seed the recommender so `GET /recommendations` and the scheduler produce real proposals. Ref ADR 0059 (candidate-discovery deferral note). This is the single item that turns LMLM autonomy from wired-but-inert to live.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#997

### LMLM: feed post-build quality into per-model build routing

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-on to the deterministic tool-calling capability signal (PR #833). Add a LEARNED build-quality signal so a local model that tool-calls but produces failing/buggy builds is deprioritized for build routing over time — the soft-quality dimension the capability probe deliberately does NOT cover. Approach (minimal slice): attribute each build's quality outcome (tests/review, or the roadmap-auto-triage Phase-4 retrospective verdict) to the SPECIFIC resolved local model — today only `lastRoutedTier` is stashed on the running entry, so the ollama model id must be threaded through the completion/retrospective path — then feed quality-fails into the EXISTING `LocalModelResolver` circuit breaker (threshold 3 + cooldown) rather than a new scoring subsystem, reusing its anti-flakiness + recovery. Keep capability (deterministic probe) separate from reliability (learned). Design MUST include decay/exploration so a model demoted on one flaky build can recover. **Gated on build throughput:** local agentic builds are minutes-to-tens-of-minutes, so meaningful per-model signal accrues slowly, and the acute hard-failure case is already covered by the breaker + the capability probe — so near-term value is low until build volume (cloud / faster hardware) makes learning worthwhile.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#998

### LMLM: dashboard direct install/evict (optional)

- **Status:** planned
- **Spec:** —
- **Summary:** Surfaced by the LMLM Phases 4–9 wiring PR (decision D-P8-2). The spec's Pool card listed "install/evict actions," but the dashboard Pool card shipped **read-only** because no HTTP install/evict route exists — Phase 7 (D-Q2) deliberately kept pool mutation to a single write path (proposal approve/reject + CLI) to avoid a duplicate write surface. Pool changes are fully doable today via the Recommendations card's approve/reject and the CLI. If direct one-click install/evict from the dashboard is wanted, it needs a new backend spec: HTTP install/evict routes on the live `PoolManager` with auth + the D10/S1 in-use guard, plus the reconciled write-path story. Low priority — the proposal-driven flow (D1 pool-bounded autonomy) is the intended model.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#999

### product-advisor

- **Status:** done
- **Spec:** docs/changes/product-advisor/proposal.md
- **Summary:** DELIVERED (PR #705, merged). Product Advisor — upstream client-inception skill: ingests a diagram + client notes, drafts a BRD, detects gaps against a fixed completeness rubric, resolves them via a one-question-at-a-time interview, then fans the BRD out into candidate roadmap items and offers a STRATEGY.md seed. Reads but never writes STRATEGY.md; stops at BRD + roadmap seeding (spec authoring stays with harness-brainstorming).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#703

### Local backend runs the full harness workflow

- **Status:** in-progress
- **Spec:** docs/changes/local-backend-full-workflow/proposal.md
- **Summary:** Let a `local`/`pi` dispatch run the full workflow (brainstorm → plan → execute → verify → outcome-eval → review → ship) via a backend-specific dispatch template (`harness.orchestrator.local.md`) that gives the tool-limited pi-agent the workflow as bash `harness <gate>` calls instead of unavailable `/harness:*` slash commands, with the orchestrator ENFORCING the verify + outcome-eval gates (re-prompt on fail, halt-to-human on exhaustion — never ship bad output), composing with the shipped post-diff retrospective. A config flag can later route the judgment gates to a stronger provider. Bar = enable the wiring with enforced gates (quality protected by halting, not by trusting a small model to self-drive).
- **Blockers:** —
- **Plan:** docs/changes/local-backend-full-workflow/plans/2026-07-15-local-backend-full-workflow-phase1-plan.md
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1031

### LMLM: pool consumption improvements (make installed models live, task-aware, self-correcting)

- **Status:** planned
- **Spec:** docs/changes/lmlm-pool-consumption/proposal.md
- **Summary:** The LMLM install side is solid (async install + progress, resumable pulls, restart recovery, lineage scoring — PRs #775, #777), but the consumption side is pull-based and static, so an installed model barely gets used. Five phased improvements: (1) **Freshness loop** — the resolver subscribes to the `local-models:pool` event (today it only polls, `local-model-resolver.ts:260`) and the analysis provider resolves its model lazily instead of freezing at pipeline build (`analysis-provider-factory.ts:147`); (2) **Score-seed** — a new pool entry starts `currentScore: 0`, so the model you explicitly installed sits at the bottom of the score-sorted candidate list until re-rank; seed it from the ranked/interpolated score; (3) **Runtime feedback** — stamp `lastUsedAt` on real inference (LRU eviction currently runs on stale data) + a failure circuit-breaker; (4) **Task-aware selection** — per-profile pool scores (`general`/`coding`/`reasoning`) + a `RoutingUseCase → profile` map so each task gets the best-fit pooled model instead of one top-scored model per backend (advances the Agent Autonomy metric; carries a standalone ADR); (5) **Warming** — warm the selected model into VRAM (`keep_alive`) to avoid first-request cold-start. Additive schema only (`PoolEntry.scoresByProfile`, absolute score on `ModelProposalContent`). Does NOT depend on live-HF candidate discovery — scores the models already in the pool.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1000

### Adaptive Model Routing (AMR)

- **Status:** in-progress
- **Spec:** docs/changes/adaptive-model-routing/proposal.md
- **Summary:** Difficulty- and cost-aware, provider-neutral routing layered on the shipped `BackendRouter` (Spec B `granular-task-routing` / Spec 2 `multi-backend-routing`). A per-invocation complexity triage picks the cheapest capable backend (local _or_ cloud) per capability tier; split-routes workflow stages; escalates tiers on repeated quality failures (D10); gates Meridian autonomy for straightforward roadmap items. Opt-in and default-off — adopters who ignore it get byte-identical behavior (D11). 11 decisions, 19 success criteria, 6 phases (~21d): Phases 1–4 substrate-only and independently shippable; Phases 5–6 add tenant policy via the Shuttle `RuntimeAdapter` + autonomy graduation. Consumes the LMLM pool. Extends the Multi-client portability strategy track; direct lever on the Agent Autonomy metric.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1032

### Ship a harness-owned OllamaBackend; off-the-shelf drivers mis-handle Ollama tool-calling

- **Status:** in-progress
- **Spec:** docs/changes/local-model-context-autosizing/proposal.md
- **Summary:** Local agentic dispatch fails not because local models are incapable but because the *driver* mis-handles Ollama's tool-calling wire format. Evidence (live e2e, 2026-07-15/16, on the same "add ESLint rule no-hardcoded-test-count" task): **PiBackend** (`@earendil-works/pi-coding-agent`, `pi.ts`) returns empty `0/0/0` completions on 0.79 AND 0.80 — the model produces nothing usable. **Codex CLI `--oss`** drives the model but its tool router rejects the model's native `tool_calls` (`error=unsupported call`), so it confabulates success and writes nothing (Codex is built for gpt-oss + the OpenAI Responses API). Yet a **direct `/v1/chat/completions` + tools loop drives the same qwen3 model flawlessly** — a ~150-line prototype produced a correct, registered ESLint rule + integration-test count update + unit test, iterating through a real read→write→test debug loop. **Fix: ship a thin harness-owned `OllamaBackend`** (`packages/orchestrator/src/agent/backends/ollama.ts`, `type: 'ollama'` in the BackendDef union + Zod schema + factory) that runs the proven loop: chat/completions → parse native `tool_calls` → execute bash/write_file/read_file against the workspace → feed results back → repeat. It plugs into the existing `AgentBackend` interface alongside `ClaudeBackend`, is model-agnostic, and removes the third-party Ollama-compat dependency. **Sub-items folded in:** (a) disable reasoning traces for agentic dispatch — pi sends `reasoning:false` but Ollama `/v1` ignores it, so qwen3 burns its output budget on `<think>` and never emits a tool call (worked around with a forced-`/no_think` Modelfile variant); (b) auto-size `num_ctx`/output budget from detected hardware + model max — `packages/local-models/src/hardware/` already reads unified-memory/VRAM but only for model *selection*, never context sizing, so Ollama falls back to its small default regardless of machine capacity. Compute `num_ctx = min(model_max, fits_in_memory)`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1033

### Language-aware workspace bootstrap + verify for local dispatch

- **Status:** planned
- **Spec:** —
- **Summary:** Local-dispatch workspace setup and the enforced verify gate are JS/pnpm-baked; make both ecosystem-aware so non-JS adopters get a working local dispatch out of the box. Two coupled pieces: (a) **workspace dependency install** — the agent's workspace is a fresh git worktree with no installed deps, so the gate's verify fails environmentally and blocks EVERY dispatch (this looked like a model failure for days; see `local-dispatch-trustworthy-e2e`). It's set via the `hooks.afterCreate` config shell command (already language-agnostic — an adopter can put any install command there), and `feat/default-local-ollama` scaffolds the JS default `pnpm install`. (b) **the verify command** — `defaultLocalVerifyRunner` (`packages/orchestrator/src/orchestrator.ts`) hardcodes `pnpm -w run typecheck/lint/test`; for a Python project it should run `pytest`/`mypy`/`ruff`, for Rust `cargo test`, etc. Build a single ecosystem detector (by lockfile/manifest: `pnpm-lock.yaml`→pnpm, `package-lock.json`→npm, `yarn.lock`→yarn, `requirements.txt`/`pyproject.toml`→pip/poetry, `Cargo.toml`→cargo, `go.mod`→go, `Gemfile`→bundler, `pom.xml`/`build.gradle`→maven/gradle) that feeds BOTH: `harness init` scaffolds a matching `afterCreate` install command AND a matching verify command; a local dispatch **warns loudly when neither is set** (rather than silently passing verify on missing deps); both remain overridable in config. Consider caching installed deps across dispatches (per-dispatch `pnpm install` is ~5s via the pnpm store, but pip/cargo/gradle can be minutes). Keep the harness's language-agnostic, degrade-gracefully posture — never hardcode a package manager in orchestrator code.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1002

### Dashboard chat can target any configured backend (incl. local/ollama)

- **Status:** planned
- **Spec:** —
- **Summary:** Let a user manually drive any configured backend — including the local `ollama` model — from the dashboard chat, so they can eyeball local-model quality interactively before trusting it with autonomous dispatch. Today the chat is hardwired to Claude: `packages/orchestrator/src/server/routes/chat-proxy.ts` spawns `claude --print` as a subprocess (`command = 'claude'`), bypassing the orchestrator's `BackendRouter` entirely — so the OllamaBackend and local models are unreachable from chat even though they now work for dispatch (#841/#843). Rewire the `/api/chat` handler to dispatch through the backend router (or an explicit backend/model param) and add a backend picker to the chat UI (default to the existing `claude` path for back-compat). The pieces already exist: the **OllamaBackend** implements a streaming chat loop (`startSession`→`runTurn` yielding `AgentEvent`s: usage / tool_execution / heartbeat), and the dashboard has the chat surface (`client/types/chat-session.ts`, `utils/chat-stream.ts`, `utils/agent-events.ts`, `stores/threadStore.ts`) + SSE streaming. Mostly a wiring job: map the backend's `AgentEvent` stream to the chat SSE event contract the client already consumes, expose the configured `agent.backends` to the picker, and preserve tool-execution/streaming semantics. Consider read-only vs full-tool permission modes for an interactive chat session (a manual chat probably wants tools optional). Ties directly to the Agent-Autonomy adoption story — humans validate the local model in chat, then graduate it to unattended dispatch.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1003

### Agentic-suitability in the local-model pool recommender

- **Status:** in-progress
- **Spec:** —
- **Summary:** The pool ranker (`packages/local-models/src/ranker/algorithm.ts`) scores candidates by VRAM fitness + a **bandwidth-estimated** tokens/sec (speed-confidence bands) + benchmark confidence — but it does NOT compose those into "is this model usable for **autonomous agentic dispatch**," and that gap picks unusable models. Live evidence (2026-07-16): **llama3.3:70b** fits memory and its tokens/sec *estimate* looked fine, but real agentic latency — time-to-first-token on a 66GB model with a large multi-turn context — was a **4-minute single call**, unusable for a tool-loop; **qwen2.5-coder:7b** fits and is fast but **won't emit tool_calls** (should be excluded from agentic routing, not merely down-ranked); **qwen3:32b** tool-calls and completes but stumbles on some tasks. Add an **agentic-suitability** dimension the recommender/AMR use to select for dispatch = (a) tool-calling capability as a HARD filter (reuse the deterministic probe from #833 in `packages/local-models/src/capability/tool-calling.ts` — no tool-calls ⇒ ineligible for agentic use), × (b) a **measured** agentic latency/throughput signal (time-to-first-token + turn latency under a real agentic prompt, not the bandwidth estimate — a model over a latency budget is ineligible/steeply penalized for interactive dispatch even if it fits), × (c) learned build quality (the `local-dispatch-...`/`lmlm-build-quality-model-selection` follow-on). Keep the existing size/speed/benchmark ranking for non-agentic uses; expose a separate `agenticScore` so a fits-VRAM-but-too-slow / can't-tool-call / builds-badly model is never routed autonomous work. Ties to Agent-Autonomy: the pool should recommend a model a human can actually let run unattended.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1004

### Automate best-model discovery/recommendation for local dispatch

- **Status:** planned
- **Spec:** —
- **Summary:** The pool recommender should automate the manual process a human just used to pick a local coding model, and that process taught concrete lessons the frozen ranker misses. When picking a model for agentic dispatch by hand (2026-07-16) the winning process was: (1) query **current** authoritative sources for the best agentic coders — the landscape moves monthly (llama3.3:70b → qwen3-coder:30b / devstral-24b / laguna-xs), so a frozen snapshot goes stale; recency must be a ranking input. (2) Filter by hardware fit (already done). (3) **Rank speed by MoE ACTIVE params, not total size** — this was the key miss: a dense 70B is too slow for a tool-loop (a single call took 4 min) while a 30B **MoE with ~3B active** is fast and usable; the ranker's bandwidth×total-size estimate treats these the same, so it must model compute/latency from active params (MoE-aware). (4) **Require tool-calling** (hard filter — reuse #833's probe). (5) **Weight agentic benchmarks** — SWE-bench Verified (devstral 46.8%, laguna-xs 70.9%) over generic perplexity/chat benchmarks. (6) **Prefer coding/agent-specialized** models (qwen3-coder, Mistral's agent-first devstral) over general chat models for dispatch. Build a discovery step that pulls current candidates (Ollama library + HF + published SWE-bench numbers) with recency weighting, computes the [[local-model-agentic-suitability]] `agenticScore` (tool-calling × MoE-aware latency × agentic benchmark × learned build quality), surfaces the top recommendation for dispatch, and can **auto-pull** it. This makes the pool's suggestions match — or beat — what an expert would pick by hand, instead of recommending a fits-VRAM-but-too-slow dense model. Cross-refs #833 (tool-calling probe), the agentic-suitability item, and the LMLM live-HF candidate-discovery work.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1005

### Refresh the suggested MCP-server catalog to current best-in-class

- **Status:** in-progress
- **Spec:** —
- **Summary:** The MCP-server suggestions in `packages/cli/src/integrations/registry.ts` (context7, sequential-thinking, playwright, perplexity, augment-code) have drifted from the 2026 best-in-class and miss servers that directly serve a dev harness. Re-analysis (2026-07-16, live web): **keep** context7 (still the #1 docs server, ~54k stars) and playwright. **Add** (biggest gaps): (a) the **official GitHub MCP** — repos/branches/PRs/issues/CI — the harness lives on GitHub (roadmap↔issues, PR flows) yet doesn't suggest it; (b) **Exa**, now the most-used agent *search* server by a wide margin (semantic queries, structured results) — a better fit than the current `perplexity`; (c) **harness's OWN MCP** as a first-class *suggested* entry (code_search, ask_graph, spec_craft, outcome_eval, review_changes) — the harness's code-intelligence + workflow tools are more useful to an agent than a generic code-context server. **Reconsider:** `perplexity` → Exa, `augment-code` (redundant with the harness MCP + graph), `sequential-thinking` (marginal now that strong models reason natively). Optionally add Postgres/Filesystem/Fetch for adopters that need them. Make the catalog **freshness-aware** (like [[local-model-discovery-recommendation]] does for models) so it doesn't restale — the MCP ecosystem moves monthly. Weigh each by popularity + security posture (some servers are broad-access; note the risk). This catalog feeds both adopter MCP scaffolding AND [[ollama-backend-mcp-tools]] (which wires suggested servers into the local agent).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1006

### Wire suggested MCP servers (incl. harness itself) into the OllamaBackend agent

- **Status:** done
- **Spec:** docs/changes/ollama-mcp-tools/proposal.md
- **Summary:** Give the local `OllamaBackend` agent the same power cloud drivers get from MCP: expose the harness-suggested MCP servers as agent tools alongside `bash`/`read_file`/`write_file`. Today the local agent has only those three built-ins, so it writes code from stale memory — e.g. it used the deprecated `@typescript-eslint/utils` RuleTester import when **context7** returns the current `@typescript-eslint/rule-tester` API (verified live). The fix generalizes: an **MCP client in `OllamaBackend`** that, at `startSession`, connects to the configured/suggested MCP servers (from the refreshed catalog — [[mcp-catalog-refresh]]), enumerates each server's tools, and adds them (namespaced, e.g. `context7__query-docs`, `harness__code_search`) to the tool schema it sends to the model; on a tool call for an MCP tool it forwards to the server and returns the result. **Include harness's own MCP** so the local agent can `code_search` / `ask_graph` / `outcome_eval` / `review_changes` on itself — the highest-leverage set for harness-native work. Reuse the harness's existing MCP client plumbing + the `@modelcontextprotocol/sdk` rather than a bespoke per-server tool. Config: a per-backend allowlist of which suggested servers the agent gets (default a safe set: context7 docs + harness read-only tools; opt-in for write/network-heavy servers). Respect the interactive vs full-tool permission mode. This is the single biggest capability lever for local-model success — combined with a stronger model ([[local-model-discovery-recommendation]]) it directly targets the observed failure (writes plausible code but with wrong/old APIs and no doc lookup). MVP: context7 `lookup_docs` (HTTP, no key — proven) + the harness MCP; then generalize to the full catalog.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#849

### Curate which MCP-server tools the local agent sees (per-server tool allowlist)

- **Status:** in-progress
- **Spec:** docs/changes/local-mcp-tool-curation/proposal.md
- **Summary:** [[ollama-backend-mcp-tools]] wires whole MCP servers into the local agent, but a broad server floods the model: in the live e2e (2026-07-16) the harness MCP alone exposed **95 tools**, and `qwen3-coder:30b` — given ~98 tools total — wrote the correct file via context7 but then **over-explored** (a cat/find/read/ls verification loop) without cleanly emitting `TASK_COMPLETE`, so a real dispatch would end via `maxTurns` rather than clean success. Choice-paralysis, not context size (the model had 262144 ctx). Fix: a **per-server `tools?: string[]` allowlist** on `McpServerSpec` — when set, only those tool names from that server are aggregated (namespaced), default unset = all tools (byte-identical). Curate the scaffolded harness example to the read-oriented set ([[ollama-backend-mcp-tools]] D3: `code_search`, `ask_graph`, `review_changes`, `outcome_eval`, `gather_context`) instead of all 95. Warn (not hard-cap) when the aggregated tool count crosses a large threshold, pointing at the allowlist. Portable — the allowlist works for any server, not just harness. Directly improves the robustness of the just-shipped local MCP path.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1034

### Reconcile a project's configured MCP servers against the refreshed catalog (consent-gated)

- **Status:** in-progress
- **Spec:** docs/changes/integrations-reconcile/proposal.md
- **Summary:** [[mcp-catalog-refresh]] refreshes the *suggested* catalog, but an existing project keeps whatever MCP servers it configured earlier (the deprecated perplexity/augment-code/sequential-thinking; none of the new github/exa/harness). Add `harness integrations sync`: diff configured servers vs the current `INTEGRATION_REGISTRY`, show newly-suggested + deprecated, and apply changes **only with the operator's consent** (report-only default; `--apply` prompts per group in a TTY; `--yes` for scripts; non-interactive without `--yes` never mutates). Pure `reconcileIntegrations` core; applies via the existing add/remove/dismiss helpers; Tier-1 adds surface the env requirement, never invent a secret. doctor's freshness advisory points at it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1035

### Cloud autopilot: independent diagnostic agent on stuck retry

- **Status:** planned
- **Spec:** —
- **Summary:** Port a convergence lesson from the local-model executor to the cloud autopilot. Today the autopilot's EXECUTE retry budget (harness-autopilot SKILL.md: attempt 1 obvious fix → attempt 2 related files + learnings → attempt 3 full context) escalates **context** but always re-dispatches the **same `harness-task-executor`** persona — it never brings in a *different, diagnosis-focused* agent when the executor is genuinely stuck. The local path added a "reasoner unstick advisory" (#937): after N failed self-corrections it dispatches an independent reasoning model to produce a structured root-cause + concrete fix, prepended to the next attempt's prompt — a validated pattern (re-prompting a stuck executor with more raw context is weak; a fresh independent diagnosis is not). Proposal: on the autopilot's final retry (or a new attempt N+1 before recovery), dispatch an independent diagnostic agent (`harness-adversarial-reviewer` or a dedicated diagnostician) with the task + accumulated diff + exact gate/test failure, and feed its structured `{root cause, prescribed fix}` to `harness-task-executor` instead of only piling on context. Adds agent-independence + structured diagnosis to the retry loop. Notes: (a) adopter-portable skill → must mirror across all 4 platform copies (claude-code/cursor/codex/gemini-cli); (b) scope guard — keep the 3-attempt/1-diagnosis budget so it can't compound failures; (c) design review needed on which persona diagnoses and whether it's a new agent. Related: the gate-failure distiller and per-stage personas from the same campaign are already covered on the cloud path (Claude reads full tool output natively; cloud already delegates to persona subagents), so this is the one genuine local→cloud crossover.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1007

### bug(roadmap): sync writeback resolves shards by title-slug not frontmatter slug, silently aborting the whole batch

- **Status:** planned
- **Spec:** —
- **Summary:** `applyRoadmapDiff` (packages/core/src/roadmap/store/apply-diff.ts) keys every shard by `slugifyFeatureName(feature.name)`, but the sharded store's real identity is the frontmatter `slug` — which `load()` enforces to equal the filename base, and which is frequently a hand-shortened or length-truncated form of the title. For the 22 shards (of 104) where `slugify(title) !== frontmatter.slug` (e.g. filename `lmlm-wire-engine-to-operator-surfaces` vs `slugify("LMLM Phases 4–9: wire the engine to operator surfaces")`), `patchFeature`/`addFeature`/`removeFeature` open `{slugify(title)}.md`, hit ENOENT, and `applyRoadmapDiff` **returns Err on the first failure — aborting the entire writeback batch**. Impact observed live during a full `roadmap sync --apply` (2026-08-04): all 11 external-ID backfills were dropped, `last_synced` was never stamped, and — most dangerously — a create path would have persisted the new issue on GitHub while failing to write its `externalId` back locally, so the next run recreates it (duplicate issues). **Fix:** resolve shards by the loaded feature's frontmatter slug (carry it on `RoadmapFeature` or index `before`/`after` by it), OR make the writeback collect per-shard errors instead of aborting on the first. Add a regression test with a shard whose title-slug ≠ frontmatter-slug. Workaround used on 2026-08-04: hand-backfill External-IDs so `changedFeatureNames` is empty and the buggy path is never entered.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1036

### bug(roadmap): harness roadmap sync never stamps last_synced on success

- **Status:** planned
- **Spec:** —
- **Summary:** `fullSync` (packages/core/src/roadmap/sync-engine.ts) pushes, pulls, and writes back changed rows, but never sets `roadmap.frontmatter.lastSynced`. Because `applyRoadmapDiff` only writes frontmatter when it differs, a successful `harness roadmap sync --apply` leaves `_meta.md`'s `last_synced` untouched — so the field stays stale even though a sync just completed. This is the exact "`last_synced` 22 days behind `last_manual_edit`" symptom the sync command's own docstring cites as its reason for existing, and it undermines the human-always-wins staleness heuristic and any observability keyed on last_synced. Confirmed live 2026-08-04: `--apply` reported 104 patches / 0 errors yet `last_synced` remained at the pre-run value (manually corrected afterward). **Fix:** stamp `frontmatter.lastSynced = now` in `fullSync` before writeback (guard against `Date.now()` in test seams as elsewhere), and cover it with a test asserting last_synced advances on a no-op-diff successful sync.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1037

## v5.0 — Enforcement Hardening

### Audit and cap the pre-commit --skip list

- **Status:** planned
- **Spec:** —
- **Summary:** `.husky/pre-commit:4` silently skips `entropy,docs,perf,security,deps,phase-gate` — six categories disabled at commit time. The skips may be justified individually, but the cumulative silence is the article's failure pattern #2: "every gap was once a known issue. Then it became background noise. Then it became invisible." Either move slow checks to pre-push with no auto-skip, or emit a one-line stderr warning per skipped category so the gaps remain visibly named. Source: Pass 1 #4.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#529

### Require --allow-regress flag on check-arch --update-baseline worsen

- **Status:** done
- **Spec:** —
- **Summary:** `packages/cli/src/commands/check-arch.ts:109-126` — today `--update-baseline` silently accepts regressions. Change semantics so updating a baseline that worsens any metric requires `--allow-regress --reason "..."`. The reason is logged to `.harness/audit.log`. Forces the regression-acceptance decision into the open. Source: Pass 1 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#530

### Harden BASELINE_AUTOAPPROVE_PAT self-approval scope

- **Status:** done
- **Spec:** —
- **Summary:** `.github/workflows/ci.yml:158-176` — the refresh-baselines job opens a PR and self-approves using `BASELINE_AUTOAPPROVE_PAT` when branch protection blocks the direct push. Today the auto-approval fires regardless of what's in the PR. Constrain auto-approval to PRs whose diff is _exactly_ `*-baselines.json` and nothing else. Add a defensive check that fails if the PR diff touches anything outside baselines. Source: Pass 1 #8.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#531

### Build harness:rollback automated-revert primitive

- **Status:** done
- **Spec:** docs/changes/harness-rollback/proposal.md
- **Summary:** When a shipped PR fails post-merge eval (harness:outcome-eval) or triggers a defined signal threshold, automatically open a revert PR with full context. The article's "circuit breaker / automated rollback — a mechanism that physically stops the fall before it hits the ground." Currently the project has no automated rollback primitive — only human-mediated PR review. Needs a "revert ready" classification system and a trust model for auto-merging reverts. Source: Pass 2 #7.
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#533

### Lift packages/cli branch coverage above the article's bar

- **Status:** planned
- **Spec:** —
- **Summary:** `coverage-baselines.json:14-19` — packages/cli currently 64.42% branches and 77.73% lines on the user-facing surface. The article: "if the team can't honestly say a green build is enough to push to production, the test suite isn't a harness — it's a comfort blanket." 64% branches on the CLI entry point doesn't pass that bar. Target ≥80% branches over the next quarter. Tighten the V8 variance tolerance for cli specifically (0.1% not 0.5%). Source: Pass 1 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#544

### Make pre-push test:coverage gate deterministic — isolate parallel-unsafe tests

- **Status:** planned
- **Spec:** docs/changes/faster-gates/proposal.md
- **Summary:** The husky pre-push gate runs `turbo run test:coverage --concurrency=2` across all packages; several heavy IO/git tests are parallel-unsafe and flake non-deterministically under contention — the failing test/package moves run-to-run (observed: `cli#test:coverage`, then `orchestrator#test:coverage`, then cli again). All pass in isolation; CI (clean runner) tolerates them. Known offenders: `packages/cli/tests/hooks/adoption-tracker.test.ts` (writes shared project-root `.harness/metrics/adoption.jsonl` not its tmpdir), `packages/cli/tests/copy-craft/extract-commits.test.ts`, `packages/cli/tests/integration/cli.test.ts` (spawns the CLI; 30s timeout under load). A flaky gate that blocks good pushes is itself an anti-harness pattern — it erodes trust like the "warns but doesn't stop" hooks this milestone targets, inverted (stops, for the wrong reason); on 2026-06-24 it flaked 3+ consecutive times on docs-only changes, forcing API-side landing. Fix: make the heavy tests concurrency-safe (per-test tmpdir + `chdir`, never touch repo-root shared files), or pool-isolate via vitest `poolOptions`/`--no-file-parallelism`; also investigate the turbo-cache miss where `packages/cli/.harness/arch/baselines.json` (auto-mutated by the commit/push arch check) busts cli's `test:coverage` input hash and forces a full re-run. Source: dogfood 2026-06-24 (audit-harness-strength + roadmap-sync pushes). **Spec `faster-gates` broadens this row:** the linked proposal keeps this determinism/isolation work as its Phase 2 (ratcheting the `--concurrency` cap up as offenders are fixed) and adds a Phase 1 — scope `pre-push` to `turbo --affected` + a free GitHub Actions `.turbo` cache for CI + a `coverage-ratchet` partial-tolerance mode — so the common-case push is fast without waiting on the isolation tail.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#620

### required-review-ci: deferred follow-ups (live verification, promote-to-required, --comment)

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-ups deferred from #541 (shipped in PR #623). None block the shipped gate; all are documented in `docs/changes/required-review-ci/proposal.md`. Deferred items - **Promote the gate to a required check (SC8):** apply `templates/ci/required-review.ruleset.json` via `gh api repos/{owner}/{repo}/rulesets` once the non-blocking dogfood run proves stable, and flip the dogfood workflow off `continue-on-error`. - **Live runner verification in CI:** `cursor` (CLI absent locally), `gemini` (auth-blocked locally; superseded by antigravity but the id is retained), and `local` single-pass (needs a running openai-compatible endpoint). Mark each `supported: true` only after a real in-CI/endpoint run confirms its verdict envelope. - **Full-agentic `local` spike (1b):** determine whether a local model can drive the multi-persona tool-use/subagent pipeline; ships only on a 'go'. - **`--comment` PR posting:** currently a documented non-failing stub in `harness review-ci`; wire real PR-review posting (and re-add `pull-requests: write` to the template workflow) when implemented. - **antigravity CI secret:** `GEMINI_API_KEY` is a best-guess pending CI verification (`runner-presets.ts`). Refs: #541, PR #623.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#626

### Adopter-facing git-hook installer for roadmap aggregate regeneration

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from #684 (roadmap sharding). Deferred by design from Phase 6 rollout. #684 ships sharding with the **CI aggregate-drift check** (`harness validate`) as the portable adopter freshness contract, plus the local `.husky/{pre-commit,post-merge}` regen hooks for this repo (dev convenience). **Not** shipped: an installer that sets up the regen git-hooks in an *adopter's* repo. Rationale: harness installs no git hooks today, and a general installer must compose with arbitrary adopter husky/`.git/hooks` setups — its own scoped piece of work. The CI drift-check already keeps adopters correct (invariant R means a missed regen only yields a stale *cosmetic* aggregate, never wrong tooling). **Scope if pursued:** - Decide mechanism (husky vs raw `.git/hooks` vs a `harness hooks install` command) and composition with existing adopter hooks. - Wire into `harness init` (opt-in) for new projects; a one-shot install for existing adopters who run `harness roadmap shard`. - Keep it optional — CI drift-check remains the authoritative freshness mechanism. See ADR 0050 (read-source invariant R) and docs/guides/roadmap-sharding.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#688

### Plugin generator leaks globally-installed skills into repo artifacts

- **Status:** done
- **Spec:** —
- **Summary:** Problem `pnpm generate:plugin:all` (and `generate-slash-commands`), run by the pre-commit hook whenever `agents/skills/` is staged, scans **globally-installed** skills — not just the repo's own `agents/skills/`. On a developer machine with third-party skills installed, those command files get written into the repo's tracked plugin dirs (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`) and auto-`git add`ed into the commit. Impact Any contributor with global skills installed leaks foreign command files into harness-engineering on every `agents/skills/` commit. Discovered while adding the `product-advisor` skill — 8 global commands were swept into the commit and had to be manually stripped before push (see PR for product-advisor). Proposed fix Scope the plugin/slash-command generators to the repo's own `agents/skills/` tree only (exclude globally-resolved skill dirs). Likely in `scripts/generate-plugin*.mjs` / `scripts/lib/plugin-config.mjs` and the `resolveAllSkillsDirs` path used during generation. Workaround until fixed Strip non-repo plugin command files from the commit before push (amend staging only plugin files so the pre-commit hook's `agents/skills/` trigger doesn't re-fire).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#704

### pre-commit hook: ci check | tee masks exit code, so the fail-closed arch gate never blocks

- **Status:** done
- **Spec:** —
- **Summary:** Summary `.husky/pre-commit` documents itself as **fail-closed** ("any check failure (including arch regressions) blocks the commit"), but the guard never blocks because the failing command is piped into `tee`. A shell pipeline's exit status is that of the **last** command (`tee`, always 0), not `node … ci check`. So an arch regression, validate failure, or traceability failure prints the red `x … fail` output and the commit proceeds anyway. Location `.husky/pre-commit`, lines ~5: `! (node … | tee)` evaluates `tee`'s exit code, which is 0 whenever `tee` writes successfully — regardless of whether `ci check` failed. Reproduction Observed while committing on `fix/issue-723-drift-config-python-symbols` (PR #724): the pre-commit output showed …and the commit still completed successfully. The documented block message ("✗ Commit blocked") never fired. Impact The primary local guard against arch/complexity/module-size regressions is silently disarmed. Regressions only get caught later (CI, or the heavier pre-push gauntlet), defeating the fast-feedback intent. The identical pattern should be audited anywhere else a hook pipes a gating command into `tee`/`grep`/etc. Suggested fix Preserve the producer's exit code. Any of: - Add `set -o pipefail` at the top of the hook (bash/zsh), so the pipeline fails if any stage fails; or - Capture explicitly: - Or drop the pipe and redirect: `node … ci check … > >(tee /tmp/…) 2>&1` with the status checked directly. `pipefail` is the smallest, most robust change and also covers the roadmap-regen / plugin-artifact pipelines further down the hook.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#726

### roadmap-auto-done fallback PAT cannot create PRs (Resource not accessible by integration)

- **Status:** planned
- **Spec:** —
- **Summary:** Problem When `.github/workflows/roadmap-auto-done.yml` cannot direct-push the shard flip to `main` (branch protection: "changes must be made through a pull request"), it falls back to opening a self-approved PR. That fallback **fails**: The token used for the fallback lacks `pull-requests: write` (or is the integration `GITHUB_TOKEN`, which is restricted from creating PRs). Result: the merged PR closes the issue, but the roadmap row is left at `planned` while the issue is `CLOSED`, and an orphaned `chore/auto-done-prNNN-*` branch accumulates on the remote. Impact This is **not** specific to one PR — **every** auto-done that cannot direct-push (i.e. whenever branch protection is active on `main`) fails the same way, silently leaving the roadmap inconsistent. It's a gap in the post-ship enforcement path. Observed - PR #779 merged, issue #533 CLOSED/COMPLETED, but shard stayed `planned`. Rescued manually via PR #780 (reused the workflow's own commit `59ccbd430`). - Failing run: roadmap-auto-done for PR 779 (2026-07-09T16:52Z). Fix direction Grant the fallback path a PAT with `pull-requests: write` (the workflow already references `AUTOAPPROVE_PAT` for the self-approval — verify it also has PR-create scope and is passed to the `gh pr create` step), and add a cleanup step for the orphaned `chore/auto-done-*` branches. Consider failing loudly (or emitting a Signal) when the roadmap flip does not land, so the inconsistency is visible rather than silent.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#781

## v5.0 — Catalog Rationalization

### Change init skill default recommendation away from "basic"

- **Status:** blocked
- **Spec:** —
- **Summary:** `agents/skills/claude-code/initialize-harness-project/SKILL.md:45,533` recommends "basic" by default for new projects. Combined with the no-thresholds basic template, this steers adopters directly into the configuration that does NOT deliver the article's harness. Change default recommendation to a new "load-bearing minimum" tier (item below). Source: Pass 3 #1.
- **Blockers:** Add "load-bearing minimum" tier
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#538

### Add "load-bearing minimum" tier between intermediate and advanced

- **Status:** blocked
- **Spec:** —
- **Summary:** Today: basic = layer linter; intermediate = layer linter + 1 forbidden import; advanced = full kit with all the dogfood-inherited overhead. What's missing is a tier between intermediate and advanced — a "load-bearing minimum" template that ships exactly: ESLint plugin + complexity cap (15) + module-size cap + multi-persona review wired into the CI workflow template + harness:outcome-eval skill. The minimum article-aligned harness without the advanced-tier surface area. Source: Pass 3 #12.
- **Blockers:** Build harness:outcome-eval skill, Ship a CI workflow template, Ship a required-review GitHub Action template
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#539

### Invert the implementation guide framing

- **Status:** blocked
- **Spec:** —
- **Summary:** `docs/standard/implementation.md:9-53` stages adoption as Level 1 (1-2 weeks) → Level 2 (2-4 weeks) → Level 3 (4-8 weeks). Total 7-14 weeks to reach what the article calls "the harness." The article: "Build the harness first. Then climb." The implementation guide: "Grow into the harness over three months." Rewrite so it doesn't sell weeks-to-the-harness. Lead with the load-bearing minimum tier as the starting point. Treat the rest as ambitious, not necessary. Source: Pass 3 #2 (CRITICAL — strategic positioning).
- **Blockers:** Add "load-bearing minimum" tier between intermediate and advanced
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#542

### Retire ~350 shelf-ware skills

- **Status:** planned
- **Spec:** —
- **Summary:** Pass 4 catalog audit: 598 of 755 SKILL.md files (79%) self-declare `Type: knowledge — not a procedural workflow, no tools or state`; 493 of 755 (65%) end with the identical copy-paste Process boilerplate "Read / Apply / Verify"; only ~9% are genuine gear (Iron Law + gates + MCP calls). Concrete retire list: all 23 `gof-*` (LLM-prior, 1994 design patterns), pre-2020 `react-*` (`react-hoc-pattern`, `react-render-props-pattern`, `react-container-presentational`), most `otel-*` (duplicates OpenTelemetry docs), generic `astro-*`/`nuxt-*`/`svelte-*` unless actively shipped. Pair retire with item below (catalog-retrospective skill) to surface candidates and item further below (catalog tiering) to reorganize the remainder. Source: Pass 4 action 1.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#545

### Merge fragmented concept clusters in the catalog

- **Status:** planned
- **Spec:** —
- **Summary:** Three confirmed/suspected clusters of concept fragmentation in the catalog. CONFIRMED: `harness-i18n` + `harness-i18n-workflow` + `harness-i18n-process` — overlap is admitted in i18n SKILL.md:13-14. SUSPECTED: six `harness-design*` skills (`harness-design`, `harness-design-craft`, `harness-design-mobile`, `harness-design-pipeline`, `harness-design-system`, `harness-design-web`). SUSPECTED: `harness-verify` + `harness-verification` + `harness-integrity`. Audit each cluster and merge to one skill per concept. Source: Pass 4 action 2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#546

### Promote 5 domain skills from advisory to load-bearing checks

- **Status:** planned
- **Spec:** —
- **Summary:** Five domain skills have genuine domain-specific assertions but are currently prose-only advisories. Wire them as load-bearing checks invoked by their parent harness skill: `api-idempotency-keys` → `harness-api-design`; `owasp-injection-prevention`, `owasp-csrf-protection`, `owasp-rate-limiting` → `harness-security-scan`; `a11y-aria-patterns` → `harness-accessibility`. Each is roughly one week of work to convert from advisory prose to a mechanical check. Source: Pass 4 action 3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#547

### Strip copy-paste Process boilerplate from library skills

- **Status:** blocked
- **Spec:** —
- **Summary:** 493 of 755 skills end with identical boilerplate: "1. Read the instructions and examples 2. Apply the patterns 3. Verify your implementation." This is the textbook shelf-ware tell — every skill ends with the same hand-waving three steps instead of an actual procedure. For skills that should remain as library reference (post-retire-decisions), strip the Process section so the catalog stops cosplaying as workflows. Skills are then honestly typed as either gear (procedural) or library (reference). Source: Pass 4 action 4.
- **Blockers:** Retire ~350 shelf-ware skills
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#548

### Tier the catalog with first-class metadata and fix discovery

- **Status:** planned
- **Spec:** —
- **Summary:** Catalog has 755 skills with no tier markers in the user-facing surface. Mark Tier-0 (load-bearing gear, ~12 skills: initialize-project, strategy, brainstorming, planning, execution, verification, code-review, tdd, outcome-eval, audit-harness-strength, debugging, compound), Tier-1 (library, on-demand reference), Tier-2 (deprecated/candidate for retire). Surface tier prominently in the dashboard catalog view and the README. Fix the naming inconsistency: rename `initialize-harness-project` skill to `harness-initialize-project` so it sorts with the workflow gear (slash command stays `/harness:initialize-project`). A senior engineer can hold 12 skills in their head; they cannot hold 755. Source: Pass 2 #9, Pass 3 #6, Pass 3 #7.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#549

## v5.0 — Telemetry & Effectiveness

### Build harness:catalog-retrospective skill

- **Status:** done
- **Spec:** —
- **Summary:** Monthly retrospective that reads `.harness/metrics/adoption.jsonl` (1319 records in dogfood across 80+ days, captures skill+session+startedAt+duration+outcome+phasesReached) and produces a structured report: top-10-most-invoked, top-10-failing, top-10-abandoned-mid-workflow, skills inactive 90+ days. Compounding-via-learning at the catalog grain — the loop the article calls Honnold's "internal harness" applied to the skill catalog. Feeds into catalog cleanup items below. Source: Pass 5 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#536

### Extend skill-effectiveness scorer to skill grain (not just personas)

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/intelligence/src/effectiveness/scorer.ts` currently scores personas using graph-attributed `execution_outcome` nodes. Extend the same Bayesian approach to score skills using `.harness/metrics/adoption.jsonl` data (skill+outcome+duration+phasesReached). Identify failing skills and skills abandoned mid-workflow. Feed into `harness:catalog-retrospective`. Closes the gap: the project has 1319 adoption records but no loop that uses them to improve the catalog. Source: Pass 5 #4.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#550

### Activate the skill-proposal pipeline in dogfood

- **Status:** planned
- **Spec:** —
- **Summary:** The skill-proposal infrastructure exists in full (`packages/orchestrator/src/proposals/`, `packages/core/src/proposals/`, `packages/cli/src/commands/proposals.ts`, ADR 0016 defining the workflow). The README markets it: "agents emit skill candidates that route through soundness gate." But `.harness/proposals/` is EMPTY in the dogfood repo — the loop the project advertises isn't observably running. Investigate why (emission disabled? soundness gate filtering all? proposals deleted?) and either fix or document. Without active proposals, the "learning catalog" claim is theoretical. Source: Pass 5 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#551

### Add Holiday Confidence KPI to STRATEGY.md

- **Status:** planned
- **Spec:** —
- **Summary:** `STRATEGY.md:23-29` defines 5 KPIs (Agent Autonomy, Harness Coverage, Context Density, Drift Floor, External Adoption) — all measure inputs to the harness, none measures what the harness is FOR. Add KPI #6: "Holiday Confidence" — % of merged PRs in the last 30 days where (a) multi-persona review fired, (b) outcome-eval passed, (c) no auto-baseline-update occurred, (d) no signal exceeded threshold. The article's binary "if the senior disappears for two weeks, what holds?" made measurable. Source: Pass 1 #9.
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#552

### Ship aggregate-telemetry synthesis surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` collects rich payload (skillName, duration, outcome, phasesReached, project, team, os, harnessVersion, installId) and streams to PostHog. **No public surface synthesizes this data back.** `core-library-design/proposal.md:1338` planned "Case studies and testimonials" but never delivered. Adopters cannot validate "is this working for teams like mine?" Ship: (a) public adoption dashboard at a known URL aggregating skillName/outcome/phasesReached across the adopter base (anonymized), (b) `docs/case-studies/` directory with quarterly updates derived from telemetry + opt-in interviews, (c) README "Adopters" section with logo wall and headline stats updated by a `harness telemetry publish` script. For a tool that markets compounding-via-learning, the synthesis loop must close. Source: Pass 7-C.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#563

### Extend adoption.jsonl with failure-reason categorization

- **Status:** blocked
- **Spec:** —
- **Summary:** `.harness/metrics/adoption.jsonl` currently captures `outcome: completed|failed` — the WHAT without the WHY. 1319 dogfood records, none with structured failure categorization. Extend the schema: add `failureCategory` field with enum (`prerequisite-missing`, `gate-rejected`, `user-cancelled`, `timeout`, `agent-error`, `dependency-failure`, `inconclusive`). Emitted by skills at gate-result events. Without this, the catalog-retrospective skill and skill-effectiveness scorer (other milestone items) operate on `outcome=failed` as undifferentiated noise. The data layer for compounding-via-learning has to record the WHY, not just the WHAT. Source: Pass 7 final-pass synthesis (collection without synthesis pattern).
- **Blockers:** Build harness:catalog-retrospective skill, Extend skill-effectiveness scorer to skill grain
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#564

## v5.0 — Trust & Security Model

### Move sentinel-pre/post to standard hook profile

- **Status:** done
- **Spec:** docs/changes/sentinel-standard-profile/proposal.md
- **Summary:** `packages/cli/src/hooks/profiles.ts:31-32` — `sentinel-pre` and `sentinel-post` (prompt-injection defense covering zero-width chars, RTL/LTR overrides, role-reassignment, permission-escalation, base64 exfiltration, destructive-bash in tainted sessions) currently ship at STRICT profile only. Default-profile adopters get NONE of this defense. Move to standard. Cost-tracker can remain strict-only as a separate concern. Source: Pass 6 #1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#556

### Pin MCP server version in plugin install + document trust model

- **Status:** planned
- **Spec:** —
- **Summary:** `.claude-plugin/plugin.json:14-16` — `mcpServers.harness.command: "npx -y -p @harness-engineering/cli@latest harness-mcp"`. Every Claude Code session pulls the latest npm publish (subject to npx's ~24h cache). No version pinning by default. A compromised publish propagates to every active adopter within a day. Pin to a specific version; update via plugin update flow. Add `docs/security/trust-model.md` explaining what an adopter trusts when installing each marketplace plugin and how to verify integrity. Source: Pass 6 #4 + #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#557

### Add per-skill capability declarations

- **Status:** planned
- **Spec:** —
- **Summary:** Skills are markdown files; the agent reads them and may take any action the user permitted Claude Code. No skill manifest declares "this skill needs Bash + Edit + WebFetch and nothing else." Add a `capabilities:` manifest field to skill.yaml declaring tool/network/file requirements. The orchestrator/agent enforces it as bounds. Closes the article's gear #4 ("bounded, observable, reversible") at the skill grain — currently it only applies at the orchestrator-workspace grain, and only when the daemon is running. Source: Pass 6 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#558

### Strengthen telemetry consent surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` prints first-run privacy notice to stderr. In IDE sessions stderr is often invisible — adopters technically opted in by installing the plugin but the consent surface is weak. Move the notice to stdout. Optionally add a `harness.config.json` `telemetry.consented: true` field that the adopter must set before first batch send. The PostHog ingest is real (1319 dogfood records over 80 days); the consent surface should match the data flow. Source: Pass 5 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#559

### Add harness mcp list-capabilities CLI for adopter audit

- **Status:** planned
- **Spec:** —
- **Summary:** MCP server has 101 tool files (`packages/cli/src/mcp/tools/`). Per-tool `trustedOutput` flag exists but per-tool capability declarations don't. Adopters have no easy way to audit what their agent can do via MCP. Add `harness mcp list-capabilities --by-permission` CLI command that surfaces each tool's read/write/exec scope, network access, and trust tag. Source: Pass 6 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#560

### Require ADR for operational policy changes

- **Status:** planned
- **Spec:** —
- **Summary:** ADRs in `docs/knowledge/decisions/` capture architectural decisions. Changes to hook profiles, threshold values, `--skip` lists, and baseline-update policies are also load-bearing — and they accumulate silently in commits without ADR-grade artifacts. Add a `harness:check-operational-drift` check (or extend the existing `harness:enforce-architecture`) that flags PRs touching `.husky/`, `harness.config.json` thresholds, the pre-commit `--skip` list, or `packages/cli/src/hooks/profiles.ts` without a corresponding ADR. Forces the "we silently softened a gate" decision to surface as a deliberate ADR-grade record. Closes the surface where Pass 1 #1 (pre-commit auto-baseline) entered the codebase without a documented decision in the first place. Source: Pass 7 final-pass synthesis.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#565

## v5.0 — Article-Framing Docs & Personas

### Invert README lede to lead with the article's binary question

- **Status:** planned
- **Spec:** —
- **Summary:** `README.md:7-19` opens with feature copy: "Mechanical constraints for AI agents. Ship faster without the chaos." Compare against what an article-aligned adopter weighs hardest. Rewrite the top 20% to lead with: "If your senior engineer goes on holiday for two weeks and your agents keep shipping — do you trust what comes out the other side? This tool is the gear list that makes the answer yes." Then walk through the 7 pieces and what the tool ships for each. Today the README sells features; article-readers buy outcomes. Source: Pass 2 #8, Pass 3 #9.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#553

### Adopt the article's framing in docs/standard/principles.md

- **Status:** planned
- **Spec:** —
- **Summary:** `docs/standard/principles.md` opens with "Context Engineering" — an internal abstraction, not a binary test. The article's framing question ("if the senior disappears for two weeks, what holds?") appears nowhere in public-facing docs. Add a Principle #0 (or lift it to the top): "The harness is load-bearing. It catches when no human is watching." Use the article's vocabulary (load-bearing, gear, holiday test) in principles so adopters get the framing they came for. Source: Pass 3 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#554

### Document the article's failure-pattern checklist

- **Status:** planned
- **Spec:** —
- **Summary:** New `docs/standard/article-failure-patterns.md`. Name the article's five failure modes (theatre, gaps stopped naming, happy-path-only, no eval, no safe failure mode). For each, point at how `harness:audit-harness-strength` (new skill above) detects it in the adopter's own project. Provides the conceptual scaffolding for the self-audit tool. Source: Pass 1 #10.
- **Blockers:** Build harness:audit-harness-strength self-audit skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#555

### Ship agent-rehearsal fixtures and harness:rehearse skill

- **Status:** planned
- **Spec:** —
- **Summary:** The article's deepest insight: Honnold rehearsed the crux moves on a rope until his body knew them, THEN soloed. The project has no analog. `examples/` (hello-world, multi-tenant-api, slack-echo-bridge, task-api) are showcase scaffolds, not failure-scenario fixtures. Ship `templates/rehearsal-fixtures/` containing deliberately-broken scaffolds across common failure modes (race condition, partial migration, edge-case data corruption, dependency cycle, layer violation, leaked secret). Build `harness:rehearse` skill that runs an agent against a chosen fixture and scores recovery. Used to (a) train agent personas before production trust, (b) regression-test the harness's own gates against known failure shapes, (c) give adopters a way to verify their gates fire before betting the climb on them. Source: Pass 7-A.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#561

### Build harness:offboarding skill symmetric to onboarding

- **Status:** planned
- **Spec:** —
- **Summary:** `harness:onboarding` exists for arrivals. There is no symmetric `harness:offboarding` for departures. Article framing is the team-shrinkage scenario; the transition is the load test. Without an extraction flow, the social knowledge the departing engineer enforced informally is lost the day they leave. Build `harness:offboarding` that conducts a structured debrief (recent decisions made, undocumented gotchas, conventions held in head, areas of expertise, known fragile components), generates ADR drafts and knowledge graph entries from the answers, and reviews the AGENTS.md / STRATEGY.md / learnings.md surfaces against the answers to identify gaps. Output: a structured `docs/knowledge/handoff-{person}-{date}.md` file plus graph ingestion. Source: Pass 7-B.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#562

### Build harness-pm persona for eval suite and acceptance criteria ownership

- **Status:** done
- **Spec:** docs/changes/harness-pm-persona/proposal.md
- **Summary:** The companion article "AI Ate My Role" defines three surviving Project Manager lanes: Taste PM (product thesis), **Harness PM (eval suite design + acceptance criteria)**, Boundary PM (compliance). The project ships 15 personas — all engineering-shaped (code-reviewer, architecture-enforcer, security-reviewer, performance-guardian, planner, task-executor, etc.). **Zero PM-shaped personas exist.** Build `harness-pm` persona that owns: (a) reviewing every spec's acceptance criteria for observability/testability/completeness, (b) ensuring eval suite coverage matches the spec's user-visible behavior section, (c) catching specs that ship without measurable success criteria. Pairs with `harness:outcome-eval` (which produces the eval verdicts) to give that eval an organizational owner. The article: "Quality became something that happened _to_ the work, not something that lived _inside_ the work. The new role sits at parity with engineering, not downstream." Source: Pass 8 (AI Ate My Role + Anatomy companion articles).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#566

### Ship golden-build reference-state primitive

- **Status:** planned
- **Spec:** —
- **Summary:** The "Anatomy of an AI-Native Org" companion article lists four required gear pieces: "specifications, evaluation suites, golden builds, and agent-review patterns." The project has the first, partial second, fourth — but no golden build primitive. The existing baselines (`coverage-baselines.json`, `benchmark-baselines.json`, arch baselines) are **metric baselines, not build baselines**. A golden build is the canonical known-good reference state (last passing main with a full eval pass) that all proposed changes are validated against — closer to an immutable release-tag concept than a metric snapshot. Ship: (a) `harness golden-build promote` command that snapshots a verified-passing state to `.harness/golden/`, (b) `harness golden-build verify` that compares the working tree against the most recent golden, (c) CI integration that auto-promotes a golden build on every green main merge, (d) `harness golden-build diff` for reviewing what's drifted since the last golden. Closes the gap between "metrics didn't regress" and "the project as a whole is still the project we trust." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#567

### Reframe principles.md around Why/What/How three-layer model

- **Status:** planned
- **Spec:** —
- **Summary:** "The Anatomy of an AI-Native Org" companion article structures AI-native orgs as three enduring layers: Why (strategic conviction, small), What (taste/judgement, growing — the "dominant middle"), How (architecture/trust-systems/harnesses, shrinking). The project's artifacts already map cleanly: STRATEGY.md = Why, specs in docs/changes/ + ADRs = What, code + skills + ESLint plugin = How. But `docs/standard/principles.md` opens with "Context Engineering" — an internal abstraction — and the Why/What/How vocabulary appears nowhere in public-facing docs (only coincidental matches in developer-quickstart table headers). Reframe `principles.md` so principle #0 names the three layers, maps the project's artifacts onto them, and explains that the harness is what makes each layer reliable. Adopters reading the article series land on this doc and immediately see "I know this framework." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#568

### Build senior-engineer accountability surface for PR push

- **Status:** done
- **Spec:** docs/changes/senior-accountability-surface/proposal.md
- **Summary:** "The Tests We Skipped" companion article: _"the person who writes the code is the person who pushes it to production. Full stop."_ In the agent-shipping flow, the agent writes; the senior engineer pushes (merges). The accountability does not transfer to the agent — it stays with the human who clicks merge. The project today does not produce a senior-facing "you are pushing X; here's what you should look at before approving" surface. Build: (a) `harness:pre-merge-brief` skill that produces a senior-facing digest on every PR with the diff summary, multi-persona review verdict, outcome-eval result (when available), signal-deltas, and a "things specifically worth your eyes" section, (b) GitHub Action that posts this as a PR comment, (c) optional gating that the merge button requires the senior to acknowledge the brief. Closes the "harness for the human too" mandate Ajey states explicitly. The same gear that protects the agent also protects the senior who's accountable. Source: Pass 8 (The Tests We Skipped companion article).
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#569

### Build harness:apprenticeship for the new junior-engineer pathway

- **Status:** planned
- **Spec:** —
- **Summary:** "AI Ate My Role" companion article on Junior Engineers: _"We're going to lose a generation if we don't think harder about this."_ The apprenticeship pipeline — code-writing as the learning mechanism — is broken. The new path is reading-and-judging muscle, outcome ownership, mentorship on _why_ not syntax. The project has `harness:onboarding` (technical orientation: read AGENTS.md, harness.config.json, learnings.md, state.json) but it serves arrivals at any skill level. There is no skill specifically designed to develop the _new_ junior-engineer capability: judging agent-generated code, reviewing for taste and architectural fit, articulating _why_ a change is right or wrong without writing the replacement themselves. Build `harness:apprenticeship` that (a) presents agent-generated PRs as judgment exercises, (b) scores the junior's review against the multi-persona review verdict, (c) compounds learning into a personalized judgment-skills graph, (d) flags judgment patterns that need mentor input. Strategic bet: the projects that ship this pathway will be where the next generation of senior engineers actually develops. Source: Pass 8 (AI Ate My Role companion article).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#570

### Wire outcome-eval into the lifecycle as an automatic spec-satisfaction gate

- **Status:** planned
- **Spec:** —
- **Summary:** outcome-eval is the harness's first blocking post-execution spec-satisfaction gate, but nothing invokes it automatically — verified 2026-06 it is absent from .husky/, .github/workflows/, AND the harness-autopilot VERIFY/INTEGRATE/REVIEW loop. Its blocking authority (high-confidence NOT_SATISFIED) only bites when a human or agent chooses to run /harness:outcome-eval or mcp**harness**outcome_eval. Wire it in: (a) call outcome_eval in harness-autopilot after REVIEW (post-execution, before PHASE_COMPLETE), gathering diff+testOutput from the session and halting on a blocking verdict; (b) add a pre-merge CI job (sibling to .github/workflows/required-review.yml) that runs it on PRs and surfaces the verdict, blocking only on high-confidence NOT_SATISFIED. This makes the #1-gap gate actually load-bearing and unblocks the assumptions baked into #569 (pre-merge-brief surfaces 'outcome-eval result when available'), #533 (post-merge rollback on failed eval), and #552 (Holiday Confidence KPI measures 'outcome-eval passed'). Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#662

### Honor persona-declared triggers — emit and commit persona CI workflows and scheduled jobs

- **Status:** planned
- **Spec:** —
- **Summary:** Persona YAMLs (agents/personas/\*.yaml) declare on_pr/on_commit/scheduled(cron) triggers and outputs.ci-workflow: true, and a generator exists (packages/cli/src/persona/generators/ci-workflow.ts), but — verified 2026-06 — NO generated persona workflow is committed and nothing honors the triggers; they are dead declarations. Make them real: run the persona CI-workflow generator and commit the resulting .github/workflows/ so declared triggers actually fire, plus a check that fails when a persona's declared trigger has no committed workflow (drift guard, mirrors generate:plugin:check). First consumer: the new harness-pm persona (#566) auto-runs acceptance-eval on PRs touching docs/changes/\*\* — closing the manual-only gap for the upstream acceptance-criteria gate. Also lights up the currently-dormant declarations on codebase-health-analyst (dependency-health, hotspot-detector, cleanup-dead-code — weekly sweep), performance-guardian (perf), entropy-cleaner (cleanup), graph-maintainer, and security-reviewer (on_pr deep OWASP/threat-model review beyond CI's lightweight security-scan). Today the project's strongest gear is opt-in; this makes it load-bearing without a human remembering to invoke each persona. Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#663

### Auto-wire standalone drift and audit pipelines on PRs

- **Status:** planned
- **Spec:** —
- **Summary:** Several high-value checks have no owning persona, so the persona-trigger work (above) does not cover them, and — verified 2026-06 — none runs automatically on PRs: detect-design-drift / design-pipeline (design-system drift), detect-doc-drift / docs-pipeline (doc drift; only a lightweight slice runs today inside the entropy check in harness.yml), supply-chain-audit (6-factor dependency risk), and test-advisor (test-strategy/coverage advice). Add PR-scoped CI jobs (path-filtered where sensible: design-drift on UI/token paths, supply-chain-audit on dependency-manifest changes, doc-drift on docs/source changes, test-advisor on test/source changes) that run these and surface findings, advisory-by-default with opt-in blocking. Note the agent-runtime constraint: the full LLM-judgment pipelines need an agent runner (the required-review.yml 'harness review-ci' pattern), not just the lightweight CLI validators GitHub Actions can run unaided. Recommended priority: P2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#664

### Add pre-merge-brief acknowledgment merge gate

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up to the senior accountability surface (#569, D3): a hard merge gate requiring the senior to acknowledge the pre-merge brief. Needs an ack-observing webhook/bot and a branch-protection ruleset. Deferred from v1 (shipped non-blocking first, matching required-review's rollout). The brief it acks already exists once #569 ships.
- **Blockers:** Build senior-engineer accountability surface for PR push
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#731

### Graduate pre-merge-brief to adopter template + ruleset

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up to the senior accountability surface (#569, D5): ship the adopter-facing pre-merge-brief as a templates/ci/*.yml.hbs rendered by `harness init`, plus a ruleset for the eventual gate. Deferred so the brief's Markdown format bakes on dogfood PRs before adopters are locked in — mirrors how required-review graduated. Natural companion to fully extracting signal providers into shared core.
- **Blockers:** Build senior-engineer accountability surface for PR push
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#732

## Full-lifecycle reach

### Product-requirements skill (close the PRD middle)

- **Status:** done
- **Spec:** docs/changes/product-requirements-skill/proposal.md
- **Summary:** **Priority: NOW.** A guided-interview skill sitting between `product-advisor` (BRD) and `brainstorming` (spec): user stories, acceptance criteria, prioritization — the product-management middle that is currently fused into the proposal. Same `configuration-interviewer` pattern as product-advisor/strategy. Output feeds `acceptance-eval` directly. Double duty: closes a lifecycle gap AND a non-technical intent edge. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#709

### UAT / user sign-off loop (close the outcome edge)

- **Status:** planned
- **Spec:** —
- **Summary:** **Priority: NOW.** The mirror of `product-advisor` at the far end: validate shipped work against the BRD's open items, client-facing, dashboard-driven. Closes the inception → acceptance circle that is currently open. Distinct from `acceptance-eval` (pre-build spec completeness) and `outcome-eval` (agent-side spec-satisfaction verdict). --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#710

### Role-shaped dashboard front doors (non-technical lanes)

- **Status:** planned
- **Spec:** —
- **Summary:** **Priority: NEXT.** PM/BA and client lanes through the existing dashboard + router + chat: author intent, watch agents, adjudicate at decision points — no terminal. The surfaces exist; they need role-scoped paths. Lever for non-technical access per the Full-lifecycle reach track. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#711

### Extend enforcement past ship (deployment + operations)

- **Status:** planned
- **Spec:** —
- **Summary:** **Priority: NEXT.** Upgrade `harness-deployment` from Tier-3 advisory to enforcing, and add an operations skill that pulls production signals (incidents, monitoring) back into the knowledge graph. Today the lifecycle stops enforcing the moment code ships; this extends the constraint loop past release. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#712

### Risk forecasting, not estimation

- **Status:** planned
- **Spec:** —
- **Summary:** **Priority: LATER.** Skip story points. Surface the intelligence pipeline's CML complexity + PESL simulation scores as a pre-execution *confidence & blast-radius* forecast — the estimate that actually matters when an agent does the work. Reframes the estimation gap using primitives that already exist. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#713

### Make the artifact chain visibly one thing (dashboard trace)

- **Status:** planned
- **Spec:** —
- **Summary:** **Priority: LATER.** Trace a single engagement BRD → spec → plan → code → outcome in the dashboard so the 'documents are runtime' thesis is legible to a non-technical stakeholder at a glance. Narrative/visualization, not new machinery. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#714

## Craft Pipeline

### harness:craft-pipeline orchestrator

- **Status:** blocked
- **Spec:** —
- **Summary:** Initiative parent. Cross-domain LLM-judgment ceiling pipeline that composes domain-specific craft skills the same way harness:docs-pipeline composes documentation skills and harness:design-pipeline composes design skills. Each sub-project is a domain-specific ceiling-raiser to a rule-based floor counterpart. Pattern established by design-craft-elevator (design-pipeline sub-project #6, the prototype) and codified in ADRs 0018 (LLM-judgment skill pattern), 0019 (3-axis output model), 0020 (living-catalog H pattern), 0021 (detect-and-offer B' pattern). Sub-projects: #1 naming-craft (cross-cutting), #2 docs-craft, #3 test-craft, #4 code-craft, #5 copy-craft (errors + log lines + commit messages), #6 spec-craft, #7 api-craft, #8 cli-ergonomics, #9 knowledge-craft, #10 security-craft (judgment-based threat modeling). design-craft-elevator (design-pipeline #6) is a peer member by composition (kept in design-pipeline initiative for cohesion with the rest of the design family). Each sub-project ships its own catalog (rubrics + patterns + exemplars) and shares the LLM provider, finding schema, and growth infrastructure from ADRs 0018-0021. Orchestrator phases mirror docs-pipeline / design-pipeline: FRESHEN catalog freshness → JUDGE (run each craft skill) → SUGGEST (POLISH-equivalent across all skills) → BENCHMARK (against per-domain exemplars) → REPORT.
- **Blockers:** craft-pipeline sub-project #2: docs-craft, craft-pipeline sub-project #4: code-craft, craft-pipeline sub-project #7: api-craft, craft-pipeline sub-project #8: cli-ergonomics
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#374

### craft-pipeline sub-project #2: docs-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for documentation quality — the ceiling counterpart to harness-detect-doc-drift / harness-check-docs / harness-docs-pipeline (which enforce existence, link freshness, coverage). Ceiling questions: does this doc teach? does the order match the reader's mental model? are examples earning their place? is prose alive or bureaucratic? does the API doc predict the response shape? would a stranger walk away with the same understanding? Direct structural twin of design-craft-elevator — same B' progressive upgrade to a docs intent skill if no doc style guide exists, same 3-axis findings, same growth catalog. Exemplars include Stripe Docs, Vercel Academy, MDN, Linear docs, Tailwind docs. Follows ADRs 0018-0021. ~3-4 week build (catalog-heavy).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#376

### craft-pipeline sub-project #4: code-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for code quality / readability — the ceiling counterpart to harness-entropy-cleaner (dead code, drift), harness-architecture-enforcer (boundaries, deps), complexity thresholds (cyclomatic, cognitive). Ceiling questions: is this code as simple as it could be? does this function tell a story? is this abstraction earned or premature? are these conditionals load-bearing or accidental? is there an obvious-in-retrospect simplification? does the code reveal intent? Possibly the largest-scope craft skill — touches every PR. Follows ADRs 0018-0021. Has overlap with #1 naming-craft (defers naming-specific findings) and #2 docs-craft (defers doc-comment findings). Exemplars: well-cited "good code" from notable codebases (Linear's, Stripe's open work, Vercel's, Anthropic's SDK code).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#379

### craft-pipeline sub-project #7: api-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for API quality — the ceiling counterpart to harness-api-openapi-design and harness-api-webhook-design (knowledge skills, rule-based about format / OpenAPI compliance). Ceiling questions: is this endpoint at the right abstraction? is this HTTP verb honest? does the resource name belong in the URL or should it be a query param? would a stranger predict this response shape from the request? does this error code tell the consumer what to do? is this idempotency-honest? does the API shape match the domain or leak implementation details? Follows ADRs 0018-0021. Exemplars: Stripe API, Linear GraphQL API, GitHub REST v3, Resend API, Anthropic SDK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#382

### craft-pipeline sub-project #8: cli-ergonomics

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for CLI quality — for projects that ship CLIs (including harness itself). NO rule-based floor counterpart. Ceiling questions: does this CLI discover itself? are flag names consistent across subcommands? is help text earning its space or just listing flags? does the output respect the user's terminal (width, color, structure)? does the error path teach what to do next? would a power-user pipe this output to grep/awk and get useful results? would a beginner not piping anywhere understand what happened? Follows ADRs 0018-0021. Exemplars: gh, fly, rg, eza, fd, bun, Linear CLI, the Stripe CLI, mise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#383

## Parallel Execution & State

### Smart-Merge Engine for Parallel-Coordinator Integration

- **Status:** planned
- **Spec:** —
- **Summary:** Port a preflight -> conflict-forecast -> classify -> resolve -> resumable-merge-state pipeline into harness's worktree integration path, replacing the current basic git 3-way + cherry-pick. Predicts conflicts before merging and persists resumable state so an interrupted multi-agent integration can recover. Closes the integration bottleneck for parallel-coordinator execution. Adapted from Spec Kitty's merge/ smart-merge engine. Adoption #3 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#600

### Owned-Files Declaration in Plans/Tasks

- **Status:** planned
- **Spec:** —
- **Summary:** Add an owns:[paths] field to harness plan tasks declaring the source files each task owns, enabling cheap deterministic pre-execution conflict forecasting alongside the heavier graph-based independence check (check_task_independence). A near-free parallel-safety guardrail. Adapted from Spec Kitty's per-work-package owned-files frontmatter. Adoption #4 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#601

### ULID Identity for Sessions and Worktrees

- **Status:** planned
- **Spec:** —
- **Summary:** Adopt collision-free immutable ULID identity for harness sessions and worktree-isolated tasks, with human-friendly numbering assigned only at completion — fixing the worktree/branch/dashboard disambiguation problem that slug-prefix schemes collide on. Adapted from Spec Kitty's ULID mission identity (mission_id immutable, mission_number at merge). Adoption #6 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#603

### Orchestrator Gateway Policy Envelope and Subprocess Air-Gap

- **Status:** planned
- **Spec:** —
- **Summary:** Add a per-call PolicyMetadata envelope (approval mode, sandbox mode, network mode, dangerous-flags, agent family/version) and a zero-import subprocess boundary to the harness orchestrator gateway API (ADR 0011), validated on both ends for safe agent isolation and a full governance audit trail. Complements MCP server version pinning + trust model (#557). Adapted from Spec Kitty's orchestrator-api subprocess air-gap. Adoption #7 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-7]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#604

### Standardize Parallel Execution

- **Status:** done
- **Spec:** docs/changes/standardize-parallel-execution/proposal.md
- **Summary:** Compose the harness's existing parallelism primitives (findParallelGroups wave-grouper, predict_conflicts, worktree isolation) into the standard execution path so sound parallel execution fires automatically instead of only when a human asks. Adds a shared parallelization-planner sub-protocol emitting a ParallelizationPlan (waves + severity + per-wave firing decision), a `dependsOn` task-schema field, and risk-tiered non-blocking dispatch (clean waves announce-and-go, medium/graph-unavailable confirm once, high-severity auto-serialize) wired into harness-autopilot EXECUTE. Execution-first; parallel planning/research and smart-merge (#600) are named follow-ons.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#746

## Planning & Process

### Init design + roadmap polish follow-ups

- **Status:** done
- **Spec:** docs/changes/init-design-roadmap-polish/proposal.md
- **Summary:** DELIVERED (PR #573, merged). Carry-forward polish from init-design-roadmap-config: (S2) refreshed proposal.md:146 stale Registrations bullet to reflect harness-roadmap skill invocation, (S3) added harness-roadmap to initialize-harness-project skill.yaml depends_on for symmetry with harness-design-system, plus FINAL-S1 helper extraction (`packages/cli/tests/integration/_helpers/init-fixture.ts`), FINAL-S2 'not sure' vocabulary homogenization, FINAL-S3 catalog-consistency test docstring clarification + D4/D5 vocabulary regression guards. All spec success criteria are satisfied by code already in main; the row was left `planned` after the merge and was re-dispatched — this flip records the delivery.
- **Blockers:** —
- **Plan:** docs/changes/init-design-roadmap-polish/plans/
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#257

### Diagnose pipeline node-path loss for domain inference

- **Status:** planned
- **Spec:** —
- **Summary:** Phase 6 verification of knowledge-domain-classifier showed SC#15 missed: real-repo unknown bucket went 7500 → 7553 instead of dropping to <100. Helper + wiring + config + integration test all pass; the gap is somewhere between KnowledgePipelineRunner.extract and KnowledgeStagingAggregator.generateGapReport — likely BusinessKnowledgeIngestor / DiagramParser / KnowledgeLinker creating business\_\* nodes without setting node.path. A 30-line diagnostic sampling business nodes post-extraction will localize it in minutes.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#259

### Skill Regression Evaluator

- **Status:** planned
- **Spec:** —
- **Summary:** Golden-fixture evaluation framework for skills: canonical inputs per major skill (brainstorming, planning, spec-craft), semantic scoring @k against golden baselines, token/duration tracking, CI gate on prompt/rule PRs. Adapted from AI-DLC's aidlc-evaluator — the one capability where AWS is categorically ahead. Adoption #1 from docs/research/aidlc-comparison-analysis.md [AIDLC-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#579

### NFR Elicitation in Planning

- **Status:** planned
- **Spec:** —
- **Summary:** Explicit NFR-requirements step in harness-planning eliciting performance, security, scalability, and resilience targets whose outputs become verifiable plan tasks wired to existing perf baselines and security scan machinery — NFRs as proactive design inputs rather than reactive review findings. Adapted from AI-DLC's per-unit NFR requirements/design stages. Adoption #3 from docs/research/aidlc-comparison-analysis.md [AIDLC-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#581

### Question-File Interview Mode

- **Status:** planned
- **Spec:** —
- **Summary:** File-based question/answer mode for strategy, pulse, and brainstorming interviews — durable, team-reviewable, async-friendly decision capture — plus a cross-answer contradiction-detection pass added to existing pushback rules. Adapted from AI-DLC's [Answer]: tag question-file ritual and mandatory ambiguity analysis. Adoption #4 from docs/research/aidlc-comparison-analysis.md [AIDLC-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#582

### Opt-In Constraint Packs

- **Status:** planned
- **Spec:** —
- **Summary:** Opt-in gating for blocking constraint rule packs: lightweight opt-in prompt loaded up front, full rules lazy-loaded only on user consent, then enforced as blocking constraints with per-stage compliance summaries (compliant / non-compliant / N/A). Mapped onto harness security/resiliency rule sets. Adapted from AI-DLC's \*.opt-in.md extension pattern. Adoption #5 from docs/research/aidlc-comparison-analysis.md [AIDLC-5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#583

### Strategy Writing-Inputs Guides

- **Status:** planned
- **Spec:** —
- **Summary:** "Here's what a good input looks like" guides for the STRATEGY interview with full and minimal examples, greenfield and brownfield variants — lowering the quality bar's entry cost for new users. Adapted from AI-DLC's docs/writing-inputs vision and tech-env document guides. Adoption #6 from docs/research/aidlc-comparison-analysis.md [AIDLC-6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#584

### Auto-Triggered Retrospection with Applyable Proposals

- **Status:** planned
- **Spec:** —
- **Summary:** Fire harness:compound automatically at the session/phase terminus (rather than only on human invocation) and emit applyable synthesis proposals that can propagate to the knowledge graph or other in-flight work, not just written to docs/solutions/. Complements the harness:compound skill, harness:outcome-eval (#532), and harness:catalog-retrospective (#536). Adapted from Spec Kitty's retrospective_hook auto-trigger + applyable-proposal shape. Adoption #5 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#602

### Semantic-Vocabulary CI Gate

- **Status:** planned
- **Spec:** —
- **Summary:** Add a harness analog of Spec Kitty's test_no_legacy_terminology architectural test: a CI gate that fails when deprecated or renamed canonical terms reappear in skills/docs, protecting the glossary and naming-craft investment from vocabulary drift over time. Adapted from Spec Kitty's semantic-terminology architectural test. Adoption #8 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-8]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#605

## Dashboard & Visualization

### Dashboard v3: Team & Stakeholder Views

- **Status:** planned
- **Spec:** —
- **Summary:** Persistent hosting option, multi-project aggregation, and presentation polish for the harness dashboard targeting team reviews and stakeholder visibility
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#124

### Dashboard graph chart

- **Status:** planned
- **Spec:** —
- **Summary:** Implement a scalable visual charting component on the graph dashboard to derive and display insights from the underlying core graph structure.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#197

## Maintenance: Lint & Deps

### ESLint Rule: no-spread-in-variadic

- **Status:** done
- **Spec:** —
- **Summary:** New ESLint rule to flag Math.min(...arr) and Math.max(...arr) patterns that throw RangeError when arrays exceed the JS engine call stack argument limit (~65K). 10 instances in codebase. Suggest reduce-based alternatives.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#220

### ESLint Rule: prefer-execfile-over-exec

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag execSync/exec with string commands (shell invocation) and suggest execFileSync/execFile with array args (no shell). Reduces shell injection surface and avoids broken exit code handling with shell redirects. 15+ instances in codebase.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#222

### ESLint Rule: no-undefined-optional-assignment

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #834, merged). New ESLint rule flags `{ optionalField: valueOrUndefined }` assignments that fail with `exactOptionalPropertyTypes`; suggests conditional spread `...(val !== undefined && { field: val })`. Rule implemented at packages/eslint-plugin/src/rules/no-undefined-optional-assignment.ts, registered in the plugin, 13 passing tests. Row was stale — auto-done did not fire because External-ID #223 is the issue number while the merge PR was #834.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#223

### ESLint Rule: no-hardcoded-test-count

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #871, merged). New ESLint rule flags magic-number `toHaveLength(N)` assertions in test files where N matches a registry/array size; suggests dynamic `.length` references. Rule implemented at packages/eslint-plugin/src/rules/no-hardcoded-test-count.ts, registered as an 'error' in the recommended config, tests passing. Row was stale — auto-done did not fire because External-ID #224 is the issue number while the merge PR was #871.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#224

### Migrate to @google/genai SDK

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (commit eb801b788, "chore(orchestrator): migrate to @google/genai 2.x SDK"; CHANGELOG a6f7cd3). packages/orchestrator gemini backend imports @google/genai (package.json: @google/genai@^2.0.4); the deprecated @google/generative-ai is fully removed. GeminiBackend public API unchanged. Row was stale — completed via a commit whose PR number differs from External-ID #298, so auto-done never fired.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#298

### Upgrade @hono/node-server to v2

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (commit 0ca37f4cf, "chore(deps): upgrade @hono/node-server to v2.0.4"). packages/dashboard runs on @hono/node-server v2 and the pnpm.overrides pin is relaxed to ">=2.0.10" (package.json). Row was stale — completed via a deps commit whose PR number differs from External-ID #299, so auto-done never fired.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#299

### review floor: SQL_CONCAT_PATTERN flags markdown prose as CWE-89 (false positive)

- **Status:** done
- **Spec:** —
- **Summary:** Summary The security floor reviewer's SQL-injection detector (`SQL_CONCAT_PATTERN` in `packages/core/src/review/agents/security-agent.ts:28`) matches **plain prose**, not just code. It fires `critical` "Potential SQL injection via string concatenation (CWE-89)" findings on markdown skill docs that contain no SQL at all. Because `required-review` blocks on `critical` findings and the floor tier runs without LLM adjudication when `ANTHROPIC_API_KEY` is absent (e.g. some CI runs), a single prose false positive hard-blocks a PR. Reproduction PR #656 (skill prose edits) failed `required-review` with 5 blocking findings, all the same false positive. The trigger was a **pre-existing** heading in `harness-integration` SKILL.md: The pattern: matches `UPDATE ... + large` — a SQL keyword followed anywhere on the line by `+ <word>`. SQL keywords like `UPDATE`/`CREATE`/`DELETE` are common English/markdown words, so any heading or sentence such as "UPDATE (medium + large tiers)", "CREATE or DELETE + re-run", etc. trips it. The finding only surfaces when the floor reviewer scans a changed file, so it lies dormant until any PR happens to touch the file — then blocks that unrelated PR. (Worked around in #656 by rewording the heading `+` → `and`. That's per-file whack-a-mole, not a fix.) Why it's wrong - The detector runs line-by-line over the **entire content of changed files**, including markdown/prose, comments, and docs — not just code. - The first alternative has no requirement that the `+` is adjacent to a string literal or that the SQL keyword is in a query context. `KEYWORD ... + word` anywhere on the line is enough. - Severity is `critical` and blocks `required-review`, so a prose match is maximally disruptive. Proposed fix (options) 1. **Restrict to code contexts.** Skip non-code files (`.md`, `.txt`, `.toml` command renders, prose blocks) and/or only run within fenced code blocks for doc files. 2. **Tighten the regex** so the `+` must be adjacent to a string literal / template boundary (e.g. require a quote or backtick near the concatenation), reducing matches on `KEYWORD ... (a + b)` arithmetic-style prose. 3. **Require a string-literal SQL context** (a quoted string containing the keyword) before flagging concatenation, rather than a bare keyword token. 4. At minimum, **downgrade prose-only matches below the blocking threshold** so they comment rather than request-changes. Acceptance - A markdown heading like `UPDATE (medium + large tiers)` produces **no** `critical` finding. - A genuine `db.query("SELECT * FROM users WHERE id = " + userId)` still flags CWE-89. - Regression test covering both cases in the security-agent suite. Detector: `packages/core/src/review/agents/security-agent.ts:28` (`SQL_CONCAT_PATTERN`), emitted at `:85-101`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#657

### feat(design): support path exclusions for the design-token drift linter (design.exclude)

- **Status:** planned
- **Spec:** —
- **Summary:** Problem Since v4, `harness validate` runs the design-token drift linter (DRIFT-T001..T004) over every `.ts/.tsx/.js/.jsx/.css/.scss` file under the project root (skipping only `node_modules`/`dist`/`build`/`coverage`/dot-dirs). The only configuration surface is `design.strictness` and `design.audit.driftDetection.enabled`. In a real monorepo this produces thousands of unavoidable findings: - **The token palette sources themselves** (e.g. a `tokens-reference.ts` or generated `theme/tokens.ts`) by definition contain raw hex literals — ours account for 350+ DRIFT-T001 errors. - **Test files** asserting on rendered colors/fonts. - **Non-UI code** (backend service definitions, DSL/DAG files) where hex strings aren't design tokens at all. With no way to scope the linter, the practical options today are `strictness: permissive` (gate passes but output is still swamped) or disabling drift detection entirely — losing the signal where it *is* valuable (component source in the UI package). Proposal Support an exclusion/scoping config for drift detection, mirroring the existing `security.exclude` shape, e.g.: An `include` allowlist (or per-path severity, e.g. error in `packages/ui`, warn elsewhere) would be even better, but plain excludes would unblock most monorepos. Context harness-engineering CLI 4.1.0. Observed while re-greening `harness validate` after the 2.8 → 4.x upgrade: 1,614 findings, 1,545 errors, 100% from `driftDetection`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#742

### bug(design): drift scanner flags hex-shaped strings inside comments (issue refs like "(#529)" reported as color #529)

- **Status:** done
- **Spec:** —
- **Summary:** Summary The design-token drift scanner (harness 4.1.0, `harness check-design`) matches hex-shaped strings inside **comment text**, producing two false-positive classes: 1. **Issue references parsed as colors** — `(#529)` in a JSDoc becomes a DRIFT-T001 finding for "color `#529`". A 2026-07-07 scan of our repo counted exactly 365 findings of this class (message hex matching `/^[0-9]{3,4}$/`): 344 are issue/PR references in comment text; 13 are issue refs inside string literals (test titles like `describe('… (#332 Tier-3)')` — still false positives, but comment-stripping alone would not catch them); and 8 are genuine all-numeric hex color literals (e.g. `#666`/`#777`/`#333`/`#999` in an inline-CSS template string, `packages/test-reporting/src/rollup.ts:134-149`) — true positives that happen to match the same shape. 2. **Hex values in comment prose** — a doc comment _describing_ a color (e.g. "renders `#e63535` on error") is flagged as a hardcoded color even though no code literal exists. 12 documented sites in one package (`packages/ui/src`, inventory below). Reproduction `harness check-design --json` reports a DRIFT-T001 finding for `#529` in `repro.ts`. Actual scanner output (from our repo, harness 4.1.0) Class 1 — issue reference parsed as a color: Class 2 — hex value in JSDoc prose (no code literal on the line): Class-2 inventory from one package (`packages/ui/src`), all inside JSDoc/comment text: | File:Line | Value in comment | | ------------------------------------------------------------- | ---------------- | | `auth/AuthErrorScreen/types.ts:32` | `#e63535` | | `auth/AuthErrorScreen/types.ts:34` | `#e6353514` | | `challenges/ActiveChallengeListCard/types.ts:13` | `#1B7FC3` | | `home-dashboard/FeaturedCarousel/index.tsx:66` | `#1b7fc3` | | `home-dashboard/FeaturedCarousel/index.tsx:67` | `#1b7fc318` | | `home-dashboard/KPICardHeroMilestoneTrackSplit/index.tsx:220` | `#f2ede0` | | `layout/AppShell/Sidebar.tsx:241` | `#e3f0f9` | | `theme/generate-client-palette.ts:24` | `#ffffff` | | `theme/generate-client-palette.ts:114` | `#1b7fc3` | | `theme/generate-client-palette.ts:162` | `#aabbcc` | | `theme/generate-client-palette.ts:184` | `#1b7fc3` | | `theme/generate-client-palette.ts:190` | `#1b7fc3` | (The same matcher also hits spacing prose: a comment line `* - bottom: 5px progress bar ...` produces a DRIFT-T003 finding.) Expected Comments are not style declarations. The scanner should strip comments before matching — comment-context detection is the correct fix (a string-literal context check would similarly address the test-title refs). A skip-bare-numerics heuristic ("skip matches whose captured value is a bare 3–4 digit number") is only an explicitly lossy stopgap: it would also suppress genuine 3-digit hex color literals (8 such true positives in our scan, e.g. `#666`/`#333` above), trading false positives for false negatives. Relationship to #742 Related but distinct: #742 (`design.exclude`) is **path scoping** — it lets users exclude files. This issue is a **matcher bug** that produces false positives in files users legitimately want scanned; scoping cannot fix it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#750

### Maintenance checks need a standard machine-parseable findings contract

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** `harness maintenance run` derives each task's findings count by regex-recovering it from free-text check output (`N findings|issues|violations|errors`, plus a keyword fallback in `classifyCheckExecutionFailure`). This is fragile: `doc-drift` (`check-docs`) and `entropy` (`cleanup`) emit no clean count and rely on recovery; if any check changes its output wording the count can silently break (the same class of bug that originally made the report show a uniform '1 finding'). **Proposal:** give maintenance check subcommands a standard machine-readable findings contract (e.g. a `--json` mode emitting `{ findings: N, ... }`) and have the runner consume that instead of regex-recovering from prose. Cross-cutting across ~18 check commands — deserves its own spec. **Scope note:** deliberately deferred from #687 to avoid scope creep; the regex recovery is the documented stopgap.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#691

### Speed up the entropy/cleanup maintenance check (~165s sweep long-pole)

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** the `entropy` maintenance task runs `cleanup` (all entropy types), which takes ~165s on this monorepo — the long pole of `harness maintenance run --all`. It fits within the 300s per-check budget but dominates sweep wall-clock. **Proposal:** profile/optimize `cleanup` / entropy detection (incremental scan, caching, or scoping). Pre-existing command perf, not introduced by #687. **Workaround today:** `harness maintenance run --skip entropy`, and it only runs weekly on the cron schedule.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#692

### Sharded roadmap: archive done rows into docs/roadmap.d/archive/

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from #684 (roadmap sharding). Keep the active shard set lean by moving `done` rows out of `docs/roadmap.d/` into a `docs/roadmap.d/archive/` subdirectory — the sharded equivalent of the existing `docs/roadmap-archive.md` + RMH001 + groom "archive done" behavior. **Why this is the one organization idea worth doing** (per-status subdirs were rejected — path should encode identity/slug, not mutable status; a status change shouldn't move a file): - `done` is terminal/one-way, so the move cost is bounded (unlike planned↔in-progress↔blocked churn). - At merge time the active set was ~175 shards, roughly half done. **Scope / design constraints:** - The store/reconciler must MOVE a shard into `archive/` on the `done` transition (not just patch in place) — touches `patchFeature` + the auto-done reconciler. - `readShardDir`/assembler must glob recursively and keep slug uniqueness across `docs/roadmap.d/` and `docs/roadmap.d/archive/`. - Must UNIFY with the existing `docs/roadmap-archive.md` + RMH001 + groom archive path, not add a second archive mechanism. - Preserve invariant R (only the regenerator reads the aggregate) and the conflict-free single-shard-per-row property. See ADRs 0050 (read-source invariant) and the proposal at docs/changes/roadmap-shard-store/proposal.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#695

## Knowledge Federation

### Cross-Project Knowledge Federation

- **Status:** blocked
- **Spec:** docs/changes/cross-project-knowledge-federation/proposal.md
- **Summary:** Decentralized knowledge sharing via package-native federation. PackageResolver interface for language-agnostic discovery. Four knowledge types (learnings, constraints, patterns, structural summaries) with visibility tags. Background sync via hooks + optional cron. [D2]
- **Blockers:** Needs 5+ active harness-managed projects for adoption density
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#88

## v1.0 Foundation

## v1.0 Distribution

## v2.0 Knowledge Graph & Personas

## v2.0 Advanced Features

## v2.0 Pipeline Unification

## Hermes Adoption

## v3.0 Graph Intelligence

## v3.0 Viral Flywheel

## v3.0 Deep Intelligence

## v3.0 Supporting Work

## v4.0 Business Knowledge System

## Assignment History
| Feature | Assignee | Action | Date |
|---------|----------|--------|------|
| Performance Engineering Knowledge Skills | @chadjw | assigned | 2026-04-09 |
| Phase 2: Code Signal Extractors | @chadjw | assigned | 2026-04-23 |
| Phase 3: Connector Enhancement | @chadjw | assigned | 2026-04-22 |
| Phase 4: Knowledge Pipeline & Diagrams | @chadjw | assigned | 2026-04-23 |
| Hermes Phase 0.1: Reference Slack Bridge | @cwarner | assigned | 2026-05-15 |
| design-pipeline sub-project #2: audit-component-anatomy | @chadjw | assigned | 2026-05-23 |
| design-pipeline sub-project #0: brand-guidelines source-of-truth | @chadjw | assigned | 2026-05-23 |
| design-pipeline sub-project #3: audit-brand-compliance | @chadjw | assigned | 2026-06-02 |
| Init design + roadmap polish follow-ups | @chadjw | assigned | 2026-06-03 |
| Build harness:outcome-eval skill | chad.warner@capillarytech.com | assigned | 2026-06-22 |
| Build harness:audit-harness-strength self-audit skill | chad.warner@capillarytech.com | assigned | 2026-06-23 |
| Ship the 5-signal dashboard panel and signals.md doc | chad.warner@capillarytech.com | assigned | 2026-06-22 |
| Ship a required-review GitHub Action template | chad.warner@gmail.com | assigned | 2026-06-23 |
| Stop the pre-commit auto-baseline-update for arch | chad.warner@gmail.com | assigned | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates | chad.warner@gmail.com | assigned | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates | @chadjw | assigned | 2026-06-25 |
| Add architecture thresholds to basic and intermediate templates | @chadjw | unassigned | 2026-06-25 |
