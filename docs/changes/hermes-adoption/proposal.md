# Hermes Adoption: 6-Phase Decomposition

**Keywords:** hermes-adoption, brainstorming, decomposition, orchestrator-gateway, session-search, skill-proposal, multi-sink-notifications, custom-maintenance-jobs, telemetry-export, supply-chain-guard

## Overview

Hermes Agent (Nous Research, MIT-licensed) is a self-improving AI assistant runtime with partial overlap and substantial divergence from harness-engineering. Hermes targets the _autonomous personal-assistant_ category (messaging-platform bidirectional chat, voice, multi-backend serverless execution, RL training infrastructure, lifestyle skills). Harness targets the _coding-agent harness_ category (mechanical enforcement of architectural constraints, knowledge graph, orchestrated maintenance tasks, multi-host plugin distribution).

This spec captures the outcome of a comprehensive feature-by-feature evaluation of Hermes (89 distinct features across two passes) and decomposes the resulting adoption work into six sequenced phases. The evaluation produced four killer adoption candidates (genuinely new capability), ten adjacent items (small, high-fit additions), 22 reject groups (mission mismatch), and ~20 watch items (interesting but deferred). Roughly 26 features that initially looked like adoption candidates were found to already exist in harness with different implementations and were removed from scope.

### Problem

Hermes ships several patterns harness genuinely lacks and would benefit from — most notably: agent-proposed skill refinement, full-text session memory with auto-summarization, user-extensible maintenance jobs with output chaining, and a unified notification dispatch surface. Without a structured evaluation, three risks emerged:

1. **Cherry-picking without rationale** — adopting features piecemeal without coherence
2. **Feature creep** — accidentally drifting harness toward the personal-assistant category by adopting too much
3. **Missed prerequisites** — building user-facing features (multi-sink notifications, skill review queues) before the foundation they need (Gateway API, telemetry exporter)

This spec resolves all three by capturing the full adopt/reject matrix with reasoning, sequencing adoptions behind their dependencies, and bounding the scope explicitly.

### Goals

1. **Durable rationale** — every adoption and rejection decision is documented with its reasoning, so future evaluations of comparable frameworks have precedent
2. **Phased execution** — adoptions decompose into 6 phases, each shippable on its own, with explicit dependencies between phases
3. **Roadmap integration** — each phase registers as a single roadmap item pointing to this spec; when a phase is picked up, a dedicated phase spec replaces this as its `spec` pointer
4. **Bounded scope** — what's in, what's out, what's watched, and the criteria for promoting watch-items to adoption later

### Non-goals

- **Implementation design for specific phases.** Each phase will receive its own spec via `harness:brainstorming` when picked up. This spec stops at the _what and why_ of each phase, not the _how_.
- **External service selection.** Choosing between Langfuse / LangSmith / OpenLLMetry for telemetry export, or Slack-specific message formats, etc. — deferred to the phase specs where those decisions matter.
- **Hermes architecture replication.** Adoption means borrowing patterns that fit harness's mission, not porting Python code into TypeScript. Several Hermes features (e.g., `mechanical-ai` analog, doctor command, supply-chain audit) turned out to already exist in harness with different implementations.
- **Watch-list activation.** ~20 items deferred to a watch list have explicit re-evaluation criteria; activating any of them is a separate decision outside this spec.

### Scope

**In-scope:**

- The full Hermes feature evaluation (adopt + reject + watch + already-done)
- Phase decomposition with dependency ordering
- Per-phase headline summary (overview, layer, prerequisites — not implementation detail)
- Roadmap entry strategy for the 6 phases

**Out-of-scope:**

- Implementation specs for any single phase
- The `harness:design-pipeline` idea (Hermes-orthogonal, tracked in project memory)
- Strategic positioning decisions about harness's market category (treated as fixed: harness remains a coding-agent harness, not a general assistant)
- Any concrete LLM-provider choices, sink-protocol choices, or auth-token format choices

---

## Decisions Made

### Adoption Decisions

#### Killer Adoptions (4)

| ID  | Decision                                                               | What harness gains                                                                                                                                                                                                                                 | Why this and not Hermes-as-is                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1  | **Skill proposal/refinement loop with provenance** (B1+B2+O5)          | Agent-emitted skill proposals routed through a review queue gated by `harness:soundness-review`; provenance + usage telemetry on every skill                                                                                                       | Hermes auto-promotes self-modified skills; harness adds a mechanical-review gate consistent with its enforcement ethos                                             |
| K2  | **FTS5 session search + auto-summarization** (C1+C2)                   | Full-text searchable `.harness/sessions/`; auto-LLM summaries written into existing `session-summary.ts` schema on session close                                                                                                                   | Hermes treats summarization as conversation-recall; harness wires into existing learnings lifecycle for codebase-scoped retrieval                                  |
| K3  | **User-defined custom maintenance jobs** (I1-ext + I3+I4 + N1+N5 + P3) | Extend `MaintenanceScheduler` beyond the 21 built-in tasks: arbitrary user-defined jobs with output persistence, `context_from` chaining, skill-content injection at runtime, origin tracking, arbitrary pre-check scripts (not just CLI commands) | Hermes's scheduler is user-extensible from day one; harness's is built-ins-only. Extension preserves the existing 4-task-type taxonomy                             |
| K4  | **Multi-sink notifications with envelope wrapping** (F8 + N2)          | Generalize `CINotifier` from GitHub-only → multi-sink (Slack-first), with `wrap_response` envelope option for delivery formatting                                                                                                                  | Hermes ships 19 delivery channels for personal-assistant use; harness adopts the abstraction with one defensible sink (Slack), leaves the rest to gateway adapters |

#### Adjacent Adoptions (10)

