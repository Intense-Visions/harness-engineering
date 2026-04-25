---
'@harness-engineering/orchestrator': patch
'@harness-engineering/dashboard': patch
---

Add runtime validation for JSON.parse calls flagged by security scan

- orchestrator: validate persisted maintenance history with Zod schema instead of bare Array.isArray check
- dashboard: add structural type guards (object + discriminator check) before casting parsed WebSocket/SSE messages
