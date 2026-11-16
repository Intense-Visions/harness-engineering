import { Command } from 'commander';
import {
  AttributeFailureError,
  attributePrFailure,
  execGh,
  type AttributeFailureReport,
  type JobAttribution,
  type GhRunner,
} from '../../ci/attribute-failure';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

interface AttributeFailureCliOptions {
  pr: string;
  job?: string;
  jobId?: string;
  repo?: string;
  windowHours: string;
  maxRuns: string;
  maxLogs: string;
  minFailures: string;
}

function positiveInt(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new AttributeFailureError(`${flag} must be a non-negative integer, got "${raw}"`);
  return n;
}

function formatRunMix(job: JobAttribution): string | null {
  if (job.examinedRuns.length === 0) return null;
  const count = (origin: string): number =>
    job.examinedRuns.filter((r) => r.origin === origin).length;
  return `  examined ${job.examinedRuns.length} other run(s): ${count('main')} main, ${count('unrelated-pr')} unrelated PR, ${count('same-branch')} same-branch (excluded)`;
}

function formatJob(job: JobAttribution): string[] {
  const lines = ['', `Job ${job.jobName} [${job.jobId}] in run ${job.runId}`];
  if (job.failingSteps.length > 0) lines.push(`  failing step(s): ${job.failingSteps.join('; ')}`);
  if (job.log === 'unavailable')
    lines.push(`  log: unavailable — ${job.logError ?? 'unknown error'}`);
  const mix = formatRunMix(job);
  if (mix) lines.push(mix);
  for (const t of job.result.tests) {
    const name = t.test.name ? ` > ${t.test.name}` : '';
    lines.push(`  [${t.verdict}] ${t.test.file}${name}`, `      ${t.reason}`);
  }
  if (job.result.tests.length === 0) lines.push(`  ${job.result.reason}`);
  return lines;
}

export function formatAttributionReport(report: AttributeFailureReport): string {
  const head = `PR #${report.pr} (${report.branch} @ ${report.headSha.slice(0, 7)}) — window ±${report.windowHours}h around each failure`;
  const verdict = `Verdict: ${report.verdict}${report.abstained ? ' (abstained)' : ''} — ${report.reason}`;
  return [head, ...report.jobs.flatMap(formatJob), '', verdict].join('\n');
}

export async function runAttributeFailure(
  opts: AttributeFailureCliOptions,
  globalOpts: Record<string, unknown>,
  gh: GhRunner = execGh
): Promise<number> {
  const mode = resolveOutputMode(globalOpts);
  let report: AttributeFailureReport;
  try {
    const pr = positiveInt(opts.pr, '--pr');
    report = await attributePrFailure(gh, {
      pr,
      ...(opts.job ? { job: opts.job } : {}),
      ...(opts.jobId ? { jobId: positiveInt(opts.jobId, '--job-id') } : {}),
      ...(opts.repo ? { repo: opts.repo } : {}),
      windowHours: positiveInt(opts.windowHours, '--window-hours'),
      maxRuns: positiveInt(opts.maxRuns, '--max-runs'),
      maxLogs: positiveInt(opts.maxLogs, '--max-logs'),
      minIndependentFailures: positiveInt(opts.minFailures, '--min-failures'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: message }));
    else logger.error(message);
    return ExitCode.ERROR;
  }

  if (mode === OutputMode.JSON) console.log(JSON.stringify(report, null, 2));
  else if (mode !== OutputMode.QUIET) console.log(formatAttributionReport(report));

  return report.abstained ? ExitCode.ZERO_DENOMINATOR : ExitCode.SUCCESS;
}

export function createAttributeFailureCommand(): Command {
  return new Command('attribute-failure')
    .description(
      "Attribute a PR's red check: environmental (same test failed on unrelated diffs/main), in-diff, or inconclusive — before spending a retry"
    )
    .requiredOption('--pr <number>', 'PR whose failing check to attribute')
    .option('--job <name>', 'Only failing checks whose name contains this string')
    .option(
      '--job-id <id>',
      'Attribute this job id (e.g. a superseded failed attempt) instead of current failing checks'
    )
    .option('--repo <owner/repo>', 'Repository (default: the current directory’s)')
    .option(
      '--window-hours <n>',
      "Correlation window half-width in hours, centred on the failing job's start",
      '24'
    )
    .option('--max-runs <n>', 'Most recent other workflow runs to examine', '40')
    .option('--max-logs <n>', 'Cap on failed-job logs fetched for correlation', '15')
    .option(
      '--min-failures <n>',
      'Distinct unrelated diffs (or main) that must fail the same test to claim environmental (min 2)',
      '2'
    )
    .action(async (opts: AttributeFailureCliOptions, cmd: Command) => {
      const code = await runAttributeFailure(opts, cmd.optsWithGlobals());
      process.exitCode = code;
    });
}
