# Strategy vs Roadmap: Operational Guidance

This document gives contributors and agents concrete guidance on what belongs in
`STRATEGY.md` versus `docs/roadmap.md`. For the architectural rationale, see
[ADR-0035](../knowledge/decisions/0035-strategy-vs-roadmap-separation.md). For why
strategy is interview-driven (not auto-generated), see
[ADR-0036](../knowledge/decisions/0036-strategy-is-interview-driven.md).

## Decision tree

Ask, in order:

1. **Does this answer change weekly?** (status, blockers, assignees, completion percent)
   → `docs/roadmap.md`. Update via `harness-roadmap-pilot` or the `manage_roadmap` MCP tool.

2. **Does this answer change monthly at most?** (target problem, who it's for, our distinctive bet, key metrics)
   → `STRATEGY.md`. Update via `/harness:strategy` (interview-driven).

3. **Is it a per-feature design decision?** (component shape, API contract, schema)
   → Neither. Write a spec in `docs/changes/<feature>/proposal.md`, then an ADR in `docs/knowledge/decisions/`.

The simple test: **if someone reads it three months from now and the words still apply, it belongs in `STRATEGY.md`.** If it would already be stale by the next phase, it belongs in `docs/roadmap.md`.

## What `STRATEGY.md` carries

Five required H2 sections (validated by `StrategyDocSchema`):

- **Target problem** — A concrete diagnosis of what is broken in the world. Not a goal ("grow X"), not a feature list ("add A, B, C"), not fluff ("be the best at Y").
- **Our approach** — The distinctive bet on how to solve the problem. Why this approach, not the obvious ones?
- **Who it's for** — A specific persona, narrow enough to disqualify the wrong users. "Developers" is too broad; "senior engineers maintaining long-lived TypeScript monorepos" is the right altitude.
- **Key metrics** — How we measure whether the bet is paying off. Two or three metrics that are actually measurable, not aspirational.
- **Tracks** — One-sentence current investment per track of work. Tracks are the broad categories of effort; the roadmap holds the per-phase steps within each track.

Three optional H2 sections: `Milestones`, `Not working on`, `Marketing`.

### Good and bad answers (Target problem)

- **Bad (goal):** "Grow our DAU by 20% in 2026." — That is a goal. Strategy answers what bet produces the outcome.
- **Bad (feature list):** "Add SSO, audit logs, and SCIM." — That is a backlog. Strategy answers why those, in that order, instead of others.
- **Bad (fluff):** "Be the best context system for AI agents." — Unfalsifiable. Strategy answers what specifically is broken today.
- **Good:** "Engineering teams accumulate undocumented constraints faster than they can write specs. The result is rework, drift, and onboarding that takes months." — Concrete diagnosis a reader can argue with.

## What `docs/roadmap.md` carries

- Features grouped by milestone with statuses (`backlog`, `planned`, `in-progress`, `done`, `blocked`).
- Per-feature fields: priority (P0–P3), assignee, source spec link, dependencies, completion percent.
- Assignment history (auto-appended by `harness-roadmap-pilot`).
- External tracker sync state (when `roadmap.tracker` is configured).

Roadmap items reference strategy tracks by name in their `track` field. `harness-roadmap-pilot` uses that field to compute strategy-alignment as a tiebreaker bonus during recommendation.

## How downstream skills use each

| Skill                        | Reads `STRATEGY.md`                                      | Reads `docs/roadmap.md`                     |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `harness-strategy`           | Authoritative read/write                                 | No                                          |
| `harness-ideate`             | Phase 1 focus context; strategy-alignment tiebreaker     | No                                          |
| `harness-brainstorming`      | Phase 1 EXPLORE step 0a; cites in spec evidence          | No                                          |
| `harness-roadmap-pilot`      | Phase 2 RECOMMEND step 1a; strategy-alignment tiebreaker | Authoritative read/write                    |
| `harness-knowledge-pipeline` | Via `BusinessKnowledgeIngestor.ingestStrategy()`         | No (roadmap is not ingested as graph nodes) |

## Soft-fail semantics

Every downstream consumer treats `STRATEGY.md` as optional. Projects that genuinely do not need a strategy doc (CLI utilities, libraries, throwaway experiments) can decline the init prompt — `init.strategy.declined: true` is recorded in `.harness/state.json` and the user is not re-prompted. Skills that read the file continue to work; they just skip the grounding step.

`docs/roadmap.md` is also optional (file-less mode pushes the roadmap into GitHub Issues — see ADRs 0008–0010), but `harness-roadmap-pilot` requires _one_ of the two roadmap modes to be active.

## Authoring rules

- **`STRATEGY.md` is interview-driven.** Run `/harness:strategy` and answer the questions section-by-section. The skill pushes back on fluff, goals, and feature lists, capped at 2 rounds per section. Do not bypass the interview by editing the file directly — `harness validate` rejects empty sections and unmodified `<placeholder>` markers.
- **`docs/roadmap.md` is tool-driven.** Use `manage_roadmap` MCP operations or `harness-roadmap-pilot` for assignment. Manual edits are preserved (human-always-wins rule), but tool-driven edits are how the file stays consistent with `harness.config.json#roadmap.tracker`.
- **Cross-references go one way.** Roadmap items may reference strategy tracks by name. Strategy never references specific roadmap items — strategy outlives any one item.
