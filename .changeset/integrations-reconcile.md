---
'@harness-engineering/cli': minor
---

Add `harness integrations sync` — reconcile a project's configured MCP
servers against the refreshed catalog, with the operator's consent. It diffs
the configured servers against `INTEGRATION_REGISTRY`, shows what's newly
suggested (e.g. github, exa, harness) and what's deprecated (perplexity,
augment-code, sequential-thinking), and applies changes only on agreement:
report-only by default; `--apply` prompts per group in a TTY; `--yes` applies
non-interactively; a non-TTY run without `--yes` never mutates (safe in
automation). Additions/removals reuse the existing add/remove/dismiss config
plumbing; Tier-1 servers surface their required env var and never invent a
secret. `harness doctor`'s freshness advisory points at it.
