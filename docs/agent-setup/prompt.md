<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# Set up Harness Engineering

Official instructions to install and initialize harness in this project. Complete every step yourself by running the commands directly. Do not ask the user to run them. These instructions are published at <https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md>.

## Prerequisites (check these first)

Verify these yourself before installing:

- **Node.js >=22.0.0** — run `node --version`. This is a hard requirement: `harness setup` / `harness doctor` fail below it. If it is older (or Node is missing), install or switch first, e.g. via nvm: `nvm install 22 && nvm use 22`.
- **npm** — bundled with Node; needed for `npm install -g @harness-engineering/cli`.
- **A git repository at the project root** — harness is git-centric (roadmap merge-driver, worktrees). If this directory isn't a git repo yet, run `git init` first.
- **Run every command from the project root.**

## 1. Install harness (recommended — universal, one command)

```bash
npm install -g @harness-engineering/cli && harness setup
```

`harness setup` auto-detects every AI client on this machine (Claude Code, Gemini CLI, Antigravity CLI, Codex CLI, Cursor, OpenCode) and lays down skills, slash commands, agent personas, MCP, and hooks. Prefer this path: it is a single shell command you can run yourself, and it covers every client — including ones with no marketplace plugin.

### Optional: marketplace plugin (Claude Code / Gemini CLI / Antigravity CLI / Codex CLI / Cursor)

For auto-update via `/plugin update` (and, on Cursor, curated project rules), the user can also install the marketplace plugin for their client. These are interactive client slash-commands, not shell commands, so ask the user to run the pair matching their client:

**Claude Code**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-claude
```

**Gemini CLI**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-gemini
```

**Antigravity CLI**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-antigravity
```

**Codex CLI**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-codex
```

**Cursor**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-cursor
```

If you cannot identify the client, or it has no plugin above, the npm + `harness setup` path already covers it — nothing more is needed.

## 2. Initialize harness in the project

```bash
harness init
```

Scaffolds harness into the project; skips cleanly if already initialized. This is the one place you may pause and ask the user — only if scaffolding needs a human decision.

## 3. Verify

```bash
harness validate
harness doctor
```

## Success

Harness is installed and initialized. Try `/harness:onboarding` to get oriented. See the project README for full documentation.
