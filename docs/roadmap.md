---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-08-04
last_synced: 2026-08-10T14:01:15.588Z
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

- **Status:** done
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

### LMLM: pool consumption improvements (make installed models live, task-aware, self-correcting)

- **Status:** done
- **Spec:** docs/changes/lmlm-pool-consumption/proposal.md
- **Summary:** DELIVERED (PR #788, merged). The LMLM install side is solid (async install + progress, resumable pulls, restart recovery, lineage scoring — PRs #775, #777), but the consumption side is pull-based and static, so an installed model barely gets used. Five phased improvements: (1) **Freshness loop** — the resolver subscribes to the `local-models:pool` event (today it only polls, `local-model-resolver.ts:260`) and the analysis provider resolves its model lazily instead of freezing at pipeline build (`analysis-provider-factory.ts:147`); (2) **Score-seed** — a new pool entry starts `currentScore: 0`, so the model you explicitly installed sits at the bottom of the score-sorted candidate list until re-rank; seed it from the ranked/interpolated score; (3) **Runtime feedback** — stamp `lastUsedAt` on real inference (LRU eviction currently runs on stale data) + a failure circuit-breaker; (4) **Task-aware selection** — per-profile pool scores (`general`/`coding`/`reasoning`) + a `RoutingUseCase → profile` map so each task gets the best-fit pooled model instead of one top-scored model per backend (advances the Agent Autonomy metric; carries a standalone ADR); (5) **Warming** — warm the selected model into VRAM (`keep_alive`) to avoid first-request cold-start. Additive schema only (`PoolEntry.scoresByProfile`, absolute score on `ModelProposalContent`). Does NOT depend on live-HF candidate discovery — scores the models already in the pool.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1000

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

### Adaptive Model Routing (AMR)

- **Status:** in-progress
- **Spec:** docs/changes/adaptive-model-routing/proposal.md
- **Summary:** Difficulty- and cost-aware, provider-neutral routing layered on the shipped `BackendRouter` (Spec B `granular-task-routing` / Spec 2 `multi-backend-routing`). A per-invocation complexity triage picks the cheapest capable backend (local _or_ cloud) per capability tier; split-routes workflow stages; escalates tiers on repeated quality failures (D10); gates Meridian autonomy for straightforward roadmap items. Opt-in and default-off — adopters who ignore it get byte-identical behavior (D11). 11 decisions, 19 success criteria, 6 phases (~21d): Phases 1–4 substrate-only and independently shippable; Phases 5–6 add tenant policy via the Shuttle `RuntimeAdapter` + autonomy graduation. Consumes the LMLM pool. Extends the Multi-client portability strategy track; direct lever on the Agent Autonomy metric.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1032

### skill-provider-freshness

- **Status:** done
- **Spec:** docs/changes/skill-provider-freshness/proposal.md
- **Summary:** External Skill-Provider Freshness & Install Follow-Through
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1066

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

- **Status:** done
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

### design-craft award bar

- **Status:** done
- **Spec:** docs/changes/design-craft-award-bar/proposal.md
- **Summary:** Design-Craft Award Bar — a machine-derived award-tier verdict on BENCHMARK output
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1141

### Agentic-suitability in the local-model pool recommender

- **Status:** in-progress
- **Spec:** —
- **Summary:** The pool ranker (`packages/local-models/src/ranker/algorithm.ts`) scores candidates by VRAM fitness + a **bandwidth-estimated** tokens/sec (speed-confidence bands) + benchmark confidence — but it does NOT compose those into "is this model usable for **autonomous agentic dispatch**," and that gap picks unusable models. Live evidence (2026-07-16): **llama3.3:70b** fits memory and its tokens/sec *estimate* looked fine, but real agentic latency — time-to-first-token on a 66GB model with a large multi-turn context — was a **4-minute single call**, unusable for a tool-loop; **qwen2.5-coder:7b** fits and is fast but **won't emit tool_calls** (should be excluded from agentic routing, not merely down-ranked); **qwen3:32b** tool-calls and completes but stumbles on some tasks. Add an **agentic-suitability** dimension the recommender/AMR use to select for dispatch = (a) tool-calling capability as a HARD filter (reuse the deterministic probe from #833 in `packages/local-models/src/capability/tool-calling.ts` — no tool-calls ⇒ ineligible for agentic use), × (b) a **measured** agentic latency/throughput signal (time-to-first-token + turn latency under a real agentic prompt, not the bandwidth estimate — a model over a latency budget is ineligible/steeply penalized for interactive dispatch even if it fits), × (c) learned build quality (the `local-dispatch-...`/`lmlm-build-quality-model-selection` follow-on). Keep the existing size/speed/benchmark ranking for non-agentic uses; expose a separate `agenticScore` so a fits-VRAM-but-too-slow / can't-tool-call / builds-badly model is never routed autonomous work. Ties to Agent-Autonomy: the pool should recommend a model a human can actually let run unattended.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1004

### design-craft responsive gate

- **Status:** done
- **Spec:** docs/changes/design-craft-responsive-gate/proposal.md
- **Summary:** DELIVERED (PR #1149, merged). Responsive Gate for awardBar — a mechanical mobile-defect veto on the award-tier verdict
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1148

### Automate best-model discovery/recommendation for local dispatch

- **Status:** done
- **Spec:** —
- **Summary:** The pool recommender should automate the manual process a human just used to pick a local coding model, and that process taught concrete lessons the frozen ranker misses. When picking a model for agentic dispatch by hand (2026-07-16) the winning process was: (1) query **current** authoritative sources for the best agentic coders — the landscape moves monthly (llama3.3:70b → qwen3-coder:30b / devstral-24b / laguna-xs), so a frozen snapshot goes stale; recency must be a ranking input. (2) Filter by hardware fit (already done). (3) **Rank speed by MoE ACTIVE params, not total size** — this was the key miss: a dense 70B is too slow for a tool-loop (a single call took 4 min) while a 30B **MoE with ~3B active** is fast and usable; the ranker's bandwidth×total-size estimate treats these the same, so it must model compute/latency from active params (MoE-aware). (4) **Require tool-calling** (hard filter — reuse #833's probe). (5) **Weight agentic benchmarks** — SWE-bench Verified (devstral 46.8%, laguna-xs 70.9%) over generic perplexity/chat benchmarks. (6) **Prefer coding/agent-specialized** models (qwen3-coder, Mistral's agent-first devstral) over general chat models for dispatch. Build a discovery step that pulls current candidates (Ollama library + HF + published SWE-bench numbers) with recency weighting, computes the [[local-model-agentic-suitability]] `agenticScore` (tool-calling × MoE-aware latency × agentic benchmark × learned build quality), surfaces the top recommendation for dispatch, and can **auto-pull** it. This makes the pool's suggestions match — or beat — what an expert would pick by hand, instead of recommending a fits-VRAM-but-too-slow dense model. Cross-refs #833 (tool-calling probe), the agentic-suitability item, and the LMLM live-HF candidate-discovery work.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1005

### canary-results-ingest

- **Status:** done
- **Spec:** docs/changes/canary-results-ingest/proposal.md
- **Summary:** DELIVERED (PR #1190, merged). Consume canary structured test results into graph / outcome-eval / pulse
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1185

### canary-tdd-verify-wiring

- **Status:** done
- **Spec:** docs/changes/canary-tdd-verify-wiring/proposal.md
- **Summary:** DELIVERED (PR #1184, merged). Wire canary into harness-tdd (RED-phase generation) and harness-verify (registry command discovery)
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1181

### roadmap-thematic-grouping

- **Status:** done
- **Spec:** docs/changes/roadmap-thematic-grouping/proposal.md
- **Summary:** Roadmap thematic grouping / free-form narrative sections
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1176

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

### PR Queue Triage & Merge Assistant Skill

- **Status:** done
- **Spec:** —
- **Summary:** A skill to help teams stay on top of a large PR backlog in busy projects — triage/sort the open-PR list by risk & readiness, surface what needs review vs. what is mergeable, and assist with review and merge to cut the manual sorting effort.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1186

### Curate which MCP-server tools the local agent sees (per-server tool allowlist)

- **Status:** in-progress
- **Spec:** docs/changes/local-mcp-tool-curation/proposal.md
- **Summary:** [[ollama-backend-mcp-tools]] wires whole MCP servers into the local agent, but a broad server floods the model: in the live e2e (2026-07-16) the harness MCP alone exposed **95 tools**, and `qwen3-coder:30b` — given ~98 tools total — wrote the correct file via context7 but then **over-explored** (a cat/find/read/ls verification loop) without cleanly emitting `TASK_COMPLETE`, so a real dispatch would end via `maxTurns` rather than clean success. Choice-paralysis, not context size (the model had 262144 ctx). Fix: a **per-server `tools?: string[]` allowlist** on `McpServerSpec` — when set, only those tool names from that server are aggregated (namespaced), default unset = all tools (byte-identical). Curate the scaffolded harness example to the read-oriented set ([[ollama-backend-mcp-tools]] D3: `code_search`, `ask_graph`, `review_changes`, `outcome_eval`, `gather_context`) instead of all 95. Warn (not hard-cap) when the aggregated tool count crosses a large threshold, pointing at the allowlist. Portable — the allowlist works for any server, not just harness. Directly improves the robustness of the just-shipped local MCP path.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1034

### init-ecosystem-aftercreate

- **Status:** done
- **Spec:** docs/changes/init-ecosystem-aftercreate/proposal.md
- **Summary:** Scaffold ecosystem-matched afterCreate install command + warn when neither install nor verify resolves
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1128

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

- **Status:** done
- **Spec:** .changeset/roadmap-writeback-slug-fix.md
- **Summary:** `applyRoadmapDiff` (packages/core/src/roadmap/store/apply-diff.ts) keys every shard by `slugifyFeatureName(feature.name)`, but the sharded store's real identity is the frontmatter `slug` — which `load()` enforces to equal the filename base, and which is frequently a hand-shortened or length-truncated form of the title. For the 22 shards (of 104) where `slugify(title) !== frontmatter.slug` (e.g. filename `lmlm-wire-engine-to-operator-surfaces` vs `slugify("LMLM Phases 4–9: wire the engine to operator surfaces")`), `patchFeature`/`addFeature`/`removeFeature` open `{slugify(title)}.md`, hit ENOENT, and `applyRoadmapDiff` **returns Err on the first failure — aborting the entire writeback batch**. Impact observed live during a full `roadmap sync --apply` (2026-08-04): all 11 external-ID backfills were dropped, `last_synced` was never stamped, and — most dangerously — a create path would have persisted the new issue on GitHub while failing to write its `externalId` back locally, so the next run recreates it (duplicate issues). **Fix:** resolve shards by the loaded feature's frontmatter slug (carry it on `RoadmapFeature` or index `before`/`after` by it), OR make the writeback collect per-shard errors instead of aborting on the first. Add a regression test with a shard whose title-slug ≠ frontmatter-slug. Workaround used on 2026-08-04: hand-backfill External-IDs so `changedFeatureNames` is empty and the buggy path is never entered.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1036

### Per-subagent token attribution in burn

- **Status:** done
- **Spec:** docs/changes/per-subagent-token-attribution-in-burn/proposal.md
- **Summary:** Group burn's existing transcript scan by `attributionAgent` to produce per-subagent and per-fleet-lane token attribution. Claude Code writes one transcript per subagent to `~/.claude/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl` (816 present locally), each carrying `agentId`, `attributionAgent`, `sessionId`, `sourceToolAssistantUUID`, `requestId`, `model` and a full `usage` block. `burn`'s `listTranscripts()` already recurses into those directories, so the data is ingested today and the identity discarded — this is a grouping key on a scan that already runs, plus the existing `requestId` dedup (transcripts repeat each usage block ~3x). Corrects a documented falsehood: `fleet-command/SKILL.md:319` states subagent tokens "are not observable, so a token governor would be a promise the skill cannot keep". Must assert the transcript shape and degrade to "unattributed" rather than 0 when the undocumented fields change, so a CLI update cannot silently report a fleet run as free. Unblocks per-lane cost measurement for Adaptive Model Routing (#1032). Source: paperclip budget-enforcement model (76.1k stars, MIT) — mechanism only, not the platform. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 9.00).
- **Blockers:** —
- **Plan:** docs/changes/per-subagent-token-attribution-in-burn/plans/2026-08-10-per-subagent-token-attribution-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1270

### bug(roadmap): harness roadmap sync never stamps last_synced on success

- **Status:** done
- **Spec:** .changeset/roadmap-writeback-slug-fix.md
- **Summary:** `fullSync` (packages/core/src/roadmap/sync-engine.ts) pushes, pulls, and writes back changed rows, but never sets `roadmap.frontmatter.lastSynced`. Because `applyRoadmapDiff` only writes frontmatter when it differs, a successful `harness roadmap sync --apply` leaves `_meta.md`'s `last_synced` untouched — so the field stays stale even though a sync just completed. This is the exact "`last_synced` 22 days behind `last_manual_edit`" symptom the sync command's own docstring cites as its reason for existing, and it undermines the human-always-wins staleness heuristic and any observability keyed on last_synced. Confirmed live 2026-08-04: `--apply` reported 104 patches / 0 errors yet `last_synced` remained at the pre-run value (manually corrected afterward). **Fix:** stamp `frontmatter.lastSynced = now` in `fullSync` before writeback (guard against `Date.now()` in test seams as elsewhere), and cover it with a test asserting last_synced advances on a no-op-diff successful sync.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1037

### Publish a reproducible graph token-savings benchmark

- **Status:** in-progress
- **Spec:** docs/changes/graph-token-savings-benchmark/proposal.md
- **Summary:** Harness ships the code-graph context-scoping capability its two closest competitors benchmark and market, and has never published a number for it. Build a reproducible benchmark comparing graph-scoped retrieval (`query_graph`, `ask_graph`, `get_impact`, `compute_blast_radius`, `code_outline`, `find_context_for`) against naive file-by-file exploration, and publish the methodology alongside the result. Comparators: `DeusData/codebase-memory-mcp` (38.3k, MIT) whose arXiv preprint 2603.27277 reports **10x fewer tokens, 83% answer quality, 2.1x fewer tool calls across 31 real repos** — that is the honest number to beat, NOT the 99.2% README figure which came from 5 hand-picked structural queries; and `tirth8205/code-review-graph` (29.6k, MIT) which publishes `docs/REPRODUCING.md` and claims 71x on flask. Accept the risk that the number may be unflattering: harness's graph is multi-purpose (review scoping, impact, blast radius) where both comparators are single-purpose and optimized for this exact metric, so a losing result is a roadmap input rather than a reason not to measure. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 6.75).
- **Blockers:** —
- **Plan:** docs/changes/graph-token-savings-benchmark/plans/plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1271

### init: scaffold ecosystem-matched install command + warn when neither install nor verify is configured

- **Status:** done
- **Spec:** —
- **Summary:** Follow-up to #1115 (lang-aware local-dispatch, #1002). The ecosystem detector (`packages/orchestrator/src/workspace/ecosystem.ts`) already exposes each ecosystem's INSTALL command alongside verify, but only verify is wired. Wire `harness init` to scaffold a matching `hooks.afterCreate` install command from the detected ecosystem, and warn loudly when a workspace has neither an install nor a verify command resolvable.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1128

### Position harness against OpenAI harness engineering

- **Status:** planned
- **Spec:** —
- **Summary:** `openai/symphony` (26.5k stars, Apache-2.0, Elixir) states in its README that it "works best in codebases that have adopted harness engineering" and links to openai.com/index/harness-engineering/ — OpenAI publishes a concept under this project's exact name, and Symphony treats it as a prerequisite substrate. This is simultaneously a validation of the thesis and a discoverability collision for anyone searching the term. Symphony is also the closest structural analogue to the fleet family: it watches a Linear board, spawns isolated autonomous implementation runs, and returns proof-of-work (CI status, PR review feedback, complexity analysis, walkthrough videos) before landing PRs. Deliverable: read OpenAI's definition, decide whether to adopt the shared vocabulary or differentiate explicitly, and record the position in STRATEGY.md and the marketing section. NOTE: openai.com/index/harness-engineering/ returned HTTP 403 to automated fetch and has NOT been read — the claim rests solely on Symphony's README, and step one is obtaining the actual page. Serves the External adoption flywheel track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 6.75).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1272

### local dispatch: make the self-verify stage-prompt prose ecosystem-aware

- **Status:** done
- **Spec:** —
- **Summary:** Follow-up to #1115 (#1002). #1115 made the enforced verify GATE ecosystem-aware, but the local stage-prompt's self-verify PROSE still hardcodes `pnpm --filter …`. Make the self-verify guidance render the detected ecosystem's verify commands; per #1115 this needs a strict-variables renderer change so the prompt accepts the ecosystem-derived command set.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1129

### System-level DESIGN.md benchmark axis for design-craft

- **Status:** planned
- **Spec:** —
- **Summary:** Add a whole-system design-language benchmark axis to `harness:design-craft` BENCHMARK, seeded from the 73 real-world `DESIGN.md` files in `VoltAgent/awesome-design-md` (107.5k stars, MIT — corpus is free to use). This is NOT corpus expansion: the existing `catalog/exemplars/` holds 50 **component-level** exemplars (EmptyState, LoadingState, ErrorState, Modal, Button — 10 each) carrying reference markup and per-exemplar reference scores that feed the machine-computed `awardBar` (dimensionFloor 80, fraction 0.95). The awesome-design-md files are whole design languages with no component markup and no reference scores, so dropping them into the existing corpus would leave `awardBar` with nothing to compute and silently return `indeterminate`. Scope as a second, differently-shaped axis with its own scoring contract, keeping the existing 5-dim radar (philosophicalCoherence, hierarchy, craftExecution, function, innovation) for component-level work. Serves the Ceiling-raising via LLM judgment track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 6.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1273

### Codex notify hook should emit a PATH-resolvable command, not an absolute path

- **Status:** done
- **Spec:** [docs/changes/codex-notify-path-resolvable/proposal.md](../changes/codex-notify-path-resolvable/proposal.md)
- **Summary:** `harness update` writes `.codex/config.toml` `notify` as an absolute `["node", "<abs path>/.harness/hooks/session-retrospect-codex.js"]`, baking a machine-specific path into a shared file (churns per machine, breaks contributors/CI). Codex `notify` is shell-less and its CWD is not guaranteed to be the repo root, so the git-rev-parse shell trick used for Claude/Gemini/Cursor cannot apply. Fix: route through a PATH-resolvable command — `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` — backed by a new `harness hooks run <name>` subcommand that reads the JSON payload from argv and self-locates via the payload's `cwd`. Codex generator only; other agents unchanged.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1208

### Context-surface attribution report with exact token counts

- **Status:** done
- **Spec:** —
- **Summary:** Report what the always-loaded context surface actually costs per turn, classified as always-loaded vs path-scoped vs invoked-only, with top contributors ranked and over-budget flags. Two mechanisms adopted from `poshan0126/dotclaude`'s `/context-budget` skill (849 stars, MIT): the three-way classification taxonomy, and calling Anthropic's `/v1/messages/count_tokens` endpoint for exact tokenizer counts instead of the `chars / 4` heuristic in `estimateTokens()` (packages/core/src/compaction/envelope.ts). Must measure harness's real surface, not a generic `.claude/` tree: the dominant contributors are MCP tool schemas across ~88 tool modules, four platform skill trees, hooks and AGENTS.md — none of which that skill models. Scope honestly against what already exists: `tool-tiers.ts` (core/standard/full allow-lists) already cuts the exposed tool count and Claude Code's own deferred-tool loading already defers schemas, so measure per-tier and expect the remaining win to be smaller than the source's framing implies. Candidate consumer for the currently-dead `contextBudget()` allocator. Serves the Upstream grounding track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 4.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1274

### Preventive over-build ladder constraint

- **Status:** planned
- **Spec:** —
- **Summary:** Add a preventive simplicity constraint that fires BEFORE code is written, closing a real gap: `harness:code-craft` already asks whether each abstraction earns its keep and whether code is as simple as it could be, but it is post-hoc critique on an existing diff. Mechanism adopted from `DietrichGebert/ponytail` (99.4k stars, MIT): a seven-rung ladder stopped at the first rung that holds — YAGNI, already in this codebase, standard library, native platform feature, installed dependency, one-liner, then minimum code that works — with the ladder running only after the problem is understood and the real flow traced. Also worth taking: root-cause-over-symptom (fix the shared function once rather than per-caller), and marking deliberate corner-cuts with a comment naming the ceiling and upgrade path. Must resolve authority against `code-craft` so an always-loaded rule and a craft skill cannot give contradictory guidance on the same diff. Adopt on mechanism, not evidence: ponytail's ~22% token / ~27% speed claims are self-measured, n=4, Haiku 4.5 only, on FastAPI+React repos. Serves the Ceiling-raising track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 4.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1275

### Frontier-based round questioning for guided interviews

- **Status:** planned
- **Spec:** —
- **Summary:** Adopt frontier/round-based questioning as a shared interview primitive across `harness:product-advisor`, `harness:product-requirements`, `harness:strategy` and `harness:pulse`, which today all interview strictly one question at a time. Mechanism from `mattpocock/skills` `grilling` (211.2k stars, MIT): model the subject as a design tree of decisions; the frontier is the set of decisions whose prerequisites are all settled; each round asks the whole frontier and nothing else, so no answer within a round can invalidate another question in it. Cited effect ~13 questions in ~3 rounds. The highest-value half is the **facts-vs-decisions split** — the skill dispatches sub-agents to settle questions the environment can answer and blocks only on genuine human decisions — which harness's interviews do not do at all. Constraints: one-at-a-time must remain a supported opt-out rather than a regression (the source concedes the round design is "genuinely contested" and that some users read better sequentially), and the frontier is model judgment rather than a computed graph, so mis-grouped questions need a reopen path. Complements the shipped Question-File Interview Mode (#582), which addressed durability/async capture rather than round structure. Serves the Full-lifecycle reach track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.75).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1276

### DESIGN.md interop with the Google Stitch convention

- **Status:** planned
- **Spec:** —
- **Summary:** Add import/export interop between harness's design system and the Google Stitch `DESIGN.md` convention, so teams arriving with an existing DESIGN.md can adopt harness without rewriting it. Two independent sources have standardized on the Stitch format: `VoltAgent/awesome-design-md` (107.5k, MIT) ships 73 files in it, and `pbakaus/impeccable` (57.4k, Apache-2.0) both consumes it and generates it via `/impeccable document`. Concrete divergence to resolve: harness places the file at `design-system/DESIGN.md` paired with `tokens.json`, while the Stitch convention is a plain-markdown file at project root. Scope deliberately as boundary interop, NOT format replacement — harness's format carries the machine-checkable half (`tokens.json`, the `$extensions.harness.brand.forbidden_contexts` schema that `audit-brand-compliance` reads for BRAND-T001) that a plain-markdown standard has nowhere to put, and dropping that would discard the constraints-as-code thesis. Serves the Multi-client portability track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1277

### Wire or deprecate the dead contextBudget allocator

- **Status:** done
- **Spec:** —
- **Summary:** `contextBudget()` in `packages/core/src/context/budget.ts` is exported from `@harness-engineering/core` and has **zero non-test callers** — verified by grep across packages excluding dist and tests. It allocates a token budget across six categories (systemPrompt, projectManifest, taskSpec, activeCode, interfaces, reserve) with graph-density weighting, which is genuinely useful logic that nothing invokes. Its sibling `computeLoadPlan()` in the same directory IS wired, via `packages/cli/src/mcp/tools/skill.ts:79`, so the dead one is easy to miss. Two acceptable outcomes: wire it into the Context-surface attribution report (which needs exactly this kind of allocator), or deprecate it on the normal cycle. Deletion is a breaking change for any adopter importing it — it appears in the package's public `.d.ts` — so it cannot simply be removed. Secondary finding worth a look: harness's own dead-export detection and `harness:entropy-cleaner` exist to catch precisely this and did not, so the detector may have a blind spot for exported-but-unused public API. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.00). **Reconciled (done):** option A shipped — `contextBudget()` is now imported into the context-surface attribution report (`packages/core/src/context/attribution.ts:17`) and its allocation drives the report's by-class budget and over-budget flags, surfaced in the CLI at `packages/cli/src/commands/mcp.ts` (`## By class (budget from contextBudget())`). The allocator now has a real non-test caller. Shipped by PR #1274 / commit `510bdab1e` (`feat(context): context-surface attribution report with exact token counts`).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1278

### Graph schema introspection tool

- **Status:** done
- **Spec:** —
- **Summary:** Expose a `get_graph_schema`-equivalent MCP tool returning node/edge counts, relationship patterns and per-label property definitions, so an agent can discover the graph's shape before querying it. Harness exposes `query_graph`, `ask_graph`, `get_relationships`, `search_similar`, `compute_blast_radius` and `find_context_for` but nothing that enumerates what node types and edge types exist — `ls packages/cli/src/mcp/tools/ | grep -i schema` returns only the unrelated `interaction-schemas.ts`. An agent must therefore already know the schema to query it, or guess. Adopted from `DeusData/codebase-memory-mcp` (38.3k stars, MIT), whose equivalent tool description reads "Run this first." Cheap, and it raises the usable yield of every other graph tool for agents that did not author them. Feature-level finding — invisible at source level, surfaced only by enumerating that project's 15 MCP tools. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 6.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1280

### Role-lens plan review

- **Status:** planned
- **Spec:** —
- **Summary:** Review a *plan* through distinct role lenses before execution, rather than reviewing *code* by persona after it. Harness reviews code by specialist persona (7 review agents) and reviews plans for internal soundness (`harness:soundness-review`, `check_task_independence`, `validate_plan_tasks`) — but never asks "what would a designer / a DevEx engineer / a CEO object to in this plan?" Adopted from `garrytan/gstack` (127.2k stars, MIT), which ships four distinct plan-review lenses: `plan-ceo-review`, `plan-design-review`, `plan-devex-review`, `plan-eng-review`, plus `plan-tune`. The value is catching a plan that is internally coherent but wrong for a stakeholder the author was not thinking about — a failure mode soundness analysis cannot detect by construction. Composes with the existing persona infrastructure (`list_personas`, `run_persona`, `generate_persona_artifacts`) rather than needing new machinery. Feature-level finding: gstack's spine duplicates harness, but its edges do not. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 4.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1281

### Runtime-trace ingestion to validate graph edges

- **Status:** planned
- **Spec:** —
- **Summary:** Ingest runtime traces and use them to confirm or refute statically-derived graph edges — a static call/HTTP edge is a hypothesis until observed traffic supports it. Harness ships ten graph ingestors (`CodeIngestor`, `GitIngestor`, `DecisionIngestor`, `KnowledgeIngestor`, `RequirementIngestor`, `DesignIngestor`, `CanaryResultsIngestor`, `BusinessKnowledgeIngestor`, plus `StructuralDriftDetector` and `ContradictionDetector`) and **no runtime-trace ingestor**: grep for `ingest_traces|ingestTrace|HTTP_CALLS|runtime trace` across `packages` returns zero non-dist hits. Adopted from `DeusData/codebase-memory-mcp`'s `ingest_traces` tool ("ingest runtime traces to validate HTTP_CALLS edges"). Strongly on-thesis for constraints-as-code: an edge validated against production traffic is a materially stronger constraint than one inferred from an AST, and an edge the traces contradict is a drift signal nothing currently emits. Existing seam to build on: `CanaryResultsIngestor` already establishes the pattern of folding execution results back into the graph, and the Canary plugin's `canary-instrument` skill already emits OpenTelemetry run artifacts correlating tests to outbound HTTP requests — a plausible first trace source. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 3.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1282

### ADR CRUD as an MCP tool

- **Status:** done
- **Spec:** —
- **Summary:** Expose Architecture Decision Records as a structured MCP tool (create / read / update / list) rather than only as skill-mediated prose. Harness has `harness:adr-fleet` (batch ADR drafting) and `harness:architecture-advisor` (interactive decision surfacing) as skills, and a `DecisionIngestor` that folds ADRs into the knowledge graph — but `ls packages/cli/src/mcp/tools/ | grep -i "adr\|decision"` returns nothing, so no caller can create or amend an ADR programmatically. Adopted from `DeusData/codebase-memory-mcp`'s `manage_adr` tool, which additionally notes a useful concurrency property: query modes do not block behind a same-project reindex while writes remain serialized. Narrow in scope and adjacent to work `adr-fleet` already owns, so the main design question is whether this belongs as its own tool or as an extension of the adr-fleet surface. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 3.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1283

### Multi-language code-graph coverage and published resolution tiers

- **Status:** planned
- **Spec:** —
- **Summary:** Widen code-graph language coverage and publish per-language resolution quality, so adopters know what the graph will actually give them. Harness resolves **6** languages — `typescript, javascript, python, go, rust, java` (`packages/core/src/code-nav/types.ts:4`) — and publishes no per-language quality figure. `DeusData/codebase-memory-mcp` (38.3k, MIT) resolves **13** languages with Hybrid LSP semantic type resolution (Python, TS/JS/JSX/TSX, PHP, C#, Go, C, C++, Java, Kotlin, Rust, Perl), parses **158** via vendored tree-sitter grammars, and publishes tiered quality (Excellent / Good / Functional) benchmarked against 64 real repositories with a stated ~95% resolution target on idiomatic code. Consequence today: an adopter on a Kotlin, C#, PHP or Ruby codebase gets a materially thinner graph than a TypeScript adopter, and nothing surfaces that — every downstream capability that reads the graph (impact analysis, blast radius, review scoping, test selection, hotspot detection) silently degrades with it. Directly gates the External adoption flywheel track, since the constraints-as-code thesis can only be tested at scale on codebases the graph can actually read. High effort and deliberately scored as such; the cheap first increment is publishing honest per-language tiers for the 6 already supported. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 2.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1284

### Generate-and-verify skill/MCP-tool reference docs (regenerate-and-gate, not detect-only)

- **Status:** done
- **Spec:** —
- **Summary:** Port dsh's gen-tool-catalog/verify-tool-catalog pattern (deepseek-ai/deepseek-harness docs/tool-catalog.md): boot each shipped skill and MCP tool definition against a real context, extract its live name/description/schema, generate a canonical docs/reference/*.md catalog from that, and add a verify mode that regenerates in CI and fails the build on any diff — the same shape as generate-docs / generate-barrel-exports:check today. Upgrades detect-doc-drift from advisory detection to a hard regenerate+gate loop for the skill/tool catalog specifically, closing the gap where a tool's real schema and its documented schema silently diverge. Reference: reference_deepseek_harness_analysis.md (memory).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1401

### Canonical bounded handoff record for fleet workers

- **Status:** done
- **Spec:** —
- **Summary:** Define one shared handoff schema — status, summary, evidence, next_steps, blocker — modeled on dsh's Ralph-loop handoff ("the normalized bounded structured report passed from one continuing Ralph round to the next"). Require every fleet family member (bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet, cleanup-fleet, security-fleet, test-fleet, issue-fleet, adr-fleet) to emit it from each worktree-isolated worker instead of each fleet defining its own ad hoc report shape, so fleet-command can parse any fleet's worker output uniformly instead of special-casing each one. Likely lands as a shared type in @harness-engineering/types plus a validation helper.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1396

### Require Service-Definition/Provider/Consumer roles in skill-authoring guidance

- **Status:** done
- **Spec:** —
- **Summary:** dsh's capability-seam model requires every extension point to name a Service Definition, at least one Provider, and at least one Consumer — a capability with only one role filled in is flagged as not actually swappable. Add an equivalent lightweight requirement to harness-skill-authoring: when a new MCP tool or skill capability is proposed, its author states what it defines, who provides it, and who consumes it. Catches half-wired capabilities before they ship as accidental single-implementation lock-in. Likely a new section in agents/skills/claude-code/harness-skill-authoring/SKILL.md plus a checklist item surfaced by create_skill.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1397

### Spill-to-disk with a followup-readable locator for large tool output

- **Status:** done
- **Spec:** —
- **Summary:** dsh's spill mechanism writes large tool output past a size threshold to disk and returns a locator the model can read/search later instead of truncating inline. Fleet and autopilot sessions that accumulate large test logs, full diffs, or grep/glob overflow today truncate ad hoc with no recovery path. Add an equivalent spill backend to harness's own long-running session/state handling (packages/core session state, or a new small package) so fleet workers and autopilot can offload large intermediate output and reference it by locator instead of losing it or blowing the context budget.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1398

### Rejection ledger — durable negative knowledge that stops re-proposal

- **Status:** planned
- **Spec:** —
- **Summary:** Decision records capture what was chosen; nothing captures what was refuted and why, so generators re-propose dead ideas at exactly the rate they generate. At high generation rates the dominant ideation waste is re-derivation of already-refuted approaches — each round of ideation, brainstorming, or inbound triage re-litigates proposals that died months ago, and the refutation is buried in a closed PR thread nobody will find. Build the rejection ledger: a first-class store of refuted approaches, each entry carrying the approach's semantic fingerprint, the refutation (the specific reason it fails), the premises the refutation depends on, and provenance. Ideation and intake query it by semantic match before proposing; a hit surfaces the prior refutation instead of re-exploring. Critically, refutations expire: each entry's premises are linked to detectable conditions (a dependency version, a constraint, a scale threshold), and when a premise no longer holds the entry is flagged for re-evaluation rather than silently blocking a now-viable idea — negative knowledge decays like any other and must be tended, not hoarded.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1620

## Fleet Family — Batch Orchestration

### issue-fleet — autonomous intake/triage of the open-issue backlog

- **Status:** done
- **Spec:** docs/changes/issue-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. issue-fleet is the intake stage: it autonomously triages the open-issue backlog (labeling, deduping, routing, and prioritizing) so downstream fleets receive a clean, ordered queue. It is the entry point of the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** docs/changes/issue-fleet/plans/2026-08-08-issue-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1195

### adr-fleet — batch-drive pending architectural decisions to ADRs

- **Status:** done
- **Spec:** docs/changes/adr-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. adr-fleet sweeps the backlog of pending architectural decisions and drives each to a batch ADR sign-off, fanning out drafting work and collecting the results for a single human review pass. It sits second in the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** docs/changes/adr-fleet/plans/2026-08-08-adr-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1197

### roadmap-fleet — backlog → verified merge-ready PRs

- **Status:** done
- **Spec:** docs/changes/roadmap-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. roadmap-fleet turns the backlog (external issues + roadmap shards) into verified, merge-ready PRs, fanning out implementation across the queue and gating on verification before batching the results for human review. It is the delivery hub of the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** docs/changes/roadmap-fleet/plans/2026-08-07-roadmap-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1198

### pr-fleet — PR-queue triage, review-assist & land

- **Status:** done
- **Spec:** docs/changes/pr-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. pr-fleet works the open-PR queue: triaging, assisting review, and landing PRs across the queue while keeping the final merge decision with a human. It is the terminal stage of the fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet, with cicd-fleet / test-fleet / cleanup-fleet running alongside.
- **Blockers:** —
- **Plan:** docs/changes/pr-fleet/plans/2026-08-08-pr-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1186

### cicd-fleet — autonomous CI/CD-red / flaky-test backlog sweep

- **Status:** done
- **Spec:** docs/changes/cicd-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. cicd-fleet sweeps the CI/CD-red and flaky-test backlog, fanning out diagnosis and fixes across failing pipelines and batching remediation PRs for human review. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/cicd-fleet/plans/2026-08-08-cicd-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1196

### test-fleet — autonomous test-coverage backlog sweep

- **Status:** done
- **Spec:** docs/changes/test-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. test-fleet works the test-coverage backlog, fanning out test authoring across under-covered areas and producing a batch of test PRs for human review. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/test-fleet/plans/2026-08-08-test-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1199

### cleanup-fleet — autonomous entropy/hotspot remediation sweep

- **Status:** done
- **Spec:** docs/changes/cleanup-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. cleanup-fleet sweeps the entropy/hotspot backlog, fanning out remediation across high-churn and high-risk areas and batching the resulting cleanup PRs for human review. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/cleanup-fleet/plans/2026-08-08-cleanup-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1200

### bug-fleet — proactive undiscovered-bug hunt across the standing codebase

- **Status:** done
- **Spec:** docs/changes/bug-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. bug-fleet is the proactive correctness hunter: it ranks the standing codebase into risk-ordered areas, hunts each with the real review machinery, and holds a REPRODUCTION-REQUIRED bar (no failing test, no bug) before emitting a tiered batch of fix PRs and filed issues. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/bug-fleet/plans/2026-08-08-bug-fleet-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1225

### craft-fleet — ceiling-raising code-quality elevation sweep

- **Status:** done
- **Spec:** docs/changes/craft-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. craft-fleet is the ceiling twin of cleanup-fleet: where cleanup-fleet works the rule-based entropy floor, craft-fleet sweeps the craft skills' LLM-judgment critique and hands back a tiered batch — elevation PRs for bounded, high-confidence, cited polish and filed roadmap items for structural quality debt. It runs alongside the core fleet spine issue-fleet → adr-fleet → roadmap-fleet → pr-fleet.
- **Blockers:** —
- **Plan:** docs/changes/craft-fleet/plans/2026-08-08-craft-fleet-plan.md
- **Assignee:** Chad Warner
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1224

### ideate-fleet — fan out strategy-grounded ideation as the head of the fleet spine

- **Status:** done
- **Spec:** docs/changes/ideate-fleet/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. ideate-fleet is the head of the core conveyor (ideate → issue → adr → roadmap → pr): it derives a queue of disjoint themes from STRATEGY.md tracks and supplied opportunity areas, fans out worktree-isolated subagents that each run the real `harness-ideate` pipeline to a ranked artifact, re-derives every ranking independently, and returns one curated ranked shortlist for a human to pick from. It files nothing — no issue, roadmap row, spec, or PR.
- **Blockers:** —
- **Plan:** docs/changes/ideate-fleet/plans/2026-08-08-ideate-fleet-plan.md
- **Assignee:** Chad Warner
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1228

### perf-fleet — fan out performance-budget/regression remediation

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. perf-fleet fans out perf-budget and regression analysis over hotspots and critical paths, emitting a batch of optimization PRs. Benchmark-gated: a regression needs a measured before/after, mirroring bug-fleet's reproduction bar. Composes the perf skills / check-perf as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (hotspots) and bug-fleet (perf-as-defect); may be folded rather than shipped standalone.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1233

### knowledge-fleet — fan out knowledge extraction/reconciliation

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. knowledge-fleet fleet-ifies knowledge-pipeline: it fans out extraction of undocumented knowledge and decisions across the codebase, emitting a batch of knowledge entries. Composes knowledge-pipeline as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps adr-fleet (decisions) and knowledge-craft (quality ceiling); may be folded rather than shipped standalone.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1232

### design-fleet — fan out design-system drift remediation

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. design-fleet fleet-ifies design-pipeline / detect-design-drift: it fans out design-token and component drift detection, emitting a batch of fixes. Most valuable in design-heavy repos. Composes design-pipeline as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (drift floor) and craft-fleet (design-craft ceiling); may be folded rather than shipped standalone.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1231

### docs-fleet — fan out doc-drift remediation across the codebase

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. docs-fleet fleet-ifies docs-pipeline / detect-doc-drift: it fans out doc-drift detection over the codebase, emitting a batch of doc-fix PRs. Composes docs-pipeline as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (drift floor) and craft-fleet (docs-craft ceiling); likely fold is drift to cleanup-fleet and quality to craft-fleet.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1230

### fleet-command — the conductor coordinating the `-fleet` family across the SDLC

- **Status:** done
- **Spec:** docs/changes/fleet-command/proposal.md
- **Summary:** Part of the `-fleet` skill family (epic #1194) — the capstone, one tier above the members and deliberately not named `-fleet`: it coordinates the fleets themselves rather than fanning out over an item-queue. Plans a run as a hybrid dependency DAG (a cicd-fleet CI prerequisite, the conveyor spine sequential, the quality sweeps parallel, pr-fleet terminal), enforces one **global** concurrency budget across every fleet in flight instead of additive per-fleet governors, owns cross-fleet deconfliction (merge-order planning, regeneration sequencing, lane serialization, cross-fleet filing dedup), batches the members' human gates by wave without ever answering them, verifies each lane from its emitted artifacts rather than re-running it, and emits one consolidated report. Never auto-merges.
- **Blockers:** —
- **Plan:** docs/changes/fleet-command/plans/2026-08-08-fleet-command-plan.md
- **Assignee:** Chad Warner
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1226

### Lightweight Nightly Micro-Loop Primitive

- **Status:** backlog
- **Spec:** —
- **Summary:** The fleet family is the right tool for a batch of independent findings but the wrong tool for Dex Horthy's team's highest daily-value pattern: fix one thing, open one tiny PR, every night via a cron-triggered "slow loop." Harness's lightest fleet unit (cleanup-fleet) still runs the full five-phase SELECT→CONFIRM→DISPATCH→VERIFY→REPORT apparatus with worktree isolation and a provenance file. harness-maintenance-pipeline is the closest existing piece (report-first, opt-in --fix) but is human-invoked, not a standing cron. Design a genuinely thin primitive — cron trigger + single deterministic check + single small PR, no worktree/provenance ceremony — that sits underneath cleanup-fleet rather than replacing it. Adapted from Dex Horthy/HumanLayer's nightly "slow loop" practice. Adoption #3 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-3]
- **Blockers:** Design decision: standalone loop primitive vs. a lightweight --micro mode on cleanup-fleet / harness-maintenance-pipeline
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1405

### fleet-item-type-routing — build-shaped fleets route by item type (bug vs feature)

- **Status:** planned
- **Spec:** docs/changes/fleet-item-type-routing/proposal.md
- **Summary:** The build-shaped `-fleet` members (`roadmap-fleet`, `security-fleet`) forced every item through the design-first pipeline `harness-brainstorming → harness-autopilot`, so a bug tracked as a backlog/roadmap item got design ceremony it did not need and then stalled in autopilot for lack of an Implementation Order. This item makes those members classify each item by type and route it: `bug` → `harness-debugging`, approved-spec → `harness-autopilot`, new-feature/ambiguous → `harness-brainstorming → harness-autopilot`. The rubric is stated once in `docs/reference/fleet-family.md` (§Item-type routing, ADR 0103) and referenced by both fleets; classification happens at SELECT (metadata-first, router-rubric fallback), is human-overridable at CONFIRM, and VERIFY checks route-appropriate artifacts. `bug-fleet` / `cicd-fleet` already route to debugging and are unchanged.
- **Blockers:** —
- **Plan:** —

### Budget governor for unattended dispatch

- **Status:** planned
- **Spec:** —
- **Summary:** Measured operator behaviour contradicts the assumption that fleets already run unattended: of 1,866 commits in 90 days, **24 landed at a weekend — 1.3%** — and the hour histogram peaks 10:00–16:00 and collapses after 18:00. All of the observed 57x-median throughput is produced inside a normal work week, ~50 hours of 168 available, because fleets are operator-dispatched rather than scheduled. Naive scheduling is unaffordable: that operator was already at ~78% of a weekly usage budget, so 168-hour operation needs ~3.4x the quota. Build the governor that makes unattended operation safe to enable — a spend envelope per period, dispatch that stops cleanly at the envelope rather than mid-lane, per-fleet allocation, and a visible remaining-budget signal. Resolves half the open design blocker on `lightweight-nightly-micro-loop-primitive` (#1405): the thin cron primitive is the *what*, this is the *how much*.
- **Blockers:** Depends on cost-per-merged-pr-attribution
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1525

### Declare an unattended-safe contract per fleet member

- **Status:** planned
- **Spec:** —
- **Summary:** `fleet-command` already distinguishes a member's **gate-free path** — it probes each installed fleet's queue depth "through its own gate-free report-only path rather than reimplementing its selection, and never through a gated dry-run path." That concept exists for *probing* only. Dispatch then runs the real member skill, and every member's SELECT→CONFIRM→DISPATCH→VERIFY→REPORT loop includes a human CONFIRM, so a scheduled fleet still serialises on a person regardless of budget or quota. Any unattended-operation plan is therefore incoherent until each member declares which of its stages are safe to run without a human, and what the fallback is when an unattended run reaches a gate. Build: a per-member contract naming its gate-free stages, its mandatory-human stages, and a defined park-and-report behaviour at the boundary — so a scheduled run either completes or parks cleanly with a queued decision, never blocks holding resources. Prerequisite for `budget-governor-for-unattended-dispatch`, which assumes unattended dispatch is possible.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1533

### Govern aggregate capacity across operators, not just per operator

- **Status:** planned
- **Spec:** —
- **Summary:** Every governor in the fleet family is scoped to one operator's run — slot budgets per workflow, a global leaf pool per invocation, and (proposed) a spend envelope per period. None of them see a second operator. The arithmetic that breaks first is aggregate: a ten-person team operating at the level a single operator already sustains would produce more merged changes than the entire 1,957-repository organisation measured here produces today, against a release pipeline that in one observed consumer had converted 1,132 merged pull requests into zero tagged releases. Individual capability is not the constraint at that point — downstream absorption is. Build: a shared capacity ledger across operators covering token spend, concurrent lanes, and per-surface change rate, with backpressure derived from downstream signals (release throughput, review queue depth, integration failures) rather than from upstream willingness. A team that can generate more change than it can absorb needs the governor at the team boundary.
- **Blockers:** Depends on `budget-governor-for-unattended-dispatch` and `merged-but-unreleased-inventory-metric` for its inputs
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1537

### Maintainer-side intake: triage a flood the project did not author

- **Status:** planned
- **Spec:** —
- **Summary:** Every fleet is producer-side. `issue-fleet` triages "the open-issue backlog" and `pr-fleet` lands "the open-PR queue" — both assume the project authored the work and that the queue is finite and ours. A large open-source project inverts this: openclaw/openclaw carries 81,403 forks, 5,726 open issues and 2,191 open pull requests, taking in roughly 131 new issues and merging 313 pull requests **per day**. At that shape the scarce resource is maintainer attention, and the harness's entire value proposition — produce more — is the opposite of what is needed. Build the receiving function: continuous intake that classifies, deduplicates, ranks and routes inbound issues and pull requests against declared project scope; auto-closes out-of-scope and stale items under stated policy; and presents maintainers with batched decisions rather than an unordered stream. Same fan-out machinery, inverted objective. Without it the harness is unusable by exactly the projects with the most volume to manage.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1544

### Semantic duplicate detection across a very large backlog

- **Status:** planned
- **Spec:** —
- **Summary:** `issue-fleet` deduplicates as part of triage, but pairwise comparison against a backlog of a few hundred items is a different problem from a backlog of thousands with thousands more arriving monthly. openclaw/openclaw holds 5,726 open issues against roughly 3,927 created in 30 days: at that ratio duplicates are the dominant class, the same defect is reported in a dozen phrasings, and textual similarity is too blunt to separate "same bug" from "same area." Build: an embedding-backed index over open and recently-closed items so intake matching is sub-linear rather than pairwise; canonical-issue election with duplicates linked rather than silently closed; and a confidence threshold below which the pair is surfaced for a human instead of merged. Note the failure mode that makes this dangerous to automate carelessly — a wrongly-merged duplicate silently discards a distinct report, and the reporter has no recourse.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1547

### One arbiter over authored and received work

- **Status:** planned
- **Spec:** —
- **Summary:** The two governors on this roadmap contend for the same resources and cannot see each other. `team-level-capacity-governor` allocates token spend, concurrent lanes and per-surface change rate to internal production; `inbound-contribution-triage-at-scale` allocates maintainer attention and review queue depth to external contributions. **Both claim review queue depth and lane capacity.** A project doing both at scale — internal fleets generating change while thousands of forks submit it — will have producer-side dispatch starve adjudication of external work, or the reverse, with no policy expressing which should win. Build a single admission controller over one shared capacity ledger: a declared allocation between authored and received work (an explicit fraction of review attention, compute and merge slots, not an emergent one), backpressure that throttles internal dispatch when the inbound queue ages past threshold, and one ranked queue in which a user-reported defect and a roadmap item are comparable rather than living in separate systems. The allocation is a stated organisational decision; the controller's job is to enforce it and report when it is being violated.
- **Blockers:** Depends on `team-level-capacity-governor` and `inbound-contribution-triage-at-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1548

### Governors need control theory, not thresholds

- **Status:** planned
- **Spec:** —
- **Summary:** Every governor on this roadmap — spend envelopes, admission control, backpressure from queue depth — is currently specified as a threshold: cross the line, throttle; fall below, resume. Threshold controllers oscillate, and coupled threshold controllers oscillate together: internal dispatch throttles on review-queue depth, the queue drains, dispatch resumes, the queue refills, in a limit cycle that wastes capacity at both extremes and thrashes every human watching the dashboard. Control theory solved this: setpoint tracking with proportional response (throttle *in proportion to* deviation, not all-or-nothing), damping against the known delay between actuation and effect (a lane dispatched now hits the review queue much later — delayed feedback is the classic oscillation driver), anti-windup on the integral term so a long saturation does not overshoot on recovery, and explicit oscillation detection that flags a governor fighting itself or another governor. Build it once as a shared controller primitive the governors instantiate, with `queueing-model-for-pipeline-capacity` supplying the plant model and setpoints. The queueing item says where the system should sit; this one is the actuator that holds it there without ringing.
- **Blockers:** Depends on `queueing-model-for-pipeline-capacity`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1567

### Shadow prices on shared capacity instead of static quotas

- **Status:** planned
- **Spec:** —
- **Summary:** `unified-work-admission-control` enforces a declared allocation between competing consumers of review attention, compute and merge slots. Static allocations have a known failure mode at scale: they are wrong most of the time, because demand shifts faster than anyone re-declares quotas, and the cost of misallocation is invisible — nobody sees the high-value work queued behind a reserved-but-idle share. The economic instrument is the shadow price: let each capacity pool carry a price that rises with contention, let intents carry budgets derived from their expected value (`value-per-spend-routing` supplies the valuation), and let dispatch order fall out of willingness-to-pay rather than static rank. Large schedulers converged on this shape for the same reason markets exist — prices aggregate dispersed information about scarcity that no central declaration keeps current. Scope guard stated plainly: this is priority arbitration *inside* declared bounds, not a replacement for them — safety gates, trust tiers and the human-attention floor for inbound work are never priced, and the admission controller's declared allocation remains the outer constraint the market clears within.
- **Blockers:** Depends on `unified-work-admission-control` and `value-per-spend-routing`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1569

### The Nyquist bound on human oversight — attention aliasing detection

- **Status:** planned
- **Spec:** —
- **Summary:** Sampling theory: to reconstruct a signal you must sample at more than twice its highest frequency, and undersampling doesn't merely miss detail — it aliases, producing false slow trends that look like calm. Human oversight of an agent fleet is a sampling process: if the system's state can change materially in hours (an agent can introduce a regression class, shift an interface, drift a convention) and humans review daily, oversight is aliased — the dashboard shows a smooth trend that is an artifact of the sampling rate, and the humans' situational picture is provably unreconstructable from their observations. Make this a law the governors obey: measure the frequency content of consequential change (how fast each class of state actually moves), derive the minimum attention sampling rate per surface, compare against the declared human attention budget, and when the budget cannot meet the bound, the governor must lower the change frequency — batching, freezing surfaces, or reducing concurrency — rather than letting oversight silently become fictional. This converts 'humans can't keep up' from a vibe into a computed inequality with a forced resolution, and it composes with every governor already on the roadmap: they get a principled setpoint instead of a policy guess.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1618

### AIMD congestion control for fleet concurrency

- **Status:** planned
- **Spec:** —
- **Summary:** The internet's congestion control discovers available capacity with no global knowledge: additive increase while the path is clean, multiplicative decrease on loss, and the equilibrium is both efficient and fair across flows. Fleet concurrency today is a static cap — wrong in both directions, idle when capacity is free and thrashing when it isn't. Replace it with AIMD per lane: each fleet lane probes upward (+1 agent per clean interval) and backs off multiplicatively on a 'loss' signal — merge conflict, CI queue saturation, provider rate-limit, verification-latency blowup, or a cavitation/turbulence warning from the sibling detectors. This is the online controller that complements the offline model: the scalability-law fit describes the capacity curve, AIMD finds the operating point without needing the model to be right, and disagreement between them is itself a signal. Fairness falls out for free: multiple lanes AIMD-sharing one capacity pool converge toward equal shares without central arbitration, and weighted variants implement the admission controller's declared priorities. Guard the known failure mode: loss signals must be debounced and classified (a flaky CI failure is not congestion), or the controller oscillates on noise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1606

### Speculative pipeline execution — branch prediction on human decisions

- **Status:** planned
- **Spec:** —
- **Summary:** CPUs are fast because branch predictors exploit the predictability of code: predict the branch, execute speculatively, squash cheaply on mispredict — and misprediction is safe because speculation never retires architectural state. Human decision points in the pipeline (approvals, batch confirmations, priority picks) are the stalls of this system, and they are predictable: the typicality work already implies most approvals are foregone conclusions. Build the speculative executor: predict the human's decision per decision-class from history, begin the next pipeline stage speculatively in isolation (worktree/sandbox — speculation never retires: no push, no merge, no external effect), and on the actual decision either commit the pre-built work (latency hidden) or squash it (bounded waste). Track prediction accuracy per decision-class as a first-class metric with two payoffs: latency hiding where predictions are good, and — the more interesting one — an evidence-based promotion path: a decision class predicted correctly at 99%+ over a large sample is a documented candidate for policy-level auto-approval, converting 'can we automate this gate?' from argument into measurement. Budget-bound the speculation (it consumes real compute) and never speculate past irreversible or externally-visible actions.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1622

### Speculative merge queue with batch bisection

- **Status:** planned
- **Spec:** —
- **Summary:** Every high-throughput engineering organisation lands changes through an optimistic merge queue — changes are tested in speculative batches against the projected future state of the trunk, batches that pass land atomically, and failures bisect to the culprit — because serial land-and-verify caps landing throughput at (verification latency × queue depth) and pre-merge-only testing admits semantic conflicts between concurrently-green changes. Everything in the fleet family assumes landings scale; nothing on the roadmap provides the landing mechanism. Build or integrate the queue: speculative batching (test change-sets against trunk + everything queued ahead), batch bisection on failure (log-time culprit isolation), priority lanes honoring the admission controller's declared allocation, and hooks so the harness's own verdict machinery is the queue's gate rather than a second CI system. Prefer integrating the platform-native queue where one exists and wrapping it with harness verdicts; build the speculative layer only where the platform lacks it. This is the most glaring field-standard-elsewhere gap on the roadmap: the 1000x items raise how much can be produced; this is what lets it land.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1647

### Continuous corpus-accumulating fuzzing fleet

- **Status:** planned
- **Spec:** —
- **Summary:** Mutation testing (filed) checks whether the gates catch seeded defects; nothing continuously hunts real defects in the product code with the one background technique that has decades of industrial proof: coverage-guided fuzzing with a persistent, growing corpus. The model is well established — harnessable entry points get fuzz targets, a background fleet runs them continuously within a compute budget, the corpus accumulates as an asset (every interesting input found makes all future fuzzing better), crashes/violations are deduplicated, minimized, and filed with reproducers. The fleet-family framing fits exactly: a standing background fleet, budget-governed, whose findings enter the normal intake queue as issues with reproducing tests attached (the bug-fleet's no-reproduction-no-bug rule satisfied by construction — a fuzz finding IS a reproducer). Agent leverage is the new part: agents write and maintain the fuzz targets — historically the adoption bottleneck — by identifying harnessable surfaces (parsers, deserializers, state machines, public APIs with structured input) and generating targets from type signatures, which is precisely the mechanical-authoring work agents do well.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1640

### Item-response model — joint task-difficulty and agent-ability estimation

- **Status:** planned
- **Spec:** —
- **Summary:** Psychometrics solved a problem routing now has: you cannot grade test-takers without knowing question difficulty, or calibrate questions without knowing taker ability — item response theory estimates both jointly on one latent scale from outcome data alone, yielding per-(taker, item) success probabilities. Routing today uses folklore equivalents: model tiers assumed ordered, task difficulty guessed from labels, success rates confounded by who attempted what (a model that only gets hard tasks looks bad). Fit an IRT model over the outcome history: tasks as items (difficulty, discrimination), agent/model configurations as takers (ability), outcomes as responses — producing calibrated success probabilities per (configuration, task) pair on a common scale. The consequences are immediately load-bearing: routing sends work where predicted success crosses threshold at least cost; the difficulty scale prices tasks for decomposition (an item too hard for every configuration must be split); ability drift over model updates is measurable on a stable scale (feeding the sentinel); and the confounding that poisons naive success rates is handled by construction, because difficulty and ability are estimated jointly. Guard: refit cadence and identifiability checks (sparse response matrices need anchoring items) are part of the deliverable, not an afterthought.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1657

### Crisis standards — pre-authorized degraded operating modes under overload

- **Status:** planned
- **Spec:** —
- **Summary:** Emergency medicine plans for overload before it happens: crisis standards of care are pre-declared, pre-authorized reduced standards — what care changes, at what trigger, authorized by whom, returning to normal how — because deciding standards during the surge produces ad-hoc collapse, inequity, and cover-up. Pipelines under overload today degrade implicitly: cavitation detection (filed) will *observe* gates silently going soft, but nothing *designs* what should happen instead. Declare the degraded modes in advance: for each overload class (review saturation, compute exhaustion, incident surge, rate-limit famine), a pre-authorized mode stating exactly which standards relax (batch sizes up, sampling fractions down, low-tier auto-approval widens), which never relax (security gates, guarded actions, protected paths — the inviolable floor), entry triggers tied to measured signals, exit criteria, and the audit trail every mode transition writes. The moral core imported from medicine: degradation happens either way under sufficient load — the choice is between a designed, bounded, auditable reduction and a silent, unbounded one. Crisis standards convert the cavitation alarm from 'quality is collapsing somewhere' into 'engage mode B, which we agreed to in daylight.'
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1654

### Bullwhip dampening — end-demand visibility across pipeline stages

- **Status:** planned
- **Spec:** —
- **Summary:** Supply chains discovered that order variance amplifies upstream: each stage orders based on the noisy orders of the stage below, adding its own safety stock and batching, so a small ripple in end demand becomes a whip at the far end — and the fix is structural, not behavioral: share the end-demand signal with every stage instead of letting each stage see only its neighbor. Multi-stage orchestration has the same topology: intent → decomposition → dispatch → verification → landing, each stage sizing its work and buffers from the stage adjacent to it. A burst of intents becomes over-decomposition, which becomes over-dispatch, which floods verification, which batches landings — amplified variance at every hop, visible in telemetry as oscillating load that no single stage caused. Import the fix: every stage reads the true end-demand signal (the intent arrival rate and its forecast) directly, sizes its buffers against that instead of against its upstream neighbor's bursts, and batching policies are set globally rather than per-stage. The measurable claim: variance amplification ratio per stage (output variance / input variance), currently unmeasured, drops toward 1 when stages share the demand signal.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1666

### Kelly staking — bet-sizing token budgets by edge and ruin avoidance

- **Status:** planned
- **Spec:** —
- **Summary:** Gambling mathematics solved optimal bet sizing under uncertainty: the Kelly criterion stakes a fraction of bankroll proportional to your edge (probability-weighted payoff vs. cost), maximizing long-run growth while making ruin probability-zero — over-betting a finite bankroll is ruinous even with positive edge, and under-betting forfeits compounding. Token budgets are a bankroll and intents are bets: each has a success probability (the IRT model supplies it, calibrated), a payoff (value-per-spend supplies the valuation), and a stake (the token budget allocated). Today stakes are sized by task-shape convention, which commits both Kelly sins — big speculative bets that can exhaust a period's budget on low-probability work, and timid stakes on high-edge work that leave growth unrealized. Build the staking layer: per intent, compute the Kelly fraction from calibrated success probability and expected payoff; stake fractional Kelly (half-Kelly is the practitioner standard — full Kelly assumes your probabilities are exact, and ours carry uncertainty); enforce the ruin constraint at the portfolio level (total staked never exceeds the declared bankroll fraction); and log realized outcomes back to sharpen the edge estimates. The discipline's deepest import is the ruin asymmetry: a budget that hits zero mid-period stops all compounding, so survival dominates any single bet's optimality.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1668

### Incident command structure — scalable surge organization with span-of-control limits

- **Status:** planned
- **Spec:** —
- **Summary:** Emergency management's incident command system (ICS) is the field-proven answer to a coordination problem fleets hit in surges: how to organize a response whose size is unknowable in advance. Its load-bearing rules transfer directly: modular organization that expands and contracts with the incident (roles are activated only when their function is needed, and every function not delegated remains with the incident commander); strict span of control (no supervisor coordinates more than ~5-7 direct reports — when exceeded, insert a layer, when under-used, collapse it); unified command when multiple jurisdictions share an incident; and common terminology so mutual aid works without translation. Surge response today (incident swarms, big remediations, fleet-command waves) improvises its structure per event: coordinator overload is discovered rather than prevented, and two fleets converging on one incident have no unified-command protocol. Encode ICS: surge responses instantiate the modular structure automatically — a commander context, sections activated on demand (investigation, remediation, verification, communication), span-of-control enforced by inserting/collapsing coordination layers as the response scales, unified command negotiated when responses collide, and the after-action review as a standard artifact. This composes with crisis standards (which govern what standards apply under load) by governing who coordinates whom while it happens.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1667

## v5.0 — Enforcement Hardening

### Audit and cap the pre-commit --skip list

- **Status:** done
- **Spec:** docs/changes/audit-precommit-skip-list/proposal.md
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

- **Status:** done
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
- **Summary:** Follow-ups deferred from #541 (shipped in PR #623). None block the shipped gate; all are documented in `docs/changes/required-review-ci/proposal.md`. Deferred items - **Promote the gate to a required check (SC8):** apply `templates/ci/required-review.ruleset.json` via `gh api repos/{owner}/{repo}/rulesets` once the non-blocking dogfood run proves stable, and flip the dogfood workflow off `continue-on-error`. - **Live runner verification in CI:** `cursor` (CLI absent locally), `gemini` (auth-blocked locally; superseded by antigravity but the id is retained), and `local` single-pass (needs a running openai-compatible endpoint). Mark each `supported: true` only after a real in-CI/endpoint run confirms its verdict envelope. - **Full-agentic `local` spike (1b):** determine whether a local model can drive the multi-persona tool-use/subagent pipeline; ships only on a 'go'. - **`--comment` PR posting (DONE):** shipped — no longer a stub. `defaultPostReview` in `packages/cli/src/commands/review-ci.ts:304-314` shells out to a real `gh pr comment --body-file -` (verdict piped via stdin), deliberately a comment rather than a `--request-changes` review so it works for self-authored PRs and CI bots. Shipped by PR #674 (`feat(cli): wire review-ci --comment PR poster`). - **antigravity CI secret:** `GEMINI_API_KEY` is a best-guess pending CI verification (`runner-presets.ts`). Refs: #541, PR #623, PR #674. **Reconciliation (partial):** the `--comment` slice above is DONE; the remaining sub-items — promote-to-required (SC8, flip `pr-advisory-checks.yml` off `continue-on-error`), live cursor/gemini/local-runner in-CI verification, the full-agentic `local` spike, and the antigravity secret — are ops/human decisions and remain **not-done / human-gated**, so this item's overall Status stays `planned`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#626

### Adopter-facing git-hook installer for roadmap aggregate regeneration

- **Status:** done
- **Spec:** docs/changes/adopter-roadmap-hook-installer/proposal.md
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

- **Status:** done
- **Spec:** —
- **Summary:** Problem When `.github/workflows/roadmap-auto-done.yml` cannot direct-push the shard flip to `main` (branch protection: "changes must be made through a pull request"), it falls back to opening a self-approved PR. That fallback **fails**: The token used for the fallback lacks `pull-requests: write` (or is the integration `GITHUB_TOKEN`, which is restricted from creating PRs). Result: the merged PR closes the issue, but the roadmap row is left at `planned` while the issue is `CLOSED`, and an orphaned `chore/auto-done-prNNN-*` branch accumulates on the remote. Impact This is **not** specific to one PR — **every** auto-done that cannot direct-push (i.e. whenever branch protection is active on `main`) fails the same way, silently leaving the roadmap inconsistent. It's a gap in the post-ship enforcement path. Observed - PR #779 merged, issue #533 CLOSED/COMPLETED, but shard stayed `planned`. Rescued manually via PR #780 (reused the workflow's own commit `59ccbd430`). - Failing run: roadmap-auto-done for PR 779 (2026-07-09T16:52Z). Fix direction Grant the fallback path a PAT with `pull-requests: write` (the workflow already references `AUTOAPPROVE_PAT` for the self-approval — verify it also has PR-create scope and is passed to the `gh pr create` step), and add a cleanup step for the orphaned `chore/auto-done-*` branches. Consider failing loudly (or emitting a Signal) when the roadmap flip does not land, so the inconsistency is visible rather than silent.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#781

### Rule-to-failure provenance linking

- **Status:** done
- **Spec:** docs/knowledge/decisions/0100-rule-to-failure-provenance.md
- **Summary:** Adopt the community harness-engineering field's #1 habit (OpenAI/Osmani/AGENTS.md) — link every enforced constraint to the incident that birthed it, so the harness can explain why each rule exists and detect dead rules. Today `harness-compound` writes post-mortems to `docs/solutions/**` and gates/linters enforce rules, but the two are **not linked** (grep for provenance across `packages/core/src` = 0 hits), so the constraint set only ever grows. **Scope if pursued:** (1) Extend the solution frontmatter Zod schema (`packages/core/src/solutions/schema.ts`, human copy `docs/solutions/references/schema.yaml`) with an optional `enforces: string[]` — rule ids a fix produced/hardened (e.g. `strength-002-autobaseline`, `arch:no-cross-package-import`, `sec:INJ-REROL-003`). (2) Add an optional `origin` field to the `StrengthRule` type + modules (`packages/core/src/harness-strength/rules/`); for generated baseline-JSON rules (`.harness/arch/baselines.json`, `.harness/security/`, coverage/benchmark baselines) store provenance in a sidecar map keyed by rule id rather than mutating generated files. (3) Ship a `harness rules provenance` reverse-index reporter that joins both sides and flags (a) "unexplained constraint" = enforced rule with no origin, and (b) "candidate dead rule" = origin solution resolved/obsolete AND failure class shows no recent recurrence. (4) Update the `harness-compound` capture phase to prompt for `enforces:` when a fix landed an enforcement change. **Acceptance:** reporter runs in CI advisory-only (never blocks); new `compound` docs can declare `enforces`; a rule missing `origin` never fails a build; existing rules stay valid with empty provenance (fill-forward — no bulk retrofit required). **Design constraints:** advisory metadata only, authority stays where it is; directly counters the `strength-004-empty-thresholds` / rule-sprawl failure mode by giving the constraint set a shrink path. **Dependencies:** none. **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1469

### Risk-tier the review gate instead of reviewing uniformly

- **Status:** planned
- **Spec:** —
- **Summary:** Measured on a dogfood consumer: of 3,252 non-merge commits in 90 days, **110 respond to review feedback — 3.4%**. One reviewer gave 314 reviews in the same window, 89% of them to two authors. Uniform human review of every pull request therefore changes something roughly once in thirty, while consuming the scarcest resource in the system — and review, not authoring, is the ceiling once throughput rises (nine engineers at 150 PRs/quarter implies ~1,000 reviews/quarter for whoever holds it). The 3.4% figure understates somewhat, since an agent may fold feedback in before committing, but the direction is unambiguous. Build: a declared risk tier per path — PHI and money paths, migrations, public API surface, security gates — where human review is mandatory, and agent review on the same gates elsewhere. Pairs with `pre-merge-brief` as the human-facing summary on the tiers that keep eyes.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1527

### Never emit a ranked list without a stability check

- **Status:** planned
- **Spec:** —
- **Summary:** A contributor-scoring exercise across 69 people and two adjacent 45-day windows produced a Spearman rank correlation of **0.62 overall, near zero in the middle band, with a mean movement of 12–15 places**. Individual position was not reproducible; only broad tier membership was. The same exercise also produced an invalid band analysis on the first pass — bands defined by the *mean* of two measurements force those measurements to anti-correlate within band, yielding impossible negative correlations. Both failure modes apply to every ranked output the harness emits: hotspots, risk areas, craft targets, critical paths, skill recommendations. Build: any ordered output computes over two windows, reports the correlation, and **degrades to tiers when correlation is low** rather than presenting a spurious order; bands are always defined on one window and validated against the other, never on the average. Turns a methodological trap into a mechanical guard.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1529

### Metrics must declare their denominator

- **Status:** planned
- **Spec:** —
- **Summary:** A 90-day measurement of 1,957 repositories produced five wrong figures, and every one was a denominator rather than a numerator error: nominal team size used for effective FTE (8 people versus 5.8 effective, and a first pass mis-stated it as 1.3); a 479-member access-control roster treated as engineering headcount; all-time contributor counts used for per-developer rates, overstating a comparison base ~8x; a documentation CMS emitting one commit per page edit inflating an org commit total by 26%; and a scored population selected by the metric carrying the heaviest weight, a closed loop that hid heavy reviewers entirely. Numerators were cross-validated to 0.24% against git; divisors were never checked once. Build: metric outputs carry `{value, numerator, denominator, population_definition}` and a scalar with no stated population fails the emit. Cheap, mechanical, and it catches the error class that silently survives every other check.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1530

### Move human control from per-change review to declared policy

- **Status:** planned
- **Spec:** —
- **Summary:** Per-change human oversight has an arithmetic ceiling. At the throughput a single operator already sustains, skimming every pull request at five minutes each consumes over three hours a day before any work happens; at twice that rate it exceeds a working day. Every review-side item on this roadmap — `risk-tiered-review-gate`, `pre-merge-brief` — reduces the volume a human reads, but the model stays "a person looks at changes." The next model is "a person declares constraints and the machine proves conformance": acceptance criteria, invariants, forbidden transitions and risk classifications authored once per surface, enforced on every change, with human attention spent on *changing the policy* rather than on reading diffs. Build: a declarative policy surface per repository, versioned and reviewable like code; mechanical conformance checks bound to it; and an escalation path that surfaces only changes the policy cannot adjudicate. Prerequisite for any operating point where nobody can read the day's output.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1534

### Verification whose cost does not scale with change rate

- **Status:** planned
- **Spec:** —
- **Summary:** Measured on a dogfood consumer, the merge gate runs a median of **21.4 minutes**. At an operator's current rate that is tolerable; at double it, the same gate implies well over a dozen gate-hours of compute per person per day. Parallelism hides the latency but not the cost, and the cost is paid per change — so test-suite execution as the primary correctness mechanism becomes the binding constraint on throughput long before authoring does. Build the complement: correctness established by construction rather than by running everything. Stronger types and exhaustiveness at boundaries, contracts and invariants on the paths that matter, property-based and specification-derived tests replacing hand-enumerated cases, and a tiered gate where the cheap conformance layer runs on every change and full execution runs once per merge train. The goal is a verification cost curve that flattens as change volume rises, instead of tracking it linearly.
- **Blockers:** Pairs with `policy-level-human-control` — the policy surface is what the conformance layer checks against
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1535

### Make architectural intent executable, not documentary

- **Status:** planned
- **Spec:** —
- **Summary:** Architectural intent lives in ADRs, `AGENTS.md`, layer and boundary config, and the knowledge graph — partly enforced (`forbiddenImports`, layer checks, design-token drift) and largely documentary. A codebase absorbing an order of magnitude more change per week accumulates drift proportionally faster, and prose intent that an agent may or may not consult is not a constraint. Measured on one dogfood consumer, the architecture baseline file itself churned nearly five thousand lines in 90 days: drift is already being *recorded* rather than *prevented*. Build: every architectural decision that can be expressed as a machine-checkable constraint is emitted as one when the ADR lands, bound to the surfaces it governs, and enforced on every change; decisions that cannot be mechanised are labelled as advisory so the distinction is explicit rather than assumed. This is the difference between a codebase that stays coherent at high change velocity and one that becomes the brownfield the greenfield advantage was measured against.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1543

### Establish safety on untrusted changes before spending human attention

- **Status:** planned
- **Spec:** —
- **Summary:** At high inbound volume a maintainer cannot afford to be the first reader. Measured on openclaw/openclaw, roughly 350 pull requests arrive daily and **1,274 were closed unmerged in 30 days — about 12% rejected** — so a material share of maintainer attention is spent discovering that a change should not land. The harness already owns the review machinery (`harness-code-reviewer`, the adversarial and security reviewers, `outcome-eval`); none of it is pointed at inbound work from outside the project. Build: a pre-review pass that runs before a human looks — scope conformance against declared project boundaries, duplicate-of-existing-PR detection, test and gate conformance, security review of the diff, and a machine verdict with cited evidence attached to the pull request. Success is measured as maintainer decisions avoided, not reviews produced. Pairs with `contributor-trust-tiering`, which decides how much verification an untrusted change earns.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1546

### Prove the gates catch anything: inject faults and measure escape rate

- **Status:** planned
- **Spec:** —
- **Summary:** The entire trust model rests on gates — coverage floors, review agents, security scans, conformance checks — and nothing measures whether the gates *work*. A 96% CI pass rate is equally consistent with "changes are good" and "gates are blind." Mutation testing answers this for test suites; apply it to the whole gate stack: periodically inject known-bad changes — a subtle logic inversion, a leaked secret pattern, a removed permission check, an invariant violation — through the same pipeline real changes take, in a marked-and-quarantined mode that can never merge, and report gate escape rate per fault class. This is the immune-system principle: a defence that never sees an attack atrophies undetected. Output: "the review stage catches 9 of 10 injected logic faults but 2 of 10 permission-check removals" — which redirects gate investment from vibes to measurement, and gives `machine-pre-review-for-untrusted-changes` a calibrated confidence number instead of an asserted one. Design constraint stated up front: injected faults are cryptographically marked, quarantined at dispatch, and excluded from every throughput metric, so the instrument cannot contaminate the thing it measures.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1554

### Route changes by how unusual they are

- **Status:** planned
- **Spec:** —
- **Summary:** Every gate treats every change as equally novel, which at high volume wastes verification depth on the thousandth routine change and under-spends it on the first weird one. Immune systems solve this with negative selection: learn the shape of "self," escalate what does not match. Build the software version: an inexpensive typicality model over the change stream — surfaces touched together, diff shape, size distribution, dependency deltas, authoring pattern — scoring each change against the repository's own history, with atypical changes routed to deeper verification tiers (more reviewers, full gate, human eyes) and typical ones to the cheap path. This is the dial that lets `verification-by-construction`'s tiered gate allocate its budget by information content rather than uniformly. Two constraints from the failure modes: novelty selects verification depth, never rejection (an unusual change is often the most valuable one); and the model must be periodically re-fit as the codebase's "self" legitimately drifts, or yesterday's architecture migration becomes permanently suspicious.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1561

### Reliability as a purchasable quantity: N-version generation with voting

- **Status:** planned
- **Spec:** —
- **Summary:** Information theory's oldest trade: reliability over a noisy channel is purchasable with redundancy, at a known rate cost. Agent generation is the noisy channel; today the harness sends every change through it once and spends the redundancy budget on *checking*. For the highest-consequence changes, spend it on *generation* instead: k independent implementations of the same intent (different models, seeds, or decomposition angles — diversity is the load-bearing property), behavioral cross-checking of the candidates against each other and the acceptance criteria, and either majority agreement or divergence escalated to a human with the disagreement itself as the evidence. Divergence is the free gift: where independent implementations disagree is precisely where the specification was ambiguous, caught *before* merge rather than in production. Build as a per-risk-tier dial bound to `risk-tiered-review-gate`'s path classification — k=1 for routine surfaces, k=3+ on the paths where being wrong is expensive — with the cost curve reported per tier so the reliability/spend trade is an explicit decision. Orchestration patterns for this exist in the workflow layer; this item makes it a declared, budgeted gate policy rather than an ad-hoc pattern.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1563

### Known-answer drills — seeded defects through the whole pipeline including humans

- **Status:** planned
- **Spec:** —
- **Summary:** Mutation testing (already on the roadmap) measures whether the mechanical gates catch synthetic defects. Capture-recapture estimates how many real defects escape. Neither measures the live end-to-end detection rate of the full pipeline — machine gates plus human reviewers — which is the quantity that actually governs what ships. Run known-answer drills: periodically inject a realistic seeded defect into a controlled change (clearly manifested but not labeled), let the normal pipeline process it, and measure where (or whether) it is caught. This is the known-answer audit from measurement science and the fire-drill from safety engineering: the human link is the only unmeasured detector in the chain and the one automation complacency degrades fastest. Governance is the design core, not an afterthought: drills are announced-in-aggregate (everyone knows drills exist; no one knows which change), never punitive by policy, capped in frequency, hard-blocked from ever reaching a release branch (the drill harness owns the revert), and results are reported as system detection rates, never individual scores.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1616

### Idiom contagion — epidemiology for code patterns (R0, tracing, ring vaccination)

- **Status:** planned
- **Spec:** —
- **Summary:** Agents write code by copying the surrounding codebase: the codebase is the few-shot prompt for its own future, so every idiom in it has a reproduction number. Define and measure R0 per idiom — the average number of new sites an existing site spawns per window — from clone/similarity detection joined with commit provenance (which files were in context when the new site was written gives the transmission path: contact tracing). The epidemiological threshold does real work here: if a bad idiom's R0 > 1, fixing instances is mathematically futile — the fix rate must exceed the spawn rate forever. The correct intervention is ring vaccination: identify the high-centrality exemplar files agents most often read and copy from, fix the idiom there first, and quarantine the pattern at the source with a generated lint rule so new transmission stops. Symmetrically, R0 measurement identifies which *good* idioms spread on their own and which need seeding. Nobody treats exemplar health as the dominant quality lever; at generation scale it provably is, because the marginal author is a copier by construction.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1612

### Immune detector dynamics — negative selection, clonal expansion, memory cells

- **Status:** planned
- **Spec:** —
- **Summary:** Rule-based gates catch anticipated failures; the immune system's architecture catches unanticipated ones, and its three mechanisms transfer cleanly. Negative selection: train detectors on 'self' — the empirical distribution of normal changes for this codebase (diff shapes, idiom profiles, dependency-touch patterns, timing) — and flag non-self for scrutiny, catching the novel anomaly no rule anticipated (the typicality work is the seed of this; this generalizes it into a managed detector population). Clonal expansion: when a detector's flag is confirmed real by downstream review, spawn variants of that detector (perturbed thresholds, adjacent features) so detection capacity concentrates where threats actually are. Memory cells: after any confirmed incident, distill a cheap, fast, specific detector for that failure class and retain it permanently — the second occurrence of anything should be caught at a fraction of the first's cost. The near-miss ledger records events; this is the complementary machinery that *evolves the detector fleet* in response to them, with population management (birth from confirmations, death from sustained false-positive rates) so the fleet tracks the threat landscape instead of the threat landscape's history.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1613

### Portfolio-diverse verification — correlation-aware panel construction

- **Status:** planned
- **Spec:** —
- **Summary:** N-version verification buys safety only if the versions fail independently, and agents sharing a model family, prompt lineage, or training distribution have correlated failure modes — three verifiers that share a blind spot are one verifier at three times the price. Portfolio theory solved exactly this: expected return per unit risk is optimized not by picking the best assets but by picking assets whose risks don't co-move. Measure the failure-correlation matrix empirically: across model/prompt/temperature/tooling variants, on a shared corpus of known-answer cases (the drills and mutation-testing items generate exactly this corpus), record which variants miss the same defects. Then construct verification panels on the efficient frontier — maximum expected detection per token, accounting for correlation — instead of by redundancy count. The practical consequences are concrete: a cheaper, weaker verifier with uncorrelated blind spots can beat a second copy of the strong one; panel composition becomes a portfolio-rebalancing problem as the correlation matrix drifts (model updates change it — the sentinel item detects when to re-measure); and the redundancy dial stops assuming independence it never verified.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1631

### Semantic canonicalization — an entropy floor for generated artifacts

- **Status:** planned
- **Spec:** —
- **Summary:** Formatters ended formatting debates by making one canonical form mechanical; generated code re-opens the entropy at a deeper level — equivalent logic arrives in gratuitously different shapes (member ordering, import structure, naming patterns, error-handling idioms, test scaffolding), and every downstream system pays for the variance. Push canonicalization one level past formatting: define canonical forms for the semantic-shape choices that don't carry meaning (declaration ordering rules, structural idioms, naming patterns per construct class), enforce them mechanically at generation time and in the gate stack, and let every downstream consumer collect the dividend — diffs shrink to intent, clone detection sharpens (idiom epidemiology depends on it), context dictionaries train better, dedup and caching improve, and review attention lands on meaning instead of shape. Compression theory 101: canonicalize before you compress — variance that carries no information is pure cost everywhere it flows. Scope honestly: only choices that are semantically free get canonicalized; anything where shape carries meaning stays untouched, and the rule catalog is versioned so canon changes are migrations, not churn.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1646

### Content-addressed gate memoization — an action cache for verdicts

- **Status:** planned
- **Spec:** —
- **Summary:** Build systems solved redundant computation a decade ago with the content-addressed action cache: key every action by the hash of its inputs, and identical inputs return the cached result without re-execution. Verification here re-runs constantly on unchanged inputs — the same file tree re-scanned, the same diff re-judged after a rebase that changed nothing it touches, the same test subset re-executed across pipeline stages and fleet members. Apply the pattern to the gate stack: key each gate execution by (content hash of its true input closure × gate version × configuration), store verdicts in a shared cache, and return memoized verdicts on hit. The input-closure discipline is the hard part and the point: a gate must declare what it actually reads (files, config, environment, model version), because an underdeclared closure returns stale verdicts — so closures are audited by recording real access during execution and failing on undeclared reads. Judges are memoizable too (same diff + same judge version + same rubric ⇒ same verdict is exactly the determinism the calibration items want). Compute and token savings compound with fleet scale, since fleets re-verify overlapping state by construction.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1639

### Precedent — stare decisis for recurring judgment calls

- **Status:** planned
- **Spec:** —
- **Summary:** Courts achieve consistency at scale without re-litigating every question through stare decisis: adjudicated decisions bind materially similar future cases, distinguished only when facts genuinely differ, and overruled only deliberately at a higher standard. Agent pipelines re-litigate constantly — the same judgment call (is this dependency acceptable, does this pattern violate the boundary, is this test flaky-or-broken) is re-decided from scratch by every agent that meets it, with drift between decisions as pure noise. Build the precedent system: when a judgment call is adjudicated (by a human, a panel, or an uncontested gate verdict of declared precedential weight), it becomes a citable precedent — facts, question, holding, rationale; future agents facing a materially similar question retrieve and follow it, citing it in their justification, or explicitly distinguish it stating which material facts differ. Overruling is a first-class deliberate act at a higher review standard, never silent divergence. Distinct from the rejection ledger (dead ideas) and compiled knowledge (facts): precedent binds *decisions*. The measurable win is consistency: the same question answered the same way everywhere, with drift visible as distinguish/overrule events instead of silent noise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1660

### Standards of review — calibrated deference for second-level checks

- **Status:** planned
- **Spec:** —
- **Summary:** Appellate courts do not re-try every case: they apply declared standards of review — questions of law are reviewed de novo (no deference), findings of fact for clear error (high deference), discretionary calls for abuse of discretion (highest deference) — because full re-derivation of everything is unaffordable and, worse, substitutes the reviewer's noise for the original's diligence. Second-level checks in the pipeline (re-review, verification of verification, human spot-checks, appeal of gate verdicts) currently have no deference theory: every re-examination is implicitly de novo, which is expensive, or implicitly rubber-stamp, which is worthless — and nothing declares which. Import the doctrine: classify what a second-level check is examining (rule application, factual finding from evidence, discretionary judgment), assign each class a declared standard of review, and have the reviewing layer apply that standard explicitly — re-derive rule applications from scratch, disturb factual findings only on clear error shown from the record, and disturb discretionary calls only for abuse (consideration of forbidden factors, failure to consider required ones). Burden of proof travels with it: the challenger of a standing verdict bears the burden, to a declared standard. The payoff is review economics: deference concentrated where re-derivation adds nothing, full rigor where it adds everything.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1663

### Back-translation — independent spec re-derivation from the finished implementation

- **Status:** planned
- **Spec:** —
- **Summary:** Translation quality control has a mechanism verification lacks: back-translation — an independent translator, blind to the source, translates the target text back, and diffing the back-translation against the original source exposes meaning drift that forward-checking misses, because the forward checker reads the target through the source's frame. The analog: after implementation, an independent agent — blind to the spec and to the author's context — derives from the finished artifact alone what it believes the spec must have been (behavior, constraints honored, edge cases handled, apparent intent), and that derived spec is diffed against the actual one. Divergences are precise findings: intent present in the spec but absent from the derived version was not implemented (or not legibly); behavior in the derived version absent from the spec is unrequested scope or an accident; constraints missing from the derivation were not made structural. This catches what tests and forward review structurally miss — tests check what the author thought to check, forward review reads the code through the spec's frame — and it doubles as a legibility gate: an implementation from which competent blind re-derivation cannot recover the intent will also defeat every future maintainer. Deference note: it is expensive, so tier policy reserves it for high-stakes work, per the standards-of-review economics.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1662

### Taguchi loss — continuous quality loss instead of binary gate verdicts

- **Status:** planned
- **Spec:** —
- **Summary:** Taguchi's insight overturned pass/fail quality control: loss is continuous — quadratic in the distance from target — not a step function at the spec limit, so two parts both 'in spec' can carry very different real losses, and a gate that only says pass/fail destroys exactly the information needed to improve. The gate stack is step functions all the way down: coverage ≥ threshold, complexity ≤ limit, latency ≤ budget — each verdict discarding the distance-to-target that predicts future failures. Keep the binary verdicts for admission (they are cheap to reason about) but record the continuous loss underneath: every thresholded gate also emits its measured distance from target, a per-gate loss function (quadratic default, calibrated where outcome data supports it) converts distances into comparable loss units, and the accumulated loss per change/surface/period becomes a leading indicator the step functions cannot see — a codebase drifting toward its limits shows rising loss while every gate still passes. This is the measurement substrate several filed items quietly want: cavitation detection gains a graded signal instead of pass-rate cliffs, NNR gains severity weighting, and threshold tuning becomes an optimization over a loss surface instead of folklore.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1673

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

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #1099, merged — audit concluded no merge needed). Three confirmed/suspected clusters of concept fragmentation in the catalog. CONFIRMED: `harness-i18n` + `harness-i18n-workflow` + `harness-i18n-process` — overlap is admitted in i18n SKILL.md:13-14. SUSPECTED: six `harness-design*` skills (`harness-design`, `harness-design-craft`, `harness-design-mobile`, `harness-design-pipeline`, `harness-design-system`, `harness-design-web`). SUSPECTED: `harness-verify` + `harness-verification` + `harness-integrity`. Audit each cluster and merge to one skill per concept. Source: Pass 4 action 2. AUDIT OUTCOME (see `docs/changes/catalog-cluster-merge-audit/`): no skills merged — all three clusters are well-factored by lifecycle role, cognitive mode, and composition layer. The i18n "CONFIRMED" label is a false positive (SKILL.md:13-14 is disambiguation, not overlap). The only genuine issue is the `verify` vs `verification` naming collision — a discoverability/rename problem, not fragmentation — flagged for human review as a separate non-destructive item. Awaiting human decision to close or reclassify.
- **Blockers:** —
- **Plan:** See audit — `docs/changes/catalog-cluster-merge-audit/proposal.md`
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#546

### Promote 5 domain skills from advisory to load-bearing checks

- **Status:** done
- **Spec:** docs/changes/domain-skills-load-bearing/proposal.md
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

- **Status:** done
- **Spec:** —
- **Summary:** Catalog has 755 skills with no tier markers in the user-facing surface. Mark Tier-0 (load-bearing gear, ~12 skills: initialize-project, strategy, brainstorming, planning, execution, verification, code-review, tdd, outcome-eval, audit-harness-strength, debugging, compound), Tier-1 (library, on-demand reference), Tier-2 (deprecated/candidate for retire). Surface tier prominently in the dashboard catalog view and the README. Fix the naming inconsistency: rename `initialize-harness-project` skill to `harness-initialize-project` so it sorts with the workflow gear (slash command stays `/harness:initialize-project`). A senior engineer can hold 12 skills in their head; they cannot hold 755. Source: Pass 2 #9, Pass 3 #6, Pass 3 #7.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#549

### Skill P&L — measured realized value per skill and gate

- **Status:** planned
- **Spec:** —
- **Summary:** The catalog is curated by opinion: skills and gates enter by being written and leave rarely, and nothing measures whether an entry earns its context cost. Give every catalog entry a P&L: invocations, downstream outcome deltas (did runs that used it succeed/land/avoid rework at a different rate than matched runs that didn't), and cost (tokens, latency, human interruptions). Rank the catalog by realized value; flag entries whose measured value is indistinguishable from zero for deprecation review; and let dispatch/recommendation weight by the ledger instead of by description quality. Attribution is the hard part and must be honest: most invocations are confounded, so the ledger reports effect estimates with uncertainty (matched comparison or the observational-causal toolkit), and 'insufficient evidence' is a first-class verdict — an entry is deprecated for measured worthlessness, never for measurement absence. This is the economics layer on top of catalog metadata tiering: metadata says what an entry claims to be; the ledger says what it demonstrably does.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1621

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

- **Status:** done
- **Spec:** —
- **Summary:** `packages/intelligence/src/effectiveness/scorer.ts` currently scores personas using graph-attributed `execution_outcome` nodes. Extend the same Bayesian approach to score skills using `.harness/metrics/adoption.jsonl` data (skill+outcome+duration+phasesReached). Identify failing skills and skills abandoned mid-workflow. Feed into `harness:catalog-retrospective`. Closes the gap: the project has 1319 adoption records but no loop that uses them to improve the catalog. Source: Pass 5 #4.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#550

### Activate the skill-proposal pipeline in dogfood

- **Status:** in-progress
- **Spec:** docs/changes/activate-skill-proposal-pipeline/proposal.md
- **Summary:** The skill-proposal infrastructure exists in full (`packages/orchestrator/src/proposals/`, `packages/core/src/proposals/`, `packages/cli/src/commands/proposals.ts`, ADR 0016 defining the workflow). The README markets it: "agents emit skill candidates that route through soundness gate." But `.harness/proposals/` is EMPTY in the dogfood repo — the loop the project advertises isn't observably running. Root-cause investigation found the loop is opt-in/dormant by design (both emission surfaces need input absent in dogfood: manual `emit_skill_proposal` or session-terminus retrospection gated on `HARNESS_SESSION_RETROSPECTION` + an analysis provider). Resolution: honesty + observability — a new `harness proposals status` command surfaces per-surface live/dormant state, an operator guide documents activation, and the README claim is corrected. Source: Pass 5 #5.
- **Blockers:** —
- **Plan:** docs/changes/activate-skill-proposal-pipeline/plans/2026-08-07-observability-command-plan.md, docs/changes/activate-skill-proposal-pipeline/plans/2026-08-07-docs-and-honesty-plan.md
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#551

### Add Holiday Confidence KPI to STRATEGY.md

- **Status:** done
- **Spec:** —
- **Summary:** `STRATEGY.md:23-29` defines 5 KPIs (Agent Autonomy, Harness Coverage, Context Density, Drift Floor, External Adoption) — all measure inputs to the harness, none measures what the harness is FOR. Add KPI #6: "Holiday Confidence" — % of merged PRs in the last 30 days where (a) multi-persona review fired, (b) outcome-eval passed, (c) no auto-baseline-update occurred, (d) no signal exceeded threshold. The article's binary "if the senior disappears for two weeks, what holds?" made measurable. Source: Pass 1 #9.
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#552

### Ship aggregate-telemetry synthesis surface

- **Status:** done
- **Spec:** docs/changes/aggregate-telemetry-synthesis/proposal.md
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

### Trajectory-to-eval harvesting from black-box records

- **Status:** backlog
- **Spec:** docs/knowledge/decisions/0102-trajectory-to-eval-harvesting.md
- **Summary:** Close the field's compounding-eval loop: turn recorded agent trajectories into repeatable regression evals so a failure observed once becomes a permanent test. We already own both endpoints but they are not connected — `FlightRecorder` writes durable per-run forensic records to `.harness/black-box/run-*/` (provenance, verdicts, gate reasons; CLI `harness orchestrator black-box list|show`, `packages/cli/src/commands/orchestrator-black-box.ts`), and `acceptance_eval` / `outcome_eval` judge spec-satisfaction from acceptance criteria + diff + test output — but nothing harvests recorded runs into a growing eval corpus. **Scope if pursued:** (1) Build a harvester that reads `FlightRecorder` run records and emits eval seed cases into the existing `acceptance_eval`/`outcome_eval` corpus format (pinned base state + spec acceptance criteria + observed verdict + gate reason) — reuse the existing evaluators, do NOT build a new eval engine. (2) Selection: harvest only decisive, reproducible verdicts (e.g. a high-confidence `NOT_SATISFIED` later fixed, or a gate rejection with a clear reason) — the cases where a permanent regression test has the most value. (3) Optional `harness evals harvest` command to run the pass on demand. (4) Harvested cases stay advisory until human-reviewed; measure corpus noise. **GATE-to-start (why this is backlog, not planned):** confirm the `FlightRecorder` record format is stable enough to depend on as a harvest source before build begins — a format change mid-build is rework. **Acceptance:** conservative selection keeps the corpus clean; harvested cases feed `outcome_eval` over time; both endpoints keep current behavior until the harvester runs. **Dependencies:** FlightRecorder record-format stability (the deferral reason). **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1471

### Join burn's token attribution to shipped outcomes — cost per merged PR

- **Status:** done
- **Spec:** —
- **Summary:** `per-subagent-token-attribution-in-burn` (#1270, done) established per-subagent and per-fleet-lane token attribution from the transcript scan. Nothing joins that spend to an outcome, so the harness cannot answer the only question that governs whether the autonomous tier scales: **what does one merged pull request cost?** Evidence from a 90-day measurement across a 1,957-repository organisation: one operator at 22.1 merged PRs per weekday was running at ~78% of a weekly usage budget, so replicating that operating pattern across nine engineers is a procurement problem before it is a tooling one — and the arithmetic was invisible until computed by hand. Build: attribute each fleet lane's token spend to the PR (or PRs) it produced, via the existing lane provenance file plus branch/PR linkage, and emit `{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per skill. Enables cost regressions to be caught like performance regressions, and makes every efficiency item below measurable rather than argued. Note the denominator trap this item must avoid: dividing spend by *merged* PRs ignores lanes that produced nothing, so the figure is only honest once fleet failure categorisation lands.
- **Blockers:** Needs fleet success rate as a denominator — `extend-adoption-jsonl-with-failure-reason-categorization` is blocked, so cost-per-PR would currently divide by completed lanes only and understate true cost per shipped unit
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1522

### Scope `harness validate` to the changed surface — 68% of all invocations

- **Status:** done
- **Spec:** —
- **Summary:** Adoption telemetry from a dogfood consumer (`.harness/metrics/adoption.jsonl`, 3,090 records) shows `cli/validate` accounts for **2,097 invocations — 68% of every harness CLI call**, with `cli/check-deps` second at 441 (14%). Two commands are 82% of all usage; nothing else exceeds 65 calls. No `--changed`, `--since`, `--scope`, `--affected` or `--incremental` flag exists in `package.json` or `harness.config.json`, so the hot path appears to re-validate the full surface every time — while the same repo's `.turbo/cache` holds 12,234 entries at 1.6 GB, meaning the underlying task work is already memoised and `validate` is likely not riding it. Build: an affected-only mode that derives the changed surface from git and delegates to the existing cache, with the full sweep reserved for pre-merge and scheduled runs. This is the single highest-leverage latency and cost fix available, because it multiplies against the most-called command in the tool.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1523

### Enforce a context-replay budget per fleet leaf

- **Status:** in-progress
- **Spec:** docs/changes/context-replay-budget-per-leaf/proposal.md
- **Summary:** Measured local usage across 698 sessions and 321,281 messages: output 120,970,128 tokens against **cache-read 35,989,246,864 — a 298:1 ratio**. Cache creation to cache read is 1:27, so caching itself is healthy; the volume is the problem. The workload is overwhelmingly context *replay*, not generation, which means efficiency work targeted at output tokens addresses 0.3% of spend. Every fresh fleet leaf pays a new context load, so fan-out width multiplies the dominant cost term. Build: a declared context budget per leaf, enforced at dispatch and failing loudly rather than silently spending; batching of queue items per leaf to amortise the load; and routing leaves through `code_outline` / `code_unfold` / `find_context_for` instead of raw file reads. Complements `context-surface-attribution-report-with-exact-token-counts` (#1274), which measures the always-loaded static surface — this item governs the dynamic replay volume that dwarfs it.
- **Blockers:** Depends on cost-per-merged-pr-attribution for a before/after signal
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1524

### Track merged-but-unreleased inventory as a first-class metric

- **Status:** planned
- **Spec:** —
- **Summary:** A dogfood consumer with **1,132 merged pull requests has 0 GitHub releases and 0 tags**, alongside **138 pending changesets** — every one an unshipped unit of declared change. The release pipeline is configured and active (`release.yml`, plus several per-target deploy workflows) and 30 deployments exist across preview and production environments, so this is not a broken pipeline but an unmeasured one: merge throughput rose without release throughput following, and nothing in the harness noticed. Merged is not shipped, and a throughput claim built on merge counts is inflated by exactly this gap. Build: pending-changeset count and age, merged-but-unreleased PR count, and time-from-merge-to-release as tracked signals per surface, with a threshold that warns when inventory outgrows release cadence. Cheap to compute, and it converts a silent accumulation into a visible one.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1526

### Instrument rework rate per surface

- **Status:** planned
- **Spec:** —
- **Summary:** On a dogfood consumer, **215 of 1,411 distinct issue references appear in more than one commit — 15.2%**. Some of that is legitimately multi-part work; the remainder is rework, and rework at the autonomous tier is waste that scales directly with the token budget rather than with headcount. Today nothing distinguishes "this issue took four PRs because it was large" from "this issue took four PRs because the first three were wrong," so the harness cannot tell an operator that a surface is churning. Build: per-surface rework rate from issue-to-PR fan-out plus superseded/closed-unmerged PRs, separated from planned multi-part delivery by roadmap linkage, and surfaced next to throughput so the two are never read apart. Prerequisite for claiming any efficiency win: a 10x throughput gain with a 15% rework rate is a 10x waste gain too.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1528

### Route by value per unit spend, not cost per change

- **Status:** planned
- **Spec:** —
- **Summary:** `cost-per-merged-pr-attribution` makes spend visible per change, and `adaptive-model-routing` picks the cheapest capable backend for a given task. Neither asks whether the work was worth doing. Once compute is a material line item rather than a personal quota, the governing question stops being "what did this change cost" and becomes "what did this outcome return" — and the harness needs the ability to decline work whose expected value does not justify its spend. Build on `outcome-eval`, which already gates spec satisfaction: attribute spend to *intents* and join it to realised outcome signal, expose expected-value estimates at selection time so `roadmap-pilot` and the fleet SELECT phases can rank on return rather than effort, and make declining an item on economic grounds a first-class, logged decision. The failure mode this prevents is specific and cheap to fall into: driving cost per change down while raising total spend on work nobody needed.
- **Blockers:** Depends on `cost-per-merged-pr-attribution` and `intent-as-the-unit-of-record`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1542

### Let the harness run a controlled experiment on its own effect

- **Status:** planned
- **Spec:** —
- **Summary:** Every effectiveness claim the harness can make today is observational, and observational claims about engineering process are close to unfalsifiable. A 90-day measurement across 1,957 repositories produced a defensible 6x throughput-per-effective-head figure and could not establish that the harness caused any of it — the inflection coincided with other changes, the high-output cohort self-selected, failed adoption leaves no trace, and no counterfactual exists. That is a structural limit of observation, not a gap in rigour, and it will not close with more telemetry. Build the experiment instead: surface-level assignment (a declared set of repositories or work-streams runs with a capability enabled, a matched set runs without), pre-registered outcome measures so the metric cannot be chosen after the result, a stability requirement across at least two windows before a verdict, and refusal to report an effect when assignment was not held. Applies to any capability — a fleet, a gate tier, model routing, an enablement cohort. Nothing else on this roadmap can distinguish "the harness works" from "the people who adopt the harness were already fast," and that distinction is the whole adoption argument.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs` and `stability-gate-on-ranked-outputs` for the measurement floor
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1551

### Estimate the defects you did not find

- **Status:** planned
- **Spec:** —
- **Summary:** Every quality figure the harness reports counts *found* problems — review findings, gate failures, reverts — and says nothing about what remains, which is the number that actually governs release confidence. Ecology solved this a century ago: capture-recapture. Mark what one observer finds, see how much a second independent observer's findings overlap, and the overlap estimates the total population including the unseen remainder. The harness already runs multiple independent reviewers (code, security, adversarial, races, typescript-strict) over the same diff; their findings are captures. Build: per-review Lincoln-Petersen (or multi-list log-linear) estimation over the independent reviewers' finding sets, reported as "found 7, overlap pattern implies ~11, estimated 4 latent" — per surface and per release. Two disciplines fall out for free: reviewers must stay genuinely independent (shared context inflates overlap and *understates* latent defects — a measurable bias, so measure it), and a rising latent estimate on a surface is an early-warning signal no counting metric can produce. Nobody in this product category reports what they did not find.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1553

### Run the delivery pipeline as a queueing system with a utilisation target

- **Status:** planned
- **Spec:** —
- **Summary:** The pipeline is a queueing network — intake, decomposition, execution, verification, review, merge, release — and queueing theory makes hard, non-obvious predictions about it. Kingman's formula: wait time explodes non-linearly as any stage's utilisation approaches 100%, multiplied by variance in arrival and service times. The practical consequences run against engineering intuition: a review stage at 95% utilisation is not efficient, it is a latency bomb; large batch-size variance (one-line fixes mixed with thousand-line features in the same queue) inflates everyone's wait; and adding capacity at a non-bottleneck stage does nothing. Measured evidence already on hand: a consumer whose merge stage ran fine while its release stage sat at zero throughput accumulated 138 units of unshipped inventory — a classic unbalanced-line failure. Build: model each stage with arrival rate, service time and its variance from telemetry the harness already has; report utilisation and predicted-vs-observed wait per stage; flag any stage above a declared utilisation target (queueing practice says ~80%); and size batches to cut service-time variance. This reframes `team-level-capacity-governor` from a static allocator into a control loop with a law behind it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1555

### Explore/exploit allocation for routing decisions, with early stopping

- **Status:** planned
- **Spec:** —
- **Summary:** The harness makes the same routing decisions thousands of times — which model tier for this task class, which reviewer configuration, which decomposition strategy — and currently either fixes them by config or (in `adaptive-model-routing`) escalates on failure. Fixed policies pay a hidden price: they never learn whether the cheaper option became good enough, and the volume that makes agentic systems expensive is exactly the volume that makes learning cheap. Build the two standard instruments. First, bandit allocation (Thompson sampling) over repeated routing decisions: mostly exploit the best-known arm, always spend a small declared fraction exploring alternatives, converge automatically as evidence accumulates — bounded regret instead of permanent guessing. Second, sequential testing (SPRT-style) for the one-shot questions `controlled-experiment-harness-for-its-own-effect` asks: instead of fixing a sample size up front, stop the moment the evidence crosses a declared threshold — typically halving the cost of an answer at the same error rates. Both must respect the existing floor: explored arms still pass every gate; exploration varies *cost*, never *safety*. Together they make the harness the first tool in this category whose routing decisions provably improve with use.
- **Blockers:** Depends on `cost-per-merged-pr-attribution` for the reward signal
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1557

### Measure whether reviewer confidence means anything

- **Status:** planned
- **Spec:** —
- **Summary:** Review agents emit verdicts with confidence (CONFIRMED/PLAUSIBLE, severity ranks, pass/fail), and every downstream decision — merge, escalate, quarantine — treats those labels as meaningful. Nothing checks them against reality. Metrology's answer is calibration: join each verdict to its realized outcome (did the flagged defect surface? did the passed change later revert or cause an incident?) and produce per-judge reliability curves and Brier scores. A judge whose "90% confident" findings are real 60% of the time is systematically mispricing risk, and every gate threshold tuned against it is wrong. Build: outcome joins via the provenance chain (`emit-provenance-trailer-from-agent-commits` supplies the key), per-reviewer and per-fault-class calibration tracking, recalibrated thresholds served back to the gate stack, and drift alerts when a model or prompt change silently shifts a judge's calibration. Complements `mutation-testing-the-gate-stack` (which measures detection against *known* faults) and `capture-recapture-defect-estimation` (which estimates the unseen population): this one measures whether the confidence attached to any verdict is worth the electrons it is written with.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1560

### A near-miss ledger: leading indicators before the incident

- **Status:** planned
- **Spec:** —
- **Summary:** Safety engineering's core empirical result is that serious incidents sit atop a much larger, observable base of near-misses, and that the *ratio* moves before the incident rate does. The harness generates near-misses constantly and discards them: a gate catch is a defect that almost merged; a revert is a defect that almost shipped; a flake that passed on retry is a verification hole; an injected fault that escaped one gate but not the next (`mutation-testing-the-gate-stack`) is a measured hole. Build: a unified near-miss ledger with a small taxonomy (caught-at-gate, caught-at-review, reverted-post-merge, escaped-to-production), per-surface ratios tracked over time, and statistical process control on the series — Shewhart/EWMA control charts so alerts fire on special-cause variation rather than on noise, which is the century-old answer to the alert fatigue every other metrics item on this roadmap will otherwise produce. The payoff is the one thing lagging metrics cannot give: a surface whose near-miss ratio is deteriorating is announcing its next incident while there is still time to spend verification budget on it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1565

### Causal answers when you cannot randomize

- **Status:** planned
- **Spec:** —
- **Summary:** `controlled-experiment-harness-for-its-own-effect` covers the cases where assignment can be held. Most real adoption questions are not those cases: teams adopt when they choose, rollouts are staggered by readiness, and nobody will randomize a production org to settle a tooling debate. Econometrics spent fifty years on exactly this: difference-in-differences (adopters vs non-adopters, before vs after, so secular trends cancel), synthetic control (a weighted composite of non-adopting repositories that tracked the adopter's pre-adoption trajectory becomes its counterfactual), and event-study designs around staggered rollouts. A 90-day measurement across a 1,957-repository organisation produced a defensible throughput effect and could not distinguish tool causation from cohort self-selection — precisely the gap these methods close, and the same repository population is the donor pool synthetic control needs. Build: the estimators packaged over telemetry the harness already collects, pre-registered outcome definitions shared with the experiment harness, and mandatory reporting of the identifying assumption alongside every estimate — a DiD that hides its parallel-trends assumption is marketing, not measurement.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1566

### Counterfactual shadow trial — try-before-you-trust evaluation mode

- **Status:** planned
- **Spec:** —
- **Summary:** Every tool in this space asks for trust up front and pays back evidence later: a prospect must adopt before any evidence about their own repository exists, and failed adoption leaves no trace. Invert that. A sealed shadow mode points the harness at a candidate repository, watches the team's real ticket flow for a bounded window, and silently does the same work in a sandbox — full pipeline, all gates — while shipping nothing. The output is an evidence pack: for each ticket the team closed, the verified PR the harness would have opened, with diff, gate verdicts, wall-clock and token cost, side by side with what the humans shipped. This is the pre-adoption sibling of `controlled-experiment-harness-for-its-own-effect` (which measures effect after adoption and cannot help someone deciding). It converts the adoption decision from a leap of faith into an experiment report, and it is a go-to-market capability rather than a post-adoption one — its value is concentrated entirely in the evaluation window.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1607

### Model-update regression sentinel — supplier change-control for the underlying model

- **Status:** planned
- **Spec:** —
- **Summary:** The underlying model is the harness's most load-bearing dependency and the only one with no change control: versions update silently, behavior shifts (tool-call fidelity, verdict distributions, latency, cost, refusal patterns), and every installation discovers the shift through a broken workflow. Treat the model as a vendored dependency. Maintain a pinned sentinel suite of representative tasks (tool-loop execution, judge verdicts on fixed cases, structured-output conformance, latency/cost probes); re-run it whenever the resolved model version changes (and on schedule as a canary against unannounced changes); diff the results against the pinned baseline; and produce the changelog the supplier didn't write. Material drift gates routing — the router holds or falls back until a human reviews the drift report. Distinct from `bandit-allocation-with-sequential-stopping` (allocation among models) and `judge-calibration-against-realized-outcomes` (judge quality): this is upstream change detection. Every firing is a trust event: the harness noticed the model changed before the team did.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1617

### Adoption-funnel telemetry — instrument the on-ramp itself

- **Status:** planned
- **Spec:** —
- **Summary:** The minimal init tier built a fast on-ramp; nothing measures it. Adopter ramp is a funnel like any product funnel — install → first init → first gate run → first verified PR → steady state — and today every stall is invisible: which gate, which config step, which permission prompt loses people is unknown, so onboarding improves by anecdote. Instrument the funnel: local-first telemetry (opt-in, anonymized, aggregate) records per-stage timestamps and stall points; time-to-first-verified-PR becomes the on-ramp's north-star metric; and per-gate/per-config stall distributions feed directly back into init-tier design the way the rest of the system already improves from its own evidence. The self-referential payoff: the harness applies its own telemetry discipline to its own adoption, which is also a credibility statement to adopters — measured, denominated, stability-checked funnel metrics in the project's own dashboard.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1604

### A Reynolds number for development flow — predicting the laminar–turbulent transition

- **Status:** planned
- **Spec:** —
- **Summary:** Fluid flow transitions from laminar to turbulent when one dimensionless ratio — inertia over viscosity — crosses a critical value; the transition is sharp, and operating near it is the danger zone. Development flow has the same phenomenology: below some load, merges flow orderly; above it, conflict cascades, rework eddies, and revert chains appear abruptly. Define the analog: Re = (change velocity × coupling density) / verification viscosity, where all three inputs are already measurable — merge rate, import-graph density over the touched surface, and gate latency/depth. Turbulence has observable proxies too: conflict rate, rework rate, revert chains, re-review loops. The deliverable is not the metaphor but the fitted threshold: compute Re continuously per repo/surface, fit the critical value empirically from observed turbulence onsets across telemetry history, and expose distance-to-transition as a first-class signal the concurrency governors consume — raise viscosity (batching, gating) or reduce coupling before the transition, not after. Guard against the known failure mode of composite indices: Re is only kept if it predicts turbulence onset out-of-sample better than its strongest single component.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1610

### Cavitation detection — load-conditioned gate-quality collapse warnings

- **Status:** planned
- **Spec:** —
- **Summary:** A pump pushed past capacity cavitates: local pressure drops below vapor pressure, voids form, and the damage appears later and elsewhere. A review pipeline pushed past attention capacity does the same — quality voids form while every gate still 'runs' and still reports green: approval latency collapses toward zero, pass rates spike, comment depth and finding density drop, overrides rise. The voids collapse later as incidents, far from where they formed. The detector is cheap and specific: condition gate-quality metrics on throughput, and alarm on the cavitation signature — quality metrics degrading as a function of load, per gate, per reviewer-class, per window. This differs from unconditioned control charts: a gate can look stable on average while cavitating at every load peak, and the load-conditioned view exposes exactly the failure mode that unattended scale produces. The output is an early-warning signal wired to admission control: when a gate cavitates, the correct response is to shed or defer load at admission, not to add more verification downstream of a gate that has stopped resisting.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1611

### Basal token metabolism — separating maintenance burn from productive spend

- **Status:** planned
- **Spec:** —
- **Summary:** Bioenergetics separates basal metabolic rate — the energy an organism burns just existing — from activity. Token accounting today has no such split: re-verification of unchanged state, CI re-runs, context re-serialization, graph refresh, idle-loop polling, and re-derivation of already-known facts are booked identically to new productive work, so the system's maintenance burn is invisible and therefore unmanaged. Classify all token spend into basal (spend that produces no new artifact, decision, or verified fact) vs. anabolic (spend that does), per workflow class, from existing telemetry. Two payoffs: first, the basal share is the single accountability metric for the whole compression family — layout, compaction, dictionaries, and progressive encoding all succeed exactly insofar as basal share falls while output holds; second, basal decomposition ranks the waste (which maintenance loop burns most), turning 'we spend too many tokens' into a ranked fix list. Biology also warns what to expect: basal share grows with organism size, so the metric matters more at fleet scale than at single-agent scale — and a fleet whose basal share grows superlinearly with its size has a design problem no per-agent optimization will fix.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1628

### Failure magnitude-frequency scaling — Gutenberg-Richter monitoring on the incident stream

- **Status:** planned
- **Spec:** —
- **Summary:** Seismology's Gutenberg-Richter law: earthquake magnitudes follow a power law, so the ratio of small to large events (the b-value) is measurable from the frequent small ones — and the fitted distribution prices the rare large one you haven't had yet. The near-miss ledger records events; this fits the distribution over them. Define a failure-magnitude scale from measurable consequences (blast radius reached, rework hours, rollback depth, users/surfaces affected), fit the magnitude-frequency distribution over the incident + near-miss stream, and monitor two quantities: the implied rate of large events (your many small incidents statistically price your rare big one — a forecast, not a vibe) and shifts in the b-value over time, which in some seismic regimes precede large events and here would mean the generating process is changing shape (small failures becoming relatively rarer while the tail fattens is a warning, not a win). Honesty guards built in: power-law fitting on small samples is notoriously abusable, so the fit uses the standard rigorous estimators, reports uncertainty, tests against alternative distributions, and publishes 'no stable fit' as a first-class outcome.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1629

### Goodhart sentinel — proxy-vs-ground-truth integrity for the whole metric estate

- **Status:** planned
- **Spec:** —
- **Summary:** Every metric on this roadmap is a proxy, and Goodhart's law says each will decay once optimized against: pass rates drift up while escaped-defect estimates hold flat, coverage rises while mutation scores fall, rework 'improves' because rework got reclassified. Nothing anywhere — here or in the field — monitors proxy-vs-ground-truth divergence systematically. Build the sentinel: a registry pairing each operational proxy with its ground-truth counterpart (gate pass rate ↔ capture-recapture escape estimate; coverage ↔ mutation score; judge verdicts ↔ realized outcomes; velocity ↔ strategy displacement), computing divergence trends, and alarming when a proxy improves while its ground truth doesn't. This is the meta-instrument that protects every other instrument: without it, the measurement edifice self-corrupts on the schedule at which agents learn to optimize the proxies.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1642

### Metrology discipline — calibration chains and golden references for every instrument

- **Status:** planned
- **Spec:** —
- **Summary:** Physical science never trusts an instrument that is not traceable to a reference standard on a recalibration schedule; this roadmap has been adding instruments for rounds with no golden references, no traceability, no recalibration cadence. Build the metrology layer: every measurement instrument (detectors, judges, estimators, scores) registers a golden-reference fixture set with known answers, a measured accuracy against it, a recalibration schedule, and a traceability record (which reference version validated which instrument version). An instrument whose calibration is expired or failing is marked untrusted and its outputs carry that flag downstream — an uncalibrated number renders with its status, never as bare truth. This is what makes the Goodhart sentinel enforceable and what keeps instrument drift (model updates change judge behavior; codebase drift changes detector baselines) from silently corrupting every downstream decision.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1645

### Strategy realization accounting — did the shipped portfolio move the declared strategy?

- **Status:** planned
- **Spec:** —
- **Summary:** Everything on the roadmap measures whether work is done well; nothing measures whether the portfolio of shipped work moved the declared strategy. At high throughput the characteristic failure is not bad work but orthogonal work — a fleet velocity-optimizing into directions nobody chose. Build the accounting: every merged item traces to a strategy track (the linkage already exists at ideation time and is discarded at merge time — keep it); per track, aggregate shipped effort and cost; and compare against the strategy's own declared success measures, reporting realized displacement per track per window. The alarms are the point: a track consuming effort with no measurable displacement (busy-but-stuck), and shipped effort concentrating in work traceable to no track at all (velocity without direction). This closes the loop that value-per-spend routing opens: routing prices work going in; realization accounting audits what came out.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1649

### The autonomy ratio — a published self-hosting benchmark

- **Status:** planned
- **Spec:** —
- **Summary:** Compilers proved themselves by self-hosting; no agent-orchestration project publishes the equivalent number. Define and publish the autonomy ratio: the fraction of this project's own development shipped through its own unattended pipeline, with declared denominators and the same measurement rigor the roadmap demands elsewhere (stability across windows, no cherry-picked numerator, human-touch minutes counted honestly — a one-line human fix reclassifies the item). Break it down by lifecycle stage (ideation, spec, build, verify, land) so the number is diagnostic, not just promotional: the stages where the ratio is lowest are, by construction, the next automation targets — the benchmark and the backlog-prioritizer are the same artifact. Publish it in the repo and keep it current mechanically; a stale or hand-edited number is worse than none. It is nearly free (the telemetry exists), uniquely credible (measured on the measurer), and the single most persuasive adoption artifact the project can produce.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1638

### Desire-path mining — systematic bypass patterns as design signals

- **Status:** planned
- **Spec:** —
- **Summary:** Urban planners read the dirt paths worn across lawns as design information: the paved path is wrong, and the desire path is the requirement. Process telemetry contains the same signal and nobody mines it: gates that are systematically overridden, fields always filled with boilerplate, steps always skipped via the same workaround, flags that every invocation sets, sequences users always reorder. Each is a vote against the designed path by someone who had a job to do. Build the miner: detect recurring bypass patterns in telemetry (override clusters, boilerplate detection on required inputs, flag-usage distributions, workaround sequences), rank by frequency × effort-expended-to-bypass, and emit them as design findings — candidate process changes — rather than compliance violations. The framing inversion is the feature: the same data that a compliance lens reads as 'users misbehaving' is, read correctly, the cheapest requirements-gathering instrument the project has. A bypass that survives investigation becomes a roadmap item to pave it; one that reveals genuine risk becomes a targeted enforcement fix with the evidence attached.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1641

### Standards interop — OpenTelemetry GenAI semantics and emerging agent protocols

- **Status:** planned
- **Spec:** —
- **Summary:** The telemetry estate is proprietary by accident rather than by decision, and the field is converging on standards: OpenTelemetry's GenAI semantic conventions for model/agent spans (tokens, model IDs, tool calls, costs) and emerging agent-interop protocols for cross-system agent communication. Every proprietary format is a standing tax — adopters cannot point their existing observability stack (the collectors, dashboards, and alerting they already run) at harness telemetry, and the federation/passport items will need wire formats that other systems speak. The work: map the internal telemetry envelope onto OTel GenAI semconv and emit it natively (OTLP export alongside the internal store, not a lossy bridge bolted on later); adopt standard span semantics for agent runs, tool calls, and gate executions; and track the agent-interop protocol space deliberately — a periodic assessment with adopt/wrap/ignore verdicts per standard — so the passport and federation wire formats align with whatever the ecosystem converges on rather than fighting it. Interop is an adoption feature: telemetry that lands in the adopter's existing dashboards on day one removes a whole integration project from the adoption cost.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1648

### SRE discipline on the harness itself — published SLOs, error budgets, alarm rationalization

- **Status:** planned
- **Spec:** —
- **Summary:** The harness asks adopters to trust it as infrastructure but does not hold itself to infrastructure discipline. Two imports from operations practice, both field-standard elsewhere and absent here. First, SLOs and error budgets on the harness's own service surfaces: dispatch latency, verdict turnaround, gate false-positive rate, pipeline availability — declared targets, measured continuously, with error budgets that gate the harness's own release cadence (a budget-exhausted month means stabilization work, mechanically, not by mood). Second, alarm rationalization from the process industries (the EEMUA-style discipline): the roadmap just minted dozens of new alarms with no alerts-per-operator-hour budget, and alarm flooding is the best-documented way to make every alarm worthless. Rationalize: a standing alarm budget per operator per period, every alarm classed by required response and priority-distribution rules enforced (mostly-low-priority by construction), a periodic review that demotes or merges alarms nobody acts on, and a flood breaker that summarizes rather than streams when the rate exceeds human processing. The two compose: SLOs make the harness's reliability legible; rationalization keeps its signaling channel worth listening to as the instrument count grows.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1643

### Double-entry work ledger — claims that must balance against verification

- **Status:** planned
- **Spec:** —
- **Summary:** Double-entry bookkeeping survived five centuries because it makes a whole class of error and fraud structurally visible: every transaction posts to two accounts, the books must balance, and an unbalanced ledger is itself the alarm — you do not need to find the specific lie to know one exists. Work reporting here is single-entry: agents claim outcomes (task done, tests passing, finding fixed) and the claim IS the record, so an unverified or false claim is indistinguishable from a true one until something downstream breaks. Build the double-entry analog: every claim posts as a debit that must be balanced by a credit from an independent source — a claim of 'tests pass' balances against a gate-run record; 'finding fixed' against a re-detection miss; 'PR merged' against the merge event; 'value delivered' against the realization account. A trial-balance job continuously reconciles: unbalanced claims (asserted but never verified) age visibly, and the unbalanced-claims report is the system's standing honesty audit. This is cheaper than universal re-verification because it is bookkeeping, not re-execution — the credit entries are records the pipeline already produces; the discipline is refusing to let claims exist without them.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1655

### Number-needed-to-run — clinical effectiveness accounting for gates

- **Status:** planned
- **Spec:** —
- **Summary:** Clinical medicine reports treatment value as number-needed-to-treat: how many patients must receive the treatment to prevent one adverse outcome — the honest denominator that separates a drug that works from one that is merely prescribed, and its sibling number-needed-to-harm prices the side effects. Gates deserve the same accounting: number-needed-to-run — how many executions of this gate to prevent one escaped defect — computed from catch records and escape estimates, alongside number-needed-to-harm — how many executions per false positive that costs rework or blocks good work. Together with per-run cost they yield cost-per-defect-prevented, the single number that makes the gate stack's composition an economic decision instead of an accumulation: a gate with NNR 10,000 and heavy per-run cost is a candidate for demotion to sampling or removal regardless of how reasonable it sounds, and one with NNR 30 is cheap insurance even if noisy. This composes the existing measurement primitives (kill rates from mutation testing, escape estimates from capture-recapture, FP rates from calibration) into the clinician's decision format — treat, sample, or discontinue — applied per gate per task class, with the honesty rule that insufficient data reports as such rather than as effectiveness.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1659

### Normal-accidents audit — interactive complexity × tight coupling of the orchestration system itself

- **Status:** planned
- **Spec:** —
- **Summary:** Perrow's Normal Accidents gives a two-axis diagnosis of when systems produce accidents no component failure explains: interactive complexity (components interact in unplanned, unexpected ways) crossed with tight coupling (failures propagate faster than intervention) — systems in the high/high quadrant have 'normal' accidents, meaning structurally inevitable, and the mitigation is moving on the axes, not adding components (each added safety device raises interactive complexity and can worsen the quadrant). The dependency-percolation item audits the *code*; nothing audits the *orchestration system itself* — and this roadmap has spent six rounds adding interacting components to it: governors reading detectors feeding admission control gating fleets writing markers consumed by governors. That is interactive complexity by construction, and pieces of it are tightly coupled (synchronous gate chains, shared budget pools). Build the audit: map the orchestration system's own interaction graph (which mechanisms read/write which signals and stores), score interaction unexpectedness (interactions present in telemetry but absent from design docs are the dangerous kind), measure coupling tightness (propagation speed vs. intervention latency per path), place the system on the Perrow quadrant, and — the actionable half — rank the specific decoupling moves (async boundaries, buffers, circuit breakers between mechanisms) that shift it leftward. The uncomfortable, honest purpose: this roadmap is its own biggest source of the risk this item measures.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1669

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

- **Status:** done
- **Spec:** [docs/changes/pin-mcp-version-trust-model/proposal.md](../changes/pin-mcp-version-trust-model/proposal.md)
- **Summary:** `.claude-plugin/plugin.json:14-16` — `mcpServers.harness.command: "npx -y -p @harness-engineering/cli@latest harness-mcp"`. Every Claude Code session pulls the latest npm publish (subject to npx's ~24h cache). No version pinning by default. A compromised publish propagates to every active adopter within a day. Pin to a specific version; update via plugin update flow. Add `docs/security/trust-model.md` explaining what an adopter trusts when installing each marketplace plugin and how to verify integrity. Source: Pass 6 #4 + #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#557

### Add per-skill capability declarations

- **Status:** done
- **Spec:** [docs/changes/per-skill-capabilities/proposal.md](../changes/per-skill-capabilities/proposal.md)
- **Summary:** Skills are markdown files; the agent reads them and may take any action the user permitted Claude Code. No skill manifest declares "this skill needs Bash + Edit + WebFetch and nothing else." Add a `capabilities:` manifest field to skill.yaml declaring tool/network/file requirements. The orchestrator/agent enforces it as bounds. Closes the article's gear #4 ("bounded, observable, reversible") at the skill grain — currently it only applies at the orchestrator-workspace grain, and only when the daemon is running. Source: Pass 6 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#558

### Strengthen telemetry consent surface

- **Status:** done
- **Spec:** docs/changes/telemetry-consent-stdout/proposal.md
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` prints first-run privacy notice to stderr. In IDE sessions stderr is often invisible — adopters technically opted in by installing the plugin but the consent surface is weak. Move the notice to stdout. Optionally add a `harness.config.json` `telemetry.consented: true` field that the adopter must set before first batch send. The PostHog ingest is real (1319 dogfood records over 80 days); the consent surface should match the data flow. Source: Pass 5 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#559

### Add harness mcp list-capabilities CLI for adopter audit

- **Status:** done
- **Spec:** [docs/changes/mcp-list-capabilities/proposal.md](../changes/mcp-list-capabilities/proposal.md)
- **Summary:** DELIVERED (PR #1049, merged). MCP server has 101 tool files (`packages/cli/src/mcp/tools/`). Per-tool `trustedOutput` flag exists but per-tool capability declarations don't. Adopters have no easy way to audit what their agent can do via MCP. Add `harness mcp list-capabilities --by-permission` CLI command that surfaces each tool's read/write/exec scope, network access, and trust tag. Source: Pass 6 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#560

### Require ADR for operational policy changes

- **Status:** done
- **Spec:** [docs/changes/require-adr-operational-policy/proposal.md](../changes/require-adr-operational-policy/proposal.md)
- **Summary:** ADRs in `docs/knowledge/decisions/` capture architectural decisions. Changes to hook profiles, threshold values, `--skip` lists, and baseline-update policies are also load-bearing — and they accumulate silently in commits without ADR-grade artifacts. Add a `harness:check-operational-drift` check (or extend the existing `harness:enforce-architecture`) that flags PRs touching `.husky/`, `harness.config.json` thresholds, the pre-commit `--skip` list, or `packages/cli/src/hooks/profiles.ts` without a corresponding ADR. Forces the "we silently softened a gate" decision to surface as a deliberate ADR-grade record. Closes the surface where Pass 1 #1 (pre-commit auto-baseline) entered the codebase without a documented decision in the first place. Source: Pass 7 final-pass synthesis.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#565

### Strip internal roadmap/PR references from shipped skills & artifacts

- **Status:** done
- **Spec:** docs/changes/shipped-skill-ref-hygiene/proposal.md
- **Summary:** Shipped skills, slash commands, subagent defs, plugin bodies, and MCP tool description strings are distributed to adopter projects but leak harness-engineering-internal references (roadmap/PR/issue numbers, sub-project indices) meaningless to adopters. Genericize (not delete) so shipped text stays meaningful, regenerate distributed artifacts, add a grep/test guard so new leaks are caught. Internal linkage stays in specs/commits/PR bodies. Principle: shipped/rendered text = generic; code comments = internal-linkage OK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1059

### Emit a machine-readable provenance trailer from agent-authored commits

- **Status:** planned
- **Spec:** —
- **Summary:** Harness-authored work is statistically invisible. Measured across two orgs: a personal org carries **69 AI co-author trailers in 6,570 commits (1%)**, and a dogfood product repo **974 in 4,618 (21%)** — while its highest-volume author shows **5 trailers across 3,988 commits**, because the fleet path emits nothing. Consequences compound: org-wide AI-adoption reporting undercounts by roughly 5x and cannot distinguish the autonomous tier from interactive assistance (the distinction that explains an 18x throughput gap); cost attribution has no key to join spend to authorship; and in a regulated codebase there is no record of which agent, skill and version produced a change touching a gated path. Build: a distinct trailer — `Harness-Run: <skill>@<version>` plus lane and agent id — emitted by the fleet path rather than co-opting `Co-authored-by`, so tier detection is mechanical and the trailer doubles as the accountability record. Foundation for `cost-per-merged-pr-attribution` and for human-in-the-loop attestation on gated paths.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1531

### Select gates by contributor trust tier

- **Status:** planned
- **Spec:** —
- **Summary:** Harness gates are uniform per repository: the same checks run for a maintainer and for a first-time contributor from one of tens of thousands of forks. That is simultaneously too strict and too weak — it wastes compute on trusted changes and applies code-authored-by-strangers to the same pipeline that holds secrets. It also collides with a structural platform gate: fork pull requests require human approval before workflows run, and on a measured dogfood consumer **47 of 100 workflow runs never reached a verdict** (33 awaiting approval, 14 cancelled), which is finished work parked behind a person. Build: declared trust tiers (maintainer, returning contributor, first-time, automated) with a gate profile per tier — secret-free sandboxed verification for untrusted changes, full pipeline for trusted ones, and an explicit promotion path as a contributor's history accumulates. Related but distinct from `risk-tiered-review-gate`, which tiers by *what the change touches*; this tiers by *who wrote it*, and both dimensions are needed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1545

### Provenance across the trust boundary

- **Status:** planned
- **Spec:** —
- **Summary:** `emit-provenance-trailer-from-agent-commits` makes internally produced agent work self-declaring. External contributors do not run the harness, so inbound work carries whatever provenance its author chose — usually none. As agent-assisted contribution becomes common, a project receiving hundreds of pull requests a day cannot distinguish a reviewed human change from unreviewed machine output, and the tier distinction that governs internal gate selection is unavailable at exactly the boundary where trust matters most. Build both halves: a declared, verifiable provenance convention contributors can opt into (and that `contributor-trust-tiering` can reward with lighter gates and faster CI), plus heuristic detection for undeclared agent authorship used only to *select verification depth*, never to reject a contribution or judge a contributor. State that constraint in the design: a false positive that gates a change harder is acceptable, and one that closes a change is not.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits` and `contributor-trust-tiering`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1550

### Make the attestation chain tamper-evident, not just recorded

- **Status:** planned
- **Spec:** —
- **Summary:** `emit-provenance-trailer-from-agent-commits` records who and what produced a change; a trailer in a commit message is mutable history — rebases rewrite it, and a compromised pipeline can forge it. The supply-chain world already built the answer: append-only transparency logs (Merkle-tree backed, the certificate-transparency / sigstore pattern), where each entry is provably included and the log is provably append-only, so tampering is detectable by anyone with the log head. Build: every gate verdict, policy version, attestation and dispatch decision appended to a per-project transparency log; inclusion proofs attached to releases; and a verifier any auditor can run offline. This is the difference between "our records say the security gate passed" and "here is a proof the security gate verdict existed before the release and has not been altered" — the standard regulated industries already accept for artifact signing, applied to the process itself. Turns the compliance story from trust-us into check-it-yourself, which is the only version that survives an audit run by a skeptic.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1556

### Inbound text is attacker input to the triage agents

- **Status:** planned
- **Spec:** —
- **Summary:** The maintainer-side items (`inbound-contribution-triage-at-scale`, `machine-pre-review-for-untrusted-changes`, `semantic-duplicate-detection-at-backlog-scale`) all point LLM agents at text authored by strangers — issue bodies, PR descriptions, commit messages, diffs. At the volumes that motivate those items (a measured large open project takes in ~131 issues per day), that is a continuous stream of attacker-controllable instructions flowing into autonomous systems that hold labels, close/merge authority, and CI dispatch. Prompt injection here is not hypothetical; it is the expected steady state. Build the hardening as a property of the intake pipeline, not of individual prompts: strict instruction/data separation so inbound text is never interpolated into an agent's directive channel; capability-stripped triage agents that can *propose* but not execute closes, merges, or dispatches; canary tokens in agent context whose exfiltration marks a compromised run; injection-attempt detection that routes the item to a quarantine queue with the evidence attached; and red-team fixtures in CI so regressions in any of this fail the build. Also covers the slower attack: outcome-learning loops (`bandit-allocation-with-sequential-stopping`, `contributor-trust-tiering` promotion) must treat inbound-influenced outcomes as poisonable training signal and cap their learning rate from untrusted sources.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1559

### Verification passports — portable, replayable attestation across boundaries

- **Status:** planned
- **Spec:** —
- **Summary:** Verification evidence today dies at the repository boundary: when a change crosses repos or organisations, the receiver re-verifies from zero because nothing trustworthy travels with it. Build the passport: a signed, content-addressed bundle that accompanies a change — tests executed and their results, coverage and mutation scores, gate verdicts with versions of the gates that produced them, provenance chain from intent to diff — structured so a receiver can (a) verify the signature chain cheaply, (b) spot-check by replaying a random subset rather than re-running everything, and (c) price the residual risk of not re-running the rest. This extends `transparency-log-for-attestation` (local, append-only) into portability, and composes with knowledge federation into machine-to-machine intake lanes between installations. It is the one feature class with true network effects: each new adopter makes every existing adopter's inbound cheaper. Zero-knowledge-style claims (prove 'coverage ≥ X' without revealing sources) are a follow-on, not v1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1624

### Threshold authorization — m-of-n co-signing for irreversible actions

- **Status:** planned
- **Spec:** —
- **Summary:** No single agent, however confident, should be able to execute an irreversible or externally-visible action alone. Cryptography's threshold signatures give the pattern: an action in the guarded class (force-push, release publish, data deletion, external communication, production config change) requires m-of-n co-signatures from independently-contexted agents — each co-signer re-derives the justification from the action's evidence packet in a fresh context, without sight of the requester's reasoning, and signs only if the action is justified de novo. This is authority control, distinct from n-version quality voting: the co-signers are not checking whether work is good but whether this specific irreversible step is warranted. Human policy stays supreme — the guarded-action list and thresholds are policy-level declarations, humans can be required as signers for designated classes, and every co-signing event is logged to the attestation trail. The defense is against single-context failure: one poisoned, confused, or manipulated agent cannot alone cause the class of harm that cannot be undone.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1650

### Statistical audit sampling — assurance at a declared confidence, not census re-verification

- **Status:** planned
- **Spec:** —
- **Summary:** Auditors certify billion-dollar ledgers without checking every transaction: statistical sampling theory tells them how many items to examine, selected how, to assert with declared confidence that material misstatement is below a threshold — and discovered errors trigger defined escalation (widen the sample, then census the stratum). Verification at scale needs the same discipline and currently improvises it: passport spot-checks, fleet-output reviews, and inbound audits all sample, but with ad-hoc fractions and no confidence statement, so nobody can say what assurance was actually purchased. Import the machinery: stratified sampling plans over populations of agent work (strata by risk tier, task class, author trust), sample sizes computed from declared confidence and tolerable error rates, attribute-sampling evaluation with the standard escalation ladder on discovered deviations, and an assurance statement attached to every sampled verification — 'examined n of N, stratified thus; with 95% confidence the deviation rate is below x%.' The statement is the product: it converts 'we checked some' into a quantified, comparable, and auditable claim, and it composes with everything that samples — passports, drills, inbound triage, fleet verification — replacing their ad-hoc fractions with computed ones.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1664

### Separation of duties — structurally enforced role independence

- **Status:** planned
- **Spec:** —
- **Summary:** Internal-controls doctrine holds that no single actor may author, verify, and approve the same transaction — not because actors are presumed dishonest, but because the structure makes both error and manipulation require collusion, which is detectable, instead of requiring only one compromised context, which is not. Agent pipelines routinely violate this by convenience: the context that authored a change also writes its tests, summarizes it for review, and sometimes judges it — one poisoned or self-deceived context controls the whole chain, and every self-assessment inherits the author's blind spots. Enforce separation structurally: declare the duty classes (author, verifier, approver, auditor) and the incompatibility matrix; the runtime enforces that the verifying context shares no session lineage, working state, or model-conversation history with the authoring context (fresh derivation from artifacts only); and approval contexts are likewise independent of both. This is the institutional generalization of details already scattered across items (fresh-context outcrossing, independent co-signers, germline inheritance): one declared matrix, enforced at spawn/dispatch, instead of per-feature improvisation. Exceptions are policy-declared (low tiers may self-verify), never silent.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1661

### Safety cases — structured, evidence-linked arguments for unattended operation

- **Status:** planned
- **Spec:** —
- **Summary:** Nuclear, rail, and defense do not authorize hazardous operation on checklists or vibes: they require a safety case — a structured argument, in goal-structuring notation, that the system is acceptably safe for a declared operation in a declared context, with every claim decomposed into sub-claims and every leaf resting on cited evidence, reviewed as an artifact and re-validated when its context or evidence changes. 'Can this fleet run unattended overnight?' is exactly such an authorization, and today it is answered by accumulated gut feel over scattered mechanisms. Build the safety-case artifact: top-level claim (this fleet, this scope, unattended, acceptable residual risk), argument structure decomposing it (contracts enforced → evidence: contract tests; irreversible actions guarded → evidence: threshold-auth adversarial suite; oversight not aliased → evidence: Nyquist verdict; budget bounded → evidence: governor records), with every leaf linked live to the actual test/telemetry artifact rather than to prose. Live linkage is the teeth: when cited evidence goes stale or red, the case degrades visibly and the authorization it supports is flagged for review. The safety case becomes the reviewable, versionable answer to the only question that gates the whole unattended program: why do we believe this is safe?
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1674

## v5.0 — Article-Framing Docs & Personas

### Invert README lede to lead with the article's binary question

- **Status:** done
- **Spec:** Direct docs change — see [README.md](../../README.md) lede + "The Gears" section.
- **Summary:** `README.md:7-19` opens with feature copy: "Mechanical constraints for AI agents. Ship faster without the chaos." Compare against what an article-aligned adopter weighs hardest. Rewrite the top 20% to lead with: "If your senior engineer goes on holiday for two weeks and your agents keep shipping — do you trust what comes out the other side? This tool is the gear list that makes the answer yes." Then walk through the 7 pieces and what the tool ships for each. Today the README sells features; article-readers buy outcomes. Source: Pass 2 #8, Pass 3 #9.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#553

### Adopt the article's framing in docs/standard/principles.md

- **Status:** done
- **Spec:** docs/standard/principles.md
- **Summary:** `docs/standard/principles.md` opens with "Context Engineering" — an internal abstraction, not a binary test. The article's framing question ("if the senior disappears for two weeks, what holds?") appears nowhere in public-facing docs. Add a Principle #0 (or lift it to the top): "The harness is load-bearing. It catches when no human is watching." Use the article's vocabulary (load-bearing, gear, holiday test) in principles so adopters get the framing they came for. Source: Pass 3 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#554

### Document the article's failure-pattern checklist

- **Status:** done
- **Spec:** docs/standard/article-failure-patterns.md
- **Summary:** New `docs/standard/article-failure-patterns.md`. Name the article's five failure modes (theatre, gaps stopped naming, happy-path-only, no eval, no safe failure mode). For each, point at how `harness:audit-harness-strength` (new skill above) detects it in the adopter's own project. Provides the conceptual scaffolding for the self-audit tool. Source: Pass 1 #10.
- **Blockers:** Build harness:audit-harness-strength self-audit skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#555

### Ship agent-rehearsal fixtures and harness:rehearse skill

- **Status:** done
- **Spec:** —
- **Summary:** The article's deepest insight: Honnold rehearsed the crux moves on a rope until his body knew them, THEN soloed. The project has no analog. `examples/` (hello-world, multi-tenant-api, slack-echo-bridge, task-api) are showcase scaffolds, not failure-scenario fixtures. Ship `templates/rehearsal-fixtures/` containing deliberately-broken scaffolds across common failure modes (race condition, partial migration, edge-case data corruption, dependency cycle, layer violation, leaked secret). Build `harness:rehearse` skill that runs an agent against a chosen fixture and scores recovery. Used to (a) train agent personas before production trust, (b) regression-test the harness's own gates against known failure shapes, (c) give adopters a way to verify their gates fire before betting the climb on them. Source: Pass 7-A.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#561

### Build harness:offboarding skill symmetric to onboarding

- **Status:** done
- **Spec:** docs/changes/harness-offboarding/proposal.md
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

- **Status:** done
- **Spec:** —
- **Summary:** The "Anatomy of an AI-Native Org" companion article lists four required gear pieces: "specifications, evaluation suites, golden builds, and agent-review patterns." The project has the first, partial second, fourth — but no golden build primitive. The existing baselines (`coverage-baselines.json`, `benchmark-baselines.json`, arch baselines) are **metric baselines, not build baselines**. A golden build is the canonical known-good reference state (last passing main with a full eval pass) that all proposed changes are validated against — closer to an immutable release-tag concept than a metric snapshot. Ship: (a) `harness golden-build promote` command that snapshots a verified-passing state to `.harness/golden/`, (b) `harness golden-build verify` that compares the working tree against the most recent golden, (c) CI integration that auto-promotes a golden build on every green main merge, (d) `harness golden-build diff` for reviewing what's drifted since the last golden. Closes the gap between "metrics didn't regress" and "the project as a whole is still the project we trust." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#567

### Reframe principles.md around Why/What/How three-layer model

- **Status:** done
- **Spec:** docs/standard/principles.md
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

- **Status:** done
- **Spec:** docs/changes/wire-outcome-eval-gate/proposal.md
- **Summary:** outcome-eval is the harness's first blocking post-execution spec-satisfaction gate, but nothing invokes it automatically — verified 2026-06 it is absent from .husky/, .github/workflows/, AND the harness-autopilot VERIFY/INTEGRATE/REVIEW loop. Its blocking authority (high-confidence NOT_SATISFIED) only bites when a human or agent chooses to run /harness:outcome-eval or mcp**harness**outcome_eval. Wire it in: (a) call outcome_eval in harness-autopilot after REVIEW (post-execution, before PHASE_COMPLETE), gathering diff+testOutput from the session and halting on a blocking verdict; (b) add a pre-merge CI job (sibling to .github/workflows/required-review.yml) that runs it on PRs and surfaces the verdict, blocking only on high-confidence NOT_SATISFIED. This makes the #1-gap gate actually load-bearing and unblocks the assumptions baked into #569 (pre-merge-brief surfaces 'outcome-eval result when available'), #533 (post-merge rollback on failed eval), and #552 (Holiday Confidence KPI measures 'outcome-eval passed'). Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#662

### Honor persona-declared triggers — emit and commit persona CI workflows and scheduled jobs

- **Status:** done
- **Spec:** docs/changes/honor-persona-triggers/proposal.md
- **Summary:** DELIVERED (PR #1086, merged). Persona YAMLs (agents/personas/\*.yaml) declare on_pr/on_commit/scheduled(cron) triggers and outputs.ci-workflow: true, and a generator exists (packages/cli/src/persona/generators/ci-workflow.ts), but — verified 2026-06 — NO generated persona workflow is committed and nothing honors the triggers; they are dead declarations. Make them real: run the persona CI-workflow generator and commit the resulting .github/workflows/ so declared triggers actually fire, plus a check that fails when a persona's declared trigger has no committed workflow (drift guard, mirrors generate:plugin:check). First consumer: the new harness-pm persona (#566) auto-runs acceptance-eval on PRs touching docs/changes/\*\* — closing the manual-only gap for the upstream acceptance-criteria gate. Also lights up the currently-dormant declarations on codebase-health-analyst (dependency-health, hotspot-detector, cleanup-dead-code — weekly sweep), performance-guardian (perf), entropy-cleaner (cleanup), graph-maintainer, and security-reviewer (on_pr deep OWASP/threat-model review beyond CI's lightweight security-scan). Today the project's strongest gear is opt-in; this makes it load-bearing without a human remembering to invoke each persona. Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#663

### Auto-wire standalone drift and audit pipelines on PRs

- **Status:** done
- **Spec:** docs/changes/auto-wire-drift-audit-pr-jobs/proposal.md
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

- **Status:** done
- **Spec:** docs/changes/pre-merge-brief-adopter-template/proposal.md
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

- **Status:** done
- **Spec:** —
- **Summary:** **Priority: NOW.** The mirror of `product-advisor` at the far end: validate shipped work against the BRD's open items, client-facing, dashboard-driven. Closes the inception → acceptance circle that is currently open. Distinct from `acceptance-eval` (pre-build spec completeness) and `outcome-eval` (agent-side spec-satisfaction verdict). --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#710

### Role-shaped dashboard front doors (non-technical lanes)

- **Status:** done
- **Spec:** docs/changes/role-shaped-dashboard-front-doors/proposal.md
- **Summary:** **Priority: NEXT.** PM/BA and client lanes through the existing dashboard + router + chat: author intent, watch agents, adjudicate at decision points — no terminal. The surfaces exist; they need role-scoped paths. Lever for non-technical access per the Full-lifecycle reach track. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** docs/changes/role-shaped-dashboard-front-doors/plans/author-intent-form.md
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#711

### Extend enforcement past ship (deployment + operations)

- **Status:** done
- **Spec:** docs/changes/enforcing-deploy-gate/proposal.md
- **Summary:** DELIVERED (PR #1193, merged) — Half A. Upgraded `harness-deployment` from Tier-3 advisory to an enforcing pre/post-deploy gate + rollback wiring. Today the lifecycle no longer stops enforcing the moment code ships; this extends the constraint loop past release. Half B — an operations skill that pulls live production signals (incidents, monitoring) back into the knowledge graph — was deferred by owner decision pending real production-signal sources and is split out as a new planned item (Operations enforcement skill). --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
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

### Operations enforcement skill (production-signal ingestion)

- **Status:** planned
- **Spec:** —
- **Summary:** Split from #712 (Half B). A `harness-operations` skill that pulls live production signals (incidents, monitoring, alerts) back into the knowledge graph, extending the constraint loop past deploy. #712 shipped Half A (enforcing pre/post-deploy gate + rollback wiring, PR #1193); Half B deferred by owner decision pending real production-signal sources. Part of the Full-lifecycle reach track.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —

### Minimum-Viable-Harness init tier

- **Status:** done
- **Spec:** docs/knowledge/decisions/0101-minimum-viable-harness-init-tier.md
- **Summary:** Formalize a `minimal` tier as the documented floor of the existing init adoption ladder ("basic → intermediate → load-bearing-minimum → advanced"), mapped one-to-one to the field's 5-item Minimum Viable Harness (OpenAI; Augment Code). Motivation: `harness-initialize-project` front-loads a 10–20 min STRATEGY.md interview + framework confirmation (~10 options) + design-system before any guardrail lands, so time-to-first-guardrail is high — friction precisely where the field has standardized on a fast, minimal on-ramp, and it matters more for us because our skills are adopter-portable. **Scope if pursued:** (1) Define the `minimal` tier contract in the init adoption-level model = exactly these 5 artifacts and nothing else: a short generated `AGENTS.md` via the existing `generateAgentsMap()`; one runnable local check (a single `harness verify`-style command wired in); one fail-closed `check-arch` rule with baseline seeded; one pre-commit (or pre-push) verification hook running that check; one permission boundary (`block-no-verify` or equivalent single guarded action). (2) Wire `harness init --tier minimal` to scaffold exactly those 5 and print an explicit, ordered upgrade path ("run `/harness:strategy` … then `harness init --tier intermediate` to add …") — STRATEGY/framework/design-system/telemetry/Tier-0 MCP integrations are **deferred, not skipped**. (3) Add a "start minimal" fast-path branch in `harness-initialize-project` Phase 1 (`agents/skills/claude-code/harness-initialize-project/SKILL.md`). (4) Verify re-running init at a higher tier is additive over a `minimal` install (no clobber). **Acceptance:** `--tier minimal` produces those 5 artifacts and only those; the printed upgrade path lands you at `intermediate` additively; existing full-flow init behavior unchanged (minimal is opt-in via `--tier`). **Dependencies:** none. **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1470

### Metric-gated progressive delivery — automated canary rollout as the shipping gate

- **Status:** planned
- **Spec:** —
- **Summary:** The roadmap's production story is reactive: closed-loop remediation responds to signals after full exposure. The field-standard preventive half is progressive delivery — every change reaches a small exposure slice first, promotion to wider exposure is gated on measured health metrics against the baseline, and regression triggers automatic halt and rollback with the evidence attached. Integrate it as the terminal pipeline stage: rollout policies per deployable (slice sequence, promotion metrics, guardrail thresholds, bake times), automated promotion/halt decisions from the same telemetry discipline the rest of the roadmap builds, and the halt evidence packet flowing back into the pipeline as a first-class failure (feeding remediation, the near-miss ledger, and failure-magnitude accounting). Prefer integrating the established rollout controllers where the adopter's platform has one, with the harness supplying policy, verdicts, and evidence handling rather than reinventing traffic shaping. Unattended landing at scale is only defensible when exposure is also incremental — this is the item that makes 'agents ship to production' a bounded-blast-radius claim instead of a hope.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1644

### Derive candidate work from production signal, not only from human specification

- **Status:** planned
- **Spec:** —
- **Summary:** Human specification supply is the absolute ceiling on autonomous throughput. `unattended-work-decomposition` removes the human from *breaking down* work; nobody has removed them from *originating* it, and no person authors hundreds of units of intent per day. Beyond some rate the organisation stops being engineers implementing decisions and becomes a loop that senses and responds — so candidate work must be derivable from evidence: error and incident streams, performance regressions, usage and abandonment patterns, dependency and security advisories, support themes. `operations-enforcement-skill-production-signal-ingestion` covers *ingesting* production signal into the knowledge graph; this item covers turning ingested signal into ranked, specified candidate work with provenance back to the observation that motivated it. Build with a hard constraint: derived intent enters the same ranked queue and the same human confirmation path as authored intent, never a privileged one. A system that can both invent and execute its own work without a gate is not a productivity tool.
- **Blockers:** Depends on `operations-enforcement-skill-production-signal-ingestion`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1540

### Closed-loop detect, revert, repair on production regression

- **Status:** planned
- **Spec:** —
- **Summary:** At low change rates a regression can wait for a human to notice. At high rates the window between shipping a fault and shipping a hundred more changes on top of it collapses, and the cost of unwinding grows with every subsequent merge — so mean time to detect becomes the dominant risk term, not defect rate. The pieces exist separately: `harness-deployment` enforces pre/post-deploy gates with rollback wiring (#712, delivered), `harness-rollback` exists as a skill, and canary tooling watches suites. Nothing closes the loop autonomously. Build: production signal bound to the change that introduced it via provenance, automatic revert of the identified change under declared conditions, a repair lane dispatched with the failure evidence attached, and a hard rule that autonomous revert is always permitted while autonomous *repair* requires the same gates as any other change. Measured on a dogfood consumer, reverts run at 0.15% of commits — low, but with no external users the sample contains no true production regressions at all, so this capability is unvalidated rather than unnecessary.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits` for change attribution
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1541

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

- **Status:** done
- **Spec:** docs/changes/docs-craft/proposal.md
- **Summary:** LLM-judgment skill for documentation quality — the ceiling counterpart to harness-detect-doc-drift / harness-check-docs / harness-docs-pipeline (which enforce existence, link freshness, coverage). Ceiling questions: does this doc teach? does the order match the reader's mental model? are examples earning their place? is prose alive or bureaucratic? does the API doc predict the response shape? would a stranger walk away with the same understanding? Direct structural twin of design-craft-elevator — same B' progressive upgrade to a docs intent skill if no doc style guide exists, same 3-axis findings, same growth catalog. Exemplars include Stripe Docs, Vercel Academy, MDN, Linear docs, Tailwind docs. Follows ADRs 0018-0021. ~3-4 week build (catalog-heavy).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#376

### craft-pipeline sub-project #4: code-craft

- **Status:** done
- **Spec:** docs/changes/code-craft/proposal.md
- **Summary:** LLM-judgment skill for code quality / readability — the ceiling counterpart to harness-entropy-cleaner (dead code, drift), harness-architecture-enforcer (boundaries, deps), complexity thresholds (cyclomatic, cognitive). Ceiling questions: is this code as simple as it could be? does this function tell a story? is this abstraction earned or premature? are these conditionals load-bearing or accidental? is there an obvious-in-retrospect simplification? does the code reveal intent? Possibly the largest-scope craft skill — touches every PR. Follows ADRs 0018-0021. Has overlap with #1 naming-craft (defers naming-specific findings) and #2 docs-craft (defers doc-comment findings). Exemplars: well-cited "good code" from notable codebases (Linear's, Stripe's open work, Vercel's, Anthropic's SDK code).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#379

### craft-pipeline sub-project #7: api-craft

- **Status:** done
- **Spec:** —
- **Summary:** LLM-judgment skill for API quality — the ceiling counterpart to harness-api-openapi-design and harness-api-webhook-design (knowledge skills, rule-based about format / OpenAPI compliance). Ceiling questions: is this endpoint at the right abstraction? is this HTTP verb honest? does the resource name belong in the URL or should it be a query param? would a stranger predict this response shape from the request? does this error code tell the consumer what to do? is this idempotency-honest? does the API shape match the domain or leak implementation details? Follows ADRs 0018-0021. Exemplars: Stripe API, Linear GraphQL API, GitHub REST v3, Resend API, Anthropic SDK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#382

### craft-pipeline sub-project #8: cli-ergonomics

- **Status:** done
- **Spec:** docs/changes/cli-ergonomics-craft/proposal.md
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

- **Status:** done
- **Spec:** docs/changes/owned-files-declaration/proposal.md
- **Summary:** Add an owns:[paths] field to harness plan tasks declaring the source files each task owns, enabling cheap deterministic pre-execution conflict forecasting alongside the heavier graph-based independence check (check_task_independence). A near-free parallel-safety guardrail. Adapted from Spec Kitty's per-work-package owned-files frontmatter. Adoption #4 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#601

### ULID Identity for Sessions and Worktrees

- **Status:** done
- **Spec:** —
- **Summary:** Adopt collision-free immutable ULID identity for harness sessions and worktree-isolated tasks, with human-friendly numbering assigned only at completion — fixing the worktree/branch/dashboard disambiguation problem that slug-prefix schemes collide on. Adapted from Spec Kitty's ULID mission identity (mission_id immutable, mission_number at merge). Adoption #6 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#603

### Orchestrator Gateway Policy Envelope and Subprocess Air-Gap

- **Status:** done
- **Spec:** —
- **Summary:** Add a per-call PolicyMetadata envelope (approval mode, sandbox mode, network mode, dangerous-flags, agent family/version) and a zero-import subprocess boundary to the harness orchestrator gateway API (ADR 0011), validated on both ends for safe agent isolation and a full governance audit trail. Complements MCP server version pinning + trust model (#557). Adapted from Spec Kitty's orchestrator-api subprocess air-gap. Adoption #7 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-7]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#604

### Orchestrator Codex Backend Subprocess Env Air-Gap (follow-up)

- **Status:** planned
- **Spec:** —
- **Summary:** Apply the subprocess env allowlist air-gap to the Codex backend. The gateway policy-envelope work air-gapped the Claude backend's subprocess spawn (replaced `env: process.env` with an explicit allowlist), but the Codex backend (`packages/orchestrator/src/backends/codex.ts`) still passes the full parent environment to its spawned subprocess — the same leak, unpatched. Extend the shared subprocess-env allowlist + PolicyMetadata stamping to codex.ts so both backends enforce the boundary identically. Follow-up to the orchestrator gateway policy envelope + subprocess air-gap.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1158

### Standardize Parallel Execution

- **Status:** done
- **Spec:** docs/changes/standardize-parallel-execution/proposal.md
- **Summary:** Compose the harness's existing parallelism primitives (findParallelGroups wave-grouper, predict_conflicts, worktree isolation) into the standard execution path so sound parallel execution fires automatically instead of only when a human asks. Adds a shared parallelization-planner sub-protocol emitting a ParallelizationPlan (waves + severity + per-wave firing decision), a `dependsOn` task-schema field, and risk-tiered non-blocking dispatch (clean waves announce-and-go, medium/graph-unavailable confirm once, high-severity auto-serialize) wired into harness-autopilot EXECUTE. Execution-first; parallel planning/research and smart-merge (#600) are named follow-ons.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#746

### Make fan-out rate-limit aware, not just slot aware

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet concurrency is governed by compute slots (`min(16, CPUs - 2)` per workflow, with `fleet-command` holding each lane to a share of a global pool) but not by the API budgets the leaves actually consume. Measured during a 90-day org analysis: GitHub **code search is capped at 10 requests per minute**, and secondary rate limits fired repeatedly under modest parallelism — 10-way fan-out on the commits API produced silent under-fetching that returned wrong answers rather than errors (287 of 430 repositories read as zero). A slot-governed fleet whose leaves are API-bound will therefore degrade into throttling and, worse, into quietly incomplete results. Build: per-resource budgets alongside slot budgets, backoff shared across a fleet rather than per-leaf, and a hard rule that a truncated or throttled fetch fails the leaf instead of returning partial data. Pairs with `standardize-parallel-execution`; the failure mode is correctness, not just speed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1532

### Semantic conflict detection and region leases for high-concurrency change

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet isolation today is per-lane worktrees plus textual merge, which is sufficient while concurrent lanes rarely touch the same code. At high change rates collision becomes the normal case rather than the exception — a ten-operator team at the top regime considered here implies thousands of merges per day against a substrate that serialises them. Textual non-conflict is also not semantic safety: two lanes can merge cleanly and jointly break an invariant neither violated alone. Build on the primitives that already exist (`predict_conflicts`, `compute_blast_radius`): advisory **leases** over code regions so lanes are dispatched to avoid collision rather than resolving it afterwards, semantic conflict checks over the union of concurrent changes rather than pairwise diffs, and change composition into verified batches so merge throughput is not one-at-a-time. Correctness, not speed, is the reason: the failure mode is a clean merge that is jointly wrong.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1539

### Treat in-flight internal lanes and inbound contributions as one index

- **Status:** planned
- **Spec:** —
- **Summary:** `concurrent-change-coordination-at-scale` proposes region leases so internal lanes avoid collision. External contributors cannot participate in that protocol and should not have to — which produces two failures that only appear when both directions run at volume. First, **wasted contribution**: an internal lane rewrites a region an external pull request targets, and the contributor's work is invalidated by velocity they could not observe. On a project taking in hundreds of pull requests a day, that is a goodwill cost, not just a rework cost. Second, **duplicated effort**: an internal fleet generates a fix while a contributor submits the same fix, and neither queue knows about the other. Build: one index spanning in-flight internal lanes, the internal ranked queue and the inbound contribution queue; collision warnings surfaced to contributors *early* (ideally at issue-claim time, before they write anything); and duplicate detection that matches an inbound pull request against internal work-in-progress, not only against other inbound items.
- **Blockers:** Depends on `concurrent-change-coordination-at-scale` and `semantic-duplicate-detection-at-backlog-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1549

### Fit a scalability law to fleet concurrency instead of guessing a cap

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet width is set by a static heuristic — slots derived from CPU count, a global pool shared across lanes. But parallel systems do not scale linearly: throughput follows the Universal Scalability Law, where contention (queueing on shared resources: merge serialisation, rate-limited APIs, the shared review stage) and coherency (cost of keeping workers consistent: rebases, conflict resolution, lease negotiation) first flatten and then *reverse* the throughput curve. Somewhere there is a width at which adding a lane reduces total output, and today nobody knows where it is. Build: instrument per-lane throughput at varying widths, fit the two USL coefficients per repository from observed data, and set dispatch width from the fitted optimum rather than from CPU count — re-fitting as the repo, gates and team change. The coherency coefficient is the diagnostic gold: a rising β says the constraint is rebase/conflict cost, which no amount of added width fixes and which points investment at `concurrent-change-coordination-at-scale` instead.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1552

### Compile comprehension once; stop re-deriving it per leaf

- **Status:** planned
- **Spec:** —
- **Summary:** The dominant cost term in measured agent operation is context replay, not generation: one operator's local usage shows **cache-read tokens at 298x output tokens** across 698 sessions. What that volume buys, over and over, is the same thing — an agent re-reading source to re-derive an understanding some previous agent already held and discarded. The knowledge graph exists but is a *reference* agents may consult; source files remain the working substrate. Build the compiler analogy properly: a persistent, incrementally-maintained comprehension layer — per-module summaries, interface contracts, invariants, dependency slices — recompiled only for surfaces whose source changed (the git diff is the invalidation signal), versioned alongside the code, and served to fleet leaves as their *primary* context with raw source as the fallback for the region under edit. Correctness requirement stated up front: a stale summary is worse than no summary, so every served unit carries its source-hash provenance and the leaf can demand recompilation. This attacks the largest single line item in the token economics, and it compounds — every other item on this roadmap gets cheaper when comprehension stops being re-purchased per run.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1558

### Model-check the fleet lifecycle before running it unattended

- **Status:** planned
- **Spec:** —
- **Summary:** The orchestration layer is becoming a distributed protocol: lanes with worktree isolation, region leases (`concurrent-change-coordination-at-scale`), budget stops mid-run (`budget-governor-for-unattended-dispatch`), park-and-report at human gates (`unattended-safe-contract-per-fleet-member`), admission arbitration (`unified-work-admission-control`). Protocols of this shape fail in interleavings no test suite explores: a lane parked at a gate holding a lease while the budget governor halts the lane that would release it; two fleets deadlocked on each other's regions; work lost when a stop lands between VERIFY and REPORT. Testing samples interleavings; model checking enumerates them. Build: a formal model (TLA+ or equivalent) of the lifecycle state machine — lanes, leases, budgets, gates, queues — checked for deadlock-freedom, no-lost-work, and bounded-park invariants, kept in the repository and re-checked in CI when the protocol changes. The model is small; the property it buys is exactly the one unattended operation stakes everything on: the system either finishes or parks cleanly, in *every* interleaving, not just the ones a test happened to produce.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1562

### Interface futures — forward contracts on shared interfaces

- **Status:** planned
- **Spec:** —
- **Summary:** Concurrent-change machinery on the roadmap detects collisions after they form; nothing prevents the most expensive class — many in-flight changes building against an interface one of them is about to change. Borrow the forward contract: an agent (or human) intending to change a shared interface declares the future shape first — a signed, versioned declaration of the post-change contract with an intended landing window. Other agents building in the overlap window resolve the interface through the declaration and build against the announced future shape; the coordination layer sequences landings so the interface change lands first and dependents land behind it, already conformant. Declarations are binding-by-default with an explicit abort path (an aborted future notifies every dependent build). This is the constructive complement to collision detection: coordination by declared intent instead of by crash. Scope guard: v1 covers typed, statically-resolvable interfaces (exported signatures, schemas, API contracts), not behavioral semantics.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1615

### Stigmergic coordination — environment-mediated fleet coordination with evaporating markers

- **Status:** planned
- **Spec:** —
- **Summary:** Every fleet today coordinates through a central orchestrator, which is precisely the serial fraction the scalability-law work will measure and indict. Colonies solved coordination without a coordinator: individuals modify the environment (pheromone deposits) and read it back, evaporation provides automatic staleness, and thresholds turn local concentrations into collective behavior (quorum sensing). Build the analog: agents deposit typed, TTL-decaying markers on the code graph — 'verified 2h ago', 'under construction', 'failing here', 'convention drift observed', 'hot' — and other agents route by reading local marker gradients instead of asking the orchestrator. Quorum rules turn concentrations into collective transitions with no global census: N distinct failure markers in one region within a window triggers swarm-to-investigate; construction-marker density above threshold triggers avoidance or queueing; verification markers suppress redundant re-checking. The orchestrator remains for admission, budget, and human gates — stigmergy replaces the coordination chatter, not the governance. This is the only architectural path on the table where coordination capacity scales with the environment rather than with a coordinator, and evaporation gives it the property central state never has: stale information deletes itself.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1623

### Agent apoptosis and lineage hygiene — programmed death and the germline barrier

- **Status:** planned
- **Spec:** —
- **Summary:** Biology maintains multicellular integrity with two mechanisms this field lacks. First, apoptosis: a cell detecting internal damage self-destructs cleanly rather than persisting as a mutation risk — whereas every agent framework tries to *recover* a degraded agent, which is how plausible-but-wrong output ships. Give agents a self-termination contract: continuously self-check context-integrity signatures (contradiction density, instruction drift from the pinned intent, tool-result/claim divergence, poisoned-input markers), and on breach, die cleanly — checkpoint provenance, discard working state, respawn from the last verified checkpoint. Death is cheap; corrupted continuation is not. Second, the germline/soma barrier (Weismann): somatic mutations never reach offspring. Episodic working state — session context, scratch conclusions, unverified beliefs — must never inherit across agent generations; only compiled, verified knowledge crosses into a spawned agent's inheritance. Add a Hayflick limit: a hard replication-depth cap on agent-spawns-agent chains, after which lineage state must pass through a germline reset (re-derivation from verified knowledge only). Together these bound error accumulation in exactly the two channels it compounds through: within a long-lived agent, and across a lineage of them.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1605

### Outcrossing against Muller's ratchet — periodic independent re-derivation in long chains

- **Status:** planned
- **Spec:** —
- **Summary:** Population genetics: an asexual lineage accumulates deleterious mutations irreversibly (Muller's ratchet) because without recombination there is no mechanism to reassemble a less-loaded genome; sex persists largely because outcrossing purges load. An agent iterating on its own output for forty turns is an asexual lineage — every misconception it forms is inherited by every subsequent turn, and self-review cannot purge what the self believes. The n-version work already on the roadmap votes between independent versions at the end; this is different machinery for a different moment: purge error *during* the run. At fixed intervals in any long self-iterating chain, inject an outcross — an independent re-derivation of the current subproblem from the spec, in a fresh context that has never seen the working copy — and reconcile by recombination at module boundaries (take the outcross's version of components where it diverges and its version passes stricter checks), not winner-take-all. The interval is tunable by measured drift: chains whose self-consistency metrics degrade faster outcross more often. The cost is one extra derivation per interval; the benefit, if the biology transfers, is that error load stops being monotonic in chain length — which is currently the binding constraint on how long a chain can safely run unattended.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1619

### Stability-ordered context layout — cache-aware delta encoding for every request

- **Status:** planned
- **Spec:** —
- **Summary:** Prompt caching is delta encoding against a shared prefix, but nothing in the field designs for it — context is assembled in whatever order the assembler finds convenient, so one volatile line early in the prompt invalidates the cache for everything after it. Borrow the storage-engine discipline that made column stores win: layout determined by change pattern, not by logical grouping. Arrange every assembled context in strictly descending stability order — immutable knowledge and tool schemas first, slow-moving conventions next, session state after, per-turn state last — so the cacheable prefix is maximal by construction, and represent recurring artifacts as content-addressed baselines plus deltas rather than re-serialized wholes. The win compounds on every request forever, costs nothing at runtime, and is measurable to the token: cache-hit fraction per workflow class before and after. This is the rare optimization that is nearly free, provably correct (layout does not change content), and applies to every context the system ever assembles — the highest ROI-per-effort item in the compression family, and the substrate the rest of the family builds on.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1634

### Rate-distortion context compaction — compression with a measured distortion metric

- **Status:** planned
- **Spec:** —
- **Summary:** Context compaction today is lossy compression with no distortion metric: summarization drops information by vibes, and the loss is discovered downstream as rework, wrong turns, and re-derivation. Rate-distortion theory says the problem is only well-posed once distortion is defined — then there is a frontier, and operating away from it is pure waste. Define distortion empirically and task-conditioned: ablate information classes from context on replayed runs (prior tool results, resolved decisions, code excerpts, conversational history, constraints) and measure which classes' removal raises error/rework rates for which task classes. The result is a distortion model: this task class is insensitive to conversational history but highly sensitive to stated constraints; that one is the reverse. Then compact to the frontier — aggressive summarization along measured-insensitive dimensions, verbatim preservation along sensitive ones — instead of uniform summarization that simultaneously over-compresses the load-bearing content and under-compresses the filler. Every long-running agent system has this problem; none has the distortion measurement. The ablation harness is the deliverable that makes the difference between a summarization heuristic and a compression discipline.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1633

### Trained context dictionaries — a verified codebook for recurring knowledge

- **Status:** planned
- **Spec:** —
- **Summary:** Zstd's largest wins on small documents come from pre-trained dictionaries: learn the corpus's recurring substrings once, then encode every new document against the dictionary. The context analog: a large fraction of every prompt is recurring knowledge — conventions, schemas, standard instructions, architectural facts — re-sent verbatim thousands of times. Train a dictionary over the corpus of past assembled contexts: bind stable, high-frequency knowledge to short handles in a controlled vocabulary, send the handle, and expand on demand only when the consumer actually needs the full text. Linguistics arrives at the same design independently — every co-located team develops jargon precisely because it compresses communication — with the known failure mode that jargon drifts. So the codebook is governed: every term is bound to a verified definition with a version, expansion is deterministic, and a term whose definition changes bumps its version so no consumer silently holds a stale meaning. Measurement decides membership: a term enters the dictionary when its (frequency x length) crosses the amortization threshold and leaves when usage decays — the dictionary is trained and re-trained, not curated by hand.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1635

### Progressive context encoding — coarse-to-fine loading driven by attention

- **Status:** planned
- **Spec:** —
- **Summary:** Progressive JPEG sends the image coarse-to-fine so a consumer can stop when it has enough. Context is served the opposite way: full resolution up front, on the guess that the agent might need any of it — and most of those tokens are never read. Serve context progressively: the first layer is low-resolution (file outlines, signatures, decision summaries, digest-level telemetry), and the agent requests refinement only where its attention actually lands — unfold this function, expand that decision's full rationale, show the verbatim diff. The mechanics largely exist (outline/unfold tooling); what's missing is making progressive the default contract for every context class and — the more valuable half — instrumenting the refinement-request stream. That log is a direct measurement of which context earns its tokens: refinement frequency per context class is exactly the demand signal that rate-distortion compaction needs as a prior and the trained dictionary needs for membership scoring. One design guard: refinement round-trips add latency, so the policy must batch predictable refinements (prefetch what this task class historically refines) rather than paying a round-trip per unfold.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1632

### Commons governance — Ostrom principles for shared surfaces

- **Status:** planned
- **Spec:** —
- **Summary:** Shared code surfaces — core libraries, schemas, build infrastructure, the knowledge store — are a commons: many consumers, distributed maintenance, and degradation dynamics (tragedy of the commons) that central ownership does not scale to and pure openness does not survive. Elinor Ostrom's Nobel-winning fieldwork distilled eight design principles from commons that survived centuries without central authority, and they map cleanly: clearly defined boundaries (which surfaces are commons, who are their appropriators — derivable from the dependency graph); congruence between rules and local conditions (per-surface rules, not global policy); collective-choice arrangements (consumers of a surface participate in changing its rules); monitoring by accountable monitors (usage and degradation telemetry visible to the appropriators themselves); graduated sanctions (first violation warns, repetition escalates — never first-strike severity); cheap conflict-resolution mechanisms; recognized rights to organize; and nested enterprises for commons-of-commons. The build is a governance layer over surfaces the coordination items already identify: declare the commons, derive the appropriator sets, attach per-surface rulebooks with graduated enforcement, and route rule changes through the consumers. The measurable claim, testable via the realization/telemetry machinery: governed commons degrade slower than ungoverned ones at equal load.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1653

### Sterile cockpit — interruption governance during critical phases

- **Status:** planned
- **Spec:** —
- **Summary:** Aviation's sterile cockpit rule is blunt and effective: below 10,000 feet — the phases where errors are least recoverable — no non-essential communication reaches the flight crew, by regulation, because interruption during critical operations is a documented killer and 'just one quick question' is how it arrives. Agent pipelines have critical phases with the same signature — landing sequences, release cuts, incident response, migration cutovers, threshold-authorized irreversible actions — and no interruption discipline: mid-phase, an agent or operator context can receive new intents, digest pings, comment notifications, and re-prioritization signals, each a context-switch exactly where state is least recoverable. Declare the sterile phases: operations classed as critical carry an interruption policy — non-essential signals are deferred and queued (not dropped), essential interrupts are a declared short list (abort signals, safety alarms), and the policy binds both agent contexts (the orchestrator withholds new work and messages) and human channels (digests batch, notifications hold) for the phase's bounded duration. The discipline is cheap because phases are short and defined; the payoff is concentrated exactly where errors cost the most — and the deferred-signal queue means nothing is lost, only sequenced.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1672

### SMED changeover reduction — externalizing agent setup time

- **Status:** planned
- **Spec:** —
- **Summary:** Lean manufacturing's SMED (single-minute exchange of die) cut changeover times from hours to minutes with one analytical move: classify every setup step as internal (machine must be stopped) or external (can be done while the previous job still runs), then relentlessly convert internal to external and streamline what remains. Agent task changeover has the same anatomy and no such discipline: between tasks, an agent context is 'stopped' while it loads repo state, reads context, warms caches, re-derives orientation — all booked as task time but actually changeover, and much of it externalizable: the next task is usually known (the queue is visible), so its context assembly, artifact prefetch, baseline checkout, and even briefback drafting can run during the current task's execution — external setup by construction. Import the method: instrument changeover time per task transition (first-token-of-productive-work minus task start), classify the setup steps internal vs. external, build the prefetch pipeline that performs external setup concurrently with the running task (speculative where the queue is probabilistic, and reusing the speculative-execution machinery's isolation), and streamline the irreducibly-internal remainder. The measured target is the manufacturing one: changeover time driven toward single-digit percent of task time, which at fleet scale compounds into whole extra agents' worth of throughput from the same spend.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1671

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

- **Status:** done
- **Spec:** —
- **Summary:** Golden-fixture evaluation framework for skills: canonical inputs per major skill (brainstorming, planning, spec-craft), semantic scoring @k against golden baselines, token/duration tracking, CI gate on prompt/rule PRs. Adapted from AI-DLC's aidlc-evaluator — the one capability where AWS is categorically ahead. Adoption #1 from docs/research/aidlc-comparison-analysis.md [AIDLC-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#579

### NFR Elicitation in Planning

- **Status:** done
- **Spec:** docs/changes/nfr-elicitation-planning/proposal.md
- **Summary:** Explicit NFR-requirements step in harness-planning eliciting performance, security, scalability, and resilience targets whose outputs become verifiable plan tasks wired to existing perf baselines and security scan machinery — NFRs as proactive design inputs rather than reactive review findings. Adapted from AI-DLC's per-unit NFR requirements/design stages. Adoption #3 from docs/research/aidlc-comparison-analysis.md [AIDLC-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#581

### Question-File Interview Mode

- **Status:** done
- **Spec:** docs/changes/question-file-interview-mode/proposal.md
- **Summary:** File-based question/answer mode for strategy, pulse, and brainstorming interviews — durable, team-reviewable, async-friendly decision capture — plus a cross-answer contradiction-detection pass added to existing pushback rules. Adapted from AI-DLC's [Answer]: tag question-file ritual and mandatory ambiguity analysis. Adoption #4 from docs/research/aidlc-comparison-analysis.md [AIDLC-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#582

### Opt-In Constraint Packs

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #1126, merged). Row was stale — auto-done did not fire because External-ID #583 is the issue number while the merge PR was #1126. Shipped code: `packages/core/src/constraints/packs.ts`, `packages/cli/src/commands/uninstall-constraints.ts`, dogfood opt-in in #1157. Opt-in gating for blocking constraint rule packs: lightweight opt-in prompt loaded up front, full rules lazy-loaded only on user consent, then enforced as blocking constraints with per-stage compliance summaries (compliant / non-compliant / N/A). Mapped onto harness security/resiliency rule sets. Adapted from AI-DLC's \*.opt-in.md extension pattern. Adoption #5 from docs/research/aidlc-comparison-analysis.md [AIDLC-5]
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

- **Status:** done
- **Spec:** docs/changes/semantic-vocabulary-ci-gate/proposal.md
- **Summary:** DELIVERED (PR #1048, merged). Add a harness analog of Spec Kitty's test_no_legacy_terminology architectural test: a CI gate that fails when deprecated or renamed canonical terms reappear in skills/docs, protecting the glossary and naming-craft investment from vocabulary drift over time. Adapted from Spec Kitty's semantic-terminology architectural test. Adoption #8 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-8]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#605

### Mid-Phase Context-Budget Trip Wire

- **Status:** done
- **Spec:** docs/changes/mid-phase-context-budget-trip-wire/proposal.md
- **Summary:** Fresh-context discipline in autopilot holds only between phases (each state dispatches a new cold subagent via subagent_type) — nothing watches a single long-running harness-task-executor turn or fleet lane for context creep within its own turn. Add a documented context-utilization threshold (a reasonable starting point is HumanLayer's own measured ~40%) that triggers an explicit write-state-and-restart action instead of leaving degradation to whatever the model does near its own context ceiling. Adapted from Dex Horthy/HumanLayer's "smart zone"/"dumb zone" context-engineering practice. Adoption #1 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1403

### SKILL.md Instruction-Density Check

- **Status:** done
- **Spec:** —
- **Summary:** HumanLayer's own RPI→CRISPY postmortem found their planning prompts exceeded a ~150-200 instruction-follow budget frontier models reliably honor — the specific failure that forced a full workflow rebuild. harness-autopilot and harness-brainstorming SKILL.md bodies run 300-470+ lines each; the progressive-disclosure packing already observed in run_skill output (context-budget levels, partial section loading) is promising evidence this repo doesn't share RPI's failure mode, but it has never been confirmed with a measured instruction count the way HumanLayer did after getting burned. Add an instruction-density estimate per loaded packing level to skill-authoring guidance and/or harness validate. Adapted from HumanLayer's RPI→CRISPY postmortem. Adoption #2 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1404

### Trustworthy spec-to-task decomposition without a human picking

- **Status:** planned
- **Spec:** —
- **Summary:** Fleets consume a queue of independent, well-scoped items. Today a human produces that queue — `roadmap-pilot` selects, `harness-planner` breaks a spec into tasks, and a person confirms both. That is affordable while an operator dispatches a few fleet runs a day. It is the binding constraint at any operating point where the queue must be refilled faster than a person can groom it: measured on one dogfood consumer, issues were created faster than they were closed (587 against 464 over 90 days), but a newly onboarded repository starts with no ranked queue at all and the fleets idle. Build: decomposition that can run unattended with a confidence signal — spec or issue in, independently-verifiable tasks out, each with acceptance criteria and a declared blast radius — plus a quality gate that parks low-confidence decompositions for human attention rather than dispatching them. The measure of success is queue depth sustained without a human in the loop, not decomposition speed.
- **Blockers:** Depends on `unattended-safe-contract-per-fleet-member`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1536

### Make intent, not the diff, the unit of record

- **Status:** planned
- **Spec:** —
- **Summary:** Every tracking, review, provenance and metric surface in the harness is keyed to the change: a commit, a pull request, a lane. That holds while a human could in principle read the change. At the upper end of the throughput regimes this roadmap contemplates — hundreds of merged changes per person per weekday — no human names, reads, or recalls an individual diff, and pull-request counts stop discriminating between operators entirely because the whole population converges. The artifact of record has to move up a level: a durable, addressable **intent** carrying its acceptance criteria, its blast radius, its conformance evidence and its outcome, with the diffs that satisfied it as an implementation detail beneath. Build: intent as a first-class entity linked to specs, tasks, changes and production outcomes; provenance and cost attributed to intents rather than commits; and review, roadmap and telemetry surfaces re-keyed onto it. Without this, every measurement surface degrades to noise exactly when volume makes measurement matter most.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1538

### Keep the human able to intervene: drills against automation complacency

- **Status:** planned
- **Spec:** —
- **Summary:** Bainbridge's ironies of automation, forty years old and repeatedly fatal in aviation: the better the automation, the less practice the human gets, and the *worse* they perform in exactly the rare moments that need them. This roadmap concentrates that risk deliberately — policy-level control, unattended dispatch, closed-loop remediation all move humans from doing to supervising, and a supervisor who has not touched the manual path in six months cannot competently override a gate, resolve a novel conflict, or steer an incident. Aviation's answer is not less automation; it is mandatory proficiency: recurrent hand-flying, simulator drills, checklists rehearsed before they are needed. Build the harness equivalent: scheduled game-days that exercise the manual paths (gate override with justification, manual revert and repair, fleet-stop and state recovery) against `mutation-testing-the-gate-stack`'s injected scenarios in a quarantined environment; proficiency tracked per operator per path the way attestation authority is tracked; and — the enforcement with teeth — attestation authority on high-risk tiers *decays* without recent proficiency, so the signature on a gated change always comes from someone who could still do the job by hand.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1568

### Coding theory for delegated intent — sized redundancy in specs

- **Status:** planned
- **Spec:** —
- **Summary:** Human → spec → agent is a noisy channel, and Shannon's result is that reliable transmission below capacity is achievable with coding — structured redundancy sized to the channel's measured noise. Spec redundancy today (acceptance criteria, examples, counter-examples) is folklore-sized: house style decides how many examples a spec gets, not measurement. Instead: use rework attribution (misread-intent rework, already instrumented by the rework-rate work) to measure the delegation channel's error rate per ambiguity class, then size the error-correcting content like parity bits — this class of spec needs three counter-examples and a worked example to hit the target delegation error rate; that class needs none and the extra prose is pure cost. Two testable claims fall out: (1) there is a computable minimum spec redundancy for a target error rate per ambiguity class, and (2) most specs are simultaneously too long in prose (which carries little error-correction) and too short in counter-examples (which carry most of it). The deliverable is a spec-authoring advisor that prescribes redundancy by measured class, plus the measurement loop that keeps the prescription calibrated as models and domains shift.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1614

### Mission-command briefback — the delegation echo-check before work begins

- **Status:** planned
- **Spec:** —
- **Summary:** Mission command (Auftragstaktik) is two centuries of refined doctrine for exactly this problem: delegating to autonomous units under uncertainty via intent plus constraints, with freedom in execution. Its sharpest importable mechanism is the briefback: before any resources move, the subordinate restates the mission — intent, constraints, success criteria, their planned approach — in their own words, and the commander corrects divergence on the spot. The agent analog is nearly free and attacks the largest quality tax (misread intent) from the opposite side as spec-side redundancy sizing: before executing, the agent re-derives the intent from the spec in its own words — what it believes it must achieve, must not break, and how it will know it succeeded — and that briefback is diffed against the issuing intent (mechanically, and by the issuer for high-tier work). Divergence caught at briefback costs one round-trip; the same divergence caught at review costs the whole execution. The briefback artifact also persists as the interpretation-of-record, so a later dispute over what was meant has evidence on both sides.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1658

### Economic injury thresholds — intervene on entropy only past the computed break-even

- **Status:** planned
- **Spec:** —
- **Summary:** Integrated pest management replaced calendar spraying with a computed decision rule: the economic injury level is the pest density at which crop damage exceeds intervention cost, and you treat only when monitoring shows the action threshold approaching it — spraying below the threshold costs more than it saves, and prophylactic spraying breeds resistance. Entropy management here is calendar spraying: cleanup fleets and refactoring sweeps run on cadence or intuition, sometimes below the damage threshold (net-negative churn that consumes review attention and destabilizes surfaces for marginal gain) and sometimes far above it (debt serviced long after it started compounding into incident risk). Compute the thresholds: per entropy class (dead code, drift, coupling growth, idiom infestation), estimate the damage function — measured cost the entropy actually imposes (rework attributable, comprehension tax from telemetry, defect correlation) — against the intervention cost (fleet spend, review load, destabilization risk), and derive the action threshold at which intervention breaks even. Monitoring (the detectors already exist) then triggers intervention at the threshold, not the calendar. The IPM resistance warning transfers too: repeated identical interventions select for what they miss — rotate cleanup strategies deliberately.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1656

### Reference-class forecasting — outside-view priors for cost and duration

- **Status:** planned
- **Spec:** —
- **Summary:** Forecasting science's most replicated finding is that inside-view estimates — built from the work's imagined steps — are systematically optimistic, and the fix is the outside view: place the item in a reference class of completed similar items and take the class's actual outcome distribution as the prior, adjusting only for documented differences. This is mandated practice in public megaproject budgeting for a reason: it is the only estimation method that prices the unknown unknowns, because the reference class already paid for them. The pipeline has what human estimators never had — a complete, honest record of every past item's true cost and duration in telemetry — and still forecasts from the inside view (task-shape conventions, or the filed complexity-based risk forecast, which is inside-view too). Build the outside view: reference-class construction by similarity over intent features (task class, surface, size signals, historical difficulty from the IRT scale), the class's realized distribution (not point estimate — the spread is the information) as the forecast prior, inside-view adjustment bounded and logged, and calibration tracked per class with the forecast-vs-actual loop feeding class refinement. Where the two views disagree sharply, that disagreement is itself a review flag: the plan believes something the history contradicts.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1670

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

### Keep humans able to model the system at machine change rates

- **Status:** planned
- **Spec:** —
- **Summary:** Ashby's law, applied honestly: a controller must carry as much variety as the system it controls. Humans steering by policy (`policy-level-human-control`) can only steer what they can still mentally model, and at hundreds of changes a week no per-change surface — not even a good pre-merge brief — maintains that model; it degrades one PR at a time until the human is signing attestations about a system they no longer understand. That degradation is silent, and it is the failure mode automation research has documented for forty years. Build the counter-instrument: periodic system-level narratives generated from the intent and provenance layers — what changed *architecturally* this week, which invariants were touched, where entropy and churn concentrated, what the fleets decided autonomously and why, what diverged from the operator's stated expectations — at the abstraction level a human actually reasons at, with drill-down to evidence. Add the measurement that makes it honest: track comprehension debt explicitly (surfaces no human has attested understanding of within N weeks) the way coverage tracks untested code. The per-PR accountability brief answers "should this merge"; this answers "do I still understand the thing I am responsible for."
- **Blockers:** Depends on `intent-as-the-unit-of-record`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1564

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

- **Status:** done
- **Spec:** docs/changes/eslint-prefer-execfile-over-exec/proposal.md
- **Summary:** DELIVERED (PR #1042, merged). New ESLint rule to flag execSync/exec with string commands (shell invocation) and suggest execFileSync/execFile with array args (no shell). Reduces shell injection surface and avoids broken exit code handling with shell redirects. 15+ instances in codebase.
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

- **Status:** done
- **Spec:** docs/changes/design-drift-exclude/proposal.md
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

- **Status:** done
- **Spec:** docs/changes/maintenance-findings-contract/proposal.md
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** `harness maintenance run` derives each task's findings count by regex-recovering it from free-text check output (`N findings|issues|violations|errors`, plus a keyword fallback in `classifyCheckExecutionFailure`). This is fragile: `doc-drift` (`check-docs`) and `entropy` (`cleanup`) emit no clean count and rely on recovery; if any check changes its output wording the count can silently break (the same class of bug that originally made the report show a uniform '1 finding'). **Proposal:** give maintenance check subcommands a standard machine-readable findings contract (e.g. a `--json` mode emitting `{ findings: N, ... }`) and have the runner consume that instead of regex-recovering from prose. Cross-cutting across ~18 check commands — deserves its own spec. **Scope note:** deliberately deferred from #687 to avoid scope creep; the regex recovery is the documented stopgap.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#691

### Speed up the entropy/cleanup maintenance check (~165s sweep long-pole)

- **Status:** done
- **Spec:** —
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** the `entropy` maintenance task runs `cleanup` (all entropy types), which takes ~165s on this monorepo — the long pole of `harness maintenance run --all`. It fits within the 300s per-check budget but dominates sweep wall-clock. **Proposal:** profile/optimize `cleanup` / entropy detection (incremental scan, caching, or scoping). Pre-existing command perf, not introduced by #687. **Workaround today:** `harness maintenance run --skip entropy`, and it only runs weekly on the cron schedule.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#692

### Sharded roadmap: archive done rows into docs/roadmap.d/archive/

- **Status:** done
- **Spec:** docs/changes/roadmap-sharded-archive/proposal.md
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

### Federated gate-calibration baselines across installations

- **Status:** planned
- **Spec:** —
- **Summary:** A gate audited only against itself cannot detect its own decay: `audit-strength` scores a project's setup, but the verdict is self-referential — nothing tells an adopter that their review gate approving 99.2% of changes is two sigma looser than the fleet-wide distribution. Build privacy-preserving federation of gate-outcome statistics: each installation contributes anonymized distributions (pass rates, override rates, latency, finding density per gate type), and every installation can compare its own gates against the fleet baseline. "Your review gate approves 99.2%; the fleet median for this gate class is 91% — likely theatre" is a norm-referenced diagnosis no amount of local telemetry can produce. Aggregation must be privacy-preserving (no code, no identities, coarse buckets, minimum-cohort suppression). This is the calibration counterpart of `cross-project-knowledge-federation`, which federates knowledge; nothing today federates instrument calibration.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1609

## v1.0 Foundation

## v1.0 Distribution

## v2.0 Knowledge Graph & Personas

### MDL knowledge pruning — description length as the knowledge store's fitness function

- **Status:** planned
- **Spec:** —
- **Summary:** Minimum Description Length: the best model of a corpus is the one that most compresses it — a knowledge entry is only knowledge if the cost of storing and shipping it is less than the cost of the errors and re-derivations it prevents. Knowledge stores today have no fitness function, so they only grow: every session adds learnings, none are scored, and the store's marginal entry eventually costs more context than it saves. Apply MDL as the standing objective: for each entry, measure description cost (tokens shipped per inclusion x inclusion frequency) against compression value (measured reduction in re-derivation, wrong turns, and rework in runs where the entry was present vs. matched runs where it wasn't — the same matched-comparison machinery as the skill P&L). Entries that don't compress experience are pruned or merged; overlapping entries whose union compresses better than their sum are consolidated. This is the objective function the entire knowledge layer currently lacks, and it is the principled version of what curation does by hand: keep what pays rent, in its shortest sufficient form. 'Insufficient evidence' is a first-class verdict — pruning requires measured worthlessness, never measurement absence.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1630

## v2.0 Advanced Features

## v2.0 Pipeline Unification

## Hermes Adoption

## v3.0 Graph Intelligence

### Graph edge provenance enum (EXTRACTED / INFERRED / AMBIGUOUS)

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add a first-class provenance enum on graph edges alongside the existing `confidence` float (`packages/graph/src/types.ts`), set at ingest time in CodeIngestor/TopologicalLinker (AST-explicit → EXTRACTED, resolver-derived → INFERRED). Lets every adapter distinguish read-directly from inferred. Highest-leverage, smallest-surface item of the Graphify Option-A port (ADR 0104).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1511

### Graph community detection (Leiden / Louvain)

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add a real community-detection pass over GraphStore with labeled subsystems exposed on nodes. Today only `clusterBySource` grouping exists (`packages/graph/src/ingest/KnowledgeLinker.ts:163`). Ported from Graphify (ADR 0104 Option A).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1512

### ContextQL shortest-path query primitive

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add `shortestPath(a, b)` between two arbitrary nodes to ContextQL, surfaced via NLQ + a CLI verb. Complements the existing explain/impact/relationships intents. Ported from Graphify (ADR 0104 Option A).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1513

### "Code changed — re-verify" staleness flag on learnings

- **Status:** done
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** Add a staleness flag to learning/execution_outcome nodes that trips when the cited source moved, surfaced in NLQ. Ported from Graphify's reflection loop — the sharpest idea from their work-memory system (ADR 0104 Option A).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1514

### [Spike] Graphify polyglot sidecar (GraphifyIngestor)

- **Status:** backlog
- **Spec:** docs/knowledge/decisions/0104-graphify-adoption-not-replacement.md
- **Summary:** SPIKE — optional GraphifyIngestor that reads Graphify's `graph.json` to enrich our code-graph with 37-language tree-sitter AST fidelity. Gated on a DEMONSTRATED polyglot fidelity gap; NOT a committed dependency (Python runtime + undocumented schema). ADR 0104 Option B, explicitly out-of-scope as a commitment.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1515

### Percolation margin — the global structural safety threshold of the dependency graph

- **Status:** planned
- **Spec:** —
- **Summary:** Percolation theory has a sharp result: on a graph, below a critical connectivity a failure stays in a small component; above it, a giant connected component exists and one failure can reach most of the system — and the transition is abrupt, not gradual. Blast-radius analysis (existing) is per-change; percolation is the *global* complement: how close is the dependency graph, as a whole, to the threshold where any single defect percolates? Compute bond percolation on the import/dependency graph (edges weighted by coupling strength and failure-transmission likelihood), report the distance-to-threshold as a standing safety margin, and — the actionable half — rank the specific edges whose removal most increases the margin (high-betweenness bridges between clusters). Refactoring stops being taste: 'these three edges keep us subcritical' is a targeting statement with a number attached, and the margin trend over time is an early-warning indicator that coupling growth is approaching the cliff — which matters at generation scale because agents add edges faster than humans ever did, and a sharp-threshold property is exactly the kind of thing that goes unnoticed until it is crossed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1608

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
| Per-subagent token attribution in burn | Chad Warner | unassigned | 2026-08-10 |
