/**
 * Missing-subcommand error under `--json`.
 *
 * A command group (`harness usage`, `harness adoption`, …) invoked with no
 * subcommand gets commander's default: group help on stderr, exit 1. That
 * stays the behavior in every mode. Under `--json`, though, it left stdout
 * EMPTY — a machine consumer saw a failing exit with no document to parse.
 *
 * Commander emits `afterHelp` with `context.error === true` exactly when it is
 * about to exit non-zero after printing help (a missing subcommand, or
 * `help <unknown>`). One listener per group, installed recursively, writes a
 * JSON error naming the available subcommands to stdout before that exit, so
 * the exit code and the stdout document agree.
 */
import type { Command } from 'commander';

/** The JSON error document a group emits when invoked without a subcommand. */
export interface MissingSubcommandError {
  error: string;
  command: string;
  subcommands: string[];
}

/** Space-joined command path from the root's first child down, e.g. `usage` or `skill info`. */
function commandPath(cmd: Command): string {
  const names: string[] = [];
  for (let c: Command | null = cmd; c && c.parent; c = c.parent) names.unshift(c.name());
  return names.join(' ');
}

/** Builds the missing-subcommand error document for a command group. */
export function missingSubcommandError(cmd: Command): MissingSubcommandError {
  const path = commandPath(cmd);
  const subcommands = cmd.commands
    .filter((c) => !(c as unknown as { _hidden?: boolean })._hidden)
    .map((c) => c.name());
  return {
    error: `Missing subcommand for 'harness ${path}'. Available: ${subcommands.join(', ')}`,
    command: path,
    subcommands,
  };
}

/**
 * Recursively installs the `--json` missing-subcommand listener on every
 * command group under `root` (the root itself is excluded: `harness` alone is
 * a separate entry point that prints its own help).
 *
 * @param write - writes a string to stdout; must be synchronous enough to land
 *   before commander's `process.exit` (the caller passes its fd-sync writer).
 */
export function installJsonMissingSubcommand(root: Command, write: (s: string) => void): void {
  const visit = (cmd: Command): void => {
    for (const sub of cmd.commands) {
      if (sub.commands.length > 0) {
        sub.on('afterHelp', (context: { error: boolean }) => {
          if (!context.error) return;
          if (!sub.optsWithGlobals().json) return;
          write(`${JSON.stringify(missingSubcommandError(sub), null, 2)}\n`);
        });
      }
      visit(sub);
    }
  };
  visit(root);
}
