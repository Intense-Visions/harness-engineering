import { Command } from 'commander';
import { createMdlCommand } from './mdl';

/**
 * `harness knowledge` — knowledge-store fitness commands.
 *
 * Currently exposes `mdl` (#1630): the Minimum Description Length scorer and
 * report-only prune/merge recommender over the learnings store.
 */
export function createKnowledgeCommand(): Command {
  const command = new Command('knowledge').description('Knowledge store fitness commands');
  command.addCommand(createMdlCommand());
  return command;
}
