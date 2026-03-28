## 2026-03-27 — Wave 1.1: Session Memory Schema & Types

- [skill:harness-execution] [outcome:success] All 3 tasks completed: types defined, re-exported, tested
- [skill:harness-execution] [outcome:gotcha] Adding a new re-export to packages/types/src/index.ts increases the arch check dependency-depth metric by 1. Must update .harness/arch/baselines.json to match.
- [skill:harness-execution] [outcome:decision] Included baseline update in the Task 2 commit since it is a legitimate growth from adding a new module, not a regression.

## 2026-03-27 — Wave 1.4: Skill Integration

- [skill:harness-execution] [outcome:success] All 5 tasks completed: gather_context extended with sessions include key, 3 SKILL.md files updated with Session State documentation
- [skill:harness-execution] [outcome:success] readSessionSections Result type unwrapping follows the same pattern as state/learnings/handoff in gather-context — consistent approach across all constituents
- [skill:harness-execution] [outcome:gotcha] sessions include key is additive to the default include set — must be explicitly requested via include: ["sessions"] to avoid overhead for existing callers

## 2026-03-27 — Wave 2.1: Skill Evidence Instructions

- [skill:harness-execution] [outcome:success] All 5 tasks completed: Evidence Requirements sections added to brainstorming, planning, execution, verification, and code-review SKILL.md files
- [skill:harness-execution] [outcome:decision] Verification skill uses FAIL/INCOMPLETE instead of [UNVERIFIED] prefix — uncitable claims are verification failures, not just flags
- [skill:harness-execution] [outcome:decision] Code-review skill discards findings without evidence during VALIDATE phase and downgrades uncitable observations to suggestion severity

## 2026-03-27 — Wave 2.2: Review Gate (Evidence Checking)

- [skill:harness-execution] [outcome:success] All 7 tasks completed: EvidenceCoverageReport type, evidence-gate module, barrel exports, output formatters, pipeline integration, integration tests, SKILL.md docs
- [skill:harness-execution] [outcome:gotcha] vitest does not support `toStartWith` matcher — use `toMatch(/^\[UNVERIFIED\]/)` instead
- [skill:harness-execution] [outcome:gotcha] Adding evidence-gate import to pipeline-orchestrator pushed module-size arch metric past baseline (45000 -> 45006). Updated baselines.json to accommodate legitimate growth.
- [skill:harness-execution] [outcome:decision] Evidence gate runs between Phase 5 (VALIDATE) and Phase 6 (DEDUP+MERGE) — tags uncited findings before dedup so the [UNVERIFIED] prefix survives into final output
