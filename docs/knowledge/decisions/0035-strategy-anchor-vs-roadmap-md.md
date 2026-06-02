---
number: 0035
title: STRATEGY.md vs roadmap.md separation of concerns
date: 2026-06-02
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/strategic-anchor/proposal.md
---

## Context

Harness shipped the Strategic Anchor system in phases 1–7: a repo-root `STRATEGY.md` anchor, `harness-strategy` interview skill, `harness-ideate` ranked-ideation skill, init wiring, brainstorming/roadmap-pilot grounding, and a `business_fact`-domain ingestor. Two adjacent artifacts now coexist:

- `STRATEGY.md` — durable product-level anchor (target problem, persona, key metrics, tracks of work).
- `harness-roadmap.md` / `docs/roadmap.md` — tactical phase tracker (status, owners, blockers, per-phase notes).

Without an explicit boundary, downstream skills and humans drift between them — e.g. embedding milestone updates in `STRATEGY.md`, or asking `roadmap.md` to justify _why_ a track exists. The boundary needs to be load-bearing because both files feed downstream skills as grounding (`harness-brainstorming` reads strategy; `harness-roadmap-pilot` reads both).

## Decision

The two artifacts have **distinct lifecycles, scopes, and update cadences**:

| Axis             | `STRATEGY.md`                                       | `roadmap.md` / `harness-roadmap.md`                                    |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Scope            | Product-level (what the product is, who it's for)   | Phase-level (what is being built, by whom, when)                       |
| Lifecycle        | Per-product — survives across all milestones        | Per-phase — items added/closed as work moves                           |
| Update cadence   | Rare (quarters/years), via `harness-strategy` skill | Frequent (days/weeks), via `harness-roadmap-pilot` / `manage_roadmap`  |
| Authoring        | Interview-driven, schema-validated                  | Mechanical from spec + execution state                                 |
| Schema authority | `packages/core/src/strategy/schema.ts` (Zod)        | `packages/cli/src/commands/manage-roadmap.ts` + roadmap-tracker schema |
| Discovery        | Repo root (peer of `README.md`)                     | `docs/` or `harness-roadmap.md`                                        |

Downstream consumers ground on each separately:

- `harness-brainstorming` Phase 1 EXPLORE — reads STRATEGY.md only (strategic context for new specs).
- `harness-roadmap-pilot` Phase 2 RECOMMEND — reads both; strategy-alignment is a tiebreaker bonus on top of roadmap-tracker impact × confidence ÷ effort.
- `BusinessKnowledgeIngestor.ingestStrategy` — emits `business_fact` nodes from STRATEGY.md sections; the roadmap is **not** ingested.

Editing one for the other's purpose is the canonical anti-pattern. Examples that belong in STRATEGY.md but commonly leak into roadmaps: "we exist because…", "our distinctive bet is…". Examples that belong in roadmap.md but commonly leak into strategy: "Q3 milestones", "current blocker on track X" (the optional `Milestones` section in STRATEGY.md is for product-level anchors like "v2 GA", not phase tracking).

## Consequences

**Positive:**

- Downstream skills can read the right grounding artifact without conflating concerns.
- Strategy stays small and high-signal — the schema validator's placeholder-rejection rule (`packages/core/src/strategy/schema.ts`) prevents header-only padding.
- Roadmap stays mechanical — owners, statuses, and blockers come from execution state, not strategic prose.
- `BusinessKnowledgeIngestor` ingests strategy sections as `business_fact` nodes without ever touching the roadmap, so graph queries can filter by `metadata.domain === 'strategy'` cleanly.

**Negative:**

- Authors must pick the right home for a fact at write time. The conventions doc (`docs/conventions/strategy-vs-roadmap.md`) carries that load with worked examples.
- Maintaining two files is more discipline than maintaining one; mitigated by the rare-update cadence of STRATEGY.md.

**Neutral:**

- The boundary is documentary, not enforced by a linter today. The schema-validator's placeholder-rejection and section-allowlist catches the most common drift (sections that don't belong); section-name sprawl is rejected automatically.

## Alternatives considered

- **Fold strategy sections into `roadmap.md` as a preamble.** Rejected — different lifecycles, different audiences. The roadmap's frequent edits would force strategy sections to be re-touched on every phase change, eroding the durability that makes the anchor useful.
- **Auto-derive strategy from the roadmap.** Rejected — strategy is a forward-looking commitment, not a summary of recent work. ADR-0036 codifies the interview-only stance.
- **Generate `roadmap.md` from STRATEGY.md tracks.** Rejected — strategy tracks are coarse-grained ("Anchor adoption"); roadmap items are fine-grained phases. The mapping is many-to-many and humans make it.

## Implementation

- `STRATEGY.md` schema lives in `packages/core/src/strategy/schema.ts`; runtime validator hooked into `harness validate` via `packages/cli/src/commands/validate.ts`.
- `BusinessKnowledgeIngestor.ingestStrategy` (`packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`) emits `bk:strategy:<section-slug>` nodes with `metadata.domain === 'strategy'`.
- `KnowledgePipelineRunner.extract` invokes `ingestStrategy(<projectDir>/STRATEGY.md)` alongside the existing business-knowledge and solutions ingestors; missing file is soft-failed.
- `harness-brainstorming` Phase 1 EXPLORE and `harness-roadmap-pilot` Phase 2 RECOMMEND already cite STRATEGY.md when present (shipped in phases 5 and 6).
- Convention doc: `docs/conventions/strategy-vs-roadmap.md`.
