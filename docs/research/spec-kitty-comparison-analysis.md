# Spec Kitty (Priivacy-ai/spec-kitty) Comparison Analysis

> Deep comparative analysis of harness-engineering against Spec Kitty
> (<https://spec-kitty.ai> · <https://github.com/Priivacy-ai/spec-kitty>), analyzed
> 2026-06-23 at ~v3.2.2. Both sides grounded in primary sources: the `spec-kitty` and
> `spec-kitty-orchestrator` repos were cloned and their CLI source, runtime, doctrine,
> charter, status model, merge engine, dashboard, and dogfooding artifacts read
> directly; the harness side was grounded in a full codebase capability sweep with key
> counts verified against the tree (756 skills, 15 personas, 10 packages, 43 ADRs, 13
> ESLint rules).
>
> Companion analyses: [aidlc-comparison-analysis.md](./aidlc-comparison-analysis.md),
> [ecc-comparison-analysis.md](./ecc-comparison-analysis.md),
> [framework-research-round-2.md](./framework-research-round-2.md),
> [framework-research-round-3.md](./framework-research-round-3.md).
>
> **Read this against the AI-DLC analysis.** AI-DLC was a methodology with _no runtime_.
> Spec Kitty is the opposite: a shipped, dogfooded Python runtime with an event-sourced
> state model, a kanban dashboard, a smart-merge engine, and a multi-agent orchestrator.
> It is the first tool in this research series that is genuinely _ahead of harness on its
> own axis_ — coordinated parallel delivery — rather than merely a leaner methodology.

## What Spec Kitty Is

Spec Kitty is a **"Delivery Control Plane for AI-Assisted Software Teams"**: a Python CLI
(`spec-kitty-cli` on PyPI, Python 3.11+, installed via `pipx`/`uv tool`/`pip`) that turns
product intent into a repo-native, multi-agent, spec-driven delivery workflow. Stated
lineage: a hard fork of GitHub's `spec-kit` that breaks from it on one tenet — **code is
the source of truth; specs are change-request deltas, not durable system documentation**
(`spec-driven.md`).

- **Lifecycle (a "mission"):** `specify → plan → tasks → implement → review → accept →
merge → mission-review → retrospective`. Each phase has a slash command
  (`/spec-kitty.specify`, `.plan`, `.tasks`, `.implement`, `.review`, `.accept`) and a CLI
  equivalent. Artifacts land in `kitty-specs/<mission>/` (`spec.md`, `plan.md`,
  `tasks.md`, `tasks/WP01..WPnn.md`, `contracts/`, `research.md`, `meta.json`,
  `status.events.jsonl`, `retrospective.yaml`).
- **Work packages (WPs):** a mission decomposes into ≤~10 independently deliverable WPs,
  each a flat `tasks/WP##.md` prompt bundle with YAML frontmatter declaring
  `dependencies`, **`owned files`**, phase, and an inline activity log. Each WP is
  implemented in its own git worktree.
- **State model — event-sourced, repo-native:** the heart of the tool. A single mutation
  entry point (`status/emit.py`) appends to an **append-only `status.events.jsonl`** per
  mission; a **deterministic reducer** (`status/reducer.py`) materializes `status.json`.
  WPs move through a **9-lane state machine** (`planned → claimed → in_progress →
for_review → in_review → approved → done`, plus `blocked`/`canceled` reachable from any
  non-terminal), validated by `status/transitions.py` with dependency guards, forced-
  transition rules (`force=true` requires actor + reason), and mandatory `evidence` to
  enter `done`. There is **no central database** — Git is the source of truth, giving
  time-travel, offline work, and a full audit trail for free.
- **Identity:** every mission gets a **ULID** at creation (`mission_id`, immutable);
  `mission_number` is assigned only at merge, for display. Solves worktree/branch/dashboard
  disambiguation that slug-prefix schemes collide on.
- **Parallelism:** `spec-kitty implement WP##` creates `.worktrees/<slug>-<mid8>-lane-<id>/`
  with its own branch. Up to ~4 concurrent WPs. **No auto-merge across worktrees** —
  integration is a deliberate `spec-kitty merge` step backed by a **smart-merge engine**
  (`merge/`): `preflight.py` (clean worktrees, branch sync), `forecast.py` (predict
  conflicts before merging), `conflict_classifier.py` / `conflict_resolver.py`, and a
  **resumable `.kittify/merge-state.json`** so an interrupted merge can `--resume`.
- **Dashboard:** `spec-kitty dashboard` runs a **local kanban** (Python HTTP API +
  HTML/JS frontend, `dashboard/`) showing every WP's lane, agent, operator, shell PID,
  blockers, and activity log in real time — _work-in-flight made visible_.
- **Governance:** a **Charter** (`src/charter/`) of immutable, freshness-hashed (SHA-256)
  articles (Library-First, CLI-mandate, Test-First, Simplicity Gate ≤3 projects,
  Anti-Abstraction, Integration-First Testing) compiled into runtime gates; a **Doctrine
  layer** (`src/doctrine/`) with a Dependency-Resolution-Graph (`graph.yaml`) over mission
  types, agent profiles, directives, tactics, styleguides, templates, and skills;
  `spec-kitty dispatch` for standalone governed work that opens/closes an audited "Op"
  record in `kitty-ops/`; and three human-in-loop modes (`full_auto` / `interactive` /
  `supervised`).
- **Multi-agent orchestration:** the separate `spec-kitty-orchestrator` spawns agents in
  parallel and drives WPs through lanes **only via a subprocess `orchestrator-api`
  contract** — zero code imports from the host, enforced by AST-level boundary tests.
  Every call carries `PolicyMetadata` (orchestrator id/version, agent family, approval
  mode, sandbox mode, network mode, dangerous flags), validated on both sides.
- **Agent portability:** **19 agents** supported — 13 via generated slash-command files
  (`.claude/commands/`, `.cursor/commands/`, `.gemini/commands/*.toml`,
  `.github/prompts/`, `.windsurf/workflows/`, `.kilocode/`, `.augment/`, `.roo/`,
  `.amazonq/`, `.kiro/`, `.opencode/`, `.qwen/`, `.agent/`) and 6 via a shared
  `.agents/skills/` surface (Codex, Vibe, Pi, Letta, …). Templates are canonical in
  `src/doctrine/`; `spec-kitty upgrade` regenerates per-agent copies via a 40+ migration
  chain.
- **Retrospective synthesis:** a post-merge **hook** (`retrospective_hook.py`,
  `retrospective/`) auto-fires at the merge terminus, writes `retrospective.yaml`, and
  emits **applyable synthesis proposals** that can be propagated to other missions
  (`spec-kitty agent retrospect synthesize --apply <id>`).
- **Self-testing of its own code:** mutmut **mutation testing**, `diff-cover` changed-line
  coverage gates, `mypy --strict`, ruff, a **semantic-terminology architectural test**
  (`test_no_legacy_terminology.py` fails on "feature" where "mission" is canonical),
  import-boundary tests, and heavy dogfooding (200+ missions in `kitty-specs/`, 127 op
  logs in `kitty-ops/`).

## Where Harness Is Stronger

1. **Semantic verification, not just process verification.** Spec Kitty's acceptance gate
   (`acceptance/__init__.py`) is a _completeness checklist_: no WP left in
   `planned`/`doing`/`for_review`, all `tasks.md` checkboxes ticked, no
   `[NEEDS CLARIFICATION]` markers, frontmatter present, an activity-log entry per
   transition. That verifies the **process ran**, not that the **code is correct**.
   Harness adds the layer above: EXISTS/SUBSTANTIVE/**WIRED** tiers, AST type-safety
   checks, graph-wiring validation (does the reference actually resolve?), convergence
   loops to a fixpoint, and a 13-rule ESLint plugin that blocks layer violations and
   circular deps in CI. Spec Kitty checks that boxes are ticked; harness checks that the
   wiring is real.
2. **Knowledge graph + cross-project learning.** Spec Kitty state is per-repo markdown and
   JSONL; `retrospective.yaml` and `.kittify/memory/` give in-repo, mission-to-mission
   learning, but **nothing crosses repos** and there is no queryable structural model.
   Harness has the knowledge graph (`query_graph`, `ask_graph`, `compute_blast_radius`,
   `get_impact`, `search_similar`), FTS5-indexed session memory searchable across every
   project on the machine, `docs/solutions/` compounding, and execution outcomes feeding
   complexity/risk modeling. Spec Kitty can tell you _what happened in this repo_; harness
   can answer _"if I change X, what breaks"_ and _"have we solved this before, anywhere."_
3. **Skill breadth and a quality ceiling.** 756 skills across 4 platforms vs. Spec Kitty's
   ~6 lifecycle commands × generated per-agent. More decisively, harness has the
   **craft/LLM-judgment layer** — `naming-craft`, `spec-craft`, `test-craft`,
   `copy-craft`, `security-craft`, `knowledge-craft`, `design-craft` — confidence-rated
   ceiling-raisers that critique _whether the work is good_, plus rule-based floor
   pipelines for design (drift/anatomy/brand) and docs. Spec Kitty has no notion of
   "raise the quality ceiling on the prose/names/tests"; it ships the artifact once the
   checklist passes.
4. **Strategy layer as a durable upstream anchor.** Harness's `STRATEGY.md` is
   interview-driven, schema-validated (vision/goals/key-results/differentiators/
   constraints, with anti-fluff and goal-as-strategy pushback), graph-ingested, and read
   downstream by brainstorming/ideate/roadmap-pilot. Spec Kitty starts at per-mission
   intent via the discovery interview; there is no persistent product-strategy artifact
   feeding mission selection.
5. **Lifecycle breadth beyond the build loop.** Harness covers perf baselines + budgets,
   dependency-health and hotspot analysis, 6-factor supply-chain audit, release-readiness,
   security scan + security-craft trends, design-system and docs pipelines, roadmap-pilot,
   and post-mortem compounding. Spec Kitty is deep but _narrow_: it is a delivery control
   plane for the spec→merge loop and stops there (no perf, no dependency health, no design
   system, no security posture beyond TDD discipline).
6. **Specs/decisions are durable, traceable knowledge — by design.** Harness deliberately
   treats specs, ADRs, and decisions as first-class graph nodes with traceability
   (`check_traceability`) and spec-craft quality gates. This is the exact axis Spec Kitty
   _gave up_ (spec-as-disposable-delta). For teams that need an auditable design rationale
   trail, harness keeps it; Spec Kitty throws it away after merge.

## Where Spec Kitty Is Stronger

1. **Event-sourced state model — cleaner than harness's.** A single mutation entry point,
   an append-only event log, a deterministic reducer to a materialized snapshot, and an
   explicit validated state machine with guards. Harness state is a mutated `state.json`
   plus assorted JSON/JSONL files with `.bak` rollback and lock files. Spec Kitty's design
   is the textbook-correct version of what harness is approximating, and it is **shipped
   and dogfooded across 200+ missions**. This is the single most adoptable idea in the
   tool.
2. **Visible work-in-flight (the kanban dashboard).** Harness's dashboard is _health_
   visualization (signals, traceability, adoption, decay). Spec Kitty's dashboard shows
   _delivery_: which WP is in which lane, owned by which agent, blocked on what, right now.
   For a human supervising a fleet of parallel agents, this is the difference between a
   retrospective health report and an air-traffic-control screen. Harness has no
   equivalent live WIP board for `autopilot`/`parallel-coordinator` runs.
3. **The smart-merge engine.** Harness's worktree integration is, per the sweep, "basic
   git 3-way + cherry-pick." Spec Kitty has preflight validation, **pre-merge conflict
   forecasting**, conflict classification (structural/content/test), resolution
   strategies, and a **resumable merge-state** file. Parallel multi-agent work _lives or
   dies on merge_, and this is the most mature merge machinery seen in this research
   series. It is a working reference architecture for harness's parallel-coordinator.
4. **Orchestration is the product, so it is hardened where harness's is thin.** Spec
   Kitty's orchestrator boundary (subprocess-only contract, zero imports, `PolicyMetadata`
   on every call covering sandbox/network/approval/dangerous-flags, AST-enforced) is a
   serious agent-isolation/governance design. Several harness orchestration surfaces are
   flagged in our own sweep as scaffolded or deferred (pulse run phase, some dashboard
   panels, vision-mode rendering). On the _overlapping_ axis — coordinated parallel
   execution — Spec Kitty is the more finished system.
5. **Owned-files declaration per work package.** Each WP frontmatter declares the source
   files it owns, enabling cheap, deterministic conflict-prevention and work-package-level
   forecasting _before_ execution. Harness checks task independence via the graph
   (`check_task_independence`) — more powerful, but heavier; Spec Kitty's explicit
   declaration is a complementary, near-free guardrail.
6. **ULID identity.** Immutable collision-free mission identity decoupled from
   human-friendly numbering, designed specifically for the worktree/branch/dashboard
   multiplicity problem. Harness uses slugs, which collide across branches and sort badly.
7. **Retrospective synthesis as an automatic terminus hook with applyable proposals.**
   Harness's `compound` writes excellent post-mortems but is human-invoked. Spec Kitty
   fires retrospection automatically at the merge terminus and emits _propagatable_
   proposals. The auto-trigger + applyable-proposal shape is a real improvement over
   manual capture.
8. **Rigorous self-testing of its own code.** Mutation testing (mutmut), changed-line
   coverage gates, strict typing, and — notably — a **semantic-terminology gate** that
   fails CI on vocabulary drift. Harness's self-testing is lighter (schema/parity tests,
   limited fixtures) and still lacks golden-fixture skill-output regression (the standing
   gap from the AI-DLC analysis). Spec Kitty does not solve the _prompt-output_ eval
   problem either, but its _code_ quality net is tighter than harness's.
9. **Portability breadth.** 19 agents, zero special runtime beyond a `pip`-installable CLI.
   Harness supports 4 platforms with a richer integration per platform; Spec Kitty trades
   depth for reach.

## Adoption Decisions

### Adopt (ranked)

1. **Event-sourced status model with a deterministic reducer.** Replace/augment harness's
   mutated `state.json` with an append-only event log + pure reducer + materialized
   snapshot, modeled on `status/{emit,store,reducer,transitions}.py`. **Highest leverage:**
   it cleanly satisfies the AI-DLC analysis's "append-only audit" adoption _and_ hardens
   harness's weakest subsystem (state/provenance), and Spec Kitty proves the design at
   scale. Pair with an explicit, guarded state machine for `autopilot`/orchestrator task
   lanes.
2. **A live work-in-flight kanban for parallel/autopilot runs.** Add a lane board to the
   harness dashboard fed by orchestrator/parallel-coordinator state: per-task lane, owning
   agent, worktree, blockers, dependency edges. Harness already has the dashboard package
   and the orchestrator state machine — this is surfacing existing state, not new
   infrastructure.
3. **Smart-merge engine for parallel-coordinator integration.** Port the preflight →
   forecast → classify → resolve → resumable-state pipeline (`merge/`) into harness's
   worktree integration path. Directly closes the "basic git 3-way" gap that bottlenecks
   multi-agent execution.
4. **Owned-files declaration in plans/tasks.** Add an `owns: [paths]` field to harness plan
   tasks; use it for cheap pre-execution conflict forecasting alongside the graph-based
   independence check. Low cost, immediate parallel-safety payoff.
5. **Auto-trigger retrospection at the merge/phase terminus, with applyable proposals.**
   Fold Spec Kitty's retrospective-hook shape into `harness:compound`: fire automatically
   at session/phase close, and emit proposals that can be applied to the knowledge graph
   or other in-flight work rather than only written to `docs/solutions/`.
6. **ULID-based identity for sessions/missions/worktrees.** Adopt collision-free immutable
   ids for harness sessions and worktree-isolated tasks, with human-friendly numbering
   assigned at completion. Fixes real worktree/dashboard disambiguation.
7. **`PolicyMetadata` envelope + subprocess air-gap for the orchestrator gateway.** Adopt
   the per-call policy envelope (approval/sandbox/network/dangerous-flags) and the
   zero-import subprocess boundary as the security posture for harness's orchestrator
   gateway API (ADR 0011), validated on both ends.
8. **Semantic-vocabulary CI gate.** A harness analog of `test_no_legacy_terminology.py` —
   fail CI when deprecated/renamed canonical terms reappear in skills/docs. Cheap, and it
   protects the glossary/naming-craft investment from drift.

### Don't Adopt

- **"Code is the source of truth / spec is a disposable delta."** This is Spec Kitty's
  founding philosophy and it is the _opposite_ of harness's bet. Harness has invested in
  spec-craft, traceability, ADRs-as-graph-nodes, and durable decision rationale precisely
  because it treats specs as compounding knowledge. Adopting spec-as-delta would gut that.
  This is a genuine fork, not an oversight on either side.
- **Markdown/Git-only state with no graph or index.** As with AI-DLC: portable and
  auditable, but it abandons the cross-project graph, blast-radius, and similarity search
  that _are_ harness. Adopt the _event-sourcing discipline_ (above) without giving up the
  graph.
- **The Charter's specific immutable articles** (Library-First, max-3-projects Simplicity
  Gate, Anti-Abstraction-as-law). These are opinionated methodology constitution that
  would collide with harness's per-project, schema-driven constraint model. Adopt the
  _mechanism_ if anything (freshness-hashed immutable principles), never the specific
  articles as universal law.
- **The 13-agent generated-command matrix as primary distribution.** Harness already ships
  via marketplace plugins + npm; per-agent template regeneration through a 40+ migration
  chain is a tax Spec Kitty pays _because_ it has no plugin runtime. Their breadth (19
  agents) is enviable, but the mechanism is not the path for harness.
- **Dual-runtime coexistence (mission DSL v1 + canonical `runtime/next`).** That is
  acknowledged migration debt in their own source, not a feature.
- **No-direct-push-to-`main` / PR-only as a hardcoded framework rule.** A reasonable team
  policy, but it is project governance, not framework behavior; harness keeps this
  configurable rather than constitutional.

## Which Is Better

**They optimize different axes, and each wins its own.**

- For a **team running many parallel AI agents who need visible, governed, mergeable
  delivery**, Spec Kitty is better _today_. Its event-sourced lanes, kanban control plane,
  smart-merge engine, owned-files conflict prevention, and per-call policy envelope are a
  shipped, dogfooded, coherent answer to "coordinate a fleet of agents and land their work
  safely." Harness's orchestration surface, while broader in ambition, is thinner and
  partly deferred on exactly this axis.
- For **correctness, cross-project learning, quality ceilings, and lifecycle breadth**,
  harness is materially ahead and not close. Semantic WIRED/AST verification, the knowledge
  graph, 756 skills, the craft layer, strategy anchoring, and the perf/security/design/docs
  pipelines are simply not in Spec Kitty's scope. Spec Kitty verifies that the _process
  completed_; harness verifies that the _result is sound_ and _compounds what it learns_.

**Net:** harness is the more ambitious and broader system; Spec Kitty is the more _finished_
product within a deliberately narrower lane. The highest-value outcome of this analysis is
not "switch" but **graft Spec Kitty's delivery-control-plane mechanics (event-sourced state,
WIP kanban, smart-merge) onto harness's verification-and-knowledge engine** — that
combination is strictly stronger than either tool alone, and it concentrates adoption
exactly where harness is comparatively weak and Spec Kitty is comparatively deep.

## Philosophical Differences

- **Delivery-control-plane vs. quality-and-knowledge engine.** Spec Kitty's organizing
  question is _"can I see and safely land the work of N parallel agents?"_ Harness's is
  _"is the work correct, and does the system get smarter each time?"_ Every other
  divergence follows from this.
- **Spec-as-delta vs. spec-as-durable-artifact.** The deepest fork. Spec Kitty trusts the
  code and discards the spec; harness trusts the verifier _and_ preserves the spec as
  graph-ingested, traceable rationale. Spec Kitty optimizes for not-keeping-two-things-in-
  sync; harness optimizes for an auditable design trail.
- **Event-sourced repo-native state vs. graph + SQLite machine state.** Spec Kitty:
  human-auditable JSONL, git time-travel, no DB, portable to any tool — but no structural
  reasoning. Harness: machine-queried graph + FTS5, cross-project — but heavier and less
  legible to outside tooling. (Same legibility tradeoff flagged in the AI-DLC analysis,
  but Spec Kitty's event-sourcing is the _stronger_ version of the markdown-state idea.)
- **Process-trust vs. machine-trust — Spec Kitty sits in the middle.** AI-DLC's quality
  floor was a human at every gate; harness's is the verifier. Spec Kitty is _between_ them:
  its floor is a human review gate, but it surrounds that gate with real machinery — an
  event log, a lane state machine, evidence fields, owned-files guards, merge forecasting.
  It does not check semantic correctness (that stays with the human/agent), but it makes
  the _process_ far more enforced and observable than AI-DLC did. Harness then layers
  semantic verification on top of a process that Spec Kitty has independently mechanized.
- **Portability-first vs. capability-first.** Spec Kitty runs on any of 19 agents with a
  plain `pip install` and moves determinism into an explicit state machine. Harness pins
  capable models, ships richer per-platform integrations, and moves determinism into code
  - graph. Same reproducibility tradeoff as AI-DLC, one notch toward capability.
- **Convergent design.** Independently, both landed on **worktree-per-unit parallelism**,
  **human-in-loop approval modes**, **scope/lane tiering**, and **post-mortem learning**.
  Where AI-DLC and harness converged on "classify intent, scale ceremony," Spec Kitty and
  harness converge on "isolate units in worktrees, gate their reintegration, learn at the
  terminus" — strong evidence these are load-bearing patterns, not incidental ones.
- **Self-testing blind spots, shared.** Spec Kitty tests its _code_ rigorously (mutation
  testing, coverage gates) but not its _prompt/template outputs_ semantically. Harness
  tests its _skills_ lightly and lacks golden-fixture output regression. Neither has
  AI-DLC's semantic-@k evaluator. The AI-DLC adoption ("skill-regression evaluator with
  golden fixtures") remains the highest-leverage capability _neither_ competitor has —
  reinforcing it as harness's single best differentiating investment.