| ID  | Decision                                               | Layer                           | Rationale                                                                                                                                                |
| --- | ------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `/insights` aggregator (L1)                            | CLI + Dashboard                 | Compose existing entropy/decay/attention/impact/health views into one summary                                                                            |
| A2  | SSH agent dispatch backend (E3)                        | Orchestrator                    | Realistic remote-execution case for harness users (single GPU box, beefy dev server) — bounded, well-trodden                                             |
| A3  | Serverless dispatch + isolation-tier routing (E5 + E8) | Orchestrator                    | Add `isolation` as a fourth axis on `BackendRouter`; generic serverless interface, Modal-style not Modal-coupled                                         |
| A4  | Telemetry exporter + trajectory record (O2 + O13)      | Core (telemetry)                | OpenTelemetry/Langfuse export of existing `skill_invocation` events + trajectory metadata; bundles into Phase 0                                          |
| A5  | Per-task cost ceiling (O9)                             | Orchestrator                    | Hard cap on dispatched maintenance job spend; aborts on exceed — closes a real autopilot cost-runaway risk                                               |
| A6  | Prompt-cache hit-rate analytics (O10)                  | Telemetry + Dashboard           | Cost optimization for autopilot; dashboard widget surfacing cache effectiveness                                                                          |
| A7  | Harden `harness doctor` (P1)                           | CLI                             | Extend existing doctor with live pings (API keys, model availability), hook validity, baseline freshness, session corruption check                       |
| A8  | Pre-launch OSV malware guard (P2)                      | MCP server lifecycle            | Real-time malware check before launching MCP/npx packages; complements existing periodic `harness:supply-chain-audit`                                    |
| A9  | Expand `cleanup-sessions` to general disk hygiene (P4) | CLI                             | Extend existing command beyond sessions to `.harness/cache/`, old archive entries, stale dashboard state                                                 |
| A10 | **Orchestrator Gateway API** (Q1)                      | Orchestrator + Dashboard server | Versioned external REST + token auth + scopes + outbound webhook fanout. Foundation for K4, K1 review queue, A4 telemetry export, external trigger of K3 |

### Rejection Decisions

| ID  | Group                                                                                                                                     | Reason category                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R1  | RL training pipeline (Atropos, batch trajectory gen, SWE-bench/terminalbench/yc_bench envs, tool-call parsers, `rl_training_tool`)        | Research-infrastructure, not user-facing                                                                |
| R2  | Honcho dialectic user-modeling                                                                                                            | Assistant-shaped (user-scoped), not coding-agent-shaped (project-scoped)                                |
| R3  | Personality system (`/personality` vibe switching)                                                                                        | Conflicts with harness's role-based persona model                                                       |
| R4  | Third-party memory services (mem0, supermemory, retaindb, openviking, byterover, hindsight, holographic)                                  | Different ecosystem; harness graph is the owned primitive                                               |
| R5  | Mid-task turn reversal (`/retry`, `/undo`)                                                                                                | Conflicts with mechanical-enforcement model; git + host CLI cover the realistic case                    |
| R6  | Consumer messaging gateways (bidirectional chat — Telegram, WhatsApp, Signal, Discord-chat, Email-chat, Matrix, Mattermost, WeChat, etc.) | Mission mismatch; one-way notification surface kept via K4                                              |
| R7  | Voice features (voice_mode, TTS, transcription, neutts_synth)                                                                             | Not a coding-agent surface; OS dictation already free in dashboard inputs                               |
| R8  | Image/video generation tools and plugins                                                                                                  | Output-shape mismatch with coding-agent outputs                                                         |
| R9  | Browser automation tools (Playwright clones, Camoufox fingerprint masking)                                                                | Playwright MCP + WebFetch + context7 already cover the legitimate cases; Camoufox is mission-mismatched |
| R10 | Computer use / desktop automation                                                                                                         | Mission mismatch; security blast radius; cost-bad for coding work                                       |
| R11 | Consumer skill categories (apple, gaming, gifs, social-media, smart-home, spotify, google_meet, creative, media)                          | Audience mismatch                                                                                       |
| R12 | PIM skills (note-taking, productivity, email-as-PIM, todo_tool, kanban)                                                                   | Project-scoped roadmap + knowledge graph + learnings cover the equivalents                              |
| R13 | Hermes gamification (achievements)                                                                                                        | Wrong success metric for engineering tooling                                                            |
| R14 | Singularity HPC backend                                                                                                                   | Audience essentially nonexistent for harness                                                            |
| R15 | GPU cluster scaffolding                                                                                                                   | Belongs at the model-serving layer (vLLM), not in harness                                               |
| R16 | Full TUI                                                                                                                                  | Harness is a guest in host CLIs, not a competitor                                                       |
| R17 | RPC tool calling from external scripts                                                                                                    | MCP + CLI + Q1 gateway API are the right external interfaces                                            |
| R18 | Red-teaming/godmode offensive skills                                                                                                      | Defensive coverage is harness's posture; offensive conflicts with safety + distribution model           |
| R19 | Gateway UX details (sticker_cache, runtime_footer, mirror, whatsapp_identity, display_config)                                             | Downstream of R6                                                                                        |
| R20 | Enterprise China-focused integrations (Feishu, Yuanbao, DingTalk, WeCom, QQBot, Bluebubbles)                                              | MCP delegation handles the few legitimate intersections                                                 |
| R21 | Microsoft Graph (Outlook/SharePoint/Teams/Calendar/etc.)                                                                                  | PIM-shaped + general-collab-shaped; MCP delegation covers it                                            |
| R22 | Hermes-specific scripts (TUI profiler, browser eval, RL sampling, Discord voice doctor, contributor audit, etc.)                          | Downstream of other rejections; harness equivalents better-integrated where any overlap exists          |

### Watch List (Deferred — Explicit Re-evaluation Criteria)

| ID  | Item                                                              | Re-evaluation trigger                                                        |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| W1  | B4 (Skills Hub centralized catalog)                               | When ≥3 external harness skill publishers exist                              |
| W2  | C7 (Conversation history navigation)                              | After K2 lands and search demand surfaces                                    |
| W3  | D2 (Multi-step pipeline fusion in orchestrator)                   | When parallel-group task counts exceed ~10 per dispatch                      |
| W4  | E6/E7 (Daytona/Vercel sandboxes)                                  | After A3 generic serverless interface ships and pick concrete second adapter |
| W5  | F2/F5 (Discord/email notification sinks)                          | After K4 lands and Slack works — community contribution likely               |
| W6  | H2 (OpenRouter fan-out)                                           | When non-Anthropic provider demand crosses ~5% of telemetry                  |
| W7  | H4 (Mid-session model switch)                                     | Currently solved by restarting CLI; revisit if autopilot needs it            |
| W8  | I5 (Natural-language schedule parsing)                            | If cron expressions become a barrier — currently no signal                   |
| W9  | J1 (Built-in tools audit / cherry-pick)                           | Ongoing; no formal trigger                                                   |
| W10 | Hermes hibernation pattern (idle agent → wake on demand)          | If harness gains a hosted-runtime offering                                   |
| W11 | M1 (Dashboard PTY chat pane)                                      | If dashboard-as-primary-interface user demand emerges                        |
| W12 | O1 (Memory backend abstraction)                                   | If multiple memory-store backends become an external request                 |
| W13 | O3 + O14 (Bedrock + other regional backends)                      | Demand-driven per-backend addition                                           |
| W14 | O6 (Mixture of Agents — same prompt, vote across models)          | Research-stage; revisit if quality gains materialize in benchmarks           |
| W15 | O8 (URL/website safety primitives)                                | If browser-tool skills become ambient in harness                             |
| W16 | O11 (Checkpoint manager for autopilot rollback)                   | When autopilot failure-recovery becomes a bottleneck                         |
| W17 | O12 (Tool result cache)                                           | When cost telemetry shows redundant tool calls as a major spend category     |
| W18 | O16 (Mid-execution interrupt)                                     | If long-running orchestrator dispatches become common                        |
| W19 | O18/O19/O20 (Tool result classification, skills guard, skill hub) | Bundle re-evaluation with K1 outcomes                                        |
| W20 | O22 (Diagramming skills)                                          | If dashboard graph + Mermaid integration prove insufficient                  |

