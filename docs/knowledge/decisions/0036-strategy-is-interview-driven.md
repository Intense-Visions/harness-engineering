---
number: 0036
title: Strategy is interview-driven, never auto-generated
date: 2026-06-02
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/strategic-anchor/proposal.md
---

## Context

Strategic-Anchor introduces `STRATEGY.md` (target problem, persona, key metrics, tracks) as the upstream anchor that grounds `harness-brainstorming`, `harness-ideate`, and `harness-roadmap-pilot`. There are two ways a strategy doc could be produced:

1. **Auto-generated** — derive from commit history, code patterns, ADRs, or roadmap state.
2. **Interview-driven** — `harness-strategy` runs a structured Q&A with pushback rules and writes only what the human commits to in plain language.

Auto-generation is attractive (zero-friction adoption, always-fresh) but produces a fundamentally different artifact: a backward-looking summary of what the repo has been doing, not a forward-looking commitment to what the team is _trying_ to do. Rumelt's _Good Strategy Bad Strategy_ frames the failure mode: strategy that describes activity is "bad strategy"; strategy that diagnoses a problem and bets on a coherent action is "good strategy". Derived strategy is structurally biased toward the former.

## Decision

`STRATEGY.md` is **interview-driven only**. There is no path that auto-generates strategy content from code, commits, ADRs, roadmap state, or any other artifact in the repo.

Concretely:

- `harness-strategy` Phase 1 (first-run) and Phase 2 (update) interview the human and write what the human says. AI helps with the _questions_ (fluff detection, goal-as-strategy rejection, feature-list-as-strategy rejection — capped at 2 rounds per section) but never with the _answers_.
- `harness-ideate` reads `STRATEGY.md` as grounding to rank candidate ideas; it does **not** write back into `STRATEGY.md`.
- `BusinessKnowledgeIngestor.ingestStrategy` extracts `business_fact` nodes _from_ `STRATEGY.md` to populate the graph; it does **not** infer or backfill strategy.
- `harness-brainstorming` and `harness-roadmap-pilot` cite STRATEGY.md as evidence and surface contradictions during EVALUATE; they never patch the strategy file.
- No CLI or skill is allowed to write `STRATEGY.md` content other than `harness-strategy`. (Schema bump / `last_updated` tick can be touched by tooling; **section bodies** are interview-only.)

Pushback rules from `agents/skills/claude-code/harness-strategy/references/interview.md` are the load-bearing element: they are what convert "captured what you said" into "captured a strategy that survives criticism." Removing pushback would collapse the interview into transcription.

## Consequences

**Positive:**

- The doc represents an actual human commitment. Downstream skills can treat it as load-bearing grounding rather than as a summary they need to sanity-check.
- Anti-patterns (fluff, goals-as-strategy, feature-lists-as-strategy) are rejected at write time, where the human can rephrase, rather than at read time, where downstream skills would have to defend against them.
- No risk that AI-derived strategy becomes a self-fulfilling prophecy ("the code looks like X, so strategy says X, so we keep building X").

**Negative:**

- Adoption requires the interview, which has friction. Mitigated by the init step's 3-way yes/no/later option (decline recorded in `.harness/state.json` as `init.strategy.declined: true` so re-runs respect prior decision).
- A bad strategy doc is still possible — pushback caps at 2 rounds. The cap is the disable mechanism (no `--skip-pushback` flag exists).

**Neutral:**

- Downstream skills must soft-fail when `STRATEGY.md` is absent. This is already wired (`BusinessKnowledgeIngestor.ingestStrategy` returns an empty result; brainstorming/roadmap-pilot fall through silently).

## Alternatives considered

- **Derive a draft strategy from commits + ADRs and let the human edit.** Rejected — the draft anchors thinking. Humans will rationalize what they see instead of diagnosing afresh. The cost of a blank page is the value of the doc.
- **Hybrid: auto-fill Tracks from `harness-roadmap` items; interview only for Target Problem / Approach / Persona.** Rejected — Tracks are the strategic-vs-tactical seam. Auto-filled tracks would inherit the roadmap's tactical granularity and lifecycle (ADR-0035).
- **Allow `harness-ideate` to propose a strategy update when a critical mass of generated ideas contradicts the current strategy.** Deferred — interesting but premature. Today, the contradiction surfaces during EVALUATE in brainstorming; the human decides whether to re-run `harness-strategy`.

## Implementation

- `harness-strategy` skill (`agents/skills/claude-code/harness-strategy/SKILL.md`) runs the interview with pushback rules.
- `agents/skills/claude-code/harness-strategy/references/interview.md` defines the three anti-pattern detectors (fluff / goal / feature-list) and the 2-round cap.
- `BusinessKnowledgeIngestor.ingestStrategy` (`packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`) reads `STRATEGY.md` and emits `business_fact` nodes — read-only on the file.
- `KnowledgePipelineRunner.extract` invokes `ingestStrategy` alongside other ingestors with a try/catch that soft-fails on absence.
- Init flow (`agents/skills/claude-code/initialize-harness-project/SKILL.md` Phase 3) records `init.strategy.declined: true` in `.harness/state.json` when the user declines.
