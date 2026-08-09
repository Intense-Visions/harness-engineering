---
'@harness-engineering/orchestrator': patch
---

`OrchestratorServer.start()` now rejects when the port cannot be bound, and adopts the OS-assigned port when constructed with `0`.

`listen()` was called with no `'error'` listener, so a bind failure did two bad things at once: the error surfaced as an unhandled `'error'` event (under a test runner, an "Uncaught Exception" attributed to nothing in particular), and the returned promise never settled. An `EADDRINUSE` collision therefore presented as a multi-minute hang until the caller's timeout, rather than as a bind failure — a real hazard for any embedder that starts the server on a port something else already holds.

`start()` now attaches one-shot `'error'`/`'listening'` handlers, rejects with the host, port, and underlying cause on failure, and on success adopts the actual bound port so passing `0` yields a usable ephemeral port. The new `boundPort` getter exposes it.
