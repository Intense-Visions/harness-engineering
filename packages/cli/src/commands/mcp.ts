import { Command } from 'commander';

export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start the MCP (Model Context Protocol) server on stdio')
    .action(async () => {
      const { startServer } = await import('../mcp/index.js');
      await startServer();
    });
}
