import { Command, Option } from 'commander';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  REVIEW_MOMENTS,
  escapeTerminalText as inert,
  runCheckFindingsFile,
  runCheckReviewReceipt,
  type CheckReviewReceiptReport,
  type CwdGit,
  type ReviewMoment,
} from '../review-receipts/gate';

/**
 * The text output. Every string a receipt, a findings file or a path can carry is printed through
 * escapeTerminalText, so control, DEL, bidi and invisible characters are shown, not acted on.
 */
export function formatCheckReviewReceipt(report: CheckReviewReceiptReport): string[] {
  const what =
    report.tier === undefined
      ? ''
      : ` (${report.moment} review, tier ${report.tier}, backend ${report.backend})`;
  const ran = `${report.reviewersRun}/${report.reviewersRequired} required reviewers ran and wrote a readable findings file`;
  if (report.pass) return [`review receipt gate: PASS${what}: ${ran}`];
  return [
    `review receipt gate: FAIL${what}: ${ran}`,
    `  receipt: ${inert(report.receiptPath)}`,
    ...report.failures.map((f) => `  - [${f.code}] ${inert(f.message)}`),
  ];
}

interface CheckFlags {
  moment?: ReviewMoment;
  findings?: string;
  base?: string;
  head?: string;
}

/** `--findings`: one reviewer findings file, optionally against a range. Exit 0 or 1. */
function runFindings(opts: CheckFlags, deps: CheckReviewReceiptDeps, json: boolean): void {
  if ((opts.base === undefined) !== (opts.head === undefined)) {
    logger.error('--base and --head are given together, or neither');
    process.exitCode = ExitCode.VALIDATION_FAILED;
    return;
  }
  const report = runCheckFindingsFile({
    findingsPath: opts.findings as string,
    ...(opts.base !== undefined && { base: opts.base }),
    ...(opts.head !== undefined && { head: opts.head }),
    ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
    ...(deps.git !== undefined && { git: deps.git }),
  });
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (report.pass) logger.info(`findings file check: PASS: ${inert(report.findingsPath)}`);
  else {
    logger.error(`findings file check: FAIL: ${inert(report.findingsPath)}`);
    for (const f of report.failures) logger.error(`  - [${f.code}] ${inert(f.message)}`);
  }
  process.exitCode = report.pass ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED;
}

/** Injected inputs for tests; production uses the process cwd and real git. */
export interface CheckReviewReceiptDeps {
  cwd?: () => string;
  git?: CwdGit;
}

export function createCheckReviewReceiptCommand(deps: CheckReviewReceiptDeps = {}): Command {
  return new Command('check-review-receipt')
    .description(
      'Gate a review receipt: recompute HEAD, the diff file set, the base and every reviewer ' +
        'findings file, and check the receipt is for the review its directory names. ' +
        'Exits 1 on any failure, including a missing receipt. Needs no model credential'
    )
    .argument('[path]', 'Path to receipt.json, or to the review directory that holds it')
    .option(
      '--findings <file>',
      "A reviewer's self-check: validate one findings file with the gate's parser (with --base " +
        'and --head, also that its head is --head and every examined file is in that diff)'
    )
    .option('--base <sha>', 'With --findings: base of the reviewed range')
    .option('--head <sha>', 'With --findings: head of the reviewed range')
    .addOption(
      new Option(
        '--moment <moment>',
        'Which review this is, for a directory that does not say (phase-N, final-all and a ' +
          'directory directly under .harness/reviews each do). Contradicting the directory fails the gate'
      ).choices([...REVIEW_MOMENTS])
    )
    .action((receiptPath: string | undefined, opts: CheckFlags, cmd: Command) => {
      const json = (cmd.optsWithGlobals() as { json?: boolean }).json === true;
      const modes = [receiptPath, opts.findings].filter((m) => m !== undefined);
      if (modes.length !== 1) {
        logger.error('give exactly one of: a receipt path or --findings');
        process.exitCode = ExitCode.VALIDATION_FAILED;
        return;
      }
      if (opts.findings !== undefined) return runFindings(opts, deps, json);
      const report = runCheckReviewReceipt({
        receiptPath: receiptPath as string,
        ...(opts.moment !== undefined && { moment: opts.moment }),
        ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
        ...(deps.git !== undefined && { git: deps.git }),
      });
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const line of formatCheckReviewReceipt(report)) {
          if (report.pass) logger.info(line);
          else logger.error(line);
        }
      }
      process.exitCode = report.pass ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED;
    });
}
