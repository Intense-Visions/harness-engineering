---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add user-level trusted autonomy mode: `resolveAutonomy` with flag/session/env/user-config precedence, a home-dir session-override store whose agent-callable path (`manage_state set-autonomy`) can only lower autonomy, a `gather_context` `autonomy` include, and `harness autonomy show|set`.
