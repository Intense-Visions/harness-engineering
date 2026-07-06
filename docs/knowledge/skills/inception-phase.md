---
type: business_process
domain: skills
tags:
  [inception, product-advisor, BRD, requirements, gap-analysis, roadmap-fan-out, upstream-grounding]
---

# Client-Inception Phase

The inception phase is the pre-`STRATEGY.md` stage of the harness lifecycle, where a
solution architect / pre-sales engineer turns a client's rough idea — a diagram plus
conversation notes — into structured, machine-usable requirements. It is owned by the
`product-advisor` skill and sits upstream of every other harness workflow.

## Position in the lifecycle

```
[client idea + diagram + notes]
        │
        ▼
  product-advisor        ← inception phase (this document)
        │  BRD + gap-list
        ├──▶ /harness:strategy   (optional: seed engagement STRATEGY.md)
        └──▶ roadmap (N backlog items)
                 │
                 ▼
   roadmap-pilot → brainstorming → spec → plan → execute   ← unchanged
```

Inception produces requirements; it never produces a spec or code. Its value is that the
artifacts it emits are consumed directly by the existing pipeline instead of being
re-authored by hand.

## Artifacts

- `docs/inception/<engagement>/brd.md` — the Business Requirements Document, in a
  client-legible register. Fixed sections: Context, Business Objectives, Scope,
  Functional Requirements (EARS-phrased where behavioral), Non-Functional Requirements,
  Assumptions, Constraints, Out-of-Scope, Open Questions.
- `docs/inception/<engagement>/gaps.md` — the gap-list, split into **Resolved** (with the
  captured answer) and **Open / chase-with-client** (each phrased as a question to ask
  the client).

## Gap model

Gaps are detected against a fixed **BRD completeness rubric** — each section non-empty and
consistent, every diagram entity/flow mapped to a requirement or a gap, every functional
requirement carrying actor + trigger + response, every NFR measurable. Detected gaps drive
a one-question-at-a-time interview with the solution architect; each answer folds back into
the BRD. Unresolvable gaps ship as explicit client-facing questions. No gap is ever silently
dropped (the skill's Iron Law).

## Handoff contract

The BRD-to-pipeline handoff is one-to-many, seeded through the roadmap (see decision
0053). `finalize` fans the BRD scope into N candidate roadmap items — each backreferenced
to the BRD section that justified it — written at `status: backlog` under the
`Inception: <engagement>` milestone. Each item then enters the existing pipeline
independently.

## Boundaries

- `product-advisor` **reads but never writes** `STRATEGY.md`; it offers to seed strategy
  via `harness-strategy`.
- `product-advisor` **never authors a spec**; spec authorship stays with
  `harness-brainstorming`.
- Diagram ingestion **reuses** the v4.0 Business Knowledge System diagram/vision path; it
  soft-degrades to notes-only intake (recording a gap) when parsing is unavailable.

See decisions 0052 (upstream front-door positioning) and 0053 (one-to-many fan-out).
