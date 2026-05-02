# Init Skill — Design System & Roadmap Configuration

**Keywords:** project-init, design-system, roadmap-setup, harness-config, on_project_init, skill-orchestration, configure-only, i18n-pattern

## Overview

`initialize-harness-project` declares two integration points it does not actually use:

1. `harness-design-system` declares `on_project_init` as a trigger (`agents/skills/claude-code/harness-design-system/skill.yaml:8`) but the init skill never invokes it.
2. The roadmap step (`agents/skills/claude-code/initialize-harness-project/SKILL.md:111`) is informational only — "When you are ready... run `/harness:roadmap --create`" — and most projects never run it.

The result: design intent is never captured during init, and roadmaps are rarely created. Both concerns silently default to "off."

### Goal

During project init, capture two decisions explicitly and act on them:

- **Design system:** Will this project have a UI? Record the answer in `harness.config.json` so `on_new_feature` can fire `harness-design-system` later when there is real design context.
- **Roadmap:** Set up the project roadmap now? If yes, create `docs/roadmap.md` immediately so feature work can be tracked from day one.

### Linkage

If both answers are yes, automatically add a "Set up design system" item to the roadmap as `planned`, executor `harness-design-system`. Deferred design work becomes visible without forcing token generation during init.

### Out of Scope

- Full design-system invocation during init (palette/typography/tokens generation) — deferred to `on_new_feature`.
- Refactoring i18n into a unified "capabilities" pattern — YAGNI until a third capability appears.
- Auto-detection of frontend stack to skip the design question — too brittle on greenfield projects with no code yet.

## Decisions

| #   | Decision                                                                                                                                              | Rationale                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Always ask the design question (mirror i18n pattern); do not auto-detect from stack signals                                                           | Greenfield projects have no code yet — auto-detection skips when design setup matters most. Human always knows the question is coming.                                                                                                                                 |
| D2  | Configure-only at init time: set `design.enabled` + `design.platforms` in `harness.config.json`. Do NOT run the full design-system skill during init  | Palette/typography decisions made before any UI exists tend to be reworked. Defer creative decisions until `on_new_feature` fires the full skill with real product context. The i18n parallel breaks here: i18n scaffolding is mechanical; design tokens are creative. |
| D3  | Three-way response for design question: `yes` / `no` / `not-sure`                                                                                     | Mirrors i18n exactly. `no` records a permanent decline (no future nudges). `not-sure` skips silently — can be enabled later.                                                                                                                                           |
| D4  | Binary response for roadmap question: `yes` / `no`                                                                                                    | No "permanent decline" semantics needed — a roadmap can always be created later via `/harness:roadmap --create`.                                                                                                                                                       |
| D5  | Roadmap question fires in Phase 4, after `harness validate` passes                                                                                    | Validation success gives the user a tangible "the project works" signal before introducing planning artifacts. Existing nudge already lives at this position — promote it to an active question.                                                                       |
| D6  | If `design = yes` AND `roadmap = yes`, automatically add a `planned` roadmap item titled "Set up design system" with executor `harness-design-system` | Closes the loop: deferred design work becomes visible. Without this, design intent recorded in config has no surface in the workflow.                                                                                                                                  |
| D7  | Bundle design + roadmap in one spec; do NOT introduce a generalized "capabilities" framework                                                          | YAGNI — three capabilities (i18n + design + roadmap) is below the threshold for abstraction. Each has genuinely different semantics.                                                                                                                                   |
| D8  | Test-suite projects skip the design question; roadmap question still asked                                                                            | Phase 1 step 5 already dispatches test suites to `initialize-test-suite-project` before step 5b would fire. Test suites have no UI but do benefit from roadmap tracking.                                                                                               |
| D9  | Existing i18n step in Phase 3 stays unchanged                                                                                                         | Working precedent. Don't refactor working code to chase symmetry.                                                                                                                                                                                                      |

## Technical Design

### Files Modified

