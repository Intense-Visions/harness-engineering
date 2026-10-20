---
'@harness-engineering/dashboard': patch
---

Patch the `serveStatic` double-decode (GHSA-5r4p-p66f-jhc7 / CVE-2026-111757, moderate, CWE-174) in
both the gate-visible package and the code path the dashboard actually executes.

`serveStatic` decoded the request path a second time after it had already been decoded for routing, so
a crafted percent-encoded path could be routed as one path and served as another — bypassing middleware
mounted on a static prefix.

- `hono`: floor raised `>=4.13.5` -> `>=4.13.11` (the patched version). The old floor permitted the
  vulnerable `4.13.7` that was actually resolved. This is the advisory `pnpm audit` sees.
- `@hono/node-server`: floor raised `>=2.0.10` -> `>=2.1.3`. The dashboard imports `serveStatic` from
  this adapter, which carries its **own** copy of the vulnerable decode and does not use Hono's
  middleware. No advisory is filed against it, so no audit tool would ever have flagged it; bumping
  `hono` alone would have greened the gate without changing the executed code.

Declared ranges in `packages/dashboard` were brought up to match both floors so the two agree.

Bump level is `patch`: dependency ranges move within the same major and no public API changes. The
adapter's `serveStatic` does change behaviour beyond the fix — it now rejects request paths containing
`%` unless `allowPercentInPath` is set, and passes non-GET/HEAD requests to `next()` — neither of which
affects this dashboard (its built asset names are hash-based with no percent-encoding, and CORS
preflight is handled by middleware registered ahead of the static handler).
