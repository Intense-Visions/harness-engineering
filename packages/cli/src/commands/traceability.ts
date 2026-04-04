import { Command } from 'commander';
import chalk from 'chalk';
import { loadGraphStore } from '../mcp/utils/graph-loader';
import { OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface TraceabilityCommandOptions {
  spec?: string;
  feature?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

function confidenceLabel(maxConfidence: number): string {
  if (maxConfidence >= 0.8) return 'explicit';
  if (maxConfidence > 0) return 'inferred';
  return '\u2014'; // em-dash
}

function statusIcon(status: string): string {
  switch (status) {
    case 'full':
      return chalk.green('\u2713 full');
    case 'code-only':
      return chalk.yellow('\u25D0 code-only');
    case 'test-only':
      return chalk.yellow('\u25D0 test-only');
    case 'none':
      return chalk.red('\u2717 none');
    default:
      return status;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function pad(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - str.length));
}

export function createTraceabilityCommand(): Command {
  const command = new Command('traceability')
    .description('Show spec-to-implementation traceability from the knowledge graph')
    .option('--spec <path>', 'Filter by spec file path')
    .option('--feature <name>', 'Filter by feature name')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const options: TraceabilityCommandOptions = {
        spec: opts.spec,
        feature: opts.feature,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      };

      const mode: OutputModeType = options.json
        ? OutputMode.JSON
        : options.quiet
          ? OutputMode.QUIET
          : options.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const projectPath = process.cwd();
      const store = await loadGraphStore(projectPath);

      if (!store) {
        if (mode === OutputMode.JSON) {
          console.log(
            JSON.stringify({ error: 'No knowledge graph found. Run `harness scan` first.' })
          );
        } else {
          logger.error('No knowledge graph found. Run `harness scan` first.');
        }
        process.exit(ExitCode.ERROR);
      }

      // Dynamic import to avoid circular dependency issues at module load time
      const graphModule = await import('@harness-engineering/graph');
      const queryTraceability = graphModule.queryTraceability;

      const filterOptions: Record<string, string> = {};
      if (options.spec) filterOptions['specPath'] = options.spec;
      if (options.feature) filterOptions['featureName'] = options.feature;

      const results = queryTraceability(store, filterOptions);

      if (results.length === 0) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ results: [], message: 'No requirements found in graph.' }));
        } else if (mode !== OutputMode.QUIET) {
          logger.info('No requirements found in graph. Run `harness scan` to index spec files.');
        }
        process.exit(ExitCode.SUCCESS);
      }

      // JSON output
      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(results, null, 2));
        process.exit(ExitCode.SUCCESS);
      }

      // Formatted table output
      console.log('');
      console.log(chalk.bold('Spec-to-Implementation Traceability'));
      console.log('');

      for (const result of results) {
        const specLabel = result.specPath || result.featureName || 'Unknown';
        console.log(
          `  ${chalk.cyan(specLabel)} ${chalk.dim(`(${result.summary.total} requirements)`)}`
        );
        console.log('');

        // Column widths
        const numWidth = 4;
        const nameWidth = mode === OutputMode.VERBOSE ? 44 : 36;
        const codeWidth = 6;
        const testWidth = 7;
        const confWidth = 12;

        // Header
        const header = chalk.dim(
          `  ${pad('#', numWidth)}${pad('Requirement', nameWidth)}${pad('Code', codeWidth)}${pad('Tests', testWidth)}${pad('Confidence', confWidth)}Status`
        );
        console.log(header);

        for (const req of result.requirements) {
          const num = `${req.index}.`;
          const name = truncate(req.requirementName, nameWidth - 2);
          const code = String(req.codeFiles.length);
          const tests = String(req.testFiles.length);
          const conf = confidenceLabel(req.maxConfidence);
          const status = statusIcon(req.status);

          console.log(
            `  ${pad(num, numWidth)}${pad(name, nameWidth)}${pad(code, codeWidth)}${pad(tests, testWidth)}${pad(conf, confWidth)}${status}`
          );

          // Verbose mode: show file paths
          if (mode === OutputMode.VERBOSE) {
            for (const f of req.codeFiles) {
              console.log(chalk.dim(`        code: ${f.path} (${f.method})`));
            }
            for (const f of req.testFiles) {
              console.log(chalk.dim(`        test: ${f.path} (${f.method})`));
            }
          }
        }

        console.log('');

        // Summary line
        const s = result.summary;
        const fullyPct = s.total > 0 ? Math.round((s.fullyTraced / s.total) * 100) : 0;
        const codePct = s.total > 0 ? Math.round((s.withCode / s.total) * 100) : 0;
        const testPct = s.total > 0 ? Math.round((s.withTests / s.total) * 100) : 0;

        console.log(
          `  ${chalk.bold('Coverage:')} ${fullyPct}% fully traced (${s.fullyTraced}/${s.total}), ${codePct}% with code (${s.withCode}/${s.total}), ${testPct}% with tests (${s.withTests}/${s.total})`
        );
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
