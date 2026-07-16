<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# Set up Harness Engineering

Official instructions to install and initialize harness in this project. Complete every step yourself by running the commands directly. Do not ask the user to run them. These instructions are published at <https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md>.

## 1. Install for your agent

### Claude Code

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-claude
```

### Cursor

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-cursor
```

### Gemini CLI

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-gemini
```

### Codex CLI

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-codex
```

### OpenCode / any other CLI

```bash
npm install -g @harness-engineering/cli && harness setup
```

If the plugin marketplace is unavailable, fall back to the npm path above. If you cannot identify your client, use the npm + `harness setup` path — it auto-detects every supported client (Claude Code, Cursor, Gemini CLI, Codex CLI, OpenCode).

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
