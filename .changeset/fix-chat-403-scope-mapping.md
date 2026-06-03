---
'@harness-engineering/orchestrator': patch
---

Fix HTTP 403 on `POST /api/chat`. Commit 261c4afc (2026-05-14) flipped the orchestrator scope check from default-permit to default-deny, but `/api/chat` was never added to `requiredScopeForRoute` — every chat request, including admin in unauth-dev mode, was hitting the unmapped-route 403 branch and breaking the dashboard "Discuss the escalation…" panel. Maps `/api/chat` (and the rewrite target `/api/chat-proxy`) to `trigger-job`, and broadens the chat-proxy handler URL match to accept both names so the `/api/v1/chat-proxy` alias no longer falls through to 404. Includes regression tests in `scopes.test.ts` covering both paths.
