import { Command } from 'commander';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result } from '@harness-engineering/core';
import {
  Ok,
  SecurityScanner,
  SecurityTimelineManager,
  parseSecurityConfig,
} from '@harness-engineering/core';
import type { SecurityFinding, SecuritySeverity } from '@harness-engineering/core';
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
}

interface CheckSecurityResult {
  valid: boolean;
  findings: SecurityFinding[];
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
    const pattern = '**/*.{ts,tsx,js,jsx,go,py,java,rb}';
    const ignore = securityConfig.exclude ?? [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/fixtures/**',
    ];
    filesToScan = await glob(pattern, { cwd: projectRoot, absolute: true, ignore });
  }

  const result = await scanner.scanFiles(filesToScan);

  // Best-effort timeline capture — never break the scan flow
  try {
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
    const timelineManager = new SecurityTimelineManager(projectRoot);
    timelineManager.capture(result, commitHash);
    timelineManager.updateLifecycles(result.findings, commitHash);
  } catch {
    // Timeline capture is best-effort
  }

  const threshold = options.severity ?? 'warning';
  const thresholdRank = SEVERITY_RANK[threshold];
  const filtered = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank);

  const hasErrors = filtered.some((f) => f.severity === 'error');

  return Ok({
    valid: !hasErrors,
    findings: filtered,
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
  opts: { severity: SecuritySeverity; changedOnly?: boolean },
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

  const output = formatter.formatValidation({
    valid: result.value.valid,
    issues,
  });

  if (output) {
    console.log(output);
  }

  process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

export function createCheckSecurityCommand(): Command {
  const command = new Command('check-security')
    .description('Run lightweight security scan: secrets, injection, XSS, weak crypto')
    .option('--severity <level>', 'Minimum severity threshold', 'warning')
    .hook('preAction', (thisCommand) => {
      const severity = thisCommand.opts().severity;
      if (!['error', 'warning', 'info'].includes(severity)) {
        logger.error(`Invalid severity: "${severity}". Must be one of: error, warning, info`);
        process.exit(ExitCode.ERROR);
      }
    })
    .option('--changed-only', 'Only scan git-changed files')
    .action(async (opts, cmd) => {
      await runCheckSecurityAction(opts, cmd.optsWithGlobals());
    });

  return command;
}
