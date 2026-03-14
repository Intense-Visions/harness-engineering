import { Command } from 'commander';
import { createGenerateCommand } from './generate';
import { createValidateCommand } from './validate';

export function createLinterCommand(): Command {
  const linter = new Command('linter')
    .description('Generate and validate ESLint rules from YAML config');

  linter.addCommand(createGenerateCommand());
  linter.addCommand(createValidateCommand());

  return linter;
}
