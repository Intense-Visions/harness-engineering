import { Command } from 'commander';
import { createTokenCommand } from './token';
import { createDeliveriesCommand } from './deliveries';

export function createGatewayCommand(): Command {
  const cmd = new Command('gateway').description('Gateway API administration');
  cmd.addCommand(createTokenCommand());
  cmd.addCommand(createDeliveriesCommand());
  return cmd;
}
