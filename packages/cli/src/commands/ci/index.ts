import { Command } from 'commander';
import { createCheckCommand } from './check';

export function createCICommand(): Command {
  const command = new Command('ci').description('CI/CD integration commands');

  command.addCommand(createCheckCommand());

  return command;
}
