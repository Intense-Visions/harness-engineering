# Claude Code — Project Instructions

See [AGENTS.md](AGENTS.md) for full project context, architecture,
and conventions.

Global, cross-project rules live in `~/.claude/CLAUDE.md` (auto-loaded).
Repo-local config here always takes precedence.

## Branch Hygiene

Before making any code changes, check the current branch with
`git branch --show-current`.

If on `main`:

- Do not start writing or modifying code yet.
- Propose a branch name using the convention in AGENTS.md
  (`<prefix>/<kebab-case-slug>`).
- Ask: _"You're on `main`. Should I create branch
  `<suggested-name>` for this work?"_
- Wait for confirmation, then create and switch to the branch
  before proceeding.

Documentation-only commits (`AGENTS.md`, `README.md`, `CLAUDE.md`,
etc.) may land on `main` directly unless the user says otherwise.
