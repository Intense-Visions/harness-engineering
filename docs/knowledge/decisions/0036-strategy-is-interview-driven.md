---
number: 0036
title: Strategy is interview-driven, never auto-generated
date: 2026-06-02
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/strategic-anchor/proposal.md
---

## Context

`STRATEGY.md` answers product-level questions that no automated source can answer correctly:

- What problem are we solving, specifically?
- What is our distinctive bet on how to solve it?
- Who is this for, in terms specific enough to disqualify the wrong users?
- What metrics tell us we are winning?

The harness toolchain already does inferential work elsewhere — `BusinessKnowledgeIngestor` derives `business_rule` nodes from doc comments, `KnowledgeLinker` correlates connector signals into facts, the planner extracts tasks from specs. Each of these inferences answers a question the code already implicitly answers. Strategy is different: the code cannot answer "who is this for?", and a commit history cannot answer "what is our distinctive bet?". Those answers exist only in the heads of the people building the product.

A plausible-but-wrong strategy is worse than no strategy. Downstream skills (`harness-brainstorming`, `harness-ideate`, `harness-roadmap-pilot`) ground on `STRATEGY.md` as evidence; if it carries auto-generated guesses, every downstream decision inherits the guess, and the guess becomes self-reinforcing as new artifacts cite it.

## Decision

`STRATEGY.md` is produced and updated only through the `harness-strategy` skill's interview flow with a human in the loop. The interview enforces:

- **Section-by-section questions.** Each H2 section is opened with one focused question, not a "fill this out" template dump.
- **Pushback rules** (capped at 2 rounds per section):
  - **Fluff detection** — answers like "be the best at X" are rejected; the skill asks for a concrete diagnosis.
  - **Goal-as-strategy** — answers like "grow revenue 20%" are rejected as goals; the skill asks what bet produces that outcome.
  - **Feature-list-as-strategy** — answers like "add features A, B, C" are rejected; the skill asks for the coherent action underneath.
- **Placeholder rejection.** `StrategyDocSchema` validates that no required section contains the template angle-bracket markers (e.g., `<2-4 sentences. ...>`). A `STRATEGY.md` with only headings present fails validation.

The skill never:

- Reads the repo to "infer" strategy from existing code.
- Reads commit history to summarize "what the team has been working on" as a stand-in for "what the team has decided to bet on."
- Calls a connector to import strategy from a planning tool. (Connectors are kept as one-way _ingest_ sources for context, not as authors of the durable anchor.)

The interview captures the user's answer in their own language. Pushback exists to surface non-strategy answers; it does not rewrite the user's words once the answer is accepted.

## Consequences

**Positive:**

- The artifact carries human commitment, not derived noise. Downstream skills can cite it as evidence without inheriting model error.
- The skill's value is in the questions, not the headings. Skipping the questions to "fill it in fast" produces a doc that fails schema validation (placeholder rejection), so the cost of shortcutting is paid up-front.
- Strategy can be intentionally absent. Projects that do not yet know their bet do not get pestered into producing one — `init.strategy.declined: true` is a first-class state.

**Negative:**

- First-run interviews are slower than auto-generation. Mitigated by the 2-round pushback cap per section; the user is never trapped in an interrogation loop.
- The team must rerun the interview to keep `STRATEGY.md` current. Mitigated by the update flow (Phase 2) re-reading the existing file and asking which section to revisit — full re-interview is not required.

## Alternatives considered

- **Auto-fill from `README.md` and the top-N commit messages.** Rejected — produces plausible but wrong strategy that downstream skills cite as ground truth. The wrongness compounds.
- **Hybrid: auto-draft, human-edit.** Rejected — an auto-drafted answer biases the human toward editing-around-it rather than answering the underlying question. The draft becomes the floor instead of a starting point.
- **Connector-sourced (e.g., Linear/Notion strategy doc).** Rejected — couples the harness anchor to a third-party tool's lifecycle and shape. Connectors remain one-way ingest sources for _context_, not authors of the durable anchor.
- **No pushback (passive interview).** Rejected — passive transcription captures fluff, goals, and feature lists as if they were strategy. The pushback is the value.

## Implementation

- `agents/skills/claude-code/harness-strategy/SKILL.md` — first-run interview and update flow (Phase 0 routing by file state)
- `agents/skills/claude-code/harness-strategy/references/interview.md` — fluff / goal-as-strategy / feature-list-as-strategy pushback rules
- `packages/core/src/strategy/schema.ts` — `StrategyDocSchema` placeholder-rejection rule
- `packages/cli/src/commands/validate.ts` — wires schema validation into `harness validate`
- `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` — consumes `STRATEGY.md` as `business_fact` nodes (consumer, not author)
