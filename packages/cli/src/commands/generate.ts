import { Command } from 'commander';
import { generateSlashCommands, handleOrphanDeletion } from './generate-slash-commands';
import { generateAgentDefinitions } from './generate-agent-definitions';
import type { Platform } from '../slash-commands/types';
import { VALID_PLATFORMS } from '../slash-commands/types';
import { CLIError, ExitCode, handleError } from '../utils/errors';

function validatePlatforms(platforms: string[]): void {
  for (const p of platforms) {
    if (!VALID_PLATFORMS.includes(p as Platform)) {
      throw new CLIError(
        `Invalid platform "${p}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
        ExitCode.VALIDATION_FAILED
      );
    }
  }
}

async function runGenerateAction(
  opts: {
    platforms: string;
    global: boolean;
    includeGlobal: boolean;
    output?: string;
    dryRun: boolean;
    yes: boolean;
  },
  globalOpts: { json?: boolean }
): Promise<void> {
  const platforms = opts.platforms.split(',').map((p: string) => p.trim());
  validatePlatforms(platforms);

  try {
    console.log('Generating slash commands...');
    const slashResults = generateSlashCommands({
      platforms: platforms as Platform[],
      global: opts.global,
      includeGlobal: opts.includeGlobal,
      ...(opts.output !== undefined && { output: opts.output }),
      skillsDir: '',
      dryRun: opts.dryRun,
      yes: opts.yes,
    });

    for (const result of slashResults) {
      const total = result.added.length + result.updated.length + result.unchanged.length;
      console.log(
        `  ${result.platform}: ${total} commands (${result.added.length} new, ${result.updated.length} updated)`
      );
    }

    await handleOrphanDeletion(slashResults, { yes: opts.yes, dryRun: opts.dryRun });

    console.log('\nGenerating agent definitions...');
    const agentResults = generateAgentDefinitions({
      platforms: platforms as Platform[],
      global: opts.global,
      ...(opts.output !== undefined && { output: opts.output }),
      dryRun: opts.dryRun,
    });

    for (const result of agentResults) {
      const total = result.added.length + result.updated.length + result.unchanged.length;
      console.log(
        `  ${result.platform}: ${total} agents (${result.added.length} new, ${result.updated.length} updated)`
      );
    }

    if (opts.dryRun) {
      console.log('\n(dry run — no files written)');
    } else {
      console.log('\nDone.');
    }

    if (globalOpts.json) {
      console.log(
        JSON.stringify({ slashCommands: slashResults, agentDefinitions: agentResults }, null, 2)
      );
    }
  } catch (error) {
    handleError(error);
  }
}

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate all platform integrations (slash commands + agent definitions)')
    .option('--platforms <list>', 'Target platforms (comma-separated)', 'claude-code,gemini-cli')
    .option('--global', 'Write to global directories', false)
    .option('--include-global', 'Include built-in global skills', false)
    .option('--output <dir>', 'Custom output directory')
    .option('--dry-run', 'Show what would change without writing', false)
    .option('--yes', 'Skip deletion confirmation prompts', false)
    .action(async (opts, cmd) => {
      await runGenerateAction(opts, cmd.optsWithGlobals());
    });
}
