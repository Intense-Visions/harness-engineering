# @harness-engineering/mcp-server (Deprecated)

> **This package has been deprecated.** The MCP server is now included in
> `@harness-engineering/cli`. Install the CLI to get both the `harness` command
> and the `harness-mcp` binary.

## Migration

```bash
# Remove the old package
npm uninstall @harness-engineering/mcp-server

# Install the CLI (includes MCP server)
npm install -g @harness-engineering/cli
```

## Updated .mcp.json

```json
{
  "mcpServers": {
    "harness": {
      "command": "harness",
      "args": ["mcp"]
    }
  }
}
```

Or use `harness-mcp` directly (also provided by the CLI package).

## API Reference

See [@harness-engineering/cli MCP exports](cli.md) for the programmatic API:

- `createHarnessServer(projectRoot?)`
- `startServer()`
- `getToolDefinitions()`

For the full tool and resource reference, see the [CLI documentation](cli.md).
