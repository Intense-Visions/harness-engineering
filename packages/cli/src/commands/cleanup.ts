// packages/cli/src/commands/cleanup.ts
import { Command } from 'commander';
import * as path from 'path';
import type { Result, EntropyConfig } from '@harness-engineering/core';
import { Ok, Err, EntropyAnalyzer } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

type CleanupType = 'drift' | 'dead-code' | 'patterns' | 'all';

interface CleanupOptions {
  cwd?: string;
  configPath?: string;
  type?: CleanupType;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface CleanupResult {
  driftIssues: Array<{ file: string; issue: string }>;
  deadCode: Array<{ file: string; symbol?: string }>;
  patternViolations: Array<{ file: string; pattern: string; message: string }>;
  totalIssues: number;
}

export async function runCleanup(
  options: CleanupOptions
): Promise<Result<CleanupResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const type = options.type ?? 'all';

  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return Err(configResult.error);
  }
  const config = configResult.value;

  const result: CleanupResult = {
    driftIssues: [],
    deadCode: [],
    patternViolations: [],
    totalIssues: 0,
  };

  const rootDir = path.resolve(cwd, config.rootDir);
  const docsDir = path.resolve(cwd, config.docsDir);

  // Build entropy config — use configured entry points or let resolveEntryPoints discover them
  const entropyConfig: EntropyConfig = {
    rootDir,
    entryPoints: config.entropy?.entryPoints,
    docPaths: [docsDir],
    analyze: {
      drift: type === 'all' || type === 'drift',
      deadCode: type === 'all' || type === 'dead-code',
      patterns: type === 'all' || type === 'patterns' ? { patterns: [] } : false,
    },
    exclude: config.entropy?.excludePatterns ?? ['**/node_modules/**', '**/*.test.ts'],
  };

  // Create analyzer and run analysis
  const analyzer = new EntropyAnalyzer(entropyConfig);
  const analysisResult = await analyzer.analyze();

  if (!analysisResult.ok) {
    return Err(
      new CLIError(`Entropy analysis failed: ${analysisResult.error.message}`, ExitCode.ERROR)
    );
  }

  const report = analysisResult.value;

  // Extract drift issues
  if (report.drift) {
    result.driftIssues = report.drift.drifts.map((d) => ({
      file: d.docFile,
      issue: `${d.issue}: ${d.details}`,
    }));
  }

  // Extract dead code
  if (report.deadCode) {
    result.deadCode = [
      ...report.deadCode.deadFiles.map((f) => ({ file: f.path })),
      ...report.deadCode.deadExports.map((e) => ({ file: e.file, symbol: e.name })),
    ];
  }

  // Extract pattern violations
  if (report.patterns) {
    result.patternViolations = report.patterns.violations.map((v) => ({
      file: v.file,
      pattern: v.pattern,
      message: v.message,
    }));
  }

  result.totalIssues =
    result.driftIssues.length + result.deadCode.length + result.patternViolations.length;

  return Ok(result);
}

function printCleanupResult(value: CleanupResult, formatter: OutputFormatter): void {
  console.log(
    formatter.formatSummary('Entropy issues', value.totalIssues.toString(), value.totalIssues === 0)
  );

  if (value.driftIssues.length > 0) {
    console.log('\nDocumentation drift:');
    for (const issue of value.driftIssues) {
      console.log(`  - ${issue.file}: ${issue.issue}`);
    }
  }

  if (value.deadCode.length > 0) {
    console.log('\nDead code:');
    for (const item of value.deadCode.slice(0, 10)) {
      console.log(`  - ${item.file}${item.symbol ? `: ${item.symbol}` : ''}`);
    }
    if (value.deadCode.length > 10) {
      console.log(`  ... and ${value.deadCode.length - 10} more`);
    }
  }

  if (value.patternViolations.length > 0) {
    console.log('\nPattern violations:');
    for (const violation of value.patternViolations.slice(0, 10)) {
      console.log(`  - ${violation.file} [${violation.pattern}]: ${violation.message}`);
    }
    if (value.patternViolations.length > 10) {
      console.log(`  ... and ${value.patternViolations.length - 10} more`);
    }
  }
}

export function createCleanupCommand(): Command {
  const command = new Command('cleanup')
    .description('Detect entropy issues (doc drift, dead code, patterns)')
    .option('-t, --type <type>', 'Issue type: drift, dead-code, patterns, all', 'all')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCleanup({
        configPath: globalOpts.config,
        type: opts.type as CleanupType,
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
      } else if (mode !== OutputMode.QUIET || result.value.totalIssues > 0) {
        printCleanupResult(result.value, formatter);
      }

      process.exit(result.value.totalIssues === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
