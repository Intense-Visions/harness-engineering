// packages/cli/src/commands/cleanup.ts
import { Command } from 'commander';
import * as path from 'path';
import type { Result, EntropyConfig, DriftConfig, PatternConfig } from '@harness-engineering/core';
import { Ok, Err, EntropyAnalyzer } from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
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
  // `type` (drift category, e.g. "api-signature") and `line` mirror the fields
  // `harness ci check` emits for the same underlying drift finding, so a single
  // consumer/oracle can filter drift by category across both commands (#838).
  driftIssues: Array<{ file: string; line: number; type: string; issue: string }>;
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

  // Build entropy config — use configured entry points or let resolveEntryPoints discover them.
  // docPaths must be glob patterns (a bare directory yields zero matches from glob).
  // Thread the project's drift config (entropy.drift) into analyze.drift so
  // ignorePatterns / checkApiSignatures etc. are honored (issue #723).
  //
  // `docPaths` needs threading separately (#1819): `buildSnapshot` reads it
  // from the TOP LEVEL of EntropyConfig, not from `analyze.drift`, so the
  // hard-coded value below stayed in force and the configured one was inert —
  // while the MCP `detect_entropy` tool honored it.
  const driftEnabled = type === 'all' || type === 'drift';
  const driftConfig = config.entropy?.drift as Partial<DriftConfig> | undefined;

  // Pattern rules come from `entropy.patterns` in harness.config.json. The
  // previous implementation hardcoded an empty rule set (`{ patterns: [] }`),
  // so `harness cleanup -t patterns` evaluated zero rules yet still reported
  // "Entropy issues: 0" and exited 0 — a pass indistinguishable from a real
  // check that found nothing (#1760). Read the configured rules instead, and
  // refuse to green-tick a patterns check that has nothing to evaluate.
  const patternsRequested = type === 'all' || type === 'patterns';
  const patternConfig = config.entropy?.patterns as PatternConfig | undefined;
  const configuredRuleCount =
    (patternConfig?.patterns?.length ?? 0) + (patternConfig?.customPatterns?.length ?? 0);
  const hasPatternRules = configuredRuleCount > 0;

  // Fail loudly when patterns is the explicitly requested check but no rules
  // are configured — an empty rule set cannot honestly report a pass (#1760).
  if (type === 'patterns' && !hasPatternRules) {
    return Err(
      new CLIError(
        'No pattern rules are configured, so `harness cleanup -t patterns` has nothing to ' +
          'evaluate. Add rules under `entropy.patterns` in harness.config.json, or run a ' +
          'different check (`-t drift`, `-t dead-code`). Refusing to report a pass over zero rules.',
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  const entropyConfig: EntropyConfig = {
    rootDir,
    ...(config.entropy?.entryPoints && { entryPoints: config.entropy.entryPoints }),
    // Fallback stays docsDir-derived (configurable, and #301 made it a glob).
    // It is narrower than the analyzer default, so an unconfigured project has
    // no README in the drift denominator — deliberately unchanged here, #1819.
    docPaths: driftConfig?.docPaths ?? [path.join(docsDir, '**/*.md')],
    analyze: {
      drift: driftEnabled ? (driftConfig ?? true) : false,
      deadCode: type === 'all' || type === 'dead-code',
      // Only run the pattern analyzer when real rules exist; an empty rule set
      // is a no-op that misrepresents "checked" as "passed" (#1760).
      patterns: patternsRequested && hasPatternRules && patternConfig ? patternConfig : false,
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
      line: d.line,
      type: d.type,
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
    .option(
      '--findings-json',
      'Emit the machine-readable maintenance findings contract ({ findings: N }) as a trailing stdout line (#691)'
    )
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

      // #691: findings = total entropy issues (drift + dead code + patterns).
      if (opts.findingsJson) {
        console.log(formatFindingsContract(result.value.totalIssues, 'cleanup'));
      }

      process.exit(result.value.totalIssues === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
