---
number: 0035
title: STRATEGY.md (durable anchor) vs roadmap.md (tactical tracker) separation
date: 2026-06-02
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/strategic-anchor/proposal.md
---

## Context

The harness pipeline opens at brainstorming, which assumes a feature has already been chosen. Two distinct upstream gaps were conflated under "roadmap":

- **What the product is** — target problem, persona, key metrics, tracks of work. Lifecycle: per-product, changes monthly at most.
- **What the team is shipping now** — current phase, blockers, assignees, status. Lifecycle: per-phase, changes weekly.

`docs/roadmap.md` already serves the second purpose well (`harness-roadmap-pilot` reads and updates it phase-by-phase). Forcing it to also carry strategic context — "who is this product for?", "what is our distinctive bet?" — would either bloat the file past its useful size or push strategic answers into ad-hoc places (READMEs, design docs, Slack threads) where downstream skills cannot ground on them.

## Decision

Add a separate `STRATEGY.md` at repo root, peer to `README.md`, as the durable product anchor. Keep `docs/roadmap.md` exactly as is for tactical phase tracking. The two files are owned by different cadences and read by different skills:

| Axis           | `STRATEGY.md`                                                      | `docs/roadmap.md`                                     |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Lifecycle      | Per-product; updated when the bet changes                          | Per-phase; updated weekly or per merge                |
| Location       | Repo root (discovery)                                              | `docs/` (tactical content)                            |
| Owns           | Target problem, approach, persona, key metrics, tracks             | Phase status, blockers, assignees, completion percent |
| Read by        | `harness-brainstorming`, `harness-ideate`, `harness-roadmap-pilot` | `harness-roadmap-pilot`                               |
| Updated by     | `harness-strategy` skill (interview-driven)                        | `harness-roadmap-pilot`, `manage_roadmap` MCP tool    |
| Schema         | Frontmatter + fixed H2 sections (validated by `StrategyDocSchema`) | Free-form markdown with phase tables                  |
| Knowledge node | `business_fact` nodes (one per section, domain `strategy`)         | Not directly ingested as nodes                        |

`harness-roadmap-pilot` reads `STRATEGY.md` (when present) as a tiebreaker bonus during item prioritization — strategy-aligned items rank higher when base impact-confidence-effort scores are close. This wiring closes the loop without coupling the two files' schemas.

## Consequences

**Positive:**

- Strategic context is discoverable to humans (peer of `README.md`) and to agents (one well-known path).
- `docs/roadmap.md` stays small and tactical — it does not grow a "Why are we doing this?" preamble that drifts from the truth.
- Downstream skills (`harness-brainstorming`, `harness-ideate`, `harness-roadmap-pilot`) ground on a single source for product-level context.
- New `business_fact` graph nodes (domain `strategy`) make strategic answers queryable alongside business rules, processes, and concepts.

**Negative:**

- Two files instead of one increases the number of artifacts to maintain. Mitigated by the per-product cadence of `STRATEGY.md` — it does not change often.
- Some projects do not need a strategy doc (CLI utilities, libraries). Mitigated by soft-fail semantics: `STRATEGY.md` is opt-in at init, and downstream skills do not block on its absence.

## Alternatives considered

- **Strategy section inside `docs/roadmap.md`.** Rejected — couples a per-product anchor to a per-phase tracker, and `harness-roadmap-pilot` would have to skip its own strategy section when summarizing the roadmap.
- **Strategy section inside `README.md`.** Rejected — `README.md` is for external readers (users, contributors). Strategy is for the team. Mixing the two pushes one or the other off-topic.
- **No durable anchor; rely on chat context.** Rejected — chat context dies with the session. Skills running outside a chat (`harness-roadmap-pilot`, materialization jobs) cannot read it.

## Implementation

- `STRATEGY.md` at repo root (created by `harness-strategy` first-run interview)
- `packages/core/src/strategy/` — Zod schema, parser, serializer, writer
- `packages/types/src/strategy.ts` — cross-layer contract types
- `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` — `ingestStrategy()` produces `business_fact` nodes per known section
- `agents/skills/claude-code/harness-strategy/SKILL.md` — interview and update flow
- `agents/skills/claude-code/harness-brainstorming/SKILL.md` — Phase 1 EXPLORE step 0a reads `STRATEGY.md`
- `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md` — Phase 2 RECOMMEND step 1a reads `STRATEGY.md` for tiebreaker scoring
- `agents/skills/claude-code/initialize-harness-project/SKILL.md` — Phase 3 step 5c offers the 3-way strategy prompt
- `docs/conventions/strategy-vs-roadmap.md` — convention doc with author-facing examples
