---
type: business_process
domain: orchestrator
tags: [tick-loop, polling, reconciliation, dispatch]
---

# Tick Loop

The orchestrator runs a polling tick loop that fetches candidates, reconciles state, and dispatches agents.

## Tick Cycle

Each tick (e.g., every 2 seconds) performs:

1. **Fetch candidates** — Query the tracker for active issues
2. **Reconcile running** — Check if actively running issues have changed state externally (e.g., user blocked an in-progress issue)
3. **Reconcile completed** — If a completed issue reappears after grace period, release it for re-dispatch
4. **Intelligence pipeline** (optional) — Run spec enrichment, complexity scoring, concern signal detection, and simulation
5. **Select candidates** — Filter eligible issues and sort by priority
6. **Route** — For each candidate: detect scope tier, check concern signals, decide destination (human/primary backend/local backend)
7. **Dispatch** — Claim issue, launch agent subprocess, monitor session

## Reconciliation

The tracker is the source of truth. The orchestrator syncs state in-memory during each tick. Orphaned claims (issue claimed but not running) are released if the issue state changed to non-active. Stale claims from crashed orchestrators are released on next startup.

## Grace Period

Completed issues are tracked with timestamps. Re-dispatch is prevented within the grace period to account for tracker write-back latency.
