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
