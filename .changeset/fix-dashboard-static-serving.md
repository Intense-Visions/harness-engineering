---
'@harness-engineering/dashboard': patch
'@harness-engineering/cli': patch
---

Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