| File                                                              | Change                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents/skills/claude-code/initialize-harness-project/SKILL.md`   | Add Phase 3 step 5b (design configure-only); promote Phase 4 step 4 from nudge to active question; add conditional "link design item" sub-step |
| `packages/cli/src/skill/schema.ts` (or relevant config schema)    | Add `design.enabled: boolean`, `design.platforms: ('web'\|'mobile')[]`                                                                         |
| `agents/skills/claude-code/initialize-harness-project/skill.yaml` | Add `harness-design-system` to `depends_on`                                                                                                    |
| `agents/skills/claude-code/harness-design-system/SKILL.md`        | Phase 1 step 2 reads `design.enabled` from `harness.config.json` and short-circuits when `false`                                               |
| `docs/reference/skills-catalog.md`                                | Update entry for `initialize-harness-project` to mention design + roadmap configuration                                                        |

No new files. No new skills. No deletions.

### Phase 3 — New Step 5b (after current step 5 i18n, before step 6 test-suite dispatch)

> **Step 5b. Configure design system.** Ask: "Will this project have a UI requiring a design system?"
>
> - **Yes:** Ask follow-up: "Which platforms? `web`, `mobile`, or both?" Set `design.enabled: true` and `design.platforms: [...]` in `harness.config.json`. Inform the user: "Design tokens will be generated when you start your first design-touching feature — `harness-design-system` fires automatically via `on_new_feature`."
> - **No:** Set `design.enabled: false`. The `on_new_feature` trigger respects this flag.
> - **Not sure:** Do not set `design.enabled`. Project can enable later by running `harness-design-system` directly.
>
> **Skip this step entirely if Phase 1 step 5 classified the project as a test suite.**

Use `emit_interaction` with `type: question`, three structured options, recommendation index 0 with `confidence: medium`.

### Phase 4 — Modified Step 4 (currently informational nudge)

> **Step 4. Set up project roadmap.** Ask: "Set up a project roadmap now? `docs/roadmap.md` tracks features, milestones, and status across specs and plans."
>
> - **Yes:** Call `manage_roadmap` with `action: init` (or run `/harness:roadmap --create` if MCP unavailable). Verify `docs/roadmap.md` is created.
>   - **If `design.enabled === true` in `harness.config.json`:** Call `manage_roadmap` with `action: add`, `feature: "Set up design system"`, `status: "planned"`, `milestone: "Current Work"`. Skip silently if duplicate.
> - **No:** Skip silently. Existing informational nudge ("run `/harness:roadmap --create` when ready") still applies.

Use `emit_interaction` with `type: question`, two structured options, recommendation index 0 with `confidence: medium`.

### Schema Addition

```jsonc
// harness.config.json (relevant slice)
{
  "design": {
    "enabled": true, // NEW — set during init
    "platforms": ["web"], // NEW — set during init when enabled=true
    "strictness": "standard", // existing
    "tokenPath": "design-system/tokens.json", // existing
    "aestheticIntent": "design-system/DESIGN.md", // existing
  },
}
```

`design.enabled` is tri-state at runtime: `true`, `false`, or absent.

- `true` → fire `harness-design-system` (full discover/define/generate/validate)
- `false` → skip (permanent decline)
- absent → fire gentle prompt asking the user to decide (existing default behavior)

### Flow

```
Phase 3 (existing):
  step 1-4: persona, AGENTS.md, layers, advanced state
  step 5:   i18n configure (existing)
  step 5b:  DESIGN configure (NEW) ──┐
  step 6:   test-suite dispatch       │
                                      │ (test-suite path skips 5b)
Phase 4:                              │
  step 1: harness validate            │
  step 2: fix validation errors       │
  step 3: harness check-deps          │
  step 4: ROADMAP setup (CHANGED) ────┤
            │                          │
            ├─ yes → create docs/roadmap.md
            │   └─ if design.enabled === true:
            │      add "Set up design system" item
            └─ no  → skip silently
  step 5: knowledge graph scan
  step 6: commit
