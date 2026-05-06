import { Command } from 'commander';
import { createScanCandidatesCommand } from './scan-candidates';

/**
 * Top-level `harness compound` command group. Currently hosts only
 * `scan-candidates`; future phases may add `migrate-learnings`, etc.
 */
export function createCompoundCommand(): Command {
  const command = new Command('compound').description('Compound (post-mortem playbook) commands');
  command.addCommand(createScanCandidatesCommand());
  return command;
}
