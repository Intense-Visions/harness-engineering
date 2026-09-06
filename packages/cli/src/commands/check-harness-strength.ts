import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, HarnessStrengthAuditor, ABSTENTION_PLACEHOLDER } from '@harness-engineering/core';
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

  // The score abstains (`null`) when no pattern applied to this mode at all
  // (#1530). Printing `0/100` or `100/100` there would both read as
  // measurements of the codebase; the em dash plus the reason reads as what it
  // is — we did not look. This is the render half of the same rule the coverage
  // line below enforces (#1013).
  const scoreCell =
    audit.score === null
      ? `${ABSTENTION_PLACEHOLDER}/100 (${audit.tier}) — no pattern applied to this mode, so nothing was scored`
      : `${audit.score}/100 (${audit.tier})`;
  const header = formatter.formatSummary(`harness strength (${audit.mode})`, scoreCell, valid);
  if (header) console.log(header);

  const output = formatter.formatValidation({ valid, issues });
  if (output) console.log(output);

  const summaryLine = formatter.formatSummary(
    'findings',
    `${audit.summary.errors} error / ${audit.summary.warnings} warning / ${audit.summary.info} info`,
    valid
  );
  if (summaryLine) console.log(summaryLine);

  // Coverage (#1013): print the denominator so a partial audit never reads as a
  // full pass. `rulesRun` of `rulesApplicable` patterns were evaluated; the rest
  // abstained (required input absent) and are named so the gap is actionable.
  const { rulesRun, rulesApplicable, skipped } = audit.summary;
  if (rulesApplicable > 0) {
    const coverageLine = formatter.formatSummary(
      'coverage',
      `${rulesRun}/${rulesApplicable} patterns evaluated`,
      skipped.length === 0
    );
    if (coverageLine) console.log(coverageLine);
    if (skipped.length > 0 && outMode !== OutputMode.QUIET) {
      for (const s of skipped) {
        console.log(`    - not evaluated: ${s.id} (${s.gearPiece}) — ${s.reason}`);
      }
    }
  }

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
