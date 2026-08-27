import { Command } from 'commander';
import { createRulesProvenanceCommand } from './provenance';

/**
 * Top-level `harness rules` command group. Hosts the advisory provenance
 * reporter (ADR 0100); future phases may add related rule-introspection tools.
 */
export function createRulesCommand(): Command {
  const command = new Command('rules').description('Enforced-rule introspection commands');
  command.addCommand(createRulesProvenanceCommand());
  return command;
}
