import { Command } from 'commander';
import { createShowCommand } from './show';
import { createResetCommand } from './reset';
import { createLearnCommand } from './learn';
import { createStreamsCommand } from './streams';

export function createStateCommand(): Command {
  const command = new Command('state').description('Project state management commands');
  command.addCommand(createShowCommand());
  command.addCommand(createResetCommand());
  command.addCommand(createLearnCommand());
  command.addCommand(createStreamsCommand());
  return command;
}
