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

**Update (second pass, 2026-05-23):** items 1-3 and 5 below are RESOLVED in the second commit batch. Only architectural decisions inherent to Phase 1 remain.

1. ~~**Skill source-location amendment.**~~ ✓ RESOLVED — both spec File-layout sections rewritten with corrected paths (`agents/skills/claude-code/` for skill markdown, `packages/{audit,design-craft}/` new packages for impl code, `packages/cli/src/mcp/tools/` for MCP tools, `agents/skills/shared/design-knowledge/` for catalogs).

2. ~~**Visual pipeline Q3 go/no-go for #6.**~~ ✓ RESOLVED — playwright MCP server (`mcp__playwright__browser_*`) used instead of npm dep. Confirmed available in this environment. Spec render-pipeline section rewritten. No new install required; users configure the MCP server one-time.

3. ~~**ADR numbering correction in spec text.**~~ ✓ RESOLVED — #6 proposal.md now references ADRs 0018-0021 with hyperlinks.

4. **`BenchmarkScore.overall` aggregation rule.** Deferred to Phase 1's first task. Spike recommendation: equal-weight mean with config override + `min` for confidence. Required for SC #34 (fixpoint detection).

5. ~~**Pre-existing ADR duplicate numbers (0003-0007 range).**~~ ✓ DOCUMENTED — ADR 0022 filed with renumbering plan (second-of-pair → 0023-0027). Execution is a separate follow-up PR (file moves + reference updates).

**New remaining decision** (surfaced by amendments work):
6. **`packages/audit/` and `packages/design-craft/` as new packages, or co-locate under `packages/cli/src/`?** The path corrections leave this open. Decided in Phase 1 first task of each sub-project. The choice affects build scripts, tsconfig refs, and whether the audit/craft code is consumable by non-CLI surfaces (e.g., the dashboard package).

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
