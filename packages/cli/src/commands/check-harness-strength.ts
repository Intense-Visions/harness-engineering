import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, HarnessStrengthAuditor } from '@harness-engineering/core';
import type { AuditResult, StrengthFinding, Severity } from '@harness-engineering/core';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

interface CheckHarnessStrengthOptions {
  severity?: Severity;
  mode?: 'adopter' | 'toolkit';
  reportOnly?: boolean;
}

export interface CheckHarnessStrengthResult {
  valid: boolean;
  audit: AuditResult; // full structured result (drives --json)
  filtered: StrengthFinding[]; // findings surviving the severity threshold
}

export function runCheckHarnessStrength(
  cwd: string,
  options: CheckHarnessStrengthOptions
): Result<CheckHarnessStrengthResult, Error> {
  const projectRoot = path.resolve(cwd);
  const auditor = new HarnessStrengthAuditor();
  const result = auditor.audit(projectRoot, options.mode ? { mode: options.mode } : {});
  if (!result.ok) return result;

  const audit = result.value;
  const threshold = options.severity ?? 'warning';
  const thresholdRank = SEVERITY_RANK[threshold];
  const filtered = audit.findings.filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank);
  const hasErrors = filtered.some((f) => f.severity === 'error');

  return Ok({ valid: !hasErrors, audit, filtered });
}

async function runCheckHarnessStrengthAction(
  opts: {
    severity: Severity;
    mode?: 'adopter' | 'toolkit';
    toolkit?: boolean;
    adopter?: boolean;
    reportOnly?: boolean;
  },
  globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
): Promise<void> {
  const outMode: OutputModeType = globalOpts.json
    ? OutputMode.JSON
    : globalOpts.quiet
      ? OutputMode.QUIET
      : globalOpts.verbose
        ? OutputMode.VERBOSE
        : OutputMode.TEXT;

  const formatter = new OutputFormatter(outMode);

  // Mode precedence: explicit --mode wins, else shortcut, else auto-detect.
  const resolvedMode =
    opts.mode ?? (opts.toolkit ? 'toolkit' : opts.adopter ? 'adopter' : undefined);

  const result = runCheckHarnessStrength(process.cwd(), {
    severity: opts.severity,
    ...(resolvedMode !== undefined && { mode: resolvedMode }),
    ...(opts.reportOnly !== undefined && { reportOnly: opts.reportOnly }),
  });

  if (!result.ok) {
    if (outMode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: result.error.message }));
    } else {
      logger.error(result.error.message);
    }
    process.exit(ExitCode.ERROR);
  }

  const { valid, audit, filtered } = result.value;

  // --json: emit the raw structured AuditResult (truth #4), then exit per gate.
  if (outMode === OutputMode.JSON) {
    console.log(JSON.stringify(audit, null, 2));
    process.exit(opts.reportOnly || valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
  }

  const issues = filtered.map((f) => ({
    file: f.line !== undefined ? `${f.file}:${f.line}` : f.file,
    message: `[${f.id}] ${f.severity.toUpperCase()} ${f.message} -> ${f.remediation}`,
  }));

  const header = formatter.formatSummary(
    `harness strength (${audit.mode})`,
    `${audit.score}/100 (${audit.tier})`,
    valid
  );
  if (header) console.log(header);

  const output = formatter.formatValidation({ valid, issues });
  if (output) console.log(output);

  const summaryLine = formatter.formatSummary(
    'findings',
    `${audit.summary.errors} error / ${audit.summary.warnings} warning / ${audit.summary.info} info`,
    valid
  );
  if (summaryLine) console.log(summaryLine);

  process.exit(opts.reportOnly || valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

export function createCheckHarnessStrengthCommand(): Command {
  const command = new Command('check-harness-strength')
    .description("Mechanically audit this project's harness setup against the 7 strength patterns")
    .option('--severity <level>', 'Minimum severity threshold to display and gate on', 'warning')
    .option('--mode <mode>', 'Audit mode: adopter | toolkit (default: auto-detect)')
    .option('--toolkit', 'Force toolkit mode')
    .option('--adopter', 'Force adopter mode')
    .option('--report-only', 'Always exit 0 regardless of findings')
    .hook('preAction', (thisCommand) => {
      const { severity, mode } = thisCommand.opts();
      if (!['error', 'warning', 'info'].includes(severity)) {
        logger.error(`Invalid severity: "${severity}". Must be one of: error, warning, info`);
        process.exit(ExitCode.ERROR);
      }
      if (mode !== undefined && !['adopter', 'toolkit'].includes(mode)) {
        logger.error(`Invalid mode: "${mode}". Must be one of: adopter, toolkit`);
        process.exit(ExitCode.ERROR);
      }
    })
    .action(async (opts, cmd) => {
      await runCheckHarnessStrengthAction(opts, cmd.optsWithGlobals());
    });

  return command;
}
