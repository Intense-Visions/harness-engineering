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
      "command": "harness-mcp"
    }
  }
}
```

## API Reference

See [@harness-engineering/cli MCP exports](cli.md) for the programmatic API:

- `createHarnessServer(projectRoot?, toolFilter?)` — Creates the MCP server. Optional `toolFilter` array limits which tools are registered.
- `startServer(toolFilter?)` — Starts the MCP server on stdio transport.
- `getToolDefinitions()` — Returns all tool definitions.
- `resultToMcpResponse(result)` — Converts a `Result<T, E>` to an MCP response.
- `resolveProjectConfig(path?)` — Resolves the project configuration for the MCP server.

For the full tool and resource reference (62 tools, 9 resources), see the [CLI documentation](cli.md).
