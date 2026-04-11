# Plan: Pipeline Skill Updates

**Date:** 2026-04-10 | **Spec:** docs/changes/pipeline-token-optimization/proposal.md | **Tasks:** 6 | **Time:** ~20 min

## Goal

Update all 5 pipeline skills to accept artifact paths and session slugs as arguments so they work both standalone (manual invocation) and as phase-agents (orchestrator invocation).

## Observable Truths

1. Each skill.yaml has `session-slug` argument defined (5 files)
2. harness-planning skill.yaml has `spec-path` argument
3. harness-execution skill.yaml has `plan-path` argument
4. harness-code-review skill.yaml has `commit-range` argument
5. Each SKILL.md has an "Argument Resolution" section documenting arg-first resolution with fallback to discovery
6. `harness validate` passes

## File Map

```
MODIFY agents/skills/claude-code/harness-brainstorming/skill.yaml
MODIFY agents/skills/claude-code/harness-planning/skill.yaml
MODIFY agents/skills/claude-code/harness-execution/skill.yaml
MODIFY agents/skills/claude-code/harness-verification/skill.yaml
MODIFY agents/skills/claude-code/harness-code-review/skill.yaml
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md
MODIFY agents/skills/claude-code/harness-planning/SKILL.md
MODIFY agents/skills/claude-code/harness-execution/SKILL.md
MODIFY agents/skills/claude-code/harness-verification/SKILL.md
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md
MODIFY docs/changes/pipeline-token-optimization/delta.md
```

## Tasks

### Task 1: Add args to all 5 skill.yaml files

### Task 2: Add Argument Resolution to brainstorming SKILL.md

### Task 3: Add Argument Resolution to planning SKILL.md

### Task 4: Add Argument Resolution to execution SKILL.md

### Task 5: Add Argument Resolution to verification + code-review SKILL.md

### Task 6: Update delta.md

_Skeleton not produced — task count (6) below threshold (8)._
