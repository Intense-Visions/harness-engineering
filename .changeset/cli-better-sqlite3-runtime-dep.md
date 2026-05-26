---
'@harness-engineering/cli': patch
---

Add `better-sqlite3` as a runtime dependency. The CLI bundles orchestrator code that imports `better-sqlite3` (webhook queue, session search-index) and ships those chunks in `dist/`. Native bindings cannot be bundled by tsup, so the published `@harness-engineering/cli` package must declare `better-sqlite3` as a direct dependency. Without this, `npm i -g @harness-engineering/cli` succeeds but any sqlite-backed feature throws `Cannot find module 'better-sqlite3'` at runtime.
