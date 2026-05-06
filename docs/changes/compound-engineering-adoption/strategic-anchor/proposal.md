# Strategic Anchor: STRATEGY.md and Pre-Brainstorm Ideation

> Add a durable upstream product anchor (`STRATEGY.md`) and a pre-brainstorm ideation phase. Closes the "what should we even be working on, and why?" gap above the existing brainstorm → plan → execute pipeline.

**Date:** 2026-05-05
**Status:** Proposed
**Keywords:** strategy-anchor, ideation, grounding, project-init, roadmap-pilot

## Overview

Harness's existing pipeline starts at brainstorming, which assumes a feature has already been identified. There is no:

- Durable anchor describing _what the product is_ (target problem, persona, metrics, tracks of work) that downstream skills can read as grounding
- Phase that generates and critiques _candidate ideas_ before one is selected for brainstorming

`harness-roadmap.md` serves a tactical role (phase tracking, blockers, assignees) and is unsuitable as a strategic anchor — its lifecycle is per-phase, not per-product.

This spec adds:

1. `STRATEGY.md` — a short, durable anchor file at repo root, peer of `README.md`
2. `harness-strategy` skill — first-run interview and update flow for `STRATEGY.md`
3. `harness-ideate` skill — generates and ranks candidate ideas, writes to `docs/ideation/`
4. Wiring of both into `initialize-harness-project`, `harness-brainstorming`, and `harness-roadmap-pilot` as grounding sources

### Goals

1. Provide a durable strategic anchor that survives across milestones and phases
2. Make brainstorm/ideate/roadmap-pilot ground in product-level context, not just code-level context
3. Establish the anchor as part of project initialization for new harness projects, while remaining adoptable mid-project
4. Keep the artifact small and high-signal — resist creeping section growth

### Non-Goals

- Replacing or competing with `docs/roadmap.md` (which remains tactical phase tracking)
- Building strategy-doc staleness detection (deferred — see INDEX YAGNI cuts)
- Generating strategy from code or commit history (interview-driven only)
- Producing requirements, plans, or code — `harness-ideate` produces ranked ideation only, not specs

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Rationale                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `STRATEGY.md` lives at repo root (peer of `README.md`)                                                                                                                                                                                                                                                                                                                                                                                                   | Discovery — agents and humans both find it without digging; signals product-level scope vs. tactical `docs/` content                    |
| 2   | Schema: YAML frontmatter (`name`, `last_updated`, `version`) + sections (`Target problem`, `Our approach`, `Who it's for`, `Key metrics`, `Tracks`; optional `Milestones`, `Not working on`, `Marketing`). Schema validation requires each required section to contain ≥1 non-whitespace sentence and to NOT contain unmodified template placeholder text (e.g., `<2-4 sentences. ...>` markers). Empty bodies and unfilled placeholders fail validation | Borrows CE's structure (informed by Rumelt's _Good Strategy Bad Strategy_); placeholder-rejection prevents header-only "completed" docs |
| 3   | `harness-strategy` is a standalone skill; `initialize-harness-project` Phase 3 invokes it on opt-in (3-way yes/no/later). On "no" the decline is recorded as `init.strategy.declined: true` in `.harness/state.json`. On "later" no state is written and the user can run `/harness:strategy` standalone                                                                                                                                                 | Init scaffolds; standalone skill updates. Decline location is explicit so re-running init can detect prior decline                      |
| 4   | Strategy interview enforces pushback — 2 rounds max per section, anti-patterns flagged (fluff, goals-as-strategy, feature-list-as-strategy)                                                                                                                                                                                                                                                                                                              | The value of the doc comes from the questions, not the headings; passive transcription produces bad strategy                            |
| 5   | `harness-ideate` writes ranked artifacts to `docs/ideation/<topic>-YYYY-MM-DD.md`; explicitly does NOT produce specs/plans/code                                                                                                                                                                                                                                                                                                                          | Clear separation from brainstorm (which DOES produce a spec). Ideation outputs feed brainstorm as inputs                                |
| 6   | Brainstorming and ideate read `STRATEGY.md` as grounding when present; soft-fail when absent (do not block)                                                                                                                                                                                                                                                                                                                                              | Backwards-compatible adoption; existing projects keep working                                                                           |
| 7   | `harness-roadmap-pilot` reads `STRATEGY.md` (when present) before "select next highest-impact item" — strategy-aligned items rank higher                                                                                                                                                                                                                                                                                                                 | Closes the loop: strategy informs prioritization, not just brainstorming                                                                |
| 8   | Strategy is not auto-generated from any source                                                                                                                                                                                                                                                                                                                                                                                                           | Strategy is a human commitment, not a derived artifact. AI helps the interview; humans own the answers                                  |

