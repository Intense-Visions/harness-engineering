---
'@harness-engineering/core': minor
'@harness-engineering/dashboard': patch
'@harness-engineering/orchestrator': patch
---

fix(dashboard,orchestrator): surface `err.cause` in proxy 502s and reject WHATWG bad ports at startup (#287)

The dashboard proxy was returning opaque `Orchestrator proxy error: fetch failed` 502s for every request when the orchestrator listened on a port the WHATWG fetch spec marks as "bad" (e.g. `10080`, `6000`, `6666`). `curl` does not enforce the bad-ports list, so the port appeared reachable from the shell — turning a one-line config fix into a multi-hour goose chase (see issue #287).

**`@harness-engineering/core`:**

- New `shared/port.ts` exports `WHATWG_BAD_PORTS` (frozen canonical list from [the fetch spec](https://fetch.spec.whatwg.org/#port-blocking)), `isBadPort(port)`, and `assertPortUsable(port, label?)`. `assertPortUsable` throws a clear, actionable error directing the user to choose a different port and linking the spec.

**`@harness-engineering/dashboard`:**

- `orchestrator-proxy.ts`: extracted `formatProxyErrorMessage(err)` that surfaces `err.cause.message` / `err.cause.code` alongside the base message. A `fetch failed` from a bad port now reads `Orchestrator proxy error: fetch failed (cause: bad port)`; `ECONNREFUSED`, `ENOTFOUND`, etc. are visible the same way.
- `getOrchestratorTarget()` logs a one-time `console.error` at resolution time if the configured target port is on the bad-ports list, so the failure mode is announced at startup rather than only per-request.
- `serve.ts`: calls `assertPortUsable(port, 'dashboard API')` before `serve()` so the dashboard refuses to start on an unreachable port.

**`@harness-engineering/orchestrator`:**

- `server/http.ts#start()`: calls `assertPortUsable(this.port, 'orchestrator')` before `httpServer.listen()` so the orchestrator refuses to start on a bad port. The `harness orchestrator start` flow now fails loudly with a clear message instead of starting, appearing healthy to `curl`, and silently breaking every dashboard request.
