import { Command } from 'commander';

import { createBudgetCheckCommand } from './budget-check';

/**
 * `harness fleet` — the concrete, enforceable callables the `-fleet` family /
 * `fleet-command` DISPATCH contract invokes.
 *
 * Today it carries `budget-check` (#1600): the spend-envelope consult a
 * conductor calls before scheduling each lane, so the DISPATCH contract in
 * `docs/reference/fleet-family.md` is enforceable code, not just prose.
 */
export function createFleetCommand(): Command {
  const command = new Command('fleet').description(
    'Fleet-family dispatch callables (spend-envelope budget consult, #1600)'
  );
  command.addCommand(createBudgetCheckCommand());
  return command;
}
