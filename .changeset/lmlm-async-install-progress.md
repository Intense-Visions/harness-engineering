---
'@harness-engineering/orchestrator': minor
'@harness-engineering/dashboard': minor
'@harness-engineering/types': minor
---

fix(lmlm): async model install with WebSocket download progress

Operator model install (`POST /api/v1/local-models/pool/install`) now returns
`202 { disposition: 'installing' }` as soon as the pull is accepted and streams
byte-level download progress plus the terminal outcome over a new
`local-models:install` WebSocket topic, instead of blocking the HTTP response for
the entire `ollama pull`.

This fixes the `502 Orchestrator proxy error: fetch failed (cause: Headers Timeout
Error)` that a multi-GB pull triggered — the dashboard reverse-proxy's undici
`headersTimeout` (~5 min) fired because no response headers were sent until the
pull completed. The Recommendations panel now renders a live download progress bar
and surfaces retryable install errors.

Approving an `add`/`swap` model **proposal** (`POST /api/v1/proposals/:id/approve`)
also installs the target, so it shares the same async treatment: it returns `202`
and streams the download over `local-models:install`, and the Pending Proposals row
shows the same progress bar instead of hanging the Approve button until the proxy
times out. (`evict` approvals and rejects stay synchronous.)

The Recommendations panel also gains a **Refresh** button that triggers a
force-refresh tick (`POST /api/v1/local-models/refresh`) to recompute
recommendations on demand and refetch the panel.
