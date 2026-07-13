import { Command } from 'commander';
import { createConfigCommand } from './config';
import { createTraceCommand } from './trace';
import { createDecisionsCommand } from './decisions';
import { createTelemetryCommand } from './telemetry';
import { createStatusCommand } from './status';

/**
 * Spec B Phase 6 + AMR observability: `harness routing` subcommand group.
 * Operator-facing inspection of routing config, dry-run trace, recent decisions,
 * the AMR telemetry projection, and live routing status. Consumes the routes
 * under `/api/v1/routing/{config,trace,decisions,telemetry,status}`.
 */
export function createRoutingCommand(): Command {
  const cmd = new Command('routing').description(
    'Inspect routing config, trace decisions, and read AMR telemetry + status'
  );
  cmd.addCommand(createConfigCommand());
  cmd.addCommand(createTraceCommand());
  cmd.addCommand(createDecisionsCommand());
  cmd.addCommand(createTelemetryCommand());
  cmd.addCommand(createStatusCommand());
  return cmd;
}
