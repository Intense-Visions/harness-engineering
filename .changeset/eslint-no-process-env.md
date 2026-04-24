---
'@harness-engineering/eslint-plugin': minor
'@harness-engineering/orchestrator': patch
---

Add `no-process-env-in-spawn` ESLint rule and fix env leak in chat-proxy

- New rule detects `process.env` passed directly to child process spawn calls, preventing environment variable leaks
- Fix env leak in orchestrator chat-proxy identified by the new rule
