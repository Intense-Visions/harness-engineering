---
'@harness-engineering/dashboard': minor
---

feat(dashboard): specialized skill-result views and chat session improvements.

- Specialized result views per skill render structured output (status, artifacts, decisions, follow-up actions) instead of raw JSON dumps.
- Interaction buttons (Approve / Revise / Stop) wired into the chat surface so confirmation flows complete in-product without copy-paste.
- Fix: chat sessions now persist across page navigation and full reload (previously lost on route change).
