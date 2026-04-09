import { Command } from 'commander';
import { listPersonas } from '../../persona/loader';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolvePersonasDir } from '../../utils/paths';

function printPersonaList(personas: Array<{ name: string; description: string }>): void {
  if (personas.length === 0) {
    logger.info('No personas found.');
  } else {
    console.log('Available personas:\n');
    for (const p of personas) {
      console.log(`  ${p.name}`);
      console.log(`    ${p.description}\n`);
    }
  }
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
        printPersonaList(result.value);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
