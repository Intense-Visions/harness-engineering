---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): local (Ollama) agent reads the worktree AGENTS.md/CLAUDE.md — repo conventions like a cloud session

A cloud (Claude Code) dispatch auto-reads `AGENTS.md`/`CLAUDE.md` into its context, so
it knows the repo's conventions — including that specs go to `docs/changes/<slug>/
proposal.md`. The local Ollama agent got only a generic "you are a coding agent"
system prompt with ZERO repo context, so it never learned the conventions and invented
paths (e.g. writing the spec to `packages/.../specs/`). The Ollama backend now reads
`AGENTS.md` + `CLAUDE.md` from the worktree at session start and prepends them to the
system prompt (head-truncated to a budget for the local context window, since the
conventions live near the top). This aligns the local agent with the cloud path and
fixes convention-following at the root rather than hardcoding individual paths.
