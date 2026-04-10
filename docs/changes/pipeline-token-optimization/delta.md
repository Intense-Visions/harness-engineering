# Delta: Session-Scoped Handoff (Phase 2)

**Date:** 2026-04-10
**Plan:** docs/plans/2026-04-10-session-scoped-handoff-plan.md

## Changes

### Pipeline Skills

- [MODIFIED] harness-brainstorming: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known; global path deprecated
- [MODIFIED] harness-planning: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known; global path deprecated
- [MODIFIED] harness-execution: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known; global path deprecated
- [MODIFIED] harness-verification: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known; global path deprecated
- [MODIFIED] harness-code-review: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known; global path deprecated
- [ADDED] All 5 skills: explicit `[DEPRECATED]` notice for global `.harness/handoff.json` writes
- [ADDED] All 5 skills: `artifacts.json` documented in session directory structure (`handoff.json`, `state.json`, `artifacts.json`)

### CLI

- [ADDED] `harness cleanup-sessions` — removes session directories where most recent file write is older than 24h
- [ADDED] `harness cleanup-sessions --dry-run` — lists stale sessions without deleting

## Invariants

- Global `.harness/handoff.json` remains supported as a fallback for standalone (non-session) invocations
- Session directory structure: `handoff.json`, `state.json`, `artifacts.json`
- Stale TTL: 24 hours based on most recent file mtime within the session directory

# Delta: Autopilot Orchestrator Refactor (Phase 3)

**Date:** 2026-04-10
**Plan:** docs/plans/2026-04-10-autopilot-orchestrator-refactor-plan.md

## Changes

### harness-autopilot

- [MODIFIED] SKILL.md rewritten as lightweight orchestrator: 664 → 247 lines (63% reduction)
- [REMOVED] Verbose inline agent prompt templates (scratchpad instructions, state-management detail) — delegated entirely to each persona skill's own SKILL.md
- [REMOVED] Verbose schema migration field-by-field detail — kept as single migration step
- [REMOVED] `## Success Criteria` section — absorbed into Gates
- [REMOVED] `## Harness Integration` verbose explanations — compressed to 4-line summary
- [KEPT] All 10 state machine states with correct transitions
- [KEPT] All 5 gates
- [KEPT] All 5 escalation rules
- [KEPT] All 5 rationalizations-to-reject
- [KEPT] All 4 persona agent dispatch calls (PLAN, EXECUTE, VERIFY, REVIEW) + FINAL_REVIEW fix dispatch
- [KEPT] Rigor level table (fast/standard/thorough)
- [KEPT] Retry budgets: EXECUTE 3 attempts, FINAL_REVIEW 3 cycles
- [KEPT] Full example (3-Phase Security Scanner + Retry Budget Exhaustion)

## Invariants

- Agent dispatch prompts contain only: subagent_type, artifact paths (spec/plan), session slug, rigor level
- Each phase-agent receives no prior phase SKILL.md content or conversation history
- State machine transitions unchanged from prior version
- Iron Law preserved: "Autopilot delegates, never reimplements"
