# Phase 5 Verification Report — Init Design + Roadmap Configuration

**Date:** 2026-05-03
**Spec:** `docs/changes/init-design-roadmap-config/proposal.md`
**Session:** `changes--init-design-roadmap-config--proposal`
**Phase:** 5 of 5 (Verification)
**Verdict:** PASS

## Spec Item → Test Mapping

Proposal Success Criteria are organized as: Behavioral (1–5), State (6–9), Validation (10–12), Idempotency (13–14), Backwards Compatibility (15).

| Spec Item         | Description                                                                                                                     | Test Artifact                                                                                                 | Verdict             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| #4                | When design=yes AND roadmap=yes, "Set up design system" appears as `planned` under `Current Work`                               | `packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts`                                      | PASS                |
| #6                | `harness.config.json` contains `design.enabled: true` + `design.platforms: [...]` after "yes"                                   | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (post-state)                              | PASS                |
| #7                | `harness.config.json` contains `design.enabled: false` after "no"                                                               | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (post-state)                              | PASS                |
| #8                | `harness.config.json` does NOT contain `design.enabled` after "not sure"                                                        | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (post-state)                              | PASS                |
| #9                | `docs/roadmap.md` exists after "yes" to roadmap question                                                                        | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (file check)                              | PASS                |
| #10               | `harness validate` passes for all 6 answer combinations                                                                         | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (6 scenarios)                             | PASS                |
| #11               | `design` schema validates with `enabled` + `platforms` fields populated correctly                                               | `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` (validate)                                | PASS                |
| Phase 4 follow-up | Skills catalog ↔ SKILL.md consistency via `check-docs` + grep (Phase 4 implementation-order item, not a Success Criteria entry) | `packages/cli/tests/integration/skill-catalog-consistency.test.ts` + `harness check-docs`                     | PASS                |
| #1                | Design question fires (yes/no/not-sure) for non-test-suite projects                                                             | Manual — interactive prompt lives in skill prose, not in `runInit`                                            | DEFERRED            |
| #2                | Design question never fires for test-suite projects                                                                             | Manual — dispatch to `initialize-test-suite-project` happens before step 5b                                   | DEFERRED            |
| #3                | Roadmap question fires for all projects (including test suites)                                                                 | Manual — interactive prompt lives in skill prose                                                              | DEFERRED            |
| #5                | Linked roadmap item does NOT appear when either answer is no/not-sure                                                           | Implicitly covered by matrix scenarios (5 of 6 cases write no design item) — see phase5-rev-002 strengthening | PASS (strengthened) |
| #12               | `harness-design-system` via `on_new_feature` reads `design.enabled` and behaves correctly (tri-state)                           | Manual — runtime behavior in a different skill, requires live `on_new_feature`                                | DEFERRED            |
| #13               | `--migrate` does not duplicate the "Set up design system" roadmap item                                                          | Manual — idempotency of interactive re-run                                                                    | DEFERRED            |
| #14               | Re-running with different design answers updates `design.enabled` in place                                                      | Manual — idempotency of interactive re-run                                                                    | DEFERRED            |
| #15               | Projects without `design.enabled` (pre-change) continue to work                                                                 | Manual — back-compat across an upgrade boundary                                                               | DEFERRED            |

