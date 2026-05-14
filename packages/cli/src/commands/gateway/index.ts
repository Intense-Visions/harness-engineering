import { Command } from 'commander';
import { createTokenCommand } from './token';

export function createGatewayCommand(): Command {
  const cmd = new Command('gateway').description('Gateway API administration');
  cmd.addCommand(createTokenCommand());
  return cmd;
}
