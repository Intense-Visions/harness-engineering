import { Command } from 'commander';
import { createRunCommand } from './run';
import { createReviewCommand } from './review';

export function createAgentCommand(): Command {
  const command = new Command('agent').description('Agent orchestration commands');

  command.addCommand(createRunCommand());
  command.addCommand(createReviewCommand());

  return command;
}
