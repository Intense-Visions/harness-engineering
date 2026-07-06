---
title: Product Advisor — Upstream Client-Inception Skill
feature: product-advisor
status: proposed
created: 2026-07-01
keywords:
  - product-advisor
  - BRD
  - requirements-elicitation
  - gap-analysis
  - diagram-ingestion
  - roadmap-decomposition
  - pre-inception
  - solution-architect
  - configuration-interviewer
---

# Product Advisor — Upstream Client-Inception Skill

## Overview

`product-advisor` is the harness front door for the **client-inception phase** of the
SDLC — the stage, upstream of `STRATEGY.md` and `brainstorming`, where a solution
architect / pre-sales engineer turns a rough client idea (a diagram plus conversation
notes) into structured, machine-usable requirements.

It ingests a diagram and client conversation notes, drafts a Business Requirements
Document (BRD) in client-legible language, then uses the **detected gaps to drive a
targeted interview** with the SA — resolving what it can and shipping the rest as an
explicit "chase-with-client" list. On finalize it offers to seed the engagement's
`STRATEGY.md` and **fans the BRD out into multiple candidate roadmap items**, after
which each item flows through the existing
`roadmap-pilot → brainstorming → spec → plan → execute` pipeline unchanged.

This realizes the originating need — _"take in a diagram and spit out a BRD and a list
of missing information"_ and _"start on a project at its inception with the client,
gather the requirement using AI … then feed those in … and have everything continue as
it does today."_

## Goals

1. **Collapse SA effort at inception** — a diagram + notes become a structured BRD +
   gap-list in one guided session instead of hand-authored documents.
2. **Make inception artifacts machine-usable downstream** — the BRD grounds
   `STRATEGY.md` and seeds the roadmap, so nothing is re-keyed to enter the pipeline.
3. **Turn "missing information" into resolved information** — gaps drive an interview
   rather than sitting as a static list; unresolved gaps ship as explicit client
   questions.
4. **Reuse, don't reinvent** — ride the existing business-knowledge diagram/vision
   ingestion, `read_strategy`, and `manage_roadmap` plumbing.

## Non-Goals (YAGNI)

- **No new "inception track" or sibling skills.** One skill; a formal inception track is
  deferred until a second inception skill is justified.
- **No new diagram-ingestion engine.** Reuse the v4.0 Business Knowledge System parser
  (Mermaid/D2/PlantUML) and vision analysis of image attachments.
- **No jump straight to a spec.** `product-advisor` seeds roadmap items; it does not
  author `proposal.md` specs — that remains `brainstorming`'s job.
- **No direct writes to `STRATEGY.md`.** It _offers_ to seed via `/harness:strategy`;
  this skill only reads strategy.
- **The `STRATEGY.md` secondary-persona amendment is a prerequisite, tracked
  separately** — not built by this skill.

## Decisions Made

| #   | Decision                                                                                                                   | Rationale                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Upstream extension of harness**, not a separate product or new track                                                     | Max reuse of diagram ingestion, `read_strategy`, `manage_roadmap`; coherent with the "humans own the thinking layer" thesis.                        |
| D2  | **Operator is the solution-architect / pre-sales engineer**; BRD in business-language register                             | Matches the genesis intent ("technical people who support sales"). Requires a `STRATEGY.md` secondary-persona amendment, tracked as a prerequisite. |
| D3  | **Hybrid interaction**: `ingest → draft-brd → gap-interview → finalize`; `configuration-interviewer` cognitive mode        | Honors both "spit out a BRD" (batch) and "gather requirements using AI" (interactive). Gaps _drive_ the interview instead of being a dead-end list. |
| D4  | **One-to-many roadmap-seeding handoff**: finalize fans the BRD into N candidate roadmap rows + offers a `STRATEGY.md` seed | A BRD describes a solution scope, not one spec. Each row flows through the existing pipeline unchanged.                                             |
| D5  | **Single skill owns the fan-out**, designed so it can later extract into a composed `ideate` step                          | Ships the front door fastest; YAGNI on an orchestrator; keeps the deferred-track decision intact.                                                   |
| D6  | **Reuse the v4.0 business-knowledge diagram/vision ingestion**; no new parser                                              | Diagram-as-code (Mermaid/D2/PlantUML) + vision analysis already shipped.                                                                            |
| D7  | **`product-advisor` reads but never writes `STRATEGY.md`**                                                                 | Mirrors the brainstorming/strategy boundary — `/harness:strategy` owns the write.                                                                   |
| D8  | **Rigid skill type, tier 1**                                                                                               | Deterministic phases with a required interview gate; foundational upstream position mirrors `strategy`/`ideate`.                                    |

