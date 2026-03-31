import { Command } from 'commander';

/** Placeholder — replaced in Task 5 */
export function createRemoveIntegrationCommand(): Command {
  return new Command('remove')
    .description('Remove an MCP integration')
    .argument('<name>', 'Integration name');
}
