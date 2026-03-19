# Plan: Harness Autopilot Skill

**Date:** 2026-03-19
**Spec:** docs/changes/autopilot/proposal.md
**Estimated tasks:** 8
**Estimated time:** 32 minutes

## Goal

Create the `/harness:autopilot` skill — a conversation-based orchestrator with a lightweight state machine that chains planning, execution, verification, and review across multi-phase projects, pausing only at human decision points.

## Observable Truths (Acceptance Criteria)

1. When `/harness:autopilot` is invoked with a spec path, the system shall read the spec, identify phases with complexity annotations, and create `.harness/autopilot-state.json` with the initial state.
2. When a phase has `complexity: low`, the system shall auto-invoke planning via subagent and present the plan for approval.
3. When a phase has `complexity: high`, the system shall pause and instruct the user to run planning interactively.
4. When `complexity: low` is set but planning produces >10 tasks or >3 checkpoints, the system shall override complexity to `medium`.
5. When a task fails during execution, the system shall retry up to 3 times with escalating context before surfacing to the human.
6. When re-invoked after a context reset, the system shall resume from the exact state recorded in `.harness/autopilot-state.json`.
7. `agents/skills/claude-code/harness-autopilot/skill.yaml` validates against the skill schema.
8. `harness generate-slash-commands` produces `agents/commands/claude-code/harness/autopilot.md`.
9. `harness validate` passes after all files are written.

## File Map

```
CREATE agents/skills/claude-code/harness-autopilot/skill.yaml
CREATE agents/skills/claude-code/harness-autopilot/SKILL.md
GENERATE agents/commands/claude-code/harness/autopilot.md
GENERATE agents/commands/gemini-cli/harness/autopilot.toml
```

## Tasks

### Task 1: Create skill.yaml

**Depends on:** none
**Files:** agents/skills/claude-code/harness-autopilot/skill.yaml

1. Create directory `agents/skills/claude-code/harness-autopilot/`
2. Create `skill.yaml`:
   ```yaml
   name: harness-autopilot
   version: '1.0.0'
   description: Autonomous phase execution loop — chains planning, execution, verification, and review, pausing only at human decision points
   cognitive_mode: constructive-architect
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
   cli:
     command: harness skill run harness-autopilot
     args:
       - name: spec
         description: Path to approved spec document
         required: false
       - name: path
         description: Project root path
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-autopilot
       path: string
   type: rigid
   phases:
     - name: init
       description: Load spec, identify phases, restore state if resuming
       required: true
     - name: loop
       description: Execute state machine — assess, plan, execute, verify, review per phase
       required: true
     - name: complete
       description: Final summary and PR offering
       required: true
   state:
     persistent: true
     files:
       - .harness/autopilot-state.json
       - .harness/state.json
       - .harness/learnings.md
   depends_on:
     - harness-planning
     - harness-execution
     - harness-verification
     - harness-code-review
   ```
3. Run: `harness validate`
4. Commit: `feat(skills): add harness-autopilot skill.yaml`

### Task 2: Create SKILL.md — Header, When to Use, Iron Law

**Depends on:** Task 1
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md

1. Create `SKILL.md` with initial sections: heading, blockquote summary, When to Use (positive and negative conditions), Relationship to Other Skills table, and Iron Law.
2. Run: `harness validate`
3. Commit: `feat(skills): add autopilot SKILL.md header, when-to-use, iron law`

### Task 3: Write Process — INIT state

**Depends on:** Task 2
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md (append)

1. Append Process section with state machine diagram and Phase 1: INIT — Load Spec and Restore State.
   - Resume logic: check for existing autopilot-state.json
   - Fresh start: parse spec Implementation Order, extract phases with complexity annotations
   - Create autopilot-state.json with schema version 1
   - Load learnings and failures context
   - Transition to ASSESS
2. Run: `harness validate`
3. Commit: `feat(skills): add autopilot INIT state`

### Task 4: Write Process — ASSESS and PLAN states

**Depends on:** Task 3
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md (append)

1. Append ASSESS state:
   - Read current phase from state
   - Check if plan already exists (skip to APPROVE_PLAN)
   - Complexity decision matrix: low → auto-plan, medium → auto-plan with scrutiny, high → pause for interactive
2. Append PLAN state:
   - Auto-planning path: dispatch subagent with harness-planning, apply complexity override check (>10 tasks or >3 checkpoints bumps low→medium, >20 tasks or >6 checkpoints bumps low→high)
   - Interactive planning path: check for user-created plan, wait if not found
3. Run: `harness validate`
4. Commit: `feat(skills): add autopilot ASSESS and PLAN states`

### Task 5: Write Process — APPROVE_PLAN and EXECUTE states

**Depends on:** Task 4
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md (append)

1. Append APPROVE_PLAN state:
   - Always pauses for human input
   - Present plan summary (task count, checkpoints, estimated time, complexity)
   - Options: yes / revise / skip phase / stop
   - Record decision in state
2. Append EXECUTE state:
   - Dispatch execution subagent with plan + state + learnings + failures
   - Handle outcomes: all complete → VERIFY, checkpoint → surface to user, failure → retry
   - Retry logic: 3 attempts with escalating context (obvious fix → expanded context → full context)
   - Budget exhaustion: stop, present all attempts, ask user, record in failures.md
3. Run: `harness validate`
4. Commit: `feat(skills): add autopilot APPROVE_PLAN and EXECUTE states`

### Task 6: Write Process — VERIFY, REVIEW, PHASE_COMPLETE, and DONE states

**Depends on:** Task 5
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md (append)

1. Append VERIFY state: dispatch verification subagent, handle pass/fail with user options
2. Append REVIEW state: dispatch review subagent, handle blocking/non-blocking findings
3. Append PHASE_COMPLETE state: phase summary, record history, check for next phase, ask user to continue
4. Append DONE state: project summary, PR offering, final handoff, append learnings, set state to DONE
5. Run: `harness validate`
6. Commit: `feat(skills): add autopilot VERIFY, REVIEW, PHASE_COMPLETE, DONE states`

### Task 7: Write Harness Integration, Success Criteria, Examples, Gates, Escalation

**Depends on:** Task 6
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md (append)

1. Append Harness Integration section (validate, check-deps, state files, handoff, learnings)
2. Append Success Criteria (8 observable criteria from spec)
3. Append Examples section (3-phase security scanner walkthrough + retry budget exhaustion example)
4. Append Gates (5 hard stops: no reimplementing, no executing without approval, no skipping verify/review, no infinite retries, no manual state edits)
5. Append Escalation (5 scenarios: no Implementation Order, delegated skill failure, reorder phases, context limits, consecutive failures)
6. Run: `harness validate`
7. Commit: `feat(skills): add autopilot integration, criteria, examples, gates, escalation`

### Task 8: Generate slash commands and final validation

[checkpoint:human-verify]

**Depends on:** Task 7
**Files:** generated output

1. Run: `harness generate-slash-commands`
2. Verify generated file exists: `agents/commands/claude-code/harness/autopilot.md`
3. Run: `harness validate`
4. Run: `harness check-docs`
5. Commit: `feat(skills): generate autopilot slash commands`

## Task Dependencies

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 [checkpoint:human-verify]
```

All tasks are sequential — each appends to the SKILL.md built by the previous task.
