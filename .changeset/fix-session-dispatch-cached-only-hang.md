---
'@harness-engineering/cli': patch
---

Fix the session-start skill-dispatch advisory that could hang every `harness` command indefinitely. The banner fires only on a git HEAD delta — which is exactly what invalidates the health-snapshot cache — so `enrichSnapshotForDispatch` always ran a fresh, expensive full `captureHealthSnapshot` (deps/entropy/graph analysis) and `main()` awaited it unbounded, blocking the CLI after any commit on a large repo. The session-start path is now `cachedOnly`, honoring its documented "always uses cached health snapshot for speed" contract: it degrades to the stale cached snapshot (or a neutral all-clear one) instead of capturing fresh, so the banner never blocks command completion.
