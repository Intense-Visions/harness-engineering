import { Command } from 'commander';

import { createBudgetCheckCommand } from './budget-check';
import { createClumpDispatchCommand } from './clump-dispatch';
import { createClumpIssuesCommand } from './clump-issues';

/**
 * `harness fleet` — the concrete, enforceable callables the `-fleet` family /
 * `fleet-command` DISPATCH contract invokes.
 *
 * It carries `budget-check` (#1600): the spend-envelope consult a conductor
 * calls before scheduling each lane, so the DISPATCH contract in
 * `docs/reference/fleet-family.md` is enforceable code, not just prose; and
 * `clump-issues` (docs/changes/clumping/proposal.md, Phase 4): the intake
 * clump set `issue-fleet` presents on its single CONFIRM round, for the same
 * reason — a triage axis that exists only as a SKILL.md paragraph is a seam
 * nothing can be held to; and `clump-dispatch` (Phase 5), which takes a CLUMP
 * as the lane unit and settles ONE verdict per clump under D10, because the
 * four members whose lane unit a clump becomes are SKILL.md files and nothing
 * in this repository schedules their lanes.
 */
export function createFleetCommand(): Command {
  const command = new Command('fleet').description(
    'Fleet-family callables (spend-envelope budget consult #1600; intake clump axis; clump lane unit)'
  );
  command.addCommand(createBudgetCheckCommand());
  command.addCommand(createClumpIssuesCommand());
  command.addCommand(createClumpDispatchCommand());
  return command;
}