### Already-done — Hermes feature → existing harness equivalent

For traceability. Features that initially looked like adoption candidates but already exist in harness:

- `harness doctor` (covers Hermes doctor, hardened separately under A7)
- `MaintenanceScheduler` with 4 task types + 21 built-in tasks (covers Hermes cron engine; extended under K3)
- `mechanical-ai` task type (covers Hermes `wakeAgent` pre-check pattern — script flexibility added under K3/P3)
- `harness migrate` (covers Hermes claw migrate — different product, equivalent shape)
- `harness validate` + `harness adoption` (covers Hermes `/status` + `/platforms`)
- `harness skill list/info/search/create/publish/validate/run` (covers Hermes `/skills` and skill operations)
- `harness:supply-chain-audit` (covers Hermes broader supply-chain — P2 adds real-time guard as distinct feature)
- `harness:security-scan` + `harness:security-review` (covers Hermes defensive security; offensive rejected under R18)
- `harness cleanup-sessions` (covers Hermes disk-cleanup base — P4 expands)
- `harness:compact` MCP tool (covers Hermes `/compress`)
- `harness usage` (covers Hermes `/usage`)
- `emit_interaction` MCP tool (covers Hermes clarify_tool / slash_confirm — richer)
- Workspace AGENTS.md / CLAUDE.md / GEMINI.md parsing (covers Hermes workspace instructions)
- SSE + dashboard live updates (covers Hermes streaming)
- `local-model-resolver` (covers Hermes custom-endpoint provider model)
- Cross-platform CI testing (covers Hermes Windows-footgun audits)

### Dependencies between adopted items

```
A10 (Gateway API) ──┬─→ K4 (Multi-sink notifications)
                    ├─→ K1 (Skill proposal review queue — UI uses Q1 API patterns)
                    ├─→ A4 (Telemetry export — webhook fanout via Q1)
                    └─→ K3 (Custom jobs — gains external trigger via Q1, but doesn't require it)

K2 (Session search) ──→ A1 (Insights aggregator — composes session search outputs)

A2, A3, A5 (SSH, serverless+isolation, cost ceiling) — independent of each other; cluster as Phase 5

A6 (Prompt-cache analytics) — depends on A4 telemetry exporter; bundle with Phase 0

A7 (Harden doctor) — independent
A8 (OSV pre-launch guard) — independent
A9 (Cleanup expansion) — independent
```

---

## Technical Design: Phase Decomposition

This is a meta-spec, so "technical design" is the **phase architecture** — what each phase delivers, what it depends on, and the rough approach. Implementation-level design lives in per-phase specs.

### File layout

- **This spec:** `docs/changes/hermes-adoption/proposal.md`
- **Phase specs (created just-in-time when each phase is picked up):**
  - `docs/changes/hermes-phase-0-gateway-api/proposal.md`
  - `docs/changes/hermes-phase-1-session-search/proposal.md`
  - `docs/changes/hermes-phase-2-custom-jobs/proposal.md`
  - `docs/changes/hermes-phase-3-notifications/proposal.md`
  - `docs/changes/hermes-phase-4-skill-proposals/proposal.md`
  - `docs/changes/hermes-phase-5-dispatch-hardening/proposal.md`

### Phase 0 — Foundation: Gateway API + Telemetry

**Bundles:** A10 (Q1 Gateway API), A4 (telemetry exporter + trajectory), A6 (prompt-cache analytics)

**Prerequisites:** None.

**Delivers:**

- Versioned external REST API on the orchestrator (`/api/v1/...`)
- Token-based auth with scopes per token (trigger-job, read-status, resolve-interaction, modify-roadmap, etc.)
- Outbound webhook fanout: orchestrator emits structured events → subscribed URLs receive them
- OpenTelemetry/Langfuse exporter consuming existing `skill_invocation` telemetry events + trajectory metadata, shipping to OTel collector or Langfuse endpoint
- Prompt-cache hit-rate analytics: instrument telemetry events with cache metadata; dashboard widget surfaces hit rate over time

**Approach:**

- Build on existing `packages/dashboard/src/server/orchestrator-proxy.ts` + `sse.ts`
- Add `auth.ts` middleware with token + scope verification
- Introduce `WebhookFanout` service that subscribes to orchestrator lifecycle events and POSTs to registered URLs (with retry, dead-letter)
- Telemetry exporter is a webhook consumer that re-formats events to OTLP/Langfuse shape
- API contract published as OpenAPI; vendored into the repo as a generated artifact

**Estimated effort:** 3–4 weeks

**Key risks:**

- Auth model must handle multi-tenant scenarios cleanly (some orgs run a single shared harness instance for multiple teams)
- Webhook delivery needs retry/dead-letter discipline; storms during incident-driven failure cascades

**Why first:** Unlocks K4 (Phase 3), K1's review-queue UI (Phase 4), external trigger of K3 (Phase 2), and observability for every phase after. No dependents until the gateway exists.

### Phase 1 — Session Memory: FTS5 + Auto-Summarization

**Bundles:** K2 (C1+C2), A1 (insights aggregator)

**Prerequisites:** None. Can run in parallel with Phase 0.

**Delivers:**

- SQLite FTS5 index over `.harness/sessions/*/` content, updated on session close
- Auto-LLM summarization on session close, writing into existing `session-summary.ts` schema (the `keyContext` field becomes LLM-populated rather than hand-written)
- CLI search command (`harness search <query>`), MCP tool, and dashboard search bar
- `harness insights` aggregator command + dashboard widget — composes entropy, decay, attention, impact, health into one summary view (replaces the need to visit 5 dashboard pages for a status check)

**Approach:**

