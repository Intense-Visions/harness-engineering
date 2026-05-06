---
track: knowledge-track
category: architecture-patterns
module: orchestrator
tags: [state-machine, leases]
problem_type: pattern
last_updated: 2026-04-15
---

# Lease cleanup pattern

When the orchestrator detects a stalled lease, the cleanup runs a 3-phase
reconciliation: detect, mark, evict.
