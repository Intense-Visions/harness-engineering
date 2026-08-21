---
'@harness-engineering/orchestrator': patch
---

Make the orchestrator HTTP server's 429 rate-limit response actionable.

The rate-limit rejection previously returned `{ error: 'Too Many Requests' }` — a bare
human string that only restated the HTTP status. A consumer could not branch on it (no
stable machine `code`), and the retry budget lived only in the `Retry-After` header. The
`429` branch of `checkRateLimit` now returns `{ error: { code: 'rate_limited', message:
'Rate limit exceeded', retryAfterSeconds: <n> } }`, exposing a stable machine code and
the retry budget in the body. The existing `Retry-After` header is preserved.