- New `packages/core/src/state/session-search.ts` module with FTS5 indexing
- Hook into the session-archive lifecycle in `session-archive.ts` to trigger indexing
- Summarization uses harness's existing backend factory (no new LLM dependency)
- Insights aggregator is a thin composition over existing dashboard data sources

**Estimated effort:** 3–4 weeks

**Key risks:**

- SQLite FTS5 native binding cross-platform (covered by harness's existing cross-platform CI)
- Summarization cost (mitigated by triggering only on session close, not mid-session)
- Index staleness across multiple parallel sessions

**Why parallel with Phase 0:** Independent. No API dependency. Fastest visible user-facing win.

### Phase 2 — Custom Maintenance Jobs

**Bundles:** K3 (I1-extension + I3+I4 + N1+N5 + P3), A8 (pre-launch OSV malware guard), A9 (cleanup-sessions expansion)

**Prerequisites:** Phase 0 strongly preferred (for external job triggering via Q1; not strictly required — CLI trigger works without it).

**Delivers:**

- `MaintenanceScheduler` accepts user-defined tasks beyond the 21 built-in (`tasks` field in `harness.config.json` `maintenance` section)
- Per-job output persistence at `.harness/maintenance/<task-id>/outputs/`
- `context_from: [taskId1, taskId2]` field on tasks — downstream jobs receive upstream outputs as prompt context
- `inlineSkills: [skillName]` field — scheduler loads and inlines skill content into the agent prompt at runtime (different from `fixSkill` which dispatches the skill)
- `origin` field on every RunResult — tracks which channel/user/source triggered the run
- `checkScript` replaces `checkCommand: string[]` — accepts arbitrary executable paths; stdout JSON signaling (`{"wakeAgent": false}` etc.) is parsed beyond exit codes
- Pre-launch OSV malware guard on MCP/npx package startup (catches `MAL-*` advisories before launching the server)
- Expanded `harness cleanup-sessions` to cover `.harness/cache/`, old archive entries, stale dashboard state

**Approach:**

- Extend `BUILT_IN_TASKS` resolution to merge user-defined tasks from config
- Add output-directory management to the scheduler's task lifecycle
- Prompt builder gains `resolveContextFrom()` and `inlineSkillContent()` helpers
- Replace `checkCommand` execution path with a `runCheckScript()` that parses JSON output if present, falls back to exit-code
- Add `osv-client.ts` module + lifecycle hook in MCP-server-launch
- Broaden cleanup TTL semantics with per-directory rules

**Estimated effort:** 4–5 weeks

**Key risks:**

- Custom-task security model — who defines them, what they can do (file access? network?). Need a tier/scope system analogous to MCP tier-tokens
- Skill content injection has token-budget implications; need a configurable cap
- Pre-launch OSV check adds latency to every MCP-server start; mitigation: cache results, async-on-warm-start

**Why third:** Builds naturally on Phase 0 (external trigger), large enough to warrant its own phase, but not a prerequisite for anything that follows except K3 → K1 indirect (custom skill-proposing jobs).

### Phase 3 — Multi-Sink Notifications

**Bundles:** K4 (F8 + N2), A7 (harden doctor)

**Prerequisites:** Phase 0 (webhook fanout infrastructure).

**Delivers:**

- Generalize `CINotifier` → `NotificationSink` interface (`deliver(event, target, options)`)
- First concrete sink: Slack (via incoming-webhook config — no OAuth flow for v1)
- `wrap_response` envelope option: orchestrator events wrap into a platform-shape suitable for chat-style rendering before delivery
- Harden `harness doctor` with live pings (API-key validity, model availability), hook script syntax validity, config schema validation, session corruption check, baseline freshness

**Approach:**

- New `packages/orchestrator/src/notifications/` directory: `sink.ts` interface, `slack-sink.ts` first adapter, `envelope.ts` for `wrap_response` formatting
- `CINotifier` becomes one specific sink (GitHub PR/Issue), refactored to implement `NotificationSink`
- Sinks subscribe to Phase 0's webhook fanout, applying envelope formatting before delivery
- Doctor extensions are independent additions to existing `checks` array

**Estimated effort:** 2–3 weeks

**Key risks:**

- Slack API rate limits during notification storms — need backoff + batching
- Envelope schema must be platform-agnostic but actionable (one envelope shape, multiple renderers)

**Why fourth:** Requires Phase 0. Doctor-hardening bundles for similar-effort profile but is genuinely independent.

### Phase 4 — Skill Proposal/Refinement Loop

**Bundles:** K1 (B1+B2+O5)

**Prerequisites:** Phase 0 (API patterns for review queue UI). Benefits from Phase 1 (search to find similar skills) and Phase 3 (notification on new proposals) — both strongly recommended.

**Delivers:**

- Agent-emit-proposal MCP tool callable from any skill at completion
- Proposal storage at `.harness/proposals/` with frontmatter (provenance, source task, justification, diff-against-existing if refinement)
- Review queue dashboard page with approve/reject/edit actions
- `harness:soundness-review` gate must pass before a proposal promotes to `.claude/skills/` (or equivalent)
- Skill provenance field: `community | agent-proposed | user-authored`
- Per-skill usage telemetry (already partially in adoption telemetry; surface explicitly)
- Refinement deltas: agents propose updates to existing skills, same review flow

**Approach:**

- Proposal schema reuses skill frontmatter format + diff metadata
- `emit_skill_proposal` MCP tool writes to `.harness/proposals/`
- Dashboard page reads proposals + soundness-review status
- Soundness gate runs automatically on proposal creation
- Provenance backfill for existing skills via heuristic + manual override

**Estimated effort:** 4–5 weeks

**Key risks:**

- Schema must round-trip with skill format without breaking parsers
- Reviewer UX must be lightweight enough to keep pace with proposal volume (target <30s per proposal)
- Provenance backfill requires careful classification (most existing harness skills are user-authored by maintainers)
- Mechanical bias: if agents propose too many low-quality skills, the queue becomes signal-poor

**Why fifth:** Most design-heavy. Benefits from foundation + search + notifications all being stable.

### Phase 5 — Dispatch Hardening

**Bundles:** A2 (SSH backend), A3 (E5+E8 serverless + isolation tier), A5 (cost ceiling)

**Prerequisites:** Phase 0 (cost ceiling needs telemetry hooks).

**Delivers:**

- New SSH agent dispatch backend (key-based auth, remote node spawn)
- Generic serverless backend interface (Modal-style, but not Modal-coupled — first concrete adapter TBD in phase spec)
- `isolation` as a fourth axis on `BackendRouter` (alongside tier / intelligence / maintenance / chat) — task config declares `isolation: 'none' | 'container' | 'remote-sandbox'`
- `costCeiling` field on `TaskDefinition` and `RunResult` — orchestrator aborts dispatch on cumulative spend exceedance

**Approach:**

- Add `packages/orchestrator/src/agent/backends/ssh.ts` with `node-ssh` or equivalent
- Add `ServerlessBackend` abstract + first concrete (likely OCI-image runner)
- Extend `BackendRouter.resolve()` to read `isolation` from `RoutingUseCase`
- Cost-ceiling integration with Phase 0 telemetry — read live cumulative spend, abort if exceeded
- All four task types (`mechanical-ai`, `pure-ai`, `report-only`, `housekeeping`) support `costCeiling`

**Estimated effort:** 3–4 weeks

**Key risks:**

- SSH key management for orchestrator dispatch (storage, rotation, scope)
- Serverless cold-start latency vs. agent responsiveness expectations
- Cost-ceiling depends on accurate per-task token-spend tracking, which depends on Phase 0 telemetry being reliable

**Why last:** Independent of K1–K4; lower urgency for the current harness user base; cleanly bundles independent items at the end. Could also be done earlier if cost-runaway becomes a pressing concern.

### Sequencing Options

| Pace                   | Description                                            | Time estimate                         |
| ---------------------- | ------------------------------------------------------ | ------------------------------------- |
| Sequential             | One phase at a time, Phase 0 → 1 → 2 → 3 → 4 → 5       | 7–9 months                            |
| Moderate (recommended) | Phases 0+1 parallel, then 2+3 parallel, then 4, then 5 | 5–6 months                            |
| Aggressive             | Phase 0 first, then 1+2+3 parallel, then 4+5 parallel  | 4–5 months (requires 3+ contributors) |

### Cross-phase Invariants

Decisions that hold across phases and shouldn't be relitigated in any phase spec:

1. **Backwards compatibility.** No phase breaks an existing harness API surface, CLI command, or config field. Additions only; deprecations require explicit deprecation periods.
2. **Mechanical-enforcement bias.** Where phases introduce flexibility (custom jobs, skill proposals, notification sinks), each flexibility point must have a mechanical gate (schema validation, soundness-review, scope check). No "trust the operator" decisions.
3. **Host-CLI deference.** No phase introduces UI surfaces that compete with the host CLI (Claude Code, Cursor, etc.). Dashboard is for monitoring/review; orchestrator is for execution; CLI is for utility commands.
4. **Telemetry by default, opt-out.** Every phase's new features emit adoption/cost telemetry by default, respecting the existing opt-out config.

---

## Integration Points

Listed at **program level** (the aggregate surface across all 6 phases). Per-phase specs will narrow these to phase-specific subsets when each is picked up.

### Entry Points

**New CLI commands (and extensions to existing):**

- `harness search <query>` _(Phase 1)_
- `harness insights` _(Phase 1)_
- `harness doctor` — extended with live pings, hook validity, baseline freshness, session corruption _(Phase 3)_
- `harness cleanup-sessions` — extended to general disk hygiene _(Phase 2)_
- `harness gateway` subcommands TBD in Phase 0 spec — likely thin wrappers over config + status

**New MCP tools:**

- `search_sessions` _(Phase 1)_
- `summarize_session` _(Phase 1 — auto-triggered on session close + manual mode)_
- `insights_summary` _(Phase 1)_
- `emit_skill_proposal` _(Phase 4)_
- `subscribe_webhook` _(Phase 0)_

**New API routes (Phase 0 owns these; others may extend):**

- `POST /api/v1/auth/token` — token issuance, admin scope only
- `POST /api/v1/jobs/maintenance` — trigger built-in or custom maintenance task
- `GET /api/v1/jobs/maintenance/{id}` — run status
- `GET /api/v1/jobs/maintenance/{id}/output` — fetch persisted output
- `POST /api/v1/interactions/{id}/resolve` — answer pending `emit_interaction`
- `GET /api/v1/events` — SSE event stream (formalize existing dashboard SSE)
- `POST /api/v1/webhooks` — register webhook URL + event-type filter
- `DELETE /api/v1/webhooks/{id}` — unsubscribe

**New orchestrator backends:**

- `packages/orchestrator/src/agent/backends/ssh.ts` _(Phase 5)_
- Serverless backend abstract + first concrete implementation _(Phase 5)_

**New persona subagents:**

- `harness-proposal-reviewer` _(Phase 4)_

**New dashboard pages:**

- `Search` (or `Memory`) page — session FTS5 + summary browse _(Phase 1)_
- `Insights` page — composite of entropy/decay/attention/impact/health _(Phase 1)_
- `Notifications` / `Sinks` configuration page _(Phase 3)_
- `Proposals` review queue _(Phase 4)_
- Extended `Maintenance` page — custom-job CRUD _(Phase 2)_

**New hooks:**

- `pre-mcp-launch` hook for OSV malware check _(Phase 2 / A8)_
- Possibly `pre-skill-proposal` hook for additional review gating _(Phase 4)_

### Registrations Required

| Registry                                                                                                              | Update                                                                                                                  | Phase                               |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `packages/cli/src/commands/_registry.ts`                                                                              | Add `search`, `insights`, extend `doctor`, `cleanup-sessions`                                                           | 1, 2, 3                             |
| `packages/cli/src/mcp/server.ts`                                                                                      | Register new MCP tools with tier assignments                                                                            | 0, 1, 4                             |
| `packages/cli/src/mcp/tool-tiers.ts`                                                                                  | Assign tiers (Phase 0 webhook subscribe → likely tier-1; Phase 1 search → tier-0; Phase 4 emit_skill_proposal → tier-1) | 0, 1, 4                             |
| `packages/dashboard/src/server/routes/`                                                                               | New route modules per API surface                                                                                       | 0                                   |
| `packages/dashboard/src/client/pages/`                                                                                | Add Search, Insights, Notifications, Proposals page components + Router entries                                         | 1, 3, 4                             |
| Skill index rebuild                                                                                                   | Phase 4 emits new skills into `agents/skills/claude-code/` and per-host equivalents                                     | 4                                   |
| New `packages/orchestrator/src/notifications/registry.ts`                                                             | Register sink adapters                                                                                                  | 3                                   |
| New `packages/orchestrator/src/auth/scopes.ts`                                                                        | Define and version-pin token scope vocabulary                                                                           | 0                                   |
| `packages/orchestrator/src/agent/backend-factory.ts`                                                                  | Register SSH + serverless backends                                                                                      | 5                                   |
| Slash command generator (`harness generate-slash-commands`)                                                           | Re-run after each phase to emit per-host plugin manifests                                                               | All                                 |
| Per-host plugin manifests (`harness-claude`, `harness-cursor`, `harness-codex`, `harness-gemini`, `harness-opencode`) | Update with new slash commands, MCP tool references, hook entries                                                       | All                                 |
| `harness.config.json` schema                                                                                          | New `gateway`, `maintenance.tasks`, `notifications`, `dispatch.isolation` sections — JSON schema updated for validation | 0, 2, 3, 5                          |
| OpenAPI artifact                                                                                                      | Generated + vendored per `/api/v1/...` change                                                                           | 0 (and each phase that adds routes) |

### Documentation Updates

**Per-phase docs (each phase adds):**

- `AGENTS.md` section describing new commands/MCP tools/skills
- `CHANGELOG.md` entry
- `README.md` Key Features bullet (if user-visible)
- Plugin marketplace listings (`harness-claude`, etc.) — surface area summary

**Knowledge graph documentation (added when phases land):**

- `docs/knowledge/orchestrator/gateway-api.md` _(Phase 0)_
- `docs/knowledge/orchestrator/webhook-fanout.md` _(Phase 0)_
- `docs/knowledge/core/telemetry-export.md` _(Phase 0)_
- `docs/knowledge/core/session-search.md` _(Phase 1)_
- `docs/knowledge/core/session-summarization.md` _(Phase 1)_
- `docs/knowledge/orchestrator/custom-maintenance-jobs.md` _(Phase 2)_
- `docs/knowledge/cli/pre-launch-osv-guard.md` _(Phase 2)_
- `docs/knowledge/orchestrator/notification-sinks.md` _(Phase 3)_
- `docs/knowledge/cli/skill-proposals.md` _(Phase 4)_
- `docs/knowledge/cli/skill-provenance.md` _(Phase 4)_
- `docs/knowledge/orchestrator/dispatch-isolation.md` _(Phase 5)_
- `docs/knowledge/orchestrator/cost-ceiling.md` _(Phase 5)_

**This meta-spec itself:**

- Lives at `docs/changes/hermes-adoption/proposal.md`
- Linked from `docs/roadmap.md` (each phase roadmap entry's `spec` field points here until that phase's dedicated spec lands)
- Listed in `docs/knowledge/decisions/README.md` if treated as a programmatic decision record

**API reference:**

- OpenAPI spec generated from Phase 0 onward, vendored at `docs/api/openapi.yaml`
- Hosted reference home TBD in Phase 0 spec

### Architectural Decisions

This program warrants seven ADRs. Each lives at `docs/knowledge/decisions/<adr-slug>.md` and is created when its corresponding phase spec is drafted (not by this meta-spec).

| ADR                                            | One-line rationale                                                                                                                                                                                                             | Phase |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **Orchestrator Gateway API contract**          | Versioned REST + token-scoped auth + outbound webhook delivery — provides a stable external interface so gateway adapters (Slack bots, GitHub bots, custom bridges) can be built without harness owning protocol-specific code | 0     |
| **Custom maintenance task model**              | User-extensible scheduler with security boundaries, output persistence, and `context_from` chaining — unlocks the scheduler for user automation while preserving the existing 4-task-type taxonomy                             | 2     |
| **Notification sink interface**                | Generalized `NotificationSink` abstraction with webhook fanout as transport — separates "what to notify about" from "how to deliver"; sink adapters live outside harness or as minimal in-tree shims                           | 3     |
| **Session memory architecture**                | SQLite FTS5 + LLM auto-summarization on session close — full-text retrieval over `.harness/sessions/` is currently impossible; FTS5 is the cheapest viable index with no new runtime dependencies                              | 1     |
| **Skill proposal/refinement workflow**         | Agent-emitted proposals routed through `harness:soundness-review` gate before promotion — enables self-improvement consistent with mechanical-enforcement ethos                                                                | 4     |
| **Isolation tier on BackendRouter**            | New routing axis (`local` / `container` / `remote-sandbox`) — task config declares isolation needs; explicit replaces implicit                                                                                                 | 5     |
| **Telemetry export to OpenTelemetry/Langfuse** | Webhook-based exporter consuming existing `skill_invocation` telemetry — gives users running in production access to standard observability tools without harness owning protocol code                                         | 0     |

### Knowledge Impact

The 6-phase program will introduce the following into the knowledge graph **across phase landings** (not from this meta-spec itself):

**New `business_process` nodes:**

- Gateway API authentication flow — issuance, scopes, token revocation
- Webhook fanout lifecycle — subscribe → match → deliver → retry → dead-letter
- Session search and summarization — index → summarize → retrieve
- Custom maintenance job lifecycle — define → schedule → pre-check → execute → persist → chain
- Notification sink delivery — envelope → sink → render → confirm
- Skill proposal review — emit → soundness-gate → reviewer-approve → promote
- Isolation-tier dispatch — task → router → backend selection → execute

**New `business_concept` nodes:**

- Orchestrator API tokens and scopes
- Webhook subscriptions
- Skill proposal queue
- Skill provenance (community / agent-proposed / user-authored)
- Notification envelope schema
- Cost ceiling enforcement
- Isolation tier

**New `business_rule` nodes:**

- Every API call must pass token scope verification
- Proposals require `harness:soundness-review` approval before promotion to skill catalog
- Cost ceiling aborts dispatch when cumulative spend exceeds task config
- Pre-launch OSV check blocks MCP/npx packages with `MAL-*` advisories
- Custom maintenance tasks inherit the existing 4-type taxonomy; no new task types are introduced
- Skill content injection has a per-job token-budget cap

**New relationships:**

- Gateway API _triggers_ Custom Maintenance Job
- Gateway API _fans out to_ Notification Sink
- Notification Sink _delivers_ Notification Envelope
- Session Search _provides_ Insights Aggregator
- Skill Proposal _gated by_ Soundness Review
- Skill Proposal _tagged with_ Skill Provenance
- Custom Maintenance Job _chains via_ `context_from`
- Custom Maintenance Job _inlines_ Skill Content
- Backend Router _resolves on_ Isolation Tier

Per harness's knowledge-graph schema, all new nodes must be added through the existing knowledge-pipeline (extraction → reconciliation → drift detection) — not hand-written. Phase specs will record these as `business_*` nodes in their `docs/knowledge/<domain>/` files; the ingestion pipeline picks them up.

---

## Success Criteria

Success operates at three levels: the spec itself (decomposition quality), the program (adoption outcomes), and per-phase readiness gates. Cross-cutting signals tie them together.

### Level 1 — Spec-level Success

1. **Each phase is independently shippable.** Picking up Phase 1 in isolation must deliver user-visible value even if Phases 2–5 never happen. Verified by: phase spec drafts pass `harness:soundness-review` standalone.
2. **Dependency graph remains acyclic.** No phase's prerequisites cycle back through a later phase. Verified by: graph audit at each phase-spec drafting.
3. **No phase scope exceeds ~5 weeks.** Phases that grow beyond this during their dedicated spec drafting trigger re-decomposition. Verified by: phase spec's "Implementation Order" section's estimated effort.
4. **Every adopted item maps to exactly one phase.** No item lost, no item double-counted. Verified by: phase-to-item mapping cross-check at this spec's approval.
5. **No reject silently re-enters scope.** Phase specs are gated against pulling in R1–R22 items without an explicit decision-record amendment to this meta-spec. Verified by: soundness-review of each phase spec checks against the reject list.
6. **Roadmap items track each phase from `planned → in-progress → done`** with each phase's `spec` pointer migrating to its dedicated phase spec when picked up. Verified by: roadmap state inspection at each phase completion. (Traces Goal 3.)

### Level 2 — Program-level Success

1. **All 6 phases land.** Measured at: 12 months from this spec's approval (sequential pace) or 8 months (moderate parallelism).
2. **Each phase's implementation passes `harness:verification` at three tiers** (EXISTS / SUBSTANTIVE / WIRED). Measured at: phase completion.
3. **No backwards-incompatible breakage of existing harness API/CLI/config.** Measured by: harness's existing test suite + adoption telemetry showing no regression in `skill_invocation` success rates.
4. **Mission positioning unchanged.** Harness's `README.md` opening — _"Mechanical constraints for AI agents. Ship faster without the chaos."_ — and the framing of harness as a coding-agent harness remain the canonical descriptions after the program ends.
5. **No category-reject re-enters scope.** All 22 reject groups (R1–R22) stay rejected at end-of-program.
6. **Watch-list items are explicitly resolved.** Each of the ~20 watch items has either been re-evaluated with a recorded decision, been promoted to a follow-up program, or remained on watch with refreshed re-evaluation criteria.
7. **Adoption telemetry shows real usage.** At 90 days after each phase's GA, ≥10% of active harness installs are using at least one of that phase's user-visible features (or, for foundation phases like 0, ≥1 production external bridge exists).

### Level 3 — Phase-readiness Gates

Each phase must pass these mechanical gates before being marked complete:

| Gate                                                            | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
| --------------------------------------------------------------- | ------- | ------- | ------- | ------- | ------- | ------- |
| `harness validate` passes                                       | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| `harness:verification` three-tier passes                        | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| `harness check-arch` clean                                      | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| `harness check-deps` clean                                      | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| Phase ADR(s) merged to `docs/knowledge/decisions/`              | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| Knowledge graph nodes ingested via `harness:knowledge-pipeline` | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| AGENTS.md updated                                               | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| CHANGELOG entry                                                 | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| Plugin manifests regenerated                                    | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |
| OpenAPI artifact updated                                        | ✓       | n/a     | ✓       | n/a     | n/a     | n/a     |
| External test consumer exists                                   | ✓       | n/a     | n/a     | ✓       | n/a     | n/a     |
| `harness:soundness-review` passed on phase spec                 | ✓       | ✓       | ✓       | ✓       | ✓       | ✓       |

### Phase-specific Observable Outcomes

| Phase                                           | Headline measurable outcome                                                                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Gateway API + Telemetry                     | At least one external bridge issues a valid signed request and receives webhook deliveries. OTel collector receives `skill_invocation` events.                                                                                                |
| 1 — Session Search + Insights                   | p95 search latency < 200ms over a corpus of 1000+ archived sessions. Session summary auto-generated for 100% of cleanly-closed sessions. `harness insights` returns composite report in < 5s.                                                 |
| 2 — Custom Maintenance Jobs                     | At least 2 user-defined custom jobs run successfully in production (dogfood) with output persistence and `context_from` chaining verified end-to-end. Pre-launch OSV guard blocks at least one synthetic malicious-package launch in CI test. |
| 3 — Multi-Sink Notifications + Doctor Hardening | Notifications delivered to Slack with median latency < 30s from orchestrator event. `harness doctor` detects every synthetic failure injected in a fault-injection test.                                                                      |
| 4 — Skill Proposal/Refinement                   | Skill proposals reviewed within 48-hour median turnaround. ≥1 agent-proposed skill promoted to the catalog via review queue after passing soundness-review. Provenance correctly recorded on all skills.                                      |
| 5 — Dispatch Hardening                          | SSH dispatch executes a real maintenance task on a remote node. Serverless backend executes a real maintenance task with cold-start ≤ 30s. Cost-ceiling aborts a synthetic runaway task at the configured threshold.                          |

### Cross-cutting Telemetry Signals

- **Adoption rate** — `skill_invocation` events for new tools/commands/skills, grouped by phase
- **Cost discipline** — average + p95 token spend per maintenance run; cost-ceiling abort events
- **Soundness-review pass rate** — phase specs and skill proposals (Phase 4) — should stay > 80% first-pass without major rework
- **Mission-drift early warning** — count of community/issue requests asking for messaging/voice/PIM features. Trigger threshold: ≥3 such requests in any rolling 90-day window triggers a positioning-clarification review (audit README + plugin marketplace descriptions for drift)
- **Webhook delivery reliability** — successful delivery rate per sink. Must stay > 99% on Slack adapter

### Anti-success Criteria (Red Flags)

If any of these surfaces during the program, **stop and re-spec**:

1. A phase's scope grows beyond 5 weeks during spec drafting → re-decompose
2. A reject from R1–R22 starts looking necessary → explicit amendment to this meta-spec, not silent re-entry
3. Telemetry shows < 5% adoption of a shipped phase's features after 90 days → spec a remediation skill or post-mortem the phase
4. External bridge developer feedback (Phase 0+) reports the API contract is unusable → halt Phase 3 (which depends on it) until contract is reworked
5. Skill proposal queue (Phase 4) accumulates > 50 unreviewed items → reviewer UX is broken; remediate before continuing Phase 5

---

## Implementation Order

This is a meta-spec, so "implementation order" sequences the **phases themselves** — not implementation tasks within a phase. Each phase's per-task ordering lives in its dedicated spec when picked up.

### Step 0 — This Meta-spec Lands

**Trigger:** All sections approved.

**Actions:**

1. Run `harness:soundness-review --mode spec`. Iterate until convergence.
2. Run `harness validate` to confirm proper placement + project health.
3. Run `advise_skills` to scan this spec; record results at `docs/changes/hermes-adoption/SKILLS.md`.
4. Request human sign-off via `emit_interaction` with `type: confirmation`.
5. On approval, register 6 roadmap items via `manage_roadmap` action `add`:
   - Each item: `status: planned`, `milestone: 'Hermes Adoption'`, `spec: docs/changes/hermes-adoption/proposal.md`
   - Item IDs: `hermes-phase-0-gateway-api`, `hermes-phase-1-session-search`, `hermes-phase-2-custom-jobs`, `hermes-phase-3-notifications`, `hermes-phase-4-skill-proposals`, `hermes-phase-5-dispatch-hardening`
   - Phase 0 marked as unblocked (no `blockedBy`); others have appropriate `blockedBy` pointers per the dependency graph

**Exit criterion:** Roadmap shows 6 planned items; no implementation work has started.

### Step 1 — Foundation Kickoff

**Trigger:** Phase 0 picked up (manually or via `harness:roadmap-pilot`).

**Actions:**

1. Run `harness:brainstorming` against Phase 0 scope. Produces `docs/changes/hermes-phase-0-gateway-api/proposal.md`.
2. **Optional parallel:** Phase 1 picked up by a second contributor; brainstorming runs independently.
3. Phase 0 spec approved → `harness:planning` produces `docs/changes/hermes-phase-0-gateway-api/plans/main.md`.
4. Plan approved → `harness:execution` runs against plan.
5. `harness:verification` three-tier check; iterate if SUBSTANTIVE or WIRED tier fails.
6. `harness:integration` materializes knowledge artifacts (`docs/knowledge/orchestrator/gateway-api.md`, etc.).
7. ADRs land in `docs/knowledge/decisions/`.
8. Roadmap item `hermes-phase-0-gateway-api` moves `planned → in-progress → done`.

**Exit criterion:** Phase 0 phase-readiness gates all green; at least one external bridge issues valid request.

### Step 2 — Mid-program Checkpoint #1

**Trigger:** Phase 0 + Phase 1 both shipped (or Phase 0 alone if sequential pace was chosen).

**Actions:**

1. Run retrospective:
   - Did each phase land within its estimated effort window?
   - Did either phase trigger a reject-list re-entry? If yes → amend Section "Decisions Made" with explicit decision record before proceeding.
   - Watch-list disposition in light of shipped work? Promote any items whose re-evaluation criteria fired.
   - Adoption telemetry — is the predicted user response materializing?
2. Decide pacing for Phases 2–3 (sequential or parallel).
3. Update `docs/roadmap.md` with any sequencing changes.

**Exit criterion:** Pacing decision recorded; Phase 2 kicked off.

### Step 3 — Custom Jobs + Notifications

**Trigger:** Phase 2 picked up.

**Actions:**

1. Phase 2 (Custom maintenance jobs + OSV guard + cleanup expansion):
   - `harness:brainstorming` → spec
   - `harness:planning` → plan
   - `harness:execution` → implementation
   - `harness:verification` → gates
   - `harness:integration` → knowledge artifacts
2. Phase 3 (Multi-sink notifications + doctor hardening) — sequential or parallel per Step 2 decision:
   - Same cycle
   - Phase 3 must verify against a real Slack instance (per phase-readiness gate)

**Exit criterion:** Both phases shipped; notification reliability metric tracked in dashboard for ≥7 days.

### Step 4 — Mid-program Checkpoint #2

**Trigger:** Phases 2 + 3 shipped.

**Actions:**

1. Retrospective covering same dimensions as Step 2 + specific Phase 3 evaluation:
   - Are notifications actually being used? (telemetry: webhook delivery counts per active install)
   - Are custom jobs being defined by users? (telemetry: count of non-built-in tasks)
   - If adoption is low → consider remediation skill or messaging before continuing
2. Phase 4 readiness check — Phases 0/1/3 all stable?
3. Update sequencing if needed.

**Exit criterion:** Phase 4 picked up.

### Step 5 — Skill Proposal Loop

**Trigger:** Phase 4 picked up.

**Actions:**

1. Standard cycle.
2. Phase 4 is the most design-heavy phase. Allocate extra design time; expect 2+ design iterations before plan approval.
3. Phase 4 must demonstrate a real agent-proposed skill making it through the review queue → soundness-review → promotion in a dogfood environment before being marked done.

**Exit criterion:** Phase 4 phase-readiness gates green; ≥1 agent-proposed skill promoted via the loop.

### Step 6 — Dispatch Hardening

**Trigger:** Phase 5 picked up (last phase).

**Actions:**

1. Standard cycle.
2. SSH backend tested against at least 2 different remote-node configurations.
3. Cost-ceiling validation requires fault-injection test (synthetic runaway task).

**Exit criterion:** Phase 5 phase-readiness gates green.

### Step 7 — End-of-program Retrospective

**Trigger:** All 6 phases marked `done` in roadmap.

**Actions:**

1. **Audit reject list (R1–R22).** Confirm no group silently re-entered scope.
2. **Disposition watch list (~20 items).** Each moves to: re-evaluated with explicit decision, promoted to follow-up program, or remains on watch with refreshed criteria.
3. **Mission positioning audit.** Confirm harness's README, plugin marketplace listings, and AGENTS.md still frame harness as a coding-agent harness.
4. **Adoption telemetry summary.**
5. **Public communication.** CHANGELOG, README updates, plugin marketplace descriptions refreshed.
6. **Archive this meta-spec.** Mark as `status: completed` in roadmap.

**Exit criterion:** Retrospective written; archive complete; follow-up programs (if any) have their own meta-specs in flight.

### Trigger Conditions for Re-decomposing

The order above assumes the meta-spec stays valid. Trigger re-decomposition if:

1. **Phase scope blows up** during its brainstorming (estimated >5 weeks)
2. **A reject becomes necessary** — amendment to Decisions Made section required
3. **A watch item gets promoted mid-program** — assess whether it fits an existing phase or warrants its own
4. **External constraints change** (new platform, new external dependency, security advisory) requiring scope shift
5. **Mid-program checkpoint shows adoption mismatch** — phases may need re-ordering to front-load higher-value items

In all cases: amend this meta-spec (don't silently change phase contents) and re-run `harness:soundness-review` on the amended sections.
