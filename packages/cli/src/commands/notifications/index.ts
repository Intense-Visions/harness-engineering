import { Command } from 'commander';
import { createNotificationsTestSubcommand } from './test';

export function createNotificationsCommand(): Command {
  const cmd = new Command('notifications').description(
    'Manage notification sinks (Slack and others)'
  );
  cmd.addCommand(createNotificationsTestSubcommand());
  return cmd;
}

export { runNotificationsTest } from './test';
