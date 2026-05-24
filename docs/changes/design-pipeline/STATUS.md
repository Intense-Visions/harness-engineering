# Design-Pipeline Session Status

**Branch:** `feat/design-pipeline-decomposition`
**Generated:** 2026-05-23 (third autonomous work block — implementation phase)
**Validate:** `v validation passed` (clean)
**Skills tests:** 23941 / 23941 passing

## What landed (18 commits across 3 work blocks)

**Third block (Phase 1 vertical slices + ADR cleanup + #0 ADR):**

```
fd053fe9 merge: #6 design-craft-elevator Phase 1 vertical slice
        (4 commits + 7 files: 3-axis findings schema, hierarchy-clarity
         rubric, MockLlmProvider, CRITIQUE phase with permissive parser,
         design_craft MCP tool, 7 integration tests passing)
        merge: #2 audit-component-anatomy Phase 1 vertical slice
        (8 commits + 10 files: AnatomyFinding type, ConventionRule +
         PatternRule with additive fields, Button convention, resolvers,
         TS Compiler API parser, convention runner, audit_anatomy MCP
         tool, 4 integration tests passing)
        feat(skills): SKILL.md Examples + Escalation + 3-platform parity
        style(skills,learnings): prettier formatting
        style(design-pipeline): prettier formatting
        docs(adr): file ADR 0028 brand-guidelines source of truth
        chore(adr): execute ADR 0022 renumbering (5 file moves + ref sweep)
        docs(design-pipeline): lock co-locate decision
        docs(design-pipeline): resolve amendments
```

**Second block (amendments resolution):** see earlier commits.

**First block (specs + plans + scaffolding):** see earlier commits.

Run `git log --oneline main..HEAD` for the canonical list.

## Artifact inventory

### Sub-project #2 — audit-component-anatomy (FLOOR)

| Artifact               | Path                                                                                                                                                                            | Status                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Spec                   | `docs/changes/design-pipeline/audit-component-anatomy/proposal.md`                                                                                                              | approved + heading-reshaped                                     |
| Skill recommendations  | `.../SKILLS.md`                                                                                                                                                                 | written by skill advisor                                        |
| Plan                   | `.../plans/2026-05-23-audit-component-anatomy-plan.md`                                                                                                                          | 71 tasks, 5 checkpoints                                         |
| Skill scaffolding      | `agents/skills/{claude-code,gemini-cli,cursor,codex}/audit-component-anatomy/`                                                                                                  | status: draft; platform parity complete + Examples + Escalation |
| Phase 0 spike          | `.../phase-0-schema-spike/{conventions,patterns,review.md}`                                                                                                                     | 6 paper artifacts; schemas locked                               |
| Finding codes ref      | `.../finding-codes.md`                                                                                                                                                          | 12 defined + ~286 reserved                                      |
| Phase 1 vertical slice | `packages/cli/src/audit/component-anatomy/` (10 files, 1233 lines) + `packages/cli/tests/audit/component-anatomy/integration/button-vertical-slice.test.ts` (4/4 tests passing) | end-to-end on Button + ANAT-D001                                |
| Phase 1 MCP tool       | `packages/cli/src/mcp/tools/audit-anatomy.ts`                                                                                                                                   | exported; not yet registered in mcp/server.ts                   |
| Roadmap entry          | `docs/roadmap.md #355`                                                                                                                                                          | status: in-progress; spec + plan attached                       |

### Sub-project #6 — design-craft-elevator (CEILING)

| Artifact               | Path                                                                                                                                             | Status                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Spec                   | `docs/changes/design-pipeline/design-craft-elevator/proposal.md`                                                                                 | approved + heading-reshaped                        |
| Skill recommendations  | `.../SKILLS.md`                                                                                                                                  | written by skill advisor                           |
| Plan                   | `.../plans/2026-05-23-design-craft-elevator-plan.md`                                                                                             | 74 tasks, 8 checkpoints                            |
| Skill scaffolding      | `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-design-craft/`                                                                      | status: draft; platform parity complete + Examples |
| Phase 0 spike          | `.../phase-0-schema-spike/{rubrics,patterns,exemplars,benchmark-specimens,review.md}`                                                            | 11 paper artifacts; schemas locked                 |
| Finding codes ref      | `.../finding-codes.md`                                                                                                                           | 9 defined + ~292 reserved                          |
| Contribution guide     | `.../contribution.md`                                                                                                                            | spec/policy doc                                    |
| Growth trajectory      | `.../growth-trajectory.md`                                                                                                                       | long-term catalog model                            |
| Phase 1 vertical slice | `packages/cli/src/design-craft/` (7 files, ~1291 lines) + `packages/cli/tests/design-craft/integration/critique-mvp.test.ts` (7/7 tests passing) | end-to-end CRITIQUE with mock LLM provider         |
| Phase 1 MCP tool       | `packages/cli/src/mcp/tools/design-craft.ts`                                                                                                     | exported; not yet registered in mcp/server.ts      |
| Roadmap entry          | `docs/roadmap.md #6`                                                                                                                             | status: in-progress; spec + plan attached          |

### Cross-cutting

| Artifact                      | Path                                                          | Note                                                                                           |
| ----------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Initiative README (prior art) | `docs/changes/design-pipeline/REFERENCES.md`                  | 60 entries unchanged                                                                           |
| Architecture amendments       | `docs/changes/design-pipeline/AMENDMENTS.md`                  | discovered issues for spec amendment                                                           |
| ADR 0018                      | `docs/knowledge/decisions/0018-llm-judgment-skill-pattern.md` | new pattern                                                                                    |
| ADR 0019                      | `.../0019-3-axis-craft-output-model.md`                       | new pattern                                                                                    |
| ADR 0020                      | `.../0020-living-catalog-h-pattern.md`                        | new pattern                                                                                    |
| ADR 0021                      | `.../0021-detect-and-offer-b-prime-pattern.md`                | new pattern                                                                                    |
| Initiative parent #316        | `docs/roadmap.md`                                             | reframed two-layer (floor + ceiling); blockers updated to include #6                           |
| #0 brand-guidelines decision  | `docs/roadmap.md`                                             | filed and assigned (still no ADR drafted)                                                      |
| Learnings                     | `.harness/learnings.md`                                       | new entry: autopilot constraint + skill location convention + visual pipeline non-availability |

## Decisions waiting for you (read `AMENDMENTS.md` for full detail)

**Update (second pass, 2026-05-23):** items 1-3 and 5 below are RESOLVED in the second commit batch. Only architectural decisions inherent to Phase 1 remain.

1. ~~**Skill source-location amendment.**~~ ✓ RESOLVED — both spec File-layout sections rewritten with corrected paths (`agents/skills/claude-code/` for skill markdown, `packages/{audit,design-craft}/` new packages for impl code, `packages/cli/src/mcp/tools/` for MCP tools, `agents/skills/shared/design-knowledge/` for catalogs).

2. ~~**Visual pipeline Q3 go/no-go for #6.**~~ ✓ RESOLVED — playwright MCP server (`mcp__playwright__browser_*`) used instead of npm dep. Confirmed available in this environment. Spec render-pipeline section rewritten. No new install required; users configure the MCP server one-time.

3. ~~**ADR numbering correction in spec text.**~~ ✓ RESOLVED — #6 proposal.md now references ADRs 0018-0021 with hyperlinks.

4. **`BenchmarkScore.overall` aggregation rule.** Deferred to Phase 1's first task. Spike recommendation: equal-weight mean with config override + `min` for confidence. Required for SC #34 (fixpoint detection).

5. ~~**Pre-existing ADR duplicate numbers (0003-0007 range).**~~ ✓ DOCUMENTED — ADR 0022 filed with renumbering plan (second-of-pair → 0023-0027). Execution is a separate follow-up PR (file moves + reference updates).

## New work (third work block)

| Sub-project                         | Milestone                     | Status                                                                                                                                    |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #0 brand-guidelines source-of-truth | ADR 0028 filed                | done — path A (extend DESIGN.md schema + claim DTCG `$extensions.harness.brand`)                                                          |
| #2 audit-component-anatomy          | Phase 1 vertical slice merged | end-to-end: AnatomyFinding → ConventionRule → Button catalog → AST parser → convention runner → MCP tool → 4 integration tests passing    |
| #6 design-craft-elevator            | Phase 1 vertical slice merged | end-to-end: 3-axis findings schema → hierarchy-clarity rubric → MockLlmProvider → CRITIQUE phase → MCP tool → 7 integration tests passing |
| #3 audit-brand-compliance           | unblocked                     | #0 ADR resolves the blocker; ready for brainstorming                                                                                      |
| Duplicate ADRs 0003-0007            | ADR 0022 executed             | 5 file renames to 0023-0027 + inbound references updated                                                                                  |
| Both skills                         | 4-platform parity             | identical SKILL.md + skill.yaml in claude-code, gemini-cli, cursor, codex                                                                 |
| Skills package tests                | all green                     | 23941 / 23941 passing                                                                                                                     |

## Decisions waiting for you (read `AMENDMENTS.md` for full detail)

**Update (third pass, 2026-05-23):** all amendments resolved. New remaining decisions list below.

~~**New remaining decision (third pass)**~~ ✓ RESOLVED: 6. ~~**`packages/audit/` and `packages/design-craft/` as new packages, or co-locate under `packages/cli/src/`?**~~ **Decided: co-locate under `packages/cli/src/audit/component-anatomy/` and `packages/cli/src/design-craft/`.** Rationale: only consumer is the CLI's MCP tool surface; precedent set by packages/cli/src/skill/ (148 KB substantial subsystem hosted inside CLI without packaging); new-package overhead (tsconfig, build pipeline, release config, dep wiring) not justified for a CLI-MCP-driven concern; extraction to a separate package later is straightforward if multi-consumer use emerges. Both spec File-layout sections updated to reflect this as the primary path (no "alternative" escape-hatch language remaining).

**All amendments resolved. No remaining architectural decisions before Phase 1 implementation work begins.**

Two narrow Phase-1-first-task spike items remain (per A4 + A5 in AMENDMENTS):

- Lock `BenchmarkScore.overall` aggregation rule (equal-weight mean + min for confidence per spike recommendation)
- Decide where to encode the Tabs trigger/panel pairing invariant (runner responsibility per spike recommendation)

Neither is a blocker for starting Phase 1; both are sub-task-level decisions that surface during the first work, not architectural gates.

## What's NOT done (deliberately)

- **No Phase 1+ implementation code.** Both Phase 1s are HIGH complexity per the plans (22 and 18 engineering tasks respectively). The skill scaffolding is the only "code" landed — and it's just SKILL.md + skill.yaml. Tree-sitter integration, AST parser, MCP tool implementations, graph adapter extensions — none of that is written. Those need:
  - The architectural amendments above resolved
  - Real time per task with verify gates
  - Probably your supervision at APPROVE_PLAN gates (every Phase 1+ trips task-count-15 signal)

- **No autopilot end-to-end runs.** Discovered during this session: autopilot requires the primary session, not a subagent. If you want to run autopilots, invoke `/harness:autopilot docs/changes/design-pipeline/audit-component-anatomy/proposal.md` from your top-level conversation.

- **No branch push to origin.** Branch `feat/design-pipeline-decomposition` is local only. Push when you've reviewed.

- **No PR opened.** Deliberately your call.

## Next move options

**A) Review and merge.** Inspect commits, push to origin, open PR.

**B) Resolve amendments first.** Apply path corrections to both spec files + decide visual-pipeline path for #6 + decide aggregation rules. ~1 hour of focused editing. Then planning phase becomes accurate.

**C) Kick off real Phase 1 implementation.** From your primary session, run `/harness:autopilot` on one or both specs. Expect APPROVE_PLAN pauses on Phase 1+. Plan to be present for those gates.

**D) Pick up #0 brand-guidelines decision.** Smaller, time-bounded work (one ADR doc). Unblocks sub-project #3. Could be done in 1-2 hours.

## Validate status

```
$ harness validate
v validation passed
```

(The Hermes link issue that was failing every validate this morning is fixed in commit `87ef5524`.)
