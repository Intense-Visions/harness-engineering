import { Command } from 'commander';
import { createIdentifyCommand } from './identify';
import { createStatusCommand } from './status';

export function createTelemetryCommand(): Command {
  const command = new Command('telemetry').description('Telemetry identity and status management');
  command.addCommand(createIdentifyCommand());
  command.addCommand(createStatusCommand());
  return command;
}
