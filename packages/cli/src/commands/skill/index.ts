import { Command } from 'commander';
import { createListCommand } from './list';
import { createRunCommand } from './run';
import { createValidateCommand } from './validate';
import { createInfoCommand } from './info';
import { createSearchCommand } from './search';
import { createCreateCommand } from './create';

export function createSkillCommand(): Command {
  const command = new Command('skill').description('Skill management commands');
  command.addCommand(createListCommand());
  command.addCommand(createRunCommand());
  command.addCommand(createValidateCommand());
  command.addCommand(createInfoCommand());
  command.addCommand(createSearchCommand());
  command.addCommand(createCreateCommand());
  return command;
}
