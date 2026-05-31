---
'@harness-engineering/orchestrator': patch
---

Close stall-detector gap for zero-event agents.

The stall detector in `asyncTick` short-circuited when `session?.lastTimestamp` was null, with the comment "still initializing." This left no upper bound on initialization: any dispatched agent that emits zero session events (silent crash, broken backend stream, hung subprocess before first stdout) sat in `state.running` indefinitely. Over a long-running orchestrator process these zero-event entries accumulated until `running.size >= maxConcurrentAgents`, at which point `canDispatch` silently returned false for every new candidate and the roadmap appeared to be ignored. Restart wiped the in-memory map and dispatch resumed — matching the user-observed "restart fixes it" workaround.

Extracts detection into a pure `detectStalledIssues` helper that falls back to `entry.startedAt` when `session.lastTimestamp` is null. Zero-event agents now stall-detect after `stallTimeoutMs` since dispatch and follow the existing retry/escalate path that removes them from `running`.
