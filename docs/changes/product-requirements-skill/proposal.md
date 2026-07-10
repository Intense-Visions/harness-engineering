---
title: Product Requirements Skill (close the PRD middle)
status: proposed
roadmap: 'github:Intense-Visions/harness-engineering#709'
milestone: Full-lifecycle reach
keywords:
  - product-requirements
  - PRD
  - user-stories
  - acceptance-criteria
  - EARS
  - MoSCoW
  - guided-interview
  - configuration-interviewer
  - lifecycle
---

# Product Requirements Skill (close the PRD middle)

## Overview & Goals

A portable, standalone **guided-interview skill** that occupies the product-management
middle between `product-advisor` (BRD) and `harness-brainstorming` (spec). It turns a
picked work item into a durable **PRD** — user stories + testable acceptance criteria +
prioritization — at `docs/product-requirements/<item>/prd.md`, which brainstorming consumes
to seed the spec's `## Success Criteria` (the section `acceptance-eval` judges).

**Goals:**

1. Close the lifecycle's "PRD is thin / fused into the proposal" gap
   (`docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`).
2. Give non-technical authors a role-shaped front door
   (`STRATEGY.md#tracks` — Full-lifecycle reach).
3. Feed `acceptance-eval` judgable, measurable criteria.

**Non-goals:** technical design (brainstorming), the BRD (product-advisor), judging criteria
(acceptance-eval), dashboard/non-technical lanes (roadmap #711).

## Decisions Made

- **D1 — Standalone skill → durable artifact** `docs/product-requirements/<item>/prd.md`
  (mirrors `product-advisor`'s `brd.md`). _Why:_ it is the guided-interview front door the
  strategy bets on and keeps the non-technical authoring edge first-class, rather than
  burying it inside an engineer-facing skill.
- **D2 — Acceptance criteria in EARS** (default; Given-When-Then as an optional rendering for
  behavior-heavy stories); user stories as `As a <role>, I want <goal>, so that <benefit>`.
  _Why:_ EARS is the requirement grammar `harness-brainstorming` (SKILL.md:365) and
  `harness-planning` already consume, so criteria flow into the spec and tests untranslated
  and read as MEASURABLE to `acceptance-eval`.
- **D3 — Optional-but-wired:** brainstorming consumes the PRD when present, runs without it
  otherwise; roadmap-pilot suggests the PRD step for feature-shaped items. _Why:_ YAGNI — no
  PRD ceremony forced on bugs, chores, or refactors.
- **D4 — Portable / degrade-gracefully:** consumes a BRD when present → else the roadmap-row
  summary → else a plain feature description passed as an argument. Absent BRD/roadmap/
  strategy → soft-degrade and record a gap, never fail (mirrors `product-advisor` notes-only).
- **D5 — Completeness rubric + severity-ranked, one-question-at-a-time gap interview**
  (mirrors `product-advisor`): every story has ≥1 acceptance criterion; every criterion is
  measurable (EARS trigger→response or a number) else it is a gap; every story is prioritized;
  non-goals are explicit. Unresolvable gaps ship as `open` PM/client-facing questions —
  never silently dropped.
- **D6 — Prioritization = MoSCoW** (Must / Should / Could / Won't) per user story.
- **D7 — Stays in its lane:** the skill does not mutate the roadmap and never writes
  `assignee`; it writes the PRD and records a `transition` to brainstorming. Brainstorming
  links the PRD. No roadmap present → skip roadmap interaction silently.
- **D8 — PRD sections:** `Context` (+ BRD link if present) · `Goal / Problem` ·
  `User Stories` (each: EARS acceptance criteria + MoSCoW priority) · `Prioritization summary`
  · `Non-Goals` · `Open Questions (chase list)`. Every section present even if thin — a thin
  section is a gap, not a place to guess.
- **Approach — Pure-skill, clone-and-adapt `product-advisor`;** the rubric is agent-executed
  and backstopped downstream by `acceptance-eval`. A shared guided-interviewer extraction and
  a mechanical `prd_lint` are recorded as future considerations, not v1 scope.

## Technical Design

- **Skill package:** `product-requirements` (unprefixed, matching `product-advisor` /
  `acceptance-eval` / `outcome-eval`). Four byte-identical `SKILL.md` copies under
  `agents/skills/{claude-code,cursor,codex,gemini-cli}/product-requirements/`, plus a
  `skill.yaml`.
- **`skill.yaml`:** `cognitive_mode: configuration-interviewer`, `type: rigid`, `tier: 2`,
  `triggers: [manual]`, `platforms: [claude-code, cursor, codex, gemini-cli]`,
  `tools: [Bash, Read, Write, Edit, Glob, Grep, emit_interaction]`,
  `depends_on: [harness-brainstorming]`.
- **Phases (prose-driven, executed by the agent following SKILL.md):**
  1. **INGEST** — resolve the item slug (argument → roadmap row → ask). Load the richest
     available input (BRD → roadmap summary → description). Soft-degrade and record a gap when
     input is sparse.
  2. **DRAFT-PRD** — write `docs/product-requirements/<item>/prd.md` (D8 sections). Derive
     user stories; attach EARS acceptance criteria + MoSCoW priority; tag rubric misses as
     gaps `{ id, section, question, severity }`.
  3. **GAP-INTERVIEW** — severity-ranked, one-question-at-a-time, plain-text multiple-choice;
     fold each answer back; unresolvable gaps become `open` chase-list questions.
  4. **FINALIZE** — write the chase list; emit a `transition` to `harness-brainstorming`. No
     roadmap mutation, no assignee.
- **Brainstorming integration (the only edit to an existing skill):** a short branch in
  `harness-brainstorming` Phase 1 — "if `docs/product-requirements/<item>/prd.md` exists, read
  it and seed `## User Stories` + `## Success Criteria` from its EARS criteria; cite the PRD
  as evidence." Absent PRD → behavior unchanged.
- **Portability:** no hardcoded repo paths; the only hard requirement is a feature
  description. MCP tools (`gather_context`, `read_strategy`) are used when available and
  soft-fail otherwise.

## Integration Points

- **Entry Points:** new skill `product-requirements` (CLI `harness skill run
product-requirements` + MCP `run_skill`); new artifact tree `docs/product-requirements/<item>/`.
- **Registrations Required:** four platform copies; `skill.yaml` tier-2; skills-catalog
  regeneration (`generate:plugin:all` / catalog) so the skill is discoverable. No hook/plugin
  profile membership — the skill is `manual`-triggered.
- **Documentation Updates:** `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`
  (flip the "Product requirements / PRD" row from `partial` → covered); `AGENTS.md` skills
  section; brief notes in `harness-roadmap-pilot` and `harness-brainstorming` describing the
  new optional step.
- **Architectural Decisions:** **D1 (standalone artifact vs. spec-embedded)** and **D3
  (optional-but-wired)** warrant a lightweight ADR — together they set the lifecycle boundary
  between requirements-authoring and spec-authoring that future lifecycle skills build on.
- **Knowledge Impact:** concepts `PRD`, `user-story`, `acceptance-criterion (EARS)`, `MoSCoW`;
  relationship `product-advisor →(feeds) product-requirements →(feeds) brainstorming
→(judged-by) acceptance-eval`.

## Success Criteria

1. When invoked with only a feature description (no BRD, roadmap, or strategy present), the
   skill shall produce `docs/product-requirements/<item>/prd.md` with all D8 sections present,
   none empty.
2. If a user story lacks a measurable acceptance criterion, the skill shall raise it as a gap
   and shall not finalize until it is resolved or shipped as an `open` chase-list question.
3. Every acceptance criterion in the PRD shall be EARS-shaped (trigger→response) or carry a
   numeric bound.
4. Every user story shall carry a MoSCoW priority.
5. When a PRD exists for an item, `harness-brainstorming` shall seed the spec's
   `## Success Criteria` from its criteria and cite the PRD as evidence; when absent,
   brainstorming behavior shall be unchanged.
6. The skill shall not modify the roadmap and shall never write an `assignee`.
7. The skill ships as four byte-identical platform copies and appears in the regenerated
   skills catalog.
8. `harness validate` passes after the skill and wiring are in place.

## Implementation Order

1. **Phase 1 — Skill authoring:** write the claude-code `SKILL.md` + `skill.yaml`; self-review
   against `harness-skill-authoring`.
2. **Phase 2 — Platform fan-out + registration:** replicate byte-identically to cursor / codex
   / gemini-cli; regenerate the skills catalog; `harness validate`.
3. **Phase 3 — Brainstorming integration:** add the "consume PRD if present" branch to
   `harness-brainstorming`; verify the absent-PRD path is unchanged.
4. **Phase 4 — Docs + ADR:** update the sdlc-coverage knowledge doc, `AGENTS.md`, and the
   roadmap-pilot / brainstorming notes; write the D1/D3 ADR.

## Future Considerations (not v1)

- **Shared guided-interviewer extraction** across `product-advisor` / `product-requirements` /
  `strategy` / `pulse` to remove prose duplication of the gap-queue interview loop.
- **Mechanical `prd_lint`** (CLI/MCP) that enforces the completeness rubric as
  constraints-as-code, complementing `acceptance-eval`'s downstream LLM judgment.
- **Role-shaped dashboard lane** for non-technical authoring (roadmap #711).
