---
'@harness-engineering/cli': minor
---

Add an opt-in `session-retrospect` Stop hook so end-of-session analysis reaches manual, interactive sessions.

The session-archive lifecycle runs its `onArchived` step (summary, index, and retrospection) only when a session is archived, and the only caller that archives a session is the `archive_session` state action used by autonomous flows. A manually driven Claude Code / Cursor session is otherwise never archived, so its end-of-session analysis never runs. This hook closes that gap: at session end it archives the active session through the same public archive seam, so `onArchived` fires for manual sessions too.

- Registered in the `standard` (and `strict`) hook profile alongside the other `Stop` hooks. Off by default.
- Opt-in: the whole hook is a no-op unless `HARNESS_SESSION_RETROSPECTION` is enabled, the same flag that gates the retrospection step inside the archive lifecycle.
- Once per session: because a `Stop` hook fires on every turn-stop, the hook archives at most once per session, keyed on the session id via a sentinel recorded under `.harness/state/retrospection/`; every later stop for the same session is a no-op. A stop that finds no session to archive writes no sentinel, so a session created later in the same run can still be caught.
- Fail-soft: any error is swallowed and the hook exits 0, never blocking the session.
