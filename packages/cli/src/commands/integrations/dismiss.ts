import { Command } from 'commander';

/** Placeholder — replaced in Task 6 */
export function createDismissIntegrationCommand(): Command {
  return new Command('dismiss')
    .description('Suppress doctor recommendations for an integration')
    .argument('<name>', 'Integration name');
}
