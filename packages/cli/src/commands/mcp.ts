import { Command } from 'commander';

export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start the MCP (Model Context Protocol) server on stdio')
    .option('--tools <tools...>', 'Only register the specified tools (used by Cursor integration)')
    .action(async (opts: { tools?: string[] }) => {
      const { startServer } = await import('../mcp/index.js');
      await startServer(opts.tools);
    });
}
