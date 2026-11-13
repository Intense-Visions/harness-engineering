import { Command } from 'commander';
import type { AutonomyCliDeps } from './deps';
import { createAutonomyShowCommand } from './show';
import { createAutonomySetCommand } from './set';

export function createAutonomyCommand(deps: AutonomyCliDeps = {}): Command {
  const command = new Command('autonomy').description(
    'Show or set autonomy. Only ~/.harness/config.json or an interactive `autonomy set` can ' +
      'raise it; environment variables (including a project .env) can only lower it'
  );
  command.addCommand(createAutonomyShowCommand(deps));
  command.addCommand(createAutonomySetCommand(deps));
  return command;
}