## Technical Design

### Skill definition

- **Location:** `agents/skills/claude-code/product-advisor/{skill.yaml, SKILL.md}`
  (+ platform mirrors: `gemini-cli`, `cursor`, `codex`).
- **`skill.yaml`:** `name: product-advisor`, `cognitive_mode: configuration-interviewer`,
  `type: rigid`, `tier: 1`, `command_name: product-advisor`,
  `depends_on: [harness-strategy, harness-brainstorming]`, phases below.
- **Discovery:** auto-indexed (no manual registry edit); `harness generate-slash-commands`
  regenerates command files.

### Phases

| Phase           | Does                                                                                                                                                                              | Reuses                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ingest`        | Load diagram(s) + client conversation notes; normalize into a structured intake object                                                                                            | business-knowledge diagram/vision ingestion; `gather_context` |
| `draft-brd`     | Synthesize a first BRD from intake, tagging every under-specified area as a gap                                                                                                   | `configuration-interviewer` synthesis                         |
| `gap-interview` | Walk the SA through the gap queue one question at a time (plain-text tables, à la `strategy`/`brainstorming`); fold answers back into the BRD; mark unresolved gaps client-facing | interview UX pattern from `harness-strategy`                  |
| `finalize`      | Write BRD + gap-list; offer `STRATEGY.md` seed; fan out into candidate roadmap rows; emit handoff                                                                                 | `read_strategy`, `manage_roadmap`, `emit_interaction`         |

### Artifacts (on disk)

- `docs/inception/<engagement>/brd.md` — client-legible BRD. Sections: _Context,
  Business Objectives, Scope, Functional Requirements (EARS-phrased where behavioral),
  Non-Functional Requirements, Assumptions, Constraints, Out-of-Scope, Open Questions._
- `docs/inception/<engagement>/gaps.md` — gap-list split into **Resolved** (with the
  captured answer) and **Open / chase-with-client** (phrased as questions to ask).
- Roadmap rows via `manage_roadmap add` (status `backlog`, milestone
  `Inception: <engagement>`), each linking back to the BRD section that spawned it.

### Data shapes (conceptual)

- **Intake:** `{ diagrams: ParsedDiagram[], notes: string, entities: string[], flows: string[] }`
- **Gap:** `{ id, brdSection, question, severity: blocker|important|nice, status: open|resolved, answer? }`
- **BRD requirement:** `{ id, section, statement, earsPattern?, source: diagram|notes|interview, confidence }`
- **RoadmapCandidate:** `{ title, summary, brdRefs: string[], rationale }`

### Completeness model (how gaps are found)

Gaps are detected against a fixed **BRD completeness rubric**, keeping detection
deterministic rather than open-ended:

- Each BRD section must be non-empty and internally consistent.
- Every diagram entity/flow must map to ≥1 requirement.
- Every functional requirement must have an actor + trigger + response.

A rubric miss produces a gap.

### Diagram-ingestion boundary

`ingest` calls the existing business-knowledge ingestion path. If vision/diagram parsing
is unavailable in the environment, it **soft-degrades to notes-only intake** and records
a gap (`"diagram not machine-read; confirm entities manually"`) rather than failing.

### Requirement phrasing

Functional requirements with behavioral expectations use EARS patterns
(event-driven: "When [trigger], the system shall [response]"; unwanted:
"If [condition], then the system shall not [behavior]"), consistent with
`harness-planning`.

## Integration Points

### Entry Points

- New skill `product-advisor` → new slash command `/harness:product-advisor`
  (all four platforms).
- No new MCP tool — composes existing `read_strategy`, `gather_context`,
  `manage_roadmap`, `emit_interaction`, and the business-knowledge ingestion path.

### Registrations Required

- Create the skill directory + `skill.yaml`/`SKILL.md`; run
  `harness generate-slash-commands`.
- Regenerate the auto-generated Skills Catalog doc.
- Tier assignment (`tier: 1`) in `skill.yaml`.

### Documentation Updates

- AGENTS.md / skills catalog: add `product-advisor` under an "inception / upstream"
  grouping.
- A short "Inception phase" note in the workflow docs showing placement
  (`product-advisor → strategy/roadmap → brainstorming → …`).

### Architectural Decisions

- **D1 (upstream extension positioning)** warrants a standalone ADR: it establishes a
  new lifecycle entry point and a new artifact class (BRD) under `docs/inception/` that
  future inception skills would build on.
- **D4 (one-to-many BRD→roadmap handoff)** warrants a standalone ADR: it defines the
  fan-out contract between an inception artifact and the roadmap — a reusable
  integration pattern.
- D2/D3/D5–D8 are skill-local decisions captured in the **Decisions Made** section; they
  do not rise to standalone ADRs.

### Knowledge Impact

- New domain concepts for the graph: _BRD_, _inception phase_, _requirements gap_,
  _solution-architect persona_, _BRD→roadmap fan-out_.
- A `docs/knowledge/` entry documenting the inception phase and its handoff contract.

## Success Criteria

1. Running `/harness:product-advisor` with a diagram + notes produces
   `docs/inception/<engagement>/brd.md` containing all required sections, none empty.
2. Every diagram entity/flow maps to ≥1 BRD requirement, or to an explicit gap.
3. `gaps.md` exists and separates **Resolved** from **Open/client-facing**; every open
   gap is phrased as a question.
4. The gap-interview asks questions one at a time and folds each answer into the BRD
   (resolved gaps move Open → Resolved).
5. `finalize` creates ≥1 candidate roadmap row via `manage_roadmap`, each linking back to
   a BRD section.
6. `finalize` offers a `STRATEGY.md` seed via `/harness:strategy` and never writes
   `STRATEGY.md` directly.
7. Functional requirements with behavioral expectations use EARS phrasing.
8. When diagram parsing is unavailable, the skill degrades to notes-only and records the
   degradation as a gap rather than failing.
9. `harness validate` passes; the skill is discoverable via `search_skills`.

## Implementation Order

1. **Skill scaffold** — `skill.yaml` + `SKILL.md` (phases, gates, cognitive mode,
   rationalizations-to-reject); wire slash-command generation across platforms.
2. **Ingest + BRD-draft** — intake normalization, reuse of diagram/vision ingestion, BRD
   synthesis against the completeness rubric with gap tagging.
3. **Gap-interview loop** — one-question-at-a-time interview driven by the gap queue;
   answer fold-back; resolved/open bookkeeping.
4. **Finalize + handoff** — write BRD + gaps; `STRATEGY.md` seed offer; `manage_roadmap`
   fan-out with backrefs; `emit_interaction` transition to the roadmap/brainstorming flow.
5. **Docs + knowledge** — ADRs for D1 & D4; `docs/knowledge/` inception entry;
   catalog/AGENTS.md updates.
6. **Prerequisite (tracked separately)** — `STRATEGY.md` secondary-persona amendment via
   `/harness:strategy`.
