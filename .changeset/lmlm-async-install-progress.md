---
'@harness-engineering/orchestrator': minor
'@harness-engineering/dashboard': minor
'@harness-engineering/local-models': minor
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

Fixes a refresh-tick ordering bug where the pool was diffed against the ranking
**before** the re-ranked scores were written back. A freshly-installed member
enters the pool at `currentScore: 0` until its first re-rank, so diffing first
produced phantom swap proposals justified as "replace a pool member scoring 0"
(and inflated `scoreDelta`s). The tick now re-scores the pool before diffing.

Wires the ranker's long-intended lineage interpolation: a candidate with no direct
benchmark used to floor to `score: 0` while labelled `evidence: 'interpolated'` (a
misnomer — nothing was interpolated), so real models like `Qwen/Qwen3-8B-GGUF`
showed "score 0 · interpolated" and churned the pool once installed. The ranker now
infers a score from same-series siblings by parameter count (linear in size, clamped
to the measured range, dampened by `'low'` benchmark confidence so it never outranks
a direct measurement of equal raw value); only a series with no measured sibling
still scores 0.

Adds resumable-pull resilience to `OllamaInstallAdapter` (new `maxPullRetries` /
`pullRetryBackoffMs` / `pullRetryMaxBackoffMs` options; orchestrator opts in with
5 retries). A multi-GB `ollama pull` that loses its `/api/pull` stream mid-download
— most often the host sleeping mid-install — now re-issues the pull (ollama resumes
from cached blobs) instead of dead-ending in an error. The failure budget is
measured in consecutive non-progressing attempts, so any forward byte progress
resets it and an install survives repeated sleep cycles as long as it keeps
advancing; a canceled request or a genuinely-missing model still fails fast.