## Technical Design

### `STRATEGY.md` file shape

```markdown
---
name: <product name>
last_updated: 2026-05-05
version: 1
---

# <product name> Strategy

## Target problem

<2-4 sentences. What specifically is broken in the world that this product addresses?>

## Our approach

<2-4 sentences. What is our distinctive bet on how to solve it?>

## Who it's for

<2-4 sentences. Specific persona, not "developers" generically.>

## Key metrics

- <metric 1>: <how it's measured, where it lives>
- <metric 2>: ...

## Tracks

- <track name>: <one-sentence current investment>

## Milestones (optional)

## Not working on (optional)

## Marketing (optional)
```

Schema validation lives in `packages/core/src/strategy/` with a Zod schema; `harness validate` checks shape when the file exists.

### `harness-strategy` skill structure

Phases:

- **Phase 0**: Route by file state (file exists → update path; doesn't exist → first-run interview)
- **Phase 1**: First-run interview (sections 1–5 required, 6–8 optional). Each section opens with one focused question, applies pushback rules from `references/interview.md`, captures the user's answer in their own language. Max 2 rounds of pushback per section
- **Phase 2**: Update run. Re-read existing file, surface 3–5 line summary of current state, ask which section to revisit, re-interview with pushback (no rubber-stamping)
- **Phase 3**: Downstream handoff — note which downstream skills will pick up the file as grounding

Pushback rules (from `references/interview.md`, adapted from CE):

- **Fluff detection**: Reject answers like "be the best at X" — push for a concrete diagnosis
- **Goal-as-strategy**: Reject "increase revenue by 20%" as a strategy answer — that's a goal; ask what the bet IS that produces it
- **Feature-list-as-strategy**: Reject "add features A, B, C" — push for the underlying coherent action

### `harness-ideate` skill structure

Phases:

- **Phase 1**: Read `STRATEGY.md` if present (grounding). Read user's argument as focus hint
- **Phase 2**: Generate N candidate ideas (N from argument, default 10). Each idea has: one-sentence premise, target persona segment, complexity estimate (low/medium/high), key risk, **impact** estimate (low/medium/high), **confidence** estimate (low/medium/high), **effort** estimate (low/medium/high)
- **Phase 3**: Critique pass — for each idea, identify the strongest objection. User picks which objections to answer
- **Phase 4**: Rank by `(impact × confidence) ÷ effort` using a 1/2/3 numeric mapping for low/medium/high. Strategy-alignment provides a tiebreaker bonus when strategy is present
- **Phase 5**: Write `docs/ideation/<slug>-YYYY-MM-DD.md`, where `<slug>` is the kebab-case slug of the focus argument (truncated to 30 chars, with a 6-char hash suffix appended on collision against an existing same-day file)

### Init wiring

Add a new step to `initialize-harness-project` Phase 3 (CONFIGURE), peer to existing i18n and design-system steps:

```typescript
// pseudo-code
emit_interaction({
  type: 'question',
  question: {
    text: 'Capture strategic anchor (STRATEGY.md) now?',
    options: [
      { label: 'Yes — run strategy interview', risk: 'low', effort: 'medium' },
      { label: 'No — this project does not need a strategy doc', risk: 'low', effort: 'low' },
      { label: 'Not sure yet', risk: 'low', effort: 'low' },
    ],
    recommendation: {
      optionIndex: 0,
      reason: 'Strategy grounds brainstorm/ideate/roadmap-pilot',
      confidence: 'medium',
    },
  },
});
```

On "yes" → delegate to `harness-strategy`. On "no" → record explicit decline. On "later" → no-op; user can run `/harness:strategy` standalone.

### Brainstorming integration

In `harness-brainstorming` Phase 1 EXPLORE, add a step:

```
0a. Read STRATEGY.md if present at repo root. Treat it as grounding context
    alongside gather_context outputs. If absent, skip silently.
```

If strategy contradicts the user's feature description, surface that explicitly during EVALUATE rather than auto-resolving.

### Roadmap-pilot integration

In `harness-roadmap-pilot` "select next highest-impact item" phase, add:

```
- Read STRATEGY.md if present
- For each candidate roadmap item, score strategy-alignment (does it serve the
  target problem / advance a current track?)
- Use strategy-alignment as a tiebreaker bonus (not a hard filter) when items
  score similarly on impact × confidence ÷ effort
```

## Integration Points

### Entry Points

- New slash command: `/harness:strategy` (run interview / update STRATEGY.md)
- New slash command: `/harness:ideate` (generate ranked candidate ideas)

### Registrations Required

- Add `harness-strategy` and `harness-ideate` to skill barrel exports
- Re-run slash-command generator (`packages/cli/src/commands/generate-slash-commands.ts`); regenerate `docs/reference/cli-commands.md`
- Add roadmap entries via `manage_roadmap`
- Both skills must be discoverable to `dispatch_skills` and `recommend_skills`
- Register `STRATEGY.md` schema with the validator entry-point in `packages/cli/src/commands/validate.ts`

### Documentation Updates

- `AGENTS.md` — new "Strategic Anchor" section explaining `STRATEGY.md` and how agents should read it
- `harness-brainstorming` SKILL.md — Phase 1 EXPLORE step 0a (read STRATEGY.md)
- `harness-roadmap-pilot` SKILL.md — strategy-alignment tiebreaker
- `initialize-harness-project` SKILL.md — Phase 3 strategy step
- `docs/conventions/` — add convention doc on `STRATEGY.md` vs `roadmap.md` separation

### Architectural Decisions

- **ADR-1**: STRATEGY.md vs roadmap.md separation of concerns (strategic anchor vs tactical phase tracker)
- **ADR-2**: Strategy is interview-driven, never auto-generated

### Knowledge Impact

- New `business_fact` knowledge domain: `strategy` (target problem, persona, metrics, tracks)
- `BusinessKnowledgeIngestor` learns to consume `STRATEGY.md` as a source

## Success Criteria

1. A user can run `/harness:strategy` on a fresh project and produce a `STRATEGY.md` ≤ 100 lines that passes schema validation
2. Re-running `/harness:strategy` on a project with existing STRATEGY.md updates only the section the user selects, preserving others verbatim
3. `harness-brainstorming` reads STRATEGY.md when present and cites it as grounding evidence in the spec output's `[evidence]` section
4. `harness-brainstorming` succeeds with no degradation when STRATEGY.md is absent
5. `harness-ideate` produces a ranked ideation artifact distinct from a brainstorm spec (no overlap of section structure or location)
6. `initialize-harness-project` includes the strategy step in Phase 3 and respects yes/no/later semantics
7. `harness-roadmap-pilot` cites strategy-alignment in its prioritization rationale when STRATEGY.md is present
8. Pushback rules fire on at least one canonical anti-pattern ("we want to be the best at X") in test fixtures
9. `harness validate` passes on a project containing a valid STRATEGY.md
10. A STRATEGY.md with required sections present but containing only template placeholder text (e.g., the `<2-4 sentences. ...>` markers verbatim) FAILS validation
11. `BusinessKnowledgeIngestor` produces at least one `business_fact` node from a sample STRATEGY.md (verified via integration test)

## Implementation Order

### Phase 1: STRATEGY.md Schema

<!-- complexity: low -->

Define `STRATEGY.md` Zod schema in `packages/core/src/strategy/` covering YAML frontmatter (`name`, `last_updated`, `version`) and the section-body shape (required sections must contain ≥1 non-whitespace sentence and must not be unmodified template placeholder text). Export types via `@harness-engineering/types`. Wire schema validation into the validator entry-point in `packages/cli/src/commands/validate.ts`. Roundtrip tests including placeholder-rejection fixtures.

### Phase 2: harness-strategy Skill

<!-- complexity: medium -->

Implement `harness-strategy` skill with first-run interview, update flow (Phase 0 routing by file state), and pushback rules in `references/interview.md`. Pushback rules: fluff detection, goal-as-strategy rejection, feature-list-as-strategy rejection. Cap at 2 rounds per section. Integration tests with at least 3 anti-pattern fixtures.

### Phase 3: Init Wiring

<!-- complexity: low -->

Extend `initialize-harness-project` Phase 3 (CONFIGURE) with the strategy step (3-way yes/no/later question, peer to existing i18n and design-system steps). On "yes" delegate to `harness-strategy`. On "no" record `init.strategy.declined: true` in `.harness/state.json`. On "later" no state write. Handle present-but-invalid existing STRATEGY.md case with three user paths (fix / move-to-bak / ignore).

### Phase 4: harness-ideate Skill

<!-- complexity: medium -->

Implement `harness-ideate` skill: candidate generation with per-idea fields (premise, persona, complexity, key risk, impact, confidence, effort), critique pass, ranking by `(impact × confidence) ÷ effort` with strategy-alignment tiebreaker. Write output to `docs/ideation/<slug>-YYYY-MM-DD.md` (slug = kebab-case of focus argument, ≤30 chars, 6-char hash suffix on collision). Integration test producing a ranked artifact.

### Phase 5: Brainstorming Integration

<!-- complexity: low -->

Update `harness-brainstorming` Phase 1 EXPLORE to read `STRATEGY.md` if present at repo root. Cite as grounding evidence in spec output's `evidence` section when present. Soft-fail when absent (no skill blocks). Surface contradictions explicitly during EVALUATE rather than auto-resolving.

### Phase 6: Roadmap-pilot Integration

<!-- complexity: low -->

Update `harness-roadmap-pilot` Phase 2 RECOMMEND to read `STRATEGY.md` (when present) and apply strategy-alignment as a tiebreaker bonus when items score similarly on impact × confidence ÷ effort. Cite strategy-alignment in recommendation rationale.

### Phase 7: Knowledge Graph Integration

<!-- complexity: medium -->

Register `strategy` `business_fact` knowledge domain. `BusinessKnowledgeIngestor` (in `packages/graph/src/ingest/`) imports strategy schema types from `@harness-engineering/types` (which re-exports the Zod-derived types from `packages/core/src/strategy/`). Respects existing layer boundary (graph → types only). Integration test asserts at least one `business_fact` node is produced from a sample STRATEGY.md.

### Phase 8: Documentation and ADRs

<!-- complexity: low -->

Write 2 ADRs (STRATEGY.md vs roadmap.md separation; strategy-is-interview-driven). Update AGENTS.md with new "Strategic Anchor" section. Write conventions doc on STRATEGY.md vs roadmap.md. Update `harness-brainstorming` and `harness-roadmap-pilot` SKILL.md with the new grounding behavior. Update `initialize-harness-project` SKILL.md with the new Phase 3 step.

## Risks and Mitigations

- **Risk:** STRATEGY.md becomes a checkbox doc nobody reads → **Mitigation:** Brainstorm/ideate/roadmap-pilot cite it in evidence; staleness becomes visible through downstream skill output, not through standalone monitoring. The placeholder-rejection rule (Decision 2) prevents header-only docs from passing
- **Risk:** Pushback feels adversarial → **Mitigation:** Cap at 2 rounds per section; explicit "captured what you gave; flagged for revisit" exit. No disable flag — the cap is the disable mechanism
- **Risk:** Section sprawl ("we also need a section on...") → **Mitigation:** Schema validation rejects unknown sections; expansion requires a separate ADR
- **Risk:** Existing projects with no STRATEGY.md are pestered → **Mitigation:** Soft-fail throughout; init step is opt-in; no skill blocks on absence
- **Risk:** Hard-fail on present-but-invalid STRATEGY.md mid-init blocks scaffolding → **Mitigation:** When init detects invalid existing STRATEGY.md, it surfaces the validation error and offers three paths: (a) fix now via `/harness:strategy` update, (b) move file to `STRATEGY.md.bak` and run first-run interview fresh, (c) ignore for this init and proceed (decline recorded). Init does NOT block
