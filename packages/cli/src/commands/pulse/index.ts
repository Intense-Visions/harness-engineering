import { Command } from 'commander';
import { createRunCommand } from './run';

/**
 * Top-level `harness pulse` command group. Currently hosts only `run`; future
 * phases may add `interview`, `validate`, etc.
 */
export function createPulseCommand(): Command {
  const command = new Command('pulse').description('Pulse (read-side observability) commands');
  command.addCommand(createRunCommand());
  return command;
}