```

### Test-Suite Carveout

Test-suite projects (Phase 1 step 5 classification) jump from Phase 2 directly to `initialize-test-suite-project` and return at Phase 4 step 4+. Therefore:

- Step 5b (design question) is **never reached** for test suites.
- Step 4 (roadmap question) **is reached** because the test-suite return point is "Phase 4 step 4+." Test suites get the roadmap question.

No special-casing needed — natural consequence of existing flow control.

## Integration Points

### Entry Points

- **Modified:** `initialize-harness-project` skill — adds Phase 3 step 5b and changes Phase 4 step 4 from nudge to active question.
- No new entry points. No new CLI commands, MCP tools, slash commands, or skills.

### Registrations Required

- `harness-design-system` is already registered with `on_project_init` trigger declared. No new registration needed.
- `manage_roadmap` MCP tool already exists.
- `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on` should add `harness-design-system` (currently lists only `initialize-test-suite-project`).
- Roadmap operations go through `manage_roadmap` MCP tool, not a skill — no `depends_on` entry needed.

### Documentation Updates

- `agents/skills/claude-code/initialize-harness-project/SKILL.md` — Phase 3 step 5b text, Phase 4 step 4 text, updated Harness Integration section, updated Success Criteria, updated Examples (add a "with design enabled" example).
- `docs/reference/skills-catalog.md` — One-line update to `initialize-harness-project` description.
- `AGENTS.md` (root) — No update needed; init skill handles its own documentation.

### Architectural Decisions

- None warrant an ADR. The decisions in this spec are skill-internal flow choices, not project-level architecture. They follow the i18n precedent which itself has no ADR.

### Knowledge Impact

- Minor. The `design.enabled` config key becomes a new fact about a project's design posture. The graph already ingests `harness.config.json` keys, so `design.enabled: true|false` flows automatically into `business_fact` nodes once `harness scan` runs.
- No new domain concepts, patterns, or relationships.

## Success Criteria

### Behavioral

1. When `initialize-harness-project` runs on a non-test-suite project, the user is asked "Will this project have a UI requiring a design system?" with three structured options (yes/no/not-sure) via `emit_interaction`.
2. When Phase 1 step 5 classifies the project as a test suite, the design question never fires.
3. Roadmap question fires for all projects, including test suites. Two options (yes/no).
4. When `design = yes` AND `roadmap = yes`, `docs/roadmap.md` contains a `planned` entry titled "Set up design system" under milestone `Current Work`.
5. The linked roadmap item does NOT appear when either answer is no/not-sure.

### State

6. `harness.config.json` contains `design.enabled: true` and `design.platforms: [...]` after the user answers "yes" to the design question.
7. `harness.config.json` contains `design.enabled: false` after the user answers "no".
8. `harness.config.json` does NOT contain `design.enabled` after the user answers "not sure".
9. `docs/roadmap.md` exists after the user answers "yes" to the roadmap question.

### Validation

10. `harness validate` passes after init completes for all answer combinations (3 design × 2 roadmap = 6 paths).
11. The `design` schema in `harness.config.json` validates with the new `enabled` and `platforms` fields populated correctly.
12. Subsequent invocation of `harness-design-system` via `on_new_feature` reads `design.enabled` and behaves correctly: fires when `true`, skips when `false`, prompts when absent.

### Idempotency

13. Re-running `initialize-harness-project --migrate` on an already-configured project does not duplicate the "Set up design system" roadmap item.
14. Re-running with different design answers updates `design.enabled` in place, does not append.

### Backwards Compatibility

15. Projects initialized before this change (no `design.enabled` field) continue to work. The absence of the field is treated as "not configured" by `harness-design-system`, which falls back to existing prompt behavior.

## Implementation Order

### Phase A — Schema & Config

1. Add `design.enabled: boolean` and `design.platforms: ('web'|'mobile')[]` to `harness.config.json` schema.
2. Update schema validation tests for valid combinations, optional `enabled`, and `platforms` required when `enabled=true`.
3. Verify `harness validate` accepts both populated and empty `design` config.

### Phase B — Init Skill Updates

4. Add Phase 3 step 5b ("Configure design system") to `initialize-harness-project/SKILL.md` with `emit_interaction` example, three-way response handling, and skip-for-test-suite note.
5. Modify Phase 4 step 4 from informational nudge to active question with binary response.
6. Add the conditional "link design item" logic in Phase 4 step 4 when both answers are yes.
7. Update `skill.yaml` `depends_on` to include `harness-design-system`.
8. Update Harness Integration, Success Criteria, and Examples sections of `SKILL.md`.

### Phase C — Skill-Side Awareness

9. Update `harness-design-system/SKILL.md` Phase 1 step 2 to read `design.enabled` and short-circuit when `false`.
10. Verify `on_new_feature` trigger respects `design.enabled`.

### Phase D — Docs & Catalog

11. Update `docs/reference/skills-catalog.md` description for `initialize-harness-project`.
12. Add a new Examples block showing the design+roadmap interaction.

### Phase E — Verification

13. Run `harness validate` against a freshly initialized test project for all 6 answer combinations.
14. Run end-to-end test: init → answer yes/yes → confirm `design.enabled=true`, `docs/roadmap.md` exists, "Set up design system" item present.
15. Run `harness check-docs` to verify catalog and SKILL.md are consistent.

### Sequencing

- Phase A → B is hard order (schema must exist before skill writes it).
- Phase C is independent of B but must complete before user-facing release.
- Phase D and E run last.
- Phase B and C should merge together to avoid a window where init writes `design.enabled` but the consumer skill doesn't read it.
