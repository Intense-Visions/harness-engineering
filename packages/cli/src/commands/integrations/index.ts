import { Command } from 'commander';
import { createAddIntegrationCommand } from './add';
import { createListIntegrationsCommand } from './list';
import { createRemoveIntegrationCommand } from './remove';
import { createDismissIntegrationCommand } from './dismiss';

/**
 * Creates the 'integrations' command group for managing MCP peer integrations.
 */
export function createIntegrationsCommand(): Command {
  const command = new Command('integrations').description(
    'Manage MCP peer integrations (add, list, remove, dismiss)'
  );
  command.addCommand(createListIntegrationsCommand());
  command.addCommand(createAddIntegrationCommand());
  command.addCommand(createRemoveIntegrationCommand());
  command.addCommand(createDismissIntegrationCommand());
  return command;
}
