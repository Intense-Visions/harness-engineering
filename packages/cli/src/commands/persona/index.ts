import { Command } from 'commander';
import { createListCommand } from './list';
import { createGenerateCommand } from './generate';
import { createSyncWorkflowsCommand } from './sync-workflows';

export function createPersonaCommand(): Command {
  const command = new Command('persona').description('Agent persona management commands');
  command.addCommand(createListCommand());
  command.addCommand(createGenerateCommand());
  command.addCommand(createSyncWorkflowsCommand());
  return command;
}
