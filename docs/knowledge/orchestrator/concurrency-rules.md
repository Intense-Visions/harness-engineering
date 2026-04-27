---
type: business_rule
domain: orchestrator
tags: [concurrency, rate-limiting, claims, coordination]
---

# Concurrency and Coordination Rules

The orchestrator enforces concurrency limits and coordinates with other orchestrator instances to prevent duplicate dispatch.

## Concurrency Limits

- **Global concurrency** — Maximum agents running in parallel (configurable, e.g., 4)
- **Per-state concurrency** — Separate limits per issue state (e.g., max 2 in-progress issues simultaneously)

## Rate Limiting

Backend-specific limits enforce: requests/minute, requests/second, input tokens/minute, output tokens/minute. Backoff uses exponential delay (10s x 2^(attempt-1), capped at 5 min). Continuation retries use fixed 1s delay. Global cooldowns are respected when set by backends.

## Claim Coordination

When multiple orchestrators run concurrently:

1. Claims are optimistic — write claim then verify after 2s delay
2. Issue is assigned to orchestrator ID in the tracker
3. Race condition detected if another orchestrator overwrites the assignment
4. Stale claims (not heartbeated within TTL) are released as orphaned

## Candidate Eligibility

Issues must satisfy all conditions: active state (not terminal), not already claimed or running, not in completed grace period (prevents duplicate dispatch after completion), and if state is "todo" with blockers, all blockers must be in terminal state.

## Selection Order

Candidates are sorted by: priority ascending, then createdAt oldest first, then identifier lexicographic.
