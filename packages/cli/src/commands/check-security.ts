import { Command } from 'commander';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result, SupplyChainSnapshot } from '@harness-engineering/core';
import {
  Ok,
  Err,
  SECURITY_SCAN_DEFAULT_IGNORE,
  SECURITY_SCAN_GLOB,
  SecurityScanner,
  SecurityTimelineManager,
  parseSecurityConfig,
  readSupplyChainMeasurement,
} from '@harness-engineering/core';
import type { SecurityFinding, SecuritySeverity } from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

const SEVERITY_RANK: Record<SecuritySeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

interface CheckSecurityOptions {
  severity?: SecuritySeverity;
  changedOnly?: boolean;
  failOnEmpty?: boolean;
  /**
   * Path (resolved against `cwd`) to an externally-measured supply-chain audit.
   * When given, its counts are recorded in the security timeline instead of the
   * all-zero default. Invalid input fails the command — it never degrades to zeros.
   */
  supplyChainJson?: string;
}

interface CheckSecurityResult {
  valid: boolean;
  findings: SecurityFinding[];
  /**
   * True when the scan matched zero files. A scan that read nothing did not pass —
   * it abstained — and callers must be able to tell the two apart, which
   * `valid: true, findings: []` alone cannot express.
   */
  scannedNothing: boolean;
  /**
   * The supply-chain measurement recorded in the timeline, when one was supplied.
   * Absent means no measurement was given — not that the dependency tree is clean.
   */
  supplyChain?: SupplyChainSnapshot;
  stats: {
    filesScanned: number;
    rulesApplied: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

function getChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD~1', {
      cwd,
      encoding: 'utf-8',
    });
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
      .map((f) => path.resolve(cwd, f));
  } catch {
    return [];
  }
}

export async function runCheckSecurity(
  cwd: string,
  options: CheckSecurityOptions
): Promise<Result<CheckSecurityResult, Error>> {
  const projectRoot = path.resolve(cwd);

  // Validate the supplied measurement before scanning, so malformed input fails
  // fast and loudly instead of being swallowed by the best-effort capture below.
  let supplyChain: SupplyChainSnapshot | undefined;
  if (options.supplyChainJson !== undefined) {
    const measurement = readSupplyChainMeasurement(
      path.resolve(projectRoot, options.supplyChainJson)
    );
    if (!measurement.ok) return measurement;
    supplyChain = measurement.value;
  }

  let configData: Record<string, unknown> = {};
  try {
    const fs = await import('node:fs');
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      configData = (parsed.security as Record<string, unknown>) ?? {};
    }
  } catch {
    // No config — use defaults
  }

  const securityConfig = parseSecurityConfig(configData);
  const scanner = new SecurityScanner(securityConfig);
  scanner.configureForProject(projectRoot);

  let filesToScan: string[];
  if (options.changedOnly) {
    filesToScan = getChangedFiles(projectRoot);
  } else {
    const { glob } = await import('glob');
    const ignore = securityConfig.exclude ?? [...SECURITY_SCAN_DEFAULT_IGNORE];
    filesToScan = await glob(SECURITY_SCAN_GLOB, {
      cwd: projectRoot,
      absolute: true,
      ignore,
    });
  }

  const result = await scanner.scanFiles(filesToScan);

  // Timeline capture is best-effort for the scan alone. A supplied supply-chain
  // measurement is different: the caller asked for it to be recorded, so failing
  // to record it is an error rather than a silent no-op.
  try {
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
    const timelineManager = new SecurityTimelineManager(projectRoot);
    timelineManager.capture(result, commitHash, supplyChain);
    timelineManager.updateLifecycles(result.findings, commitHash);
  } catch (error) {
    if (supplyChain !== undefined) {
      const reason = error instanceof Error ? error.message : String(error);
      return Err(
        new Error(`Supply-chain measurement was not recorded in the security timeline: ${reason}`, {
          cause: error,
        })
      );
    }
  }

  const threshold = options.severity ?? 'warning';
  const thresholdRank = SEVERITY_RANK[threshold];
  const filtered = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank);

  // `--severity` bounds BOTH the reported findings and the pass/fail verdict:
  // the command fails only when a finding at or above the requested threshold
  // exists. Findings below the threshold (e.g. info findings under
  // `--severity error`) are excluded from `filtered`, so they never fail the
  // gate. Previously the verdict was hardcoded to `error`, which meant the flag
  // filtered the report but not the verdict — leaving lower-severity requests
  // (`--severity warning`/`info`) unable to fail and giving downstream gates the
  // impression that findings below the requested severity were blocking.
  // A zero-file scan is an abstention, not a clean bill of health: nothing was
  // read, so nothing was verified. It stays non-blocking by default (a repo may
  // legitimately have no scannable source, and flipping every such repo red on
  // upgrade would be a worse failure), but it is always reported, and
  // `--fail-on-empty` lets a CI gate treat it as the non-result it is.
  const scannedNothing = result.scannedFiles === 0;

  return Ok({
    valid: filtered.length === 0 && !(scannedNothing && options.failOnEmpty === true),
    findings: filtered,
    scannedNothing,
    ...(supplyChain !== undefined && { supplyChain }),
    stats: {
      filesScanned: result.scannedFiles,
      rulesApplied: result.rulesApplied,
      errorCount: filtered.filter((f) => f.severity === 'error').length,
      warningCount: filtered.filter((f) => f.severity === 'warning').length,
      infoCount: filtered.filter((f) => f.severity === 'info').length,
    },
  });
}

