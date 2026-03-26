import { Command } from 'commander';
import { createPruneCommand } from './prune';

export function createLearningsCommand(): Command {
  const command = new Command('learnings').description('Learnings management commands');
  command.addCommand(createPruneCommand());
  return command;
}
