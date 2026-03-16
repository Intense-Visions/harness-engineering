import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { checkDocCoverage, validateKnowledgeMap } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface CheckDocsOptions {
  cwd?: string;
  configPath?: string;
  minCoverage?: number;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface CheckDocsResult {
  valid: boolean;
  coveragePercent: number;
  documented: string[];
  undocumented: string[];
  brokenLinks: string[];
}

export async function runCheckDocs(
  options: CheckDocsOptions
): Promise<Result<CheckDocsResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const minCoverage = options.minCoverage ?? 80;

  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  const docsDir = path.resolve(cwd, config.docsDir);
  const sourceDir = path.resolve(cwd, config.rootDir);

  // Check documentation coverage
  const coverageResult = await checkDocCoverage('project', {
    docsDir,
    sourceDir,
    excludePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
  });

  if (!coverageResult.ok) {
    return Err(
      new CLIError(
        `Documentation coverage check failed: ${coverageResult.error.message}`,
        ExitCode.ERROR
      )
    );
  }

  // Check knowledge map for broken links
  const knowledgeResult = await validateKnowledgeMap(cwd);
  let brokenLinks: string[] = [];

  if (knowledgeResult.ok) {
    brokenLinks = knowledgeResult.value.brokenLinks.map((b) => b.path);
  } else {
    // Log warning for secondary check failure but continue
    logger.warn(`Knowledge map validation failed: ${knowledgeResult.error.message}`);
  }

  const coveragePercent = coverageResult.value.coveragePercentage;

  const result: CheckDocsResult = {
    valid: coveragePercent >= minCoverage && brokenLinks.length === 0,
    coveragePercent,
    documented: coverageResult.value.documented,
    undocumented: coverageResult.value.undocumented,
    brokenLinks,
  };

  return Ok(result);
}

export function createCheckDocsCommand(): Command {
  const command = new Command('check-docs')
    .description('Check documentation coverage')
    .option('--min-coverage <percent>', 'Minimum coverage percentage', '80')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runCheckDocs({
        configPath: globalOpts.config,
        minCoverage: parseInt(opts.minCoverage, 10),
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        const { value } = result;
        console.log(
          formatter.formatSummary(
            'Documentation coverage',
            `${value.coveragePercent.toFixed(1)}%`,
            value.valid
          )
        );

        if (value.undocumented.length > 0 && (mode === OutputMode.VERBOSE || !value.valid)) {
          console.log('\nUndocumented files:');
          for (const file of value.undocumented.slice(0, 10)) {
            console.log(`  - ${file}`);
          }
          if (value.undocumented.length > 10) {
            console.log(`  ... and ${value.undocumented.length - 10} more`);
          }
        }

        if (value.brokenLinks.length > 0) {
          console.log('\nBroken links:');
          for (const link of value.brokenLinks) {
            console.log(`  - ${link}`);
          }
        }
      }

      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
