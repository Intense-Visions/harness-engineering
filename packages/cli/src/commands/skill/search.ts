import { Command } from 'commander';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import {
  searchNpmRegistry,
  extractSkillName,
  type NpmSearchResult,
} from '../../registry/npm-client';

interface SearchOptions {
  platform?: string;
  trigger?: string;
}

/**
 * Search for community skills on the npm registry.
 * Filters by platform and trigger keywords.
 */
export async function runSearch(query: string, opts: SearchOptions): Promise<NpmSearchResult[]> {
  const results = await searchNpmRegistry(query);

  return results.filter((r) => {
    if (opts.platform && !r.keywords.includes(opts.platform)) {
      return false;
    }
    if (opts.trigger && !r.keywords.includes(opts.trigger)) {
      return false;
    }
    return true;
  });
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search for community skills on the @harness-skills registry')
    .argument('<query>', 'Search query')
    .option('--platform <platform>', 'Filter by platform (e.g., claude-code)')
    .option('--trigger <trigger>', 'Filter by trigger type (e.g., manual, automatic)')
    .action(async (query: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      try {
        const results = await runSearch(query, opts);

        if (globalOpts.json) {
          logger.raw(results);
          process.exit(ExitCode.SUCCESS);
          return;
        }

        if (results.length === 0) {
          logger.info(`No skills found matching "${query}".`);
          process.exit(ExitCode.SUCCESS);
          return;
        }

        console.log(`\nFound ${results.length} skill(s):\n`);
        for (const r of results) {
          const shortName = extractSkillName(r.name);
          console.log(`  ${shortName}@${r.version}`);
          console.log(`    ${r.description}`);
          if (r.keywords.length > 0) {
            console.log(`    keywords: ${r.keywords.join(', ')}`);
          }
          console.log();
        }

        logger.info(`Install with: harness install <skill-name>`);
        process.exit(ExitCode.SUCCESS);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(ExitCode.VALIDATION_FAILED);
      }
    });
}
