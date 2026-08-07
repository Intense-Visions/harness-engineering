---
'@harness-engineering/cli': minor
---

Add an opt-in, **multi-agent** `session-retrospect` trigger so end-of-session analysis reaches manual, interactive sessions across every agent the harness supports — Claude Code, Gemini CLI, Codex CLI, and Cursor.

The session-archive lifecycle runs its `onArchived` step (summary, index, and retrospection) only when a session is archived, and the only caller that archives a session is the `archive_session` state action used by autonomous flows. A manually driven session is otherwise never archived, so its end-of-session analysis never runs. This trigger closes that gap: at session end it archives the active session through the same public archive seam, so `onArchived` fires for manual sessions too.

- **One archive engine, many agents.** An agent-agnostic core (opt-in gate + once-per-session dedupe + archive call) is shared by a thin per-agent entry point. When hooks are installed at the `standard` (or `strict`) profile, the trigger is wired into each detected agent's native config: Claude Code `Stop` in `.claude/settings.json`, Gemini CLI `SessionEnd` in `.gemini/settings.json`, Codex CLI `notify` (agent-turn-complete) in `.codex/config.toml`, and Cursor `stop` + `sessionEnd` in `.cursor/hooks.json`. Only agents whose project config dir is present are wired; unrelated user config is preserved and installs are idempotent.
- **Opt-in.** Every agent's trigger is a no-op unless `HARNESS_SESSION_RETROSPECTION` is enabled — the same flag that gates the retrospection step inside the archive lifecycle.
- **Once per session.** Because a session-end hook can fire more than once (Claude's `Stop` on every turn-stop; Codex's `notify` on every turn), the trigger archives at most once per session, keyed on the agent's session id via a sentinel under `.harness/state/retrospection/`. A fire that finds no session writes no sentinel, so a session created later in the same run is still caught.
- **Fail-soft.** Any error is swallowed and the hook exits 0, never blocking or delaying session exit.
- **Known limitation (Cursor CLI).** Cursor's `sessionEnd` is IDE-only and the local `cursor-agent` CLI has historically emitted only shell-execution events. The trigger is wired for both `stop` and `sessionEnd` so it works in the Cursor IDE agent today and in the local CLI the moment it emits these events. Codex `notify` holds a single program, so an existing non-harness `notify` is reported as a conflict and left untouched rather than clobbered.
