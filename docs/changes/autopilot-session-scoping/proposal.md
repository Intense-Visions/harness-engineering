# Scoped Autopilot State: Per-Spec Session Directories

> Enable concurrent autopilot runs on different specs by scoping per-run state into session directories keyed by spec path.

**Date:** 2026-03-19
**Status:** Proposed
**Keywords:** autopilot, state-isolation, sessions, concurrent-execution, slugify, spec-scoping

## Overview

The autopilot skill currently stores all state in singleton files at `.harness/` root (`autopilot-state.json`, `state.json`, `handoff.json`). This means two concurrent autopilot runs on different specs in the same repo will clobber each other's state.

This change scopes per-run state files into `.harness/sessions/<slug>/` where `<slug>` is derived from the spec file path. Global append-only files (`learnings.md`, `failures.md`) remain at `.harness/` root.

### Goals

1. Enable concurrent autopilot runs on different specs without state collision
2. Preserve resume-from-state capability — each session directory is self-contained
3. Keep global learnings/failures shared across all runs
4. Minimal change — update SKILL.md references and agent delegation prompts only

### Non-Goals

- Migrating existing legacy state files (current run is nearly complete)
- Supporting concurrent runs on the _same_ spec (undefined behavior, user's problem)
- Adding session management commands (list/cleanup) — future work if needed

## Decisions

| #   | Decision                                                                             | Rationale                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Slugify the spec file path as session key**                                        | Deterministic, stable across runs, requires no spec parsing. Path is already unique per spec.                                             |
| 2   | **Nest under `.harness/sessions/<slug>/`**                                           | Clean separation from global files. `sessions/` directory makes intent obvious. Avoids cluttering `.harness/` root with slug directories. |
| 3   | **Global learnings.md and failures.md**                                              | Cross-cutting context useful across all runs. Append-only semantics make concurrent writes low-risk.                                      |
| 4   | **No backward-compatibility migration**                                              | Current in-flight run is nearly complete. Not worth adding dual-path code for a one-time transition.                                      |
| 5   | **Slug convention: strip `docs/` prefix, replace `/` and `.` with `--`, drop `.md`** | Human-readable, filesystem-safe, reversible. E.g., `docs/changes/autopilot/proposal.md` → `changes--autopilot--proposal`.                 |
| 6   | **Delegated agents receive session directory as explicit parameter**                 | Agents don't derive the slug themselves — the orchestrator passes the resolved path. Single source of truth for session location.         |

## Technical Design

### Slug Derivation

```
Input:  docs/changes/autopilot/proposal.md
Step 1: Strip leading "docs/" → changes/autopilot/proposal.md
Step 2: Drop trailing ".md" → changes/autopilot/proposal
Step 3: Replace "/" and "." with "--" → changes--autopilot--proposal
Step 4: Lowercase → changes--autopilot--proposal

Result: .harness/sessions/changes--autopilot--proposal/
```

More examples:

```
docs/changes/security-scanner/proposal.md → changes--security-scanner--proposal
docs/changes/design-system-skills/proposal.md → changes--design-system-skills--proposal
specs/feature.md → specs--feature
```

If the spec path does not start with `docs/`, skip step 1 (use full relative path).

### Directory Layout

```
.harness/
  learnings.md              # Global — shared across all runs
  failures.md               # Global — shared across all runs
  sessions/
    changes--autopilot--proposal/
      autopilot-state.json  # Orchestration state machine
      state.json            # Task-level execution state
      handoff.json          # Inter-skill communication
    changes--design-system-skills--proposal/
      autopilot-state.json
      state.json
      handoff.json
```

### Affected SKILL.md References

Every reference to the three singleton files changes to use the session directory:

| Current                         | New                                             |
| ------------------------------- | ----------------------------------------------- |
| `.harness/autopilot-state.json` | `.harness/sessions/<slug>/autopilot-state.json` |
| `.harness/state.json`           | `.harness/sessions/<slug>/state.json`           |
| `.harness/handoff.json`         | `.harness/sessions/<slug>/handoff.json`         |

### INIT State Changes

The INIT phase gains a slug derivation step before state file creation:

1. Resolve spec path (from argument or user input)
2. Derive slug from spec path
3. Set `sessionDir = .harness/sessions/<slug>/`
4. **Resume check:** If `<sessionDir>/autopilot-state.json` exists and `currentState` is not `DONE`, resume
5. **Fresh start:** Create `<sessionDir>/`, write `autopilot-state.json` there

The `autopilot-state.json` schema gains one field:

```json
{
  "schemaVersion": 2,
  "sessionDir": ".harness/sessions/changes--autopilot--proposal",
  "specPath": "docs/changes/autopilot/proposal.md",
  "currentState": "ASSESS",
  "currentPhase": 0,
  "phases": [],
  "retryBudget": {},
  "history": []
}
```

`schemaVersion` bumps to `2` to distinguish from legacy singleton state files.

### Agent Delegation Changes

All subagent prompts include the session directory explicitly:

```
Agent tool parameters:
  subagent_type: "harness-planner"
  prompt: |
    ...
    Session directory: .harness/sessions/<slug>/
    Write handoff to: .harness/sessions/<slug>/handoff.json
    Read/write state at: .harness/sessions/<slug>/state.json
    Learnings (global): .harness/learnings.md
    Failures (global): .harness/failures.md
```

### skill.yaml Changes

```yaml
state:
  persistent: true
  files:
    - .harness/sessions/*/autopilot-state.json
    - .harness/sessions/*/state.json
    - .harness/sessions/*/handoff.json
    - .harness/learnings.md
```

## Success Criteria

1. Two concurrent autopilot runs on different specs produce separate session directories and do not interfere with each other's state
2. Resume works per-session — re-invoking `/harness:autopilot` with a spec path finds the correct session directory and continues from recorded state
3. Global `learnings.md` and `failures.md` remain shared and are written to by all sessions
4. Slug derivation is deterministic — same spec path always produces the same slug
5. Schema version bumps to 2; legacy singleton files are ignored (no migration)
6. All delegated agents receive the explicit session directory path and never write to `.harness/` root for per-run state

## Implementation Order

### Phase 1: Update autopilot SKILL.md with session scoping

<!-- complexity: low -->

Update the harness-autopilot SKILL.md on both platforms (claude-code and gemini-cli) to replace all singleton state file references with session-scoped paths. Add slug derivation logic to INIT. Update agent delegation prompts. Bump schema version to 2.

### Phase 2: Update skill.yaml state declaration

<!-- complexity: low -->

Update `skill.yaml` on both platforms to use glob patterns for session state files. Run validation.
