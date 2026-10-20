---
'@harness-engineering/dashboard': patch
---

Raise the `hono` security floor to the patched `4.13.11` (GHSA-5r4p-p66f-jhc7, CVE-2026-111757, moderate).

`serveStatic` decoded the request path a second time after Hono had already decoded it for
routing, so a crafted percent-encoded path could be routed as one path and served as another —
bypassing middleware mounted on a static prefix (CWE-174). The root `pnpm.overrides` floor was
`>=4.13.5`, which permitted the vulnerable `4.13.7` that was actually resolved; the dashboard's
declared range was `^4.12.18`. Both now sit at the patched version and agree.

Bump level is `patch`: the dashboard's declared dependency range moves within the same major,
no public API changes, and the dashboard's own static-file code path is untouched by the
upstream fix (it calls `@hono/node-server`'s `serveStatic`, not Hono's).
