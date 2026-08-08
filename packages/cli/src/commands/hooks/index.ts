import { Command } from 'commander';
import { createInitCommand } from './init';
import { createListCommand } from './list';
import { createRemoveCommand } from './remove';
import { createAddCommand } from './add';
import { createRunCommand } from './run';

export function createHooksCommand(): Command {
  const command = new Command('hooks').description('Manage Claude Code hook configurations');

  command.addCommand(createInitCommand());
  command.addCommand(createListCommand());
  command.addCommand(createRemoveCommand());
  command.addCommand(createAddCommand());
  command.addCommand(createRunCommand());

  return command;
}
