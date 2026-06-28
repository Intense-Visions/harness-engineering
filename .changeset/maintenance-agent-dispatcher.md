---
'@harness-engineering/orchestrator': patch
---

Wire the maintenance `AgentDispatcher` to a real agent session. It was a stub that only logged "skill dispatch integration pending" and returned `{ producedCommits: false, fixed: 0 }`, so agent/skill-based maintenance tasks silently did nothing while the check/command runners worked.

A new `createAgentDispatcher` (extracted to `maintenance/agent-dispatcher.ts` for unit-testability) resolves the named backend from `agent.backends` via `createBackend`, drives a multi-turn `AgentRunner` session over the skill prompt in the worktree, and measures the outcome by diffing `HEAD` before/after — commit count (`git rev-list --count`), not the agent's self-report, is the source of truth for `fixed`/`producedCommits`. An unknown/unconfigured backend name degrades to a logged no-op instead of crashing the scheduler.
