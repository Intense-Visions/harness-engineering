import { Command } from 'commander';
import { createIdentifyCommand } from './identify';
import { createStatusCommand } from './status';
import { createTestCommand } from './test';

export function createTelemetryCommand(): Command {
  const command = new Command('telemetry').description('Telemetry identity and status management');
  command.addCommand(createIdentifyCommand());
  command.addCommand(createStatusCommand());
  command.addCommand(createTestCommand());
  return command;
}
