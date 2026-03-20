import { startServer } from '@harness-engineering/mcp-server';

startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
