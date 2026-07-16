<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# Set up Harness Engineering

Official instructions to install and initialize harness in this project. Complete every step yourself by running the commands directly. Do not ask the user to run them. These instructions are published at <https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md>.

## 1. Install harness (recommended — universal, one command)

```bash
npm install -g @harness-engineering/cli && harness setup
```

`harness setup` auto-detects every AI client on this machine (Claude Code, Cursor, Gemini CLI, Codex CLI, OpenCode) and lays down skills, slash commands, agent personas, MCP, and hooks. Prefer this path: it is a single shell command you can run yourself, and it covers every client — including ones with no marketplace plugin.

### Optional: marketplace plugin (Claude Code / Cursor)

For auto-update via `/plugin update` (and, on Cursor, curated project rules), the user can also install the marketplace plugin for their client. These are interactive client slash-commands, not shell commands, so ask the user to run the pair matching their client:

**Claude Code**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-claude
```

**Cursor**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-cursor
```

**Gemini CLI**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-gemini
```

**Codex CLI**

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-codex
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
