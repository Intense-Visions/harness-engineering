import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
import { checkDocCoverage, validateKnowledgeMap } from '@harness-engineering/core';
import { skipDirGlobs } from '@harness-engineering/graph';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
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
  // Denominator: source files actually scanned. `scannedNothing` (scanned === 0)
  // is an abstention, not a pass — the scan verified nothing (#1146).
  scanned: number;
  scannedNothing: boolean;
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

  // Honor `entropy.excludePatterns` from harness.config.json. Previously this
  // command hardcoded its excludes, so config had no effect on `check-docs` at
  // all and the fix that worked via the `harness ci check` path was unavailable
  // here (#1146). The fallback deliberately does NOT exclude `**/fixtures/**`:
  // baking fixture-exclusion into the default is exactly the footgun that drives
  // the denominator to zero and turns the gate green (#1146 §3). A project that
  // genuinely wants fixtures excluded opts in via `entropy.excludePatterns`.
  const excludePatterns = config.entropy?.excludePatterns ?? [
    ...skipDirGlobs(),
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  // Check documentation coverage
  const coverageResult = await checkDocCoverage('project', {
    docsDir,
    sourceDir,
    excludePatterns,
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
  const scanned = coverageResult.value.scanned;
  const scannedNothing = scanned === 0;

  const result: CheckDocsResult = {
    // A scan that read zero source files abstained rather than passed: it
    // verified nothing, so it can never be valid regardless of the (0%)
    // coverage number (#1146).
    valid: !scannedNothing && coveragePercent >= minCoverage && brokenLinks.length === 0,
    coveragePercent,
    documented: coverageResult.value.documented,
    undocumented: coverageResult.value.undocumented,
    brokenLinks,
    scanned,
    scannedNothing,
  };

  return Ok(result);
}

function printUndocumentedFiles(undocumented: string[]): void {
  if (undocumented.length === 0) return;
  console.log('\nUndocumented files:');
  for (const file of undocumented.slice(0, 10)) {
    console.log(`  - ${file}`);
  }
  if (undocumented.length > 10) {
    console.log(`  ... and ${undocumented.length - 10} more`);
  }
}

function printCheckDocsResult(
  value: CheckDocsResult,
  mode: OutputModeType,
  formatter: OutputFormatter
): void {
  // An empty scan surfaces explicitly, never as a coverage number: a scan that
  // read nothing abstained rather than passed (#1146).
  if (value.scannedNothing) {
    console.log(
      formatter.formatSummary('Documentation coverage', 'undetermined (0 files scanned)', false)
    );
    console.log(
      '\nABSTAINED: 0 source files scanned — coverage undetermined, not a pass.\n' +
        'Check config.rootDir and `entropy.excludePatterns` in harness.config.json.'
    );
    return;
  }

  console.log(
    formatter.formatSummary(
      'Documentation coverage',
      `${value.coveragePercent.toFixed(1)}%`,
      value.valid
    )
  );

  // The denominator is part of the result, not trivia: 100% over 4 files and
  // 100% over 4,000 are different claims. State it on every run so a collapsed
  // scope is visible.
  console.log(`  ${value.documented.length}/${value.scanned} source files documented`);

  if (mode === OutputMode.VERBOSE || !value.valid) {
    printUndocumentedFiles(value.undocumented);
  }

  if (value.brokenLinks.length > 0) {
    console.log('\nBroken links:');
    for (const link of value.brokenLinks) {
      console.log(`  - ${link}`);
    }
  }
}

export function createCheckDocsCommand(): Command {
  const command = new Command('check-docs')
    .description('Check documentation coverage')
    .option('--min-coverage <percent>', 'Minimum coverage percentage', '80')
    .option(
      '--findings-json',
      'Emit the machine-readable maintenance findings contract ({ findings: N }) as a trailing stdout line (#691)'
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
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
        printCheckDocsResult(result.value, mode, formatter);
      }

      // #691: findings = undocumented files + broken knowledge-map links.
      if (opts.findingsJson) {
        const findings = result.value.undocumented.length + result.value.brokenLinks.length;
        console.log(formatFindingsContract(findings, 'check-docs'));
      }

      // A zero-file scan abstained: distinct exit code (3) so CI can tell "read
      // nothing" from "verified and failed" (1) or "verified and passed" (0).
      if (result.value.scannedNothing) {
        process.exit(ExitCode.ZERO_DENOMINATOR);
      }
      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
