---
name: Harness Engineering
last_updated: '2026-07-01'
version: 2
---

# Harness Engineering Strategy

## Target problem

AI coding agents are fast but unreliable without structure. Left unconstrained, they compound drift — circular dependencies, layer violations, dead code, documentation rot — that humans then absorb as code-review backlogs and manual checklists. Conventions and prompts don't survive iteration: each agent invocation starts cold, re-litigates settled architectural decisions, and inflates entropy debt. Teams currently choose between babysitting the agent or paying the cleanup tax. Neither scales.

## Our approach

The substrate the agent runs on, not the agent itself, determines reliability. We bet on **encoding architectural decisions, process discipline, and strategic intent as machine-checkable constraints** — layered dependency rules in ESLint, entropy rules in detectors, workflow rigidity in skills, durable grounding in a knowledge graph and STRATEGY.md. Constraints fire in real time, so agents self-correct mid-stream instead of accumulating cleanup debt downstream. Humans own the thinking layer (specs, decisions, strategy); the harness mechanically polices everything below it. The wager: **constraints-as-code outperforms prompts-and-conventions** at every scale, and compounds — each constraint added now removes a class of future drift.

## Who it's for

**Primary persona:** tech leads and senior engineers on teams that have adopted AI coding agents (Claude Code, Cursor, Gemini CLI, Codex) and are running into the second-order cost — architectural drift, layer violations, doc rot, and ballooning PR-review backlogs. They typically already have a CLAUDE.md / AGENTS.md / conventions doc, prompt templates, and a code-review checklist, but those are _conventions without enforcement_ — agents drift back to bad patterns the moment a session forgets the prompt. They are not the marginal user trying agents for the first time; they're the user 3–6 months in, watching the cleanup tax compound.

**Secondary persona:** individual developers running agents heavily (10+ sessions/week) who are paying the cleanup tax themselves. Same diagnosis, smaller blast radius.

## Key metrics

- **Agent Autonomy:** % of merged PRs in `Intense-Visions/harness-engineering` whose commits are 100% bot/automation (no human code commits), measured monthly via the GitHub API and reported in `docs/standard/kpis.md`.
- **Harness Coverage:** ratio of documented architectural rules that carry mechanical enforcement (ESLint rule, validator, schema, hook) to total documented rules, surfaced via `harness validate` baselines tracked in `.harness/architecture/timeline.json`.
- **Context Density:** count of load-bearing knowledge nodes (ADRs, principles, conventions, STRATEGY.md sections) reachable via the knowledge graph per package, measured by `@harness-engineering/graph` and reported by `harness insights`.
- **Drift Floor:** layer-violation / dependency-violation / entropy-finding count introduced per merged PR over a 30-day rolling window, reported by `harness validate` in CI and aggregated to `.harness/security/timeline.json` and the architecture timeline.
- **External Adoption:** distinct projects running harness in the last 30 days, surfaced by anonymous telemetry (DO_NOT_TRACK respected); tells us whether the bet generalizes off-repo.

## Tracks

- **Upstream grounding:** make the strategic and knowledge substrate (STRATEGY.md, knowledge graph, principles, ADRs) durable enough that downstream skills ground reliably instead of starting cold each invocation. Current: strategic-anchor skill (Phases 3-7 wire it into brainstorming, ideate, roadmap-pilot, knowledge graph); v4.0 Business Knowledge System.
- **Ceiling-raising via LLM judgment:** add craft-pipeline skills that critique _quality_ (naming, prose, code shape, spec clarity, threat models) beyond what rule-based linters can catch. Current: complete the craft family — docs-craft, code-craft, api-craft, cli-ergonomics are the remaining four; six already shipped (naming, spec, test, copy, knowledge, security).
- **Compounding feedback loops:** invest in mechanisms that make agents and skills _measurably improve_ over time rather than holding steady. Current: skill proposal loop, skill effectiveness baselines, trust scoring, prompt injection from historical outcomes.
- **Multi-client portability:** keep the harness usable across Claude Code, Cursor, Codex, Gemini CLI, and OpenCode without forking the substrate. Current: marketplace plugins per client, per-skill / per-cognitive-mode backend routing, gateway API for external bridges.
- **External adoption flywheel:** make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale. Current: skill marketplace, constraint sharing bundles, harness:blueprint for codebase courseware, telemetry-driven adoption insights.
- **Full-lifecycle reach:** the harness owns the build loop (design → plan → code → verify → review) deeply, but a toolset's value is capped by its narrowest human edge, not its deepest skill. Extend reliably to the two edges where non-engineers meet the pipeline — _authoring intent_ (client requirements upstream of the spec) and _adjudicating outcomes_ (user acceptance, sign-off, production signals feeding back into the graph) — and reach those edges through role-shaped front doors (guided interviews, dashboard lanes) rather than the CLI. Bet: once intent is the input and agents run the middle, completing the two human edges is what lets non-technical people drive real lifecycle work — and that, not more expert skills, is where the next unit of leverage is. Current: product-advisor (BRD / inception edge, first wedge); gaps at the product-requirements middle, UAT / sign-off edge, and post-ship enforcement (deployment, operations). See `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`.

## Marketing

Stop babysitting your AI agent. Harness encodes your architectural decisions, conventions, and strategic intent as machine-checkable constraints — agents get real-time feedback when they violate boundaries, drift is detected and cleaned automatically, and every rule is validated on every change. The result: **humans stay in the thinking layer (specs, design, strategy) and AI reliably executes the rest.** Scale agent-assisted development across your team without the entropy tax.
