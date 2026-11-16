/**
 * Root-option propagation (#2069).
 *
 * The root program declares `--json`, `--verbose`, `--quiet` and
 * `-c, --config`. Commander binds a repeated flag to the FIRST command that
 * declared it, so when a subcommand redeclares one of those flags, the user's
 * value lands on the ROOT store and the subcommand's own `opts()` keeps its
 * default. Every subcommand that read its own `opts().json` silently ignored
 * `--json` — in either position (`harness x --json` and `harness --json x`).
 *
 * Rather than patching each action to read `optsWithGlobals()`, one
 * `preAction` hook on the root copies every root option the user actually set
 * into each command on the dispatch chain that redeclares it. Commander builds
 * the action's `opts` argument AFTER `preAction` hooks run, so the action sees
 * the propagated value through its plain `opts` parameter.
 */
import type { Command } from 'commander';

/** Option values that came from the user rather than a declared default. */
function isUserSupplied(source: string | undefined): boolean {
  return source !== undefined && source !== 'default';
}

function declares(cmd: Command, attribute: string): boolean {
  return cmd.options.some((o) => o.attributeName() === attribute);
}

/** Copy user-supplied root option values into every redeclaring command on the chain. */
export function propagateRootOptions(root: Command, actionCommand: Command): void {
  for (const option of root.options) {
    const attribute = option.attributeName();
    const source = root.getOptionValueSource(attribute);
    if (!isUserSupplied(source)) continue;
    const value: unknown = root.getOptionValue(attribute);
    for (let cmd: Command | null = actionCommand; cmd && cmd !== root; cmd = cmd.parent) {
      if (declares(cmd, attribute)) cmd.setOptionValueWithSource(attribute, value, source!);
    }
  }
}

/** Install {@link propagateRootOptions} as a root `preAction` hook. */
export function installRootOptionPropagation(program: Command): void {
  program.hook('preAction', (_thisCommand, actionCommand) => {
    propagateRootOptions(program, actionCommand);
  });
}
