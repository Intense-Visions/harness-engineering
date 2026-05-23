# Design-Pipeline Session Status

**Branch:** `feat/design-pipeline-decomposition`
**Generated:** 2026-05-23 (end of 3-hour autonomous work block)
**Validate:** `v validation passed` (clean)

## What landed (8 commits)

```
63e02d7b docs(design-pipeline): finding-codes references, 4 new ADRs, contribution + growth docs
a6a66704 exec(design-pipeline): complete Phase 0 schema spikes for #2 and #6
7262ce24 feat(skills): scaffold audit-component-anatomy and harness-design-craft skill markdown
73f33775 plan(design-pipeline): author implementation plans for #2 and #6
87ef5524 fix(agents): correct ADR 0016 filename in skill-proposals reference
9235c90d chore(design-pipeline): reshape Sprint headings to autopilot-compatible Phase format
34c119ad feat(design-pipeline): decompose initiative into 6 sub-projects with floor+ceiling architecture
(plus this commit — STATUS + AMENDMENTS + learnings)
```

## Artifact inventory

### Sub-project #2 — audit-component-anatomy (FLOOR)

| Artifact | Path | Status |
|---|---|---|
| Spec | `docs/changes/design-pipeline/audit-component-anatomy/proposal.md` | approved + heading-reshaped |
| Skill recommendations | `.../SKILLS.md` | written by skill advisor |
| Plan | `.../plans/2026-05-23-audit-component-anatomy-plan.md` | 71 tasks, 5 checkpoints |
| Skill scaffolding | `agents/skills/claude-code/audit-component-anatomy/{SKILL.md,skill.yaml}` | status: draft |
| Phase 0 spike | `.../phase-0-schema-spike/{conventions,patterns,review.md}` | 6 paper artifacts; schemas locked |
| Finding codes ref | `.../finding-codes.md` | 12 defined + ~286 reserved |
| Roadmap entry | `docs/roadmap.md #355` | status: in-progress; spec + plan attached |

### Sub-project #6 — design-craft-elevator (CEILING)

| Artifact | Path | Status |
|---|---|---|
| Spec | `docs/changes/design-pipeline/design-craft-elevator/proposal.md` | approved + heading-reshaped |
| Skill recommendations | `.../SKILLS.md` | written by skill advisor |
| Plan | `.../plans/2026-05-23-design-craft-elevator-plan.md` | 74 tasks, 8 checkpoints |
| Skill scaffolding | `agents/skills/claude-code/harness-design-craft/{SKILL.md,skill.yaml}` | status: draft |
| Phase 0 spike | `.../phase-0-schema-spike/{rubrics,patterns,exemplars,benchmark-specimens,review.md}` | 11 paper artifacts; schemas locked |
| Finding codes ref | `.../finding-codes.md` | 9 defined + ~292 reserved |
| Contribution guide | `.../contribution.md` | spec/policy doc |
| Growth trajectory | `.../growth-trajectory.md` | long-term catalog model |
| Roadmap entry | `docs/roadmap.md #6` | status: in-progress; spec + plan attached |

### Cross-cutting

| Artifact | Path | Note |
|---|---|---|
| Initiative README (prior art) | `docs/changes/design-pipeline/REFERENCES.md` | 60 entries unchanged |
| Architecture amendments | `docs/changes/design-pipeline/AMENDMENTS.md` | discovered issues for spec amendment |
| ADR 0018 | `docs/knowledge/decisions/0018-llm-judgment-skill-pattern.md` | new pattern |
| ADR 0019 | `.../0019-3-axis-craft-output-model.md` | new pattern |
| ADR 0020 | `.../0020-living-catalog-h-pattern.md` | new pattern |
| ADR 0021 | `.../0021-detect-and-offer-b-prime-pattern.md` | new pattern |
| Initiative parent #316 | `docs/roadmap.md` | reframed two-layer (floor + ceiling); blockers updated to include #6 |
| #0 brand-guidelines decision | `docs/roadmap.md` | filed and assigned (still no ADR drafted) |
| Learnings | `.harness/learnings.md` | new entry: autopilot constraint + skill location convention + visual pipeline non-availability |

## Decisions waiting for you (read `AMENDMENTS.md` for full detail)

1. **Skill source-location amendment.** Both specs reference `packages/cli/src/skills/<name>/src/` which doesn't exist. Right home is `agents/skills/<platform>/` (markdown) + `packages/cli/src/mcp/tools/` (MCP tools) + `agents/skills/shared/design-knowledge/` (catalogs). The skill scaffolding is in the correct place; the proposals' "Technical Design — File layout" sections need editing before Phase 1 implementation work.

2. **Visual pipeline Q3 go/no-go for #6.** `playwright` is not installed in this repo and vision-LLM render pipeline doesn't exist. Spec documented fallback is code-only mode. Plan Task 12 is the explicit decision gate. Either accept the downgrade or schedule the playwright integration as a precursor.

3. **ADR numbering correction in spec text.** Spec for #6 references ADRs 0004-0007 as the four new patterns; actual ADRs filed as 0018-0021 (existing 0004-0007 slots taken). Spec text should be updated to match filed numbers.

4. **`BenchmarkScore.overall` aggregation rule.** Spec says "weighted aggregate" without specifics. Spike recommended equal-weight mean with config override + min for confidence. Need to make the call and update the spec.

5. **Pre-existing ADR duplicate numbers (0003-0007 range).** Out of scope but worth flagging — README says "Never reuse a number." Probably a 1-commit cleanup ADR.

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
