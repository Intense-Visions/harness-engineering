import { Command } from 'commander';
import { createCheckCommand } from './check';
import { createInitCommand } from './init';
import { createNotifyCommand } from './notify';

export function createCICommand(): Command {
  const command = new Command('ci').description('CI/CD integration commands');

  command.addCommand(createCheckCommand());
  command.addCommand(createInitCommand());
  command.addCommand(createNotifyCommand());

  return command;
}