Test totals: 6 (matrix) + 1 (e2e) + 3 (consistency) = **10 new tests**, all passing. Of 15 Success Criteria items: 7 covered by automated tests (#4, #6, #7, #8, #9, #10, #11), 1 implicitly covered with strengthened assertions (#5), 7 deferred to manual verification (#1, #2, #3, #12, #13, #14, #15). The catalog-consistency test is a Phase 4 implementation-order follow-up, not a Success Criteria item.

## Approach

Approach (B), fixture-based scenario tests, was selected over Approach (A) live LLM-driven init runs (cannot be automated in CI) and Approach (C) subprocess-shell init with stdin scripting (heavier, brittle — the interactive prompt path lives in skill prose, not in `runInit`'s programmatic surface).

The matrix test (Task 1) scaffolds via `runInit`, then mutates `harness.config.json` and writes `docs/roadmap.md` to simulate the post-step-5b and post-step-4 states. The single true e2e (Task 2) covers spec item #14 verbatim via `parseRoadmap` structural assertion. The consistency test (Task 3) locks the post-Phase-4 vocabulary in place and guards against the "created via manage_roadmap" regression string returning.

`runValidate` was invoked in-process with both `cwd` and `configPath` set to the temp dir's `harness.config.json` so the fixture is self-contained and does not bleed into the host repo.

`serializeRoadmap` was given the full `Roadmap` shape (including `frontmatter`, `isBacklog`, and the extended feature fields) — confirmed against the canonical fixture in `packages/core/tests/roadmap/fixtures.ts`.

## Coverage Baseline

`harness check-docs` reports: **72.0%** (Phase 4 baseline 72.0% preserved exactly — within ±0.5% tolerance). No new undocumented files introduced by Phases 1–4. The 277 undocumented TS files pre-date this change set and remain on the carry-forward list.

## Carry-Forward Concerns (Acknowledged, NOT Fixed)

- [CARRY-FORWARD-DTS] Pre-existing DTS-only typecheck failures in `packages/cli/src/commands/graph/ingest.ts`, `packages/cli/src/commands/knowledge-pipeline.ts`, `packages/cli/src/mcp/tools/graph/ingest-source.ts`. Untouched.
- [CARRY-FORWARD-COMMITS] Concurrent unrelated commits `52ff1341` and `2573809f` are not part of this change set.
- [CARRY-FORWARD-COVERAGE] `harness check-docs` 72.0% baseline preserved; 277 undocumented TS files acknowledged.
- [CARRY-FORWARD-ARCH] Pre-commit arch warnings on unrelated files. No new arch warnings on Phase 5 test files.
- [CARRY-FORWARD-DEFER-S2] proposal.md:146 stale Registrations bullet — deliberately deferred (Phase 4 plan).
- [CARRY-FORWARD-DEFER-S3] skill.yaml `depends_on` should add `harness-roadmap` — deliberately deferred (Phase 4 plan).
- [CARRY-FORWARD-NEW-PHASE4] `pnpm run generate-docs --check` produces unrelated drift in `cli-commands.md` and `mcp-tools.md`. Phase 5 does not regenerate these reference docs.
- [CARRY-FORWARD-PHASE4-REVIEW] 3 non-blocking Phase 4 review suggestions remain on the carry-forward list.

## Manual Verification Still Required

The following cannot be automated in CI and should be exercised on a real LLM-driven init session:

- The actual `emit_interaction` prompt copy in **Phase 3 step 5b** matches `agents/skills/claude-code/initialize-harness-project/SKILL.md` (the design-system question with yes / no / not-sure branches and the platform follow-up).
- The actual `emit_interaction` prompt copy in **Phase 4 step 4** matches SKILL.md (the roadmap question with yes / no branches and the conditional `manage_roadmap action: add` for the design item).
- The "Inform the user" line for the **yes branch** of the design-system question is rendered as expected — i.e., the user sees the deferral explanation that the actual `harness-design-system` skill will fire on the first design-touching feature.
- A real `manage_roadmap` MCP tool call from inside an active session writes `docs/roadmap.md` matching the fixture format used in the e2e test (frontmatter + `Current Work` milestone + planned `Set up design system` feature).
- **Proposal #2 (test-suite skip):** Run init on a Playwright or Cypress repo and confirm the design question (Phase 3 step 5b) never fires — Phase 1 step 5 dispatches to `initialize-test-suite-project` before step 5b.
- **Proposal #3 (test-suite roadmap):** On the same test-suite project, confirm the roadmap question (Phase 4 step 4) DOES fire — test suites benefit from roadmap tracking even though they have no UI.
- **Proposal #12 (`harness-design-system` runtime tri-state via `on_new_feature`):** Trigger `on_new_feature` on three projects: one with `design.enabled: true` (skill fires fully), one with `design.enabled: false` (skill skips silently), and one with `design.enabled` absent (gentle prompt). Confirm each branch behaves per spec.
- **Proposal #13 + #14 (idempotency):** Re-run `initialize-harness-project --migrate` on an already-configured project; confirm (a) the "Set up design system" roadmap item is not duplicated and (b) re-running with a different design answer (e.g., `yes` → `no`) updates `design.enabled` in place rather than appending.

The canonical example reproducing the yes/yes path lives in `agents/skills/claude-code/initialize-harness-project/SKILL.md`. Operators conducting manual verification should compare the live session transcript against that example.

## Sign-Off

Automated coverage spans 7 of 15 Success Criteria items (#4, #6, #7, #8, #9, #10, #11), plus item #5 implicitly covered with strengthened absence-of-design-item assertions in the matrix test, plus the Phase 4 catalog-consistency follow-up. **7 items (#1, #2, #3, #12, #13, #14, #15) remain pending manual verification** — primarily interactive prompt behavior, runtime tri-state in a downstream skill, idempotency of `--migrate`, and back-compat across the upgrade boundary. The eight carry-forward concerns from prior phases are acknowledged and remain non-blocking. Two follow-up commits (S2 + S3) remain outstanding per the Phase 4 plan.

**Phase 5 — automated verification complete for the automatable subset; 7 items pending manual or follow-up verification.**
