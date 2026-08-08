---
slug: "codex-notify-path-resolvable"
milestone: "Intake"
order: 34
---

### Codex notify hook should emit a PATH-resolvable command, not an absolute path

- **Status:** planned
- **Spec:** [docs/changes/codex-notify-path-resolvable/proposal.md](../changes/codex-notify-path-resolvable/proposal.md)
- **Summary:** `harness update` writes `.codex/config.toml` `notify` as an absolute `["node", "<abs path>/.harness/hooks/session-retrospect-codex.js"]`, baking a machine-specific path into a shared file (churns per machine, breaks contributors/CI). Codex `notify` is shell-less and its CWD is not guaranteed to be the repo root, so the git-rev-parse shell trick used for Claude/Gemini/Cursor cannot apply. Fix: route through a PATH-resolvable command — `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` — backed by a new `harness hooks run <name>` subcommand that reads the JSON payload from argv and self-locates via the payload's `cwd`. Codex generator only; other agents unchanged.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1208
