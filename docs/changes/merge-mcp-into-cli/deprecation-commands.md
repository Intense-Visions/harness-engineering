# Deprecation Commands for @harness-engineering/mcp-server

These commands must be run manually with npm credentials.

## 1. Publish final deprecation version (0.7.0)

The `packages/mcp-server/package.json` was already at version 0.7.0 before removal.
To publish a deprecation stub:

1. Create a temporary directory with a minimal package:

   ```bash
   mkdir -p /tmp/mcp-server-deprecation
   cd /tmp/mcp-server-deprecation
   ```

2. Create `package.json`:

   ```json
   {
     "name": "@harness-engineering/mcp-server",
     "version": "0.7.0",
     "description": "DEPRECATED: Use @harness-engineering/cli instead",
     "scripts": {
       "postinstall": "echo '\\n\\n  WARNING: @harness-engineering/mcp-server is deprecated.\\n  Install @harness-engineering/cli instead, which includes the MCP server.\\n  Run: npm install -g @harness-engineering/cli\\n\\n'"
     },
     "bin": {
       "harness-mcp": "./bin/harness-mcp.js"
     }
   }
   ```

3. Create `bin/harness-mcp.js`:

   ```javascript
   #!/usr/bin/env node
   console.error(
     '\n@harness-engineering/mcp-server is deprecated.\n' +
       'The MCP server is now included in @harness-engineering/cli.\n\n' +
       'To migrate:\n' +
       '  npm install -g @harness-engineering/cli\n' +
       '  # Then use: harness mcp\n'
   );
   process.exit(1);
   ```

4. Publish:
   ```bash
   npm publish --access public
   ```

## 2. Mark as deprecated on npm

```bash
npm deprecate "@harness-engineering/mcp-server" "This package is deprecated. The MCP server is now included in @harness-engineering/cli. Install the CLI package instead: npm install -g @harness-engineering/cli"
```
