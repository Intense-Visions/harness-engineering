---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add user-level trusted autonomy mode: `resolveAutonomy` with flag/session/env/user-config precedence, a home-dir session-override store whose agent-callable path (`manage_state set-autonomy`) can only lower autonomy, a `gather_context` `autonomy` include, and `harness autonomy show|set`.

Raises can come only from `~/.harness/config.json` or an interactive `harness autonomy set`: the `HARNESS_AUTONOMY*` environment tier (reachable from a project `.env`) can only lower. A raise is bound to an existing `.harness/sessions/<slug>/`, expires (default 24h, `--for <duration>`), and is appended to `~/.harness/autonomy-audit.log`. Corrupt overrides fail closed, override writes are locked, and all worktrees of a repo share one override. A new minimal-profile `autonomy-guard` PreToolUse hook blocks agent raises via `harness autonomy set` and agent writes to `~/.harness` autonomy state.

Session slugs are now validated by one shared rule, so `resolveSessionDir` (and every `session` argument that reaches it) newly rejects slugs containing `:`, dot-only slugs (`.`, `...`), slugs with leading or trailing whitespace, and Windows reserved device names (`CON`, `NUL`, `COM1`, ...).
