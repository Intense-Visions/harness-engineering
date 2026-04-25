---
type: business_process
domain: orchestrator
tags: [dispatch, agent, workspace, retry, lifecycle]
---

# Agent Dispatch Lifecycle

When an issue is selected for dispatch, it enters a structured lifecycle from workspace preparation through completion or failure recovery.

## Run Phases

1. **PreparingWorkspace** — Create ephemeral git worktree based on configured baseRef
2. **BuildingPrompt** — Render template with issue context (title, spec, plans, labels)
3. **LaunchingAgent** — Start agent subprocess with backend-specific configuration
4. **InitializingSession** — Backend setup (Claude API, local model, container, etc.)
5. **StreamingTurn** — Agent produces events (text, thoughts, code, status, usage)
6. **RateLimitSleeping** — Wait if rate limit hit (respects global cooldowns)
7. **Finishing** — Post-processing and cleanup

## Terminal States

- **Succeeded** — Agent completed task successfully
- **Failed** — Agent encountered unrecoverable error
- **TimedOut** — Execution exceeded configured timeout
- **Stalled** — No progress detected within threshold
- **CanceledByReconciliation** — Issue state changed externally during execution

## Retry and Recovery

On failure: increment attempt counter, check retry budget (configurable per scope tier), schedule exponential backoff retry (10s x 2^(attempt-1), capped at 5 min). If budget exceeded, escalate to human interaction queue with full context.

## Workspace Lifecycle

Each dispatch gets a fresh ephemeral workspace (git worktree). A best-effort git fetch runs before creation. Stale worktrees are removed before re-dispatch. On completion or abandonment, the workspace is cleaned up to reclaim disk.
