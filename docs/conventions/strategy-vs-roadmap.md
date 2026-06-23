# Strategy vs Roadmap: Operational Guidance

This document gives contributors concrete guidance on what belongs in
`STRATEGY.md` versus what belongs in `harness-roadmap.md` / `docs/roadmap.md`.
For the architectural rationale, see
[ADR-0035](../knowledge/decisions/0035-strategy-anchor-vs-roadmap-md.md).
For why strategy is interview-driven, see
[ADR-0036](../knowledge/decisions/0036-strategy-is-interview-driven.md).

## TL;DR

- `STRATEGY.md` — **why we exist** (target problem, persona, key metrics, tracks of work). Rare edits. Repo root, peer of `README.md`.
- `harness-roadmap.md` / `docs/roadmap.md` — **what we're doing this phase** (items, owners, statuses, blockers). Frequent edits.

If you find yourself updating STRATEGY.md on every sprint, you are using it
wrong. If you find yourself describing the company's distinctive bet in
roadmap.md, you are also using it wrong.

## Decision Tree

Ask, in order:

1. **Is this a fact that will still be true a year from now?**
   → STRATEGY.md (probably).
2. **Is this a state that changes every few days / weeks?**
   → roadmap (always).
3. **Is this a commitment about _direction_ (where the product is going)?**
   → STRATEGY.md.
4. **Is this a commitment about _execution_ (who, by when, blocked on what)?**
   → roadmap.

When in doubt: a STRATEGY.md update should feel like an event worth telling
the team about. A roadmap update is routine.

## STRATEGY.md: The Anchor

Sections (defined in `packages/types/src/strategy.ts`):

- **Target problem** — what specifically is broken in the world.
- **Our approach** — our distinctive bet on how to solve it.
- **Who it's for** — specific persona, not "developers" generically.
- **Key metrics** — what counts as winning, where it's measured.
- **Tracks** — the small set of coherent investments we're making.
- _Optional_: **Milestones**, **Not working on**, **Marketing**.

Authored via `harness-strategy` skill with pushback rules
(fluff / goal-as-strategy / feature-list-as-strategy detectors capped at
2 rounds per section). Schema validation rejects header-only "completed"
docs and unfilled template placeholders (`packages/core/src/strategy/schema.ts`).

### Belongs in STRATEGY.md

- "We exist because mid-sized engineering teams lose track of why a
  project is being worked on once handoffs happen mid-phase."
- "Our bet is that a small durable anchor file beats wiki pages because
  agents can read it as grounding."
- "Tracks: anchor adoption, downstream grounding, agent-discoverable
  surface."
- "Key metric: percentage of brainstorm specs that cite STRATEGY.md as
  evidence."

### Does NOT belong in STRATEGY.md

- "Phase 7 ships 2026-Q2." → roadmap (or, if the date matters strategically,
  put a single bullet under the optional `Milestones` section).
- "Track X is blocked on Y team." → roadmap.
- "Add feature A, B, C." → That's a feature list, not a strategy. Push back
  for the underlying coherent action (this is one of the three anti-patterns
  the interview rejects).

### Good and bad answers (Target problem)

- **Bad (goal):** "Grow our DAU by 20% in 2026." — That is a goal. Strategy answers what bet produces the outcome.
- **Bad (feature list):** "Add SSO, audit logs, and SCIM." — That is a backlog. Strategy answers why those, in that order, instead of others.
- **Bad (fluff):** "Be the best context system for AI agents." — Unfalsifiable. Strategy answers what specifically is broken today.
- **Good:** "Engineering teams accumulate undocumented constraints faster than they can write specs. The result is rework, drift, and onboarding that takes months." — Concrete diagnosis a reader can argue with.

## harness-roadmap.md / docs/roadmap.md: The Tracker

Authored mechanically via `manage_roadmap` and `harness-roadmap-pilot`.
Items have:

- `kind` (issue / spec / chore), `title`, `status` (planned / in-progress / blocked / done),
  `owner`, `phase`, `blocked_by`, `depends_on`.
- Free-form context lives in the linked spec or change doc, not in the
  roadmap row.

### Belongs in roadmap

- "feat: compound-engineering Strategic Anchor phase 7 — assignee: chad@,
  status: in-progress, blocked_by: none."
- "chore: bump @harness-engineering/graph version on release — status: planned."
- `spec: docs/changes/<feature>/proposal.md — status: review.`

### Does NOT belong in roadmap

- "We exist to help agent-first teams." → STRATEGY.md.
- "Our distinctive bet is that mechanical enforcement beats code review." →
  STRATEGY.md.

## How They Connect at Runtime

Both files feed downstream skills as grounding, but through separate paths:

- `harness-brainstorming` Phase 1 EXPLORE reads `STRATEGY.md` if present.
  It does **not** read the roadmap (the brainstorm scopes a new spec, not
  the next phase item).
- `harness-roadmap-pilot` Phase 2 RECOMMEND reads **both**: the roadmap
  for items + impact × confidence ÷ effort scoring, and STRATEGY.md for
  the strategy-alignment tiebreaker bonus.
- `BusinessKnowledgeIngestor.ingestStrategy`
  (`packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`) emits
  `business_fact` nodes from `STRATEGY.md` with
  `metadata.domain === 'strategy'`. The roadmap is **not** ingested into
  the knowledge graph — it's an execution-state artifact, not a fact source.

### Downstream skill read matrix

| Skill                        | Reads `STRATEGY.md`                                      | Reads `docs/roadmap.md`                     |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `harness-strategy`           | Authoritative read/write                                 | No                                          |
| `harness-ideate`             | Phase 1 focus context; strategy-alignment tiebreaker     | No                                          |
| `harness-brainstorming`      | Phase 1 EXPLORE step 0a; cites in spec evidence          | No                                          |
| `harness-roadmap-pilot`      | Phase 2 RECOMMEND step 1a; strategy-alignment tiebreaker | Authoritative read/write                    |
| `harness-knowledge-pipeline` | Via `BusinessKnowledgeIngestor.ingestStrategy()`         | No (roadmap is not ingested as graph nodes) |

## Common Mistakes

- **Embedding milestone updates in the strategy doc.** Symptom: `last_updated`
  ticks every week. Fix: move to roadmap; restore strategy's durability.
- **Describing the company's bet in roadmap row context.** Symptom: a
  multi-paragraph "why" attached to a roadmap item. Fix: move the "why" to
  the spec doc; let the roadmap row stay terse.
- **Re-running `harness-strategy` to capture phase-level progress.** Symptom:
  Tracks balloon with implementation details. Fix: rephrase the track as a
  coherent investment ("downstream grounding") rather than a task list
  ("wire brainstorming, then roadmap-pilot, then…").
- **Treating absent STRATEGY.md as broken.** Soft-fail throughout — the init
  step is opt-in, and downstream skills degrade silently. Pestering existing
  projects is an anti-pattern.

## See Also

- [ADR-0035](../knowledge/decisions/0035-strategy-anchor-vs-roadmap-md.md) —
  STRATEGY.md vs roadmap.md separation of concerns.
- [ADR-0036](../knowledge/decisions/0036-strategy-is-interview-driven.md) —
  why strategy is interview-driven and never auto-generated.
- `agents/skills/claude-code/harness-strategy/SKILL.md` — interview skill.
- `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md` — roadmap
  prioritization skill.
- `packages/core/src/strategy/schema.ts` — Zod schema and validator.
- `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` — `ingestStrategy`
  method.
