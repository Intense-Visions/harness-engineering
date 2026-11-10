---
'@harness-engineering/orchestrator': patch
---

`AuditLogger.flush()` now drains writes enqueued while it is waiting, not just the
ones queued when it was called, and `OrchestratorServer` exposes `flushAudit()` so the
owner of the audit log's directory can drain the fire-and-forget request-path write
before removing it. The audit contract is unchanged: appends stay best-effort, are
never awaited by the request handler, and a failed write only warns.

Before this, a test that closed the server and removed its temp dir could leave an
audit write in flight; its late `[audit] write failed` warning landed after the vitest
worker tore down and failed an otherwise-green run with an error blamed on an
unrelated test file (#2265). The server test teardowns now drain the audit write first.
