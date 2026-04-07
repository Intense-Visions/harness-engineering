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

function resolveOutputMode(options: TraceabilityCommandOptions): OutputModeType {
  if (options.json) return OutputMode.JSON;
  if (options.quiet) return OutputMode.QUIET;
  if (options.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

function buildFilterOptions(options: TraceabilityCommandOptions): Record<string, string> {
  const filterOptions: Record<string, string> = {};
  if (options.spec) filterOptions['specPath'] = options.spec;
  if (options.feature) filterOptions['featureName'] = options.feature;
  return filterOptions;
}

function handleNoStore(mode: OutputModeType): never {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ error: 'No knowledge graph found. Run `harness scan` first.' }));
  } else {
    logger.error('No knowledge graph found. Run `harness scan` first.');
  }
  process.exit(ExitCode.ERROR);
}

function handleEmptyResults(mode: OutputModeType): never {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ results: [], message: 'No requirements found in graph.' }));
  } else if (mode !== OutputMode.QUIET) {
    logger.info('No requirements found in graph. Run `harness scan` to index spec files.');
  }
  process.exit(ExitCode.SUCCESS);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printResultTable(result: any, mode: OutputModeType): void {
  const specLabel = result.specPath || result.featureName || 'Unknown';
  console.log(`  ${chalk.cyan(specLabel)} ${chalk.dim(`(${result.summary.total} requirements)`)}`);
  console.log('');

  const numWidth = 4;
  const nameWidth = mode === OutputMode.VERBOSE ? 44 : 36;
  const codeWidth = 6;
  const testWidth = 7;
  const confWidth = 12;

  const header = chalk.dim(
    `  ${pad('#', numWidth)}${pad('Requirement', nameWidth)}${pad('Code', codeWidth)}${pad('Tests', testWidth)}${pad('Confidence', confWidth)}Status`
  );
  console.log(header);

  printRequirementRows(result.requirements, mode, {
    numWidth,
    nameWidth,
    codeWidth,
    testWidth,
    confWidth,
  });

  console.log('');
  printCoverageSummary(result.summary);
  console.log('');
}

interface ColumnWidths {
  numWidth: number;
  nameWidth: number;
  codeWidth: number;
  testWidth: number;
  confWidth: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printRequirementRows(requirements: any[], mode: OutputModeType, cols: ColumnWidths): void {
  const { numWidth, nameWidth, codeWidth, testWidth, confWidth } = cols;
  for (const req of requirements) {
    const num = `${req.index}.`;
    const name = truncate(req.requirementName, nameWidth - 2);
    const code = String(req.codeFiles.length);
    const tests = String(req.testFiles.length);
    const conf = confidenceLabel(req.maxConfidence);
    const status = statusIcon(req.status);

    console.log(
      `  ${pad(num, numWidth)}${pad(name, nameWidth)}${pad(code, codeWidth)}${pad(tests, testWidth)}${pad(conf, confWidth)}${status}`
    );

    if (mode === OutputMode.VERBOSE) {
      for (const f of req.codeFiles) {
        console.log(chalk.dim(`        code: ${f.path} (${f.method})`));
      }
      for (const f of req.testFiles) {
        console.log(chalk.dim(`        test: ${f.path} (${f.method})`));
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printCoverageSummary(summary: any): void {
  const s = summary;
  const fullyPct = s.total > 0 ? Math.round((s.fullyTraced / s.total) * 100) : 0;
  const codePct = s.total > 0 ? Math.round((s.withCode / s.total) * 100) : 0;
  const testPct = s.total > 0 ? Math.round((s.withTests / s.total) * 100) : 0;

  console.log(
    `  ${chalk.bold('Coverage:')} ${fullyPct}% fully traced (${s.fullyTraced}/${s.total}), ${codePct}% with code (${s.withCode}/${s.total}), ${testPct}% with tests (${s.withTests}/${s.total})`
  );
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

      const mode = resolveOutputMode(options);
      const projectPath = process.cwd();
      const store = await loadGraphStore(projectPath);

      if (!store) {
        handleNoStore(mode);
      }

      // Dynamic import to avoid circular dependency issues at module load time
      const graphModule = await import('@harness-engineering/graph');
      const queryTraceability = graphModule.queryTraceability;

      const filterOptions = buildFilterOptions(options);
      const results = queryTraceability(store, filterOptions);

      if (results.length === 0) {
        handleEmptyResults(mode);
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
        printResultTable(result, mode);
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
