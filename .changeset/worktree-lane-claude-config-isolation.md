---
'@harness-engineering/burn': patch
'@harness-engineering/core': patch
'@harness-engineering/orchestrator': patch
---

fleet: extend a build lane's isolation boundary beyond the git worktree to user-global `~/.claude` state via a per-lane `CLAUDE_CONFIG_DIR` config-dir override (#1299, ADR 0098).

- `@harness-engineering/core` adds a pure primitive `fleet/lane-state-isolation.ts` (`buildLaneStateEnvOverride` / `applyLaneStateEnv` / `resolveLaneClaudeConfigDir`) that redirects `~/.claude` into a sandbox under the worktree's gitignored `.harness/lane-state/`.
- `@harness-engineering/burn` `resolvePaths()` now derives the HUD store base from `CLAUDE_CONFIG_DIR` before falling back to `$HOME/.claude`, so a lane's HUD verification writes land in its sandbox instead of the operator's real store. Explicit `CLAUDE_HUD_*` overrides still win.
- `@harness-engineering/orchestrator` `buildSubprocessEnv` gains a `laneStateScope` option applying the override; `ClaudeBackend` threads it in, opt-in via `laneStateIsolation` / the `HARNESS_LANE_STATE_ISOLATION` flag (off by default so a normal single-run agent keeps its real login/credentials).
