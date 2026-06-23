# AI-DLC (awslabs/aidlc-workflows) Comparison Analysis

> Deep comparative analysis of harness-engineering against AWS Labs' AI-DLC workflows
> (<https://github.com/awslabs/aidlc-workflows>), analyzed 2026-06-11 at ~v0.1.x.
> Both sides grounded in primary sources: the aidlc-workflows repo was cloned and its
> core workflow, rule details, extensions, and support tools read directly; the harness
> side was grounded in a full codebase capability sweep.
>
> Companion analyses: [ecc-comparison-analysis.md](./ecc-comparison-analysis.md),
> [framework-research-round-2.md](./framework-research-round-2.md),
> [framework-research-round-3.md](./framework-research-round-3.md).

## What AI-DLC Is

AI-DLC is a **methodology with no runtime**: pure markdown rule files
(`aws-aidlc-rules/core-workflow.md` + `aws-aidlc-rule-details/`) copied into whatever
rules directory a coding agent reads (Kiro, Amazon Q, Cursor, Cline, Claude Code,
Copilot, Codex). Stated tenets: methodology first, vendor/agent agnostic, reproducible
across models, human in the loop.

- **Lifecycle:** three phases — Inception (workspace detection → brownfield reverse
  engineering → adaptive-depth requirements analysis → conditional user stories →
  workflow planning → conditional application design → conditional units generation),
  Construction (per-unit loop: functional design → NFR requirements → NFR design →
  infrastructure design → code generation, then build-and-test), Operations
  (explicit placeholder).
- **Interaction model:** the agent never asks questions in chat. It writes
  multiple-choice question files with `[Answer]:` tags, waits for the user to fill them
  in, then runs a mandatory contradiction/ambiguity pass over the answers and generates
  clarification files until resolved. Every stage ends in an explicit approval gate
  with a standardized 2-option message — the core workflow mandates "NO EMERGENT
  BEHAVIOR."
- **Provenance:** a mandatory append-only `audit.md` logging every user input verbatim
  ("never summarize") with ISO timestamps, plus two-level checkbox tracking
  (plan-level + stage-level in `aidlc-state.md`).
- **Extensions:** opt-in rule packs (security baseline, resiliency, property-based
  testing). Only the lightweight `*.opt-in.md` prompt loads up front; full rules load
  only on user consent — then become blocking constraints with per-stage compliance
  summaries (compliant / non-compliant / N/A).
- **Support tooling (Python, Bedrock):** `aidlc-evaluator` (golden test cases, semantic
  eval @k, lint/security/duplication scans, NFR eval incl. token consumption and
  cross-model consistency, CI on rule PRs), `aidlc-designreview` (3-agent
  critique/alternatives/gap-analysis), `aidlc-traceability`
  (requirements→stories→units→components→code matrix with orphan/gap detection).

## Where Harness Is Stronger

1. **Programmatic verification.** AI-DLC's only in-workflow quality mechanism is a
   human reading an artifact and approving. No EXISTS/SUBSTANTIVE/WIRED equivalent, no
   AST checks, no graph-wiring verification, no convergence loops, no phase gates.
2. **Knowledge persistence and compounding.** AI-DLC artifacts are per-project markdown;
   nothing carries across projects or sessions. Harness has the knowledge graph,
   FTS5-indexed session memory, `docs/solutions/` compounding, and execution outcomes
   feeding complexity modeling. AI-DLC has no learning loop.
3. **Execution machinery.** AI-DLC is one agent, fully synchronous, one stage at a time.
   Harness has the event-sourced orchestrator, backend routing with fallback chains,
   12 review personas with parallel coordination, autopilot, worktree isolation. AI-DLC
   generates units "for parallel development" but provides zero machinery to develop
   them in parallel.
4. **Strategy layer.** AI-DLC starts at per-project intent; harness's STRATEGY.md is
   interview-driven, schema-validated, graph-ingested, and consumed downstream.
5. **Lifecycle breadth.** AI-DLC's Operations phase is empty; no roadmap, perf
   baselining, dependency health, release readiness, post-mortems, or docs/design
   pipelines. AI-DLC ends at _generating build-and-test instructions_ — it doesn't run
   the tests.
6. **Granularity and routing.** One monolithic adaptive workflow vs. harness's 50+
   skill catalog with semantic search, scope-tier routing, and cognitive modes.

## Where AI-DLC Is Stronger

1. **It tests its own methodology.** The `aidlc-evaluator` runs golden test cases
   (vision + tech-env in, golden `aidlc-docs/` + working code out) through a six-stage
   pipeline — execution, post-run tests, static analysis, contract tests against an
   OpenAPI spec, semantic comparison against golden baseline _@k to account for
   non-determinism_, consolidated reports — wired into CI so rule-file PRs are
   evaluated for outcome regression, token consumption, and cross-model consistency.
   Harness iterates on skill prompts constantly with no equivalent regression net.
2. **Compliance-grade audit trail.** Append-only `audit.md` with verbatim raw user
   input and every approval prompt/response timestamped. Harness's
   `.harness/state.json` decisions log records _that_ decisions happened, not raw input
   verbatim, and it is machine-state, not a human-readable provenance document.
3. **The question-file ritual.** Durable, team-reviewable, async-friendly decision
   capture, plus mandatory cross-answer contradiction detection ("you said bug fix in
   Q1 but entire-codebase impact in Q2"). Harness `AskUserQuestion` interactions are
   ephemeral chat turns.
4. **NFR and infrastructure design as first-class stages.** Per unit: NFR requirements
   → NFR design → infrastructure design, before code generation. Harness surfaces NFRs
   reactively (review findings) rather than proactively (design inputs).
5. **Structured brownfield reverse engineering.** Prescribed artifact set: business
   overview of system transactions, architecture docs, component inventory, interaction
   diagrams per business transaction, tech-stack and dependency docs — generated before
   requirements work. Harness graph ingestion captures structure but not this
   business-transaction-centric narrative layer.
6. **Context-efficiency and documented self-awareness.** Opt-in lazy extension loading;
   `overconfidence-prevention.md` (a published root-cause analysis of their own prompt
   system's under-asking failure mode, with the "when in doubt, ask" doctrine);
   context-hygiene guidance (reset at gates, decline compaction, re-read answer files
   from disk).
7. **Portability.** Seven-plus platforms, zero install, any model.

## Adoption Decisions

### Adopt (ranked)

1. **Skill-regression evaluator with golden fixtures.** Golden fixture projects +
   canonical inputs per major skill (brainstorming, planning, spec-craft); run the
   skill; score artifacts semantically @k against golden baselines; track token cost
   and duration; gate prompt/rule PRs in CI. AI-DLC's evaluator is a working reference
   architecture. **Highest leverage — the one capability where AWS is categorically
   ahead.**
2. **Append-only audit log.** A session-scoped audit log capturing raw user input
   verbatim plus every approval prompt/response with timestamps (session-scoped per the
   handoff-pollution lesson, ADR on handoff deprecation). Cheap to add at
   `emit_interaction`/state-write level; large compliance and debuggability payoff.
3. **NFR elicitation in harness-planning.** Explicit NFR-requirements step (performance,
   security, scalability, resilience targets) whose outputs become verifiable plan
   tasks, connected to existing perf baselines and security scan machinery.
4. **Question-file mode for interviews + contradiction detection.** File-based mode for
   strategy/pulse/brainstorming interviews in team/async contexts; cross-answer
   consistency pass added to existing pushback rules.
5. **Opt-in gating for blocking constraint packs.** The `*.opt-in.md` → lazy-load →
   blocking-with-compliance-summary pattern, mapped onto harness security/resiliency
   rule sets.
6. **Writing-inputs guides.** Vision/tech-env-style "here's what a good input looks
   like" docs with full _and minimal_ examples, greenfield and brownfield variants, for
   the STRATEGY interview.

### Don't Adopt

- **Markdown-only, zero-runtime distribution** — abandons the graph, verification, and
  orchestration that _are_ harness.
- **"NO EMERGENT BEHAVIOR" / universal stop-and-approve gates** — contradicts autopilot
  and the escalation-based human-in-the-loop model.
- **Per-IDE manual setup matrix** — consequence of having no tooling, not a feature.
- **The `aidlc-docs/` tree, welcome-message ritual, A/B/C question files for every
  interaction** — harness has established conventions and native `AskUserQuestion`.
- **"Bolts" / Mob Elaboration ceremony vocabulary** — methodology branding; even the
  repo's own workflow files barely use it.
- **Operations phase** — it's empty.

## Philosophical Differences

- **Process-trust vs. machine-trust.** AI-DLC's quality floor is the human at each
  gate; harness's is the verifier. This explains every other divergence: AI-DLC needs
  audit trails and mandatory approvals _because_ nothing else checks the work; harness
  can run autopilot _because_ something else does.
- **Reproducibility strategies.** AI-DLC minimizes cross-model variance through
  exhaustively explicit prompts (it runs on whatever agent the user has). Harness pins
  capable models and moves determinism into code.
- **Convergent adaptivity.** Both independently landed on "classify the intent, scale
  the ceremony" — AI-DLC's adaptive stage selection + depth levels mirrors harness's
  quick-fix/guided-change/full-exploration/diagnostic tiers.
- **State legibility.** AI-DLC state is human-readable markdown checkboxes resumable in
  any tool; harness state is JSON + graph + SQLite a machine can reason over. Worth
  remembering when harness artifacts must face auditors or non-harness tooling.
