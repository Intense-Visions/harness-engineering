import type { Command } from 'commander';
import { createScanCommand } from './scan.js';
import { createQueryCommand } from './query.js';
import { createIngestCommand } from './ingest.js';

/**
 * Canonical form for each legacy graph operation. The command now lives under
 * the `graph` group (see #644); the bare top-level form is retained only as a
 * deprecated alias.
 */
const DEPRECATED_GRAPH_ALIASES: Array<{ factory: () => Command; canonical: string }> = [
  { factory: createScanCommand, canonical: 'harness graph scan' },
  { factory: createQueryCommand, canonical: 'harness graph query' },
  { factory: createIngestCommand, canonical: 'harness graph ingest' },
];

/**
 * Register the legacy top-level `scan`/`query`/`ingest` commands as deprecated
 * aliases of their `harness graph <op>` counterparts.
 *
 * Each alias reuses the same factory as the canonical subcommand, so behavior
 * is identical. It is registered hidden (absent from `--help`) and prints a
 * one-line deprecation notice to stderr before running — stderr, not stdout,
 * so `--json` consumers are unaffected. The notice is suppressed under
 * `--quiet`.
 *
 * These exist so existing scripts, CI jobs, and muscle memory that call
 * `harness scan` keep working after the move to the `graph` group. Remove in
 * the next major once downstreams have migrated.
 */
export function registerDeprecatedGraphAliases(program: Command): void {
  for (const { factory, canonical } of DEPRECATED_GRAPH_ALIASES) {
    const alias = factory();
    alias.hook('preAction', (thisCommand) => {
      const globalOpts = thisCommand.optsWithGlobals() as { quiet?: boolean };
      if (globalOpts.quiet) return;
      process.stderr.write(
        `⚠ "harness ${alias.name()}" is deprecated and will be removed in the next ` +
          `major release. Use "${canonical}" instead.\n`
      );
    });
    program.addCommand(alias, { hidden: true });
  }
}
