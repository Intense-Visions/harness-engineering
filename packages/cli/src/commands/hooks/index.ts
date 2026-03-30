import { Command } from 'commander';
import { createInitCommand } from './init';
import { createListCommand } from './list';
import { createRemoveCommand } from './remove';

export function createHooksCommand(): Command {
  const command = new Command('hooks').description('Manage Claude Code hook configurations');

  command.addCommand(createInitCommand());
  command.addCommand(createListCommand());
  command.addCommand(createRemoveCommand());

  return command;
}
