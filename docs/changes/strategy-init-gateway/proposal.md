---
title: Promote the strategic anchor to a gateway position in init
feature: strategy-init-gateway
status: planned
tier: small
keywords:
  [
    initialize-harness-project,
    STRATEGY.md,
    harness-strategy,
    init-phase-ordering,
    strategic-anchor,
    plugin-mirrors,
    decline-flag,
  ]
roadmap-row: Promote harness:strategy to gateway position in init
external-id: github:Intense-Visions/harness-engineering#543
---

# Promote the strategic anchor to a gateway position in init

## Overview

`initialize-harness-project` asks the `STRATEGY.md` capture prompt at **Phase 3 step 5c**
(`agents/skills/claude-code/initialize-harness-project/SKILL.md:145`) — after scaffolding,
personas, AGENTS.md, layers, i18n, and the design-system question. Adopters who skip past it,
or never reach it, finish init with no strategic anchor, so `harness-brainstorming`,
`harness-ideate`, and `harness-roadmap-pilot` start cold
(`STRATEGY.md#target-problem` — "each agent invocation starts cold").

This change promotes the prompt to a new **Phase 0: GROUND** that runs first, making the
strategic anchor the gateway to init: _think first (strategy), build second (scaffold)_. It
directly advances the `STRATEGY.md#tracks` **Upstream grounding** track, which names this exact
wiring ("make the strategic substrate durable enough that downstream skills ground reliably
instead of starting cold each invocation").

It is a documentation-only change to the `initialize-harness-project` skill (the skill _is_ the
init procedure), applied across all four platform mirrors with the generated plugin artifacts
regenerated.

## Goals

- Relocate the strategy capture prompt to a new `Phase 0: GROUND`, before `Phase 1: ASSESS` —
  the first thing init does and the first question it asks the human.
- Preserve the strategy interview's **content and decision semantics**: the same
  Yes / No / Not-sure offer, the same absent / present-valid / present-invalid branching, and
  the same `init.strategy.declined` meaning.
- Resolve the ordering hazard the relocation exposes: the `init.strategy.declined` flag is
  persisted to `.harness/state.json`, which only exists **after** SCAFFOLD. Split the _offer_
  (Phase 0) from the _flag persistence_ (post-SCAFFOLD) so the relocation does not corrupt
  `Phase 1: ASSESS` new-vs-migration classification.
- Document the cross-phase ordering contract so the relocation cannot silently regress into a
  double-prompt or a blocking init.
- Apply across all four platform mirrors (`claude-code`, `cursor`, `codex`, `gemini-cli`) and
  regenerate the plugin command artifacts.

### Non-goals (YAGNI)

- No change to the `harness-strategy` skill or its interview content.
- No change to the **meaning** of `init.strategy.declined` (only its write _point_ moves).
- No change to the i18n (step 5) or design-system (step 5b) prompts.

## Decisions made

1. **Placement = new `Phase 0: GROUND` before `Phase 1: ASSESS`.** Chosen over front-of-ASSESS
   and first-in-CONFIGURE. Rationale: the roadmap intent is "the FIRST question init asks," and
   `STRATEGY.md#our-approach` ("humans own the thinking layer — specs, decisions, strategy")
   argues for establishing _why_ before _how_. (Roadmap row: "Promote harness:strategy to
   gateway position in init"; `github:...#543`.)

2. **Capture the anchor in Phase 0; defer only the decline-flag bookkeeping.** Phase 0 runs the
   offer and, on "Yes," writes `STRATEGY.md` to repo root (which always exists) with **doc-level**
   validation via the `write_strategy` / `validate_strategy` MCP tools — **no** project-level
   `harness validate`, because `harness.config.json` does not exist until SCAFFOLD. The
   `init.strategy.declined` write is **deferred** to a new first step of `Phase 3: CONFIGURE`,
   after SCAFFOLD has created `.harness/`. Rationale: writing the flag in Phase 0 would either
   fail (no `.harness/`) or fabricate `.harness/` early and make `Phase 1: ASSESS` step 1
   (`SKILL.md:36`) misclassify a new project as a migration. This is the only semantic change —
   the flag's _meaning_ is unchanged, only its write location moves.

3. **Phase 0 prompt is delivered in plain text, not `emit_interaction`.** `SKILL.md:32` already
   mandates plain-text prompts for this whole skill; the legacy step 5c used an
   `emit_interaction({type:"question"})` block, which renders/records but does not surface to the
   user (a known failure mode in this repo). Promoting the step to the _first_ user interaction
   amplifies the risk: an invisible prompt means the anchor is silently skipped and every
   downstream skill loses its grounding — the exact opposite of the goal. Phase 0 therefore asks
   in plain text.

4. **Offer-to-all preserved.** Phase 0 runs before the test-suite classification (`SKILL.md:49`)
   and the step-6 dispatch, so strategy is offered regardless of project shape — identical reach
   to today's step 5c.

5. **Present-invalid detection uses the `validate_strategy` MCP tool, not a core one-liner.** The
   legacy text (`SKILL.md:192`, `:329`) imports `validateStrategy` from `@harness-engineering/core`
   via `node -e`, which is unresolvable for plugin-only adopters (no `node_modules`). The MCP
   server already has core loaded (`harness-strategy/SKILL.md:25`), so Phase 0 routes through it.

6. **The 4-platform fan-out and plugin-artifact regeneration are part of this change**, not
   follow-up. The four `SKILL.md` mirrors are currently byte-identical and must stay so.

## Technical design

**Primary file:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`, plus three
byte-identical mirrors under `agents/skills/{cursor,codex,gemini-cli}/initialize-harness-project/`.

1. **Insert `### Phase 0: GROUND — Capture the Strategic Anchor`** immediately before
   `### Phase 1: ASSESS`. Body = the relocated step-5c content with these adaptations:
   - The Yes/No/Not-sure offer is phrased in **plain text** (Decision 3), not an
     `emit_interaction` block.
   - **Absent** → present the offer. On **Yes**, run the strategy interview and write
     `STRATEGY.md` (doc-validated via `write_strategy` MCP; no project-level `harness validate`).
     On **No** or **Not-sure**, record the answer in working memory for Phase 3 step 1; do **not**
     touch `.harness/` (it does not exist yet).
   - **Present-valid** → skip silently with the one-line detection note.
   - **Present-invalid** → surface the error via `validate_strategy` MCP and offer the three
     repair paths (fix now / move-to-`.bak` / ignore). Never block.
   - Three **guard sentences**: (a) Phase 0 runs for **all** project shapes incl. test suites;
     (b) migrations are handled by the present-valid (skip) / present-invalid (offer fix)
     branches — distinct from the `.harness/`-based adoption-level classification in ASSESS, which
     Phase 0 must not pre-empt; (c) **No / Not-sure proceeds immediately into ASSESS; Phase 0
     never blocks.**
   - Reword the trailing "Mirror the i18n / design-system pattern" line so it does not point
     _forward_ to steps that now appear later (e.g. "This mirrors the ask-once-record-the-answer
     pattern also used by the i18n and design-system prompts in Phase 3").

2. **Add `Phase 3: CONFIGURE` step 1 — "Persist the Phase 0 grounding decision."** After SCAFFOLD
   has created `.harness/`: if the user **declined** in Phase 0, write
   `init.strategy.declined: true` to `.harness/state.json` (merge; do not clobber). If Yes or
   Not-sure, no write. Renumber the existing CONFIGURE steps accordingly, or insert as step 0 to
   avoid renumbering i18n (5) / design-system (5b).

3. **Remove step 5c from `Phase 3: CONFIGURE`.** No other steps renumber (only 5c is removed; the
   new persistence step is additive).

4. **Repoint all 8 in-file "Phase 3 step 5c" / "Step 5c" references** to "Phase 0: GROUND":
   `SKILL.md:328` (Harness Integration — `harness-strategy`), `:329` (`validateStrategy` →
   `validate_strategy` MCP), `:346` (Success Criteria), `:361 :362 :363` (Rationalizations table),
   `:442` and `:552` (Examples).

5. **Regenerate generated artifacts** so pre-commit finds no drift:
   `.claude-plugin/commands/initialize-project.md`, `.cursor-plugin/commands/initialize-project.md`,
   and any `.claude-plugin/agents/` copy of the skill — via the repo's slash-command / plugin
   generation script.

## Integration Points

- **Entry Points:** A new `Phase 0` and a new `Phase 3` step-1 within the
  `initialize-harness-project` skill procedure. No new CLI command, MCP tool, API route, or
  barrel export.
- **Registrations Required:** Regenerate the plugin command artifacts (claude + cursor) and the
  plugin `agents/` skill copy. All four platform `SKILL.md` mirrors must remain byte-identical
  (verify with `diff`).
- **Documentation Updates:** The 8 intra-file "step 5c" cross-references in the same `SKILL.md`
  (Harness Integration, Success Criteria, Rationalizations, Examples) must be repointed — these
  are part of the edited file, not external docs. No edits to `harness-strategy/SKILL.md` (it
  references generic "init wiring") or to CHANGELOGs (immutable history).
- **Architectural Decisions:** None rise to a standalone ADR. This is a doc-ordering change with
  no architectural surface; the decline-flag deferral is an implementation detail of the skill,
  not a cross-cutting policy.
- **Knowledge Impact:** None new. Reinforces the existing "STRATEGY.md is the upstream anchor,
  captured at init" concept already represented in the knowledge graph.

## Success criteria

1. `initialize-harness-project/SKILL.md` contains a `Phase 0: GROUND` section **before**
   `Phase 1: ASSESS`, and `Phase 3: CONFIGURE` no longer contains a strategy/STRATEGY.md
   **capture** step.
2. The relocated section preserves all three branches (absent→prompt, present-valid→skip
   silently, present-invalid→offer fix) and the `init.strategy.declined` meaning.
3. Phase 0 documents the three guard clauses (all-shapes; migration-via-branches; never-blocks).
4. All four platform mirrors are byte-identical (`diff` clean).
5. Generated plugin command artifacts are regenerated and match — `harness validate` / pre-commit
   reports no plugin-artifact drift.
6. `harness validate` passes.
7. No `"step 5c"` / `"Phase 3 step 5c"` / `"Step 5c"` string survives anywhere in the file.
8. The `init.strategy.declined` flag is persisted only in `Phase 3: CONFIGURE` (after `.harness/`
   exists), never in Phase 0.
9. Phase 0 uses a plain-text prompt and the `validate_strategy` / `write_strategy` MCP tools for
   doc validation, and runs **no** project-level `harness validate`.

## Implementation order

1. Edit claude-code `SKILL.md`: add `Phase 0: GROUND`; add `Phase 3` step-1 decline-persistence;
   remove step 5c; reword the forward-pointing "mirror" line; repoint the 8 cross-references;
   switch present-invalid detection to the `validate_strategy` MCP tool.
2. Mirror the file byte-identically to `cursor`, `codex`, `gemini-cli`.
3. Regenerate plugin / slash-command artifacts; verify no drift (`diff` against regenerated
   output).
4. Run `harness validate`. The brainstorming skill then commits the spec and the roadmap
   promotion atomically.
