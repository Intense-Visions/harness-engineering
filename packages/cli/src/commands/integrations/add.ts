import { Command } from 'commander';

/** Placeholder — replaced in Task 4 */
export function createAddIntegrationCommand(): Command {
  return new Command('add')
    .description('Enable an MCP integration')
    .argument('<name>', 'Integration name');
}
