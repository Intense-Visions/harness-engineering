import { Command } from 'commander';
import type { AutonomyCliDeps } from './deps';
import { createAutonomyShowCommand } from './show';
import { createAutonomySetCommand } from './set';

export function createAutonomyCommand(deps: AutonomyCliDeps = {}): Command {
  const command = new Command('autonomy').description(
    'Show or set user-level trusted autonomy (never read from project config)'
  );
  command.addCommand(createAutonomyShowCommand(deps));
  command.addCommand(createAutonomySetCommand(deps));
  return command;
}
