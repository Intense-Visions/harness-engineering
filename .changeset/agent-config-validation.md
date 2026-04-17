---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add `harness validate --agent-configs` for hybrid agent-config validation.

- Preferred path shells out to the [agnix](https://github.com/agent-sh/agnix) binary when it
  is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP).
- When agnix is unavailable (or disabled via `HARNESS_AGNIX_DISABLE=1`), the command runs a
  built-in TypeScript fallback rule set (`HARNESS-AC-*`) covering broken agents, invalid
  hooks, unreachable skills, oversize CLAUDE.md, malformed MCP entries, persona references,
  and `.agnix.toml` sanity.
- `harness init` now ships a default `.agnix.toml` so the agnix path works with no extra
  configuration.
- Supports `--strict`, `--agnix-bin`, `--json`, and `HARNESS_AGNIX_BIN` env override.