async function runCheckSecurityAction(
  opts: {
    severity: SecuritySeverity;
    changedOnly?: boolean;
    findingsJson?: boolean;
    failOnEmpty?: boolean;
    supplyChainJson?: string;
  },
  globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
): Promise<void> {
  const mode: OutputModeType = globalOpts.json
    ? OutputMode.JSON
    : globalOpts.quiet
      ? OutputMode.QUIET
      : globalOpts.verbose
        ? OutputMode.VERBOSE
        : OutputMode.TEXT;

  const formatter = new OutputFormatter(mode);

  const result = await runCheckSecurity(process.cwd(), {
    severity: opts.severity,
    ...(opts.changedOnly !== undefined && { changedOnly: opts.changedOnly }),
    ...(opts.failOnEmpty !== undefined && { failOnEmpty: opts.failOnEmpty }),
    ...(opts.supplyChainJson !== undefined && { supplyChainJson: opts.supplyChainJson }),
  });

  if (!result.ok) {
    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: result.error.message }));
    } else {
      logger.error(result.error.message);
    }
    process.exit(ExitCode.ERROR);
  }

  const issues = result.value.findings.map((f) => ({
    file: `${f.file}:${f.line}`,
    message: `[${f.ruleId}] ${f.severity.toUpperCase()} ${f.message}`,
  }));

  // An empty scan surfaces as an issue rather than a footnote, so it cannot be
  // read as a clean run in any output mode.
  if (result.value.scannedNothing) {
    issues.unshift({
      file: process.cwd(),
      message:
        'ABSTAINED: 0 files scanned — nothing was verified. Check the scan pattern ' +
        'and `security.exclude` in harness.config.json (use --fail-on-empty to make this fail).',
    });
  }

  if (mode === OutputMode.JSON) {
    // Additive: the denominator ships alongside the verdict so a consumer can tell
    // "clean" from "read nothing".
    console.log(
      JSON.stringify(
        {
          valid: result.value.valid,
          issues,
          scannedNothing: result.value.scannedNothing,
          ...(result.value.supplyChain !== undefined && {
            supplyChain: result.value.supplyChain,
          }),
          stats: result.value.stats,
        },
        null,
        2
      )
    );
  } else {
    const output = formatter.formatValidation({
      valid: result.value.valid,
      issues,
    });
    if (output) {
      console.log(output);
    }
    // The denominator is part of the result, not trivia: a pass over 0 files and a
    // pass over 4,000 are different claims.
    if (mode !== OutputMode.QUIET) {
      console.log(
        `  ${result.value.stats.filesScanned} file(s) scanned, ${result.value.stats.rulesApplied} rule(s) applied`
      );
      const supply = result.value.supplyChain;
      if (supply !== undefined) {
        const covered =
          supply.packagesScanned !== undefined
            ? ` across ${supply.packagesScanned} package(s)`
            : '';
        console.log(
          `  supply chain recorded${covered}: critical ${supply.critical}, high ${supply.high}, ` +
            `moderate ${supply.moderate}, low ${supply.low}, info ${supply.info}`
        );
      }
    }
  }

  // #691: findings = security findings at or above the requested severity.
  if (opts.findingsJson) {
    console.log(formatFindingsContract(result.value.findings.length, 'check-security'));
  }

  process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

export function createCheckSecurityCommand(): Command {
  const command = new Command('check-security')
    .description('Run lightweight security scan: secrets, injection, XSS, weak crypto')
    .option(
      '--severity <level>',
      'Minimum severity that fails the command; findings below it are excluded from the report and never fail the gate (error, warning, info)',
      'warning'
    )
    .hook('preAction', (thisCommand) => {
      const severity = thisCommand.opts().severity;
      if (!['error', 'warning', 'info'].includes(severity)) {
        logger.error(`Invalid severity: "${severity}". Must be one of: error, warning, info`);
        process.exit(ExitCode.ERROR);
      }
    })
    .option('--changed-only', 'Only scan git-changed files')
    .option(
      '--fail-on-empty',
      'Fail when the scan matched 0 files. A scan that read nothing abstained rather than passed; recommended for CI gates'
    )
    .option(
      '--supply-chain-json <file>',
      'Record an externally-measured dependency audit in the security timeline: a JSON file of { critical, high, moderate, low, info, total, packagesScanned? }. Invalid input fails the command'
    )
    .option(
      '--findings-json',
      'Emit the machine-readable maintenance findings contract ({ findings: N }) as a trailing stdout line (#691)'
    )
    .action(async (opts, cmd) => {
      await runCheckSecurityAction(opts, cmd.optsWithGlobals());
    });

  return command;
}
