---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add the `harness:rollback` post-ship revert primitive (roadmap #533). When a merged PR crosses a tracked signal threshold, the engine classifies revert-readiness (clean in-memory `git merge-tree` revert + no dependent later merge) and opens a full-context revert PR — **propose-only in v1; it never auto-merges** (ADR 0063). Adds `classifyRevert`/`RollbackDecision` to core, the `harness rollback evaluate` and `harness rollback sweep` CLI commands, the propose-only `rollback-propose.yml` workflow, a `rollback` config block, and a flag-gated dark eval arm (activates once outcome-eval runs post-merge, #31).
