# MCP Setup Documentation & Scaffolding

**Date:** 2026-03-16
**Status:** Approved

## Context

The MCP server (`@harness-engineering/mcp-server`) exists but there's no documented or automated way for developers to connect it to their AI clients. Developers need to manually configure Claude Code and Gemini CLI.

## Changes

### 1. `harness setup-mcp` command

New CLI command that:
- Writes MCP server config for Claude Code (`.claude/settings.json`) and Gemini CLI (`.gemini/settings.json`)
- If configs already exist, merges the harness MCP entry without overwriting other settings
- Prints a summary of what was configured
- Supports `--client claude|gemini|all` flag (default: `all`)

### 2. `harness init` includes MCP setup

- Init templates scaffold MCP config files
- "Next steps" output mentions the MCP connection

### 3. Documentation updates

- **README** — add "AI Agent Integration" section with MCP setup instructions
- **Getting-started guide** — add "Connect to AI Agents" section for Claude Code and Gemini CLI
- **MCP server package README** — explain what it does and how to configure it

### 4. Version bumps

- Bump CLI and MCP server versions via changesets
