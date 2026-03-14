import { Command } from 'commander';
import * as path from 'path';
import { listPersonas } from '../../persona/loader';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function resolvePersonasDir(): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  return path.join(repoRoot, 'agents', 'personas');
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List available agent personas')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const personasDir = resolvePersonasDir();
      const result = listPersonas(personasDir);
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
      }
      if (globalOpts.json) {
        logger.raw(result.value);
      } else if (globalOpts.quiet) {
        for (const p of result.value) console.log(p.name);
      } else {
        if (result.value.length === 0) {
          logger.info('No personas found.');
        } else {
          console.log('Available personas:\n');
          for (const p of result.value) {
            console.log(`  ${p.name}`);
            console.log(`    ${p.description}\n`);
          }
        }
      }
      process.exit(ExitCode.SUCCESS);
    });
}
