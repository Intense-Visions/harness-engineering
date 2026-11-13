import { Command } from 'commander';
import {
  readAutoDecisions,
  renderAutoDecisionSummary,
  summarizeAutoDecisions,
  type AutoDecision,
  type AutoDecisionSummary,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import type { AutonomyCliDeps } from './deps';

export interface AutonomyLogReport {
  session: string;
  file: string;
  logPresent: boolean;
  /** The live session dir was gone; `file` is in its newest archived copy. */
  archived: boolean;
  /** Older archived copies of the slug that were not read (review N3). */
  olderArchives: number;
  summary: AutoDecisionSummary;
  entries: AutoDecision[];
  invalidLines: Array<{ line: number; error: string }>;
}

export type AutonomyLogOutcome =
  | { ok: true; report: AutonomyLogReport }
  | { ok: false; message: string };

export function runAutonomyLog(
  opts: { session: string },
  deps: AutonomyCliDeps = {}
): AutonomyLogOutcome {
  const r = readAutoDecisions((deps.cwd ?? (() => process.cwd()))(), opts.session, {
    sessionNotFoundHint: 'Check the session slug.',
    archiveFallback: true,
  });
  if (!r.ok) return { ok: false, message: r.error.message };
  return {
    ok: true,
    report: {
      session: opts.session,
      file: r.value.file,
      logPresent: r.value.present,
      archived: r.value.archived,
      olderArchives: r.value.olderArchives,
      summary: summarizeAutoDecisions(r.value.entries),
      entries: r.value.entries,
      invalidLines: r.value.invalid,
    },
  };
}

/** The archive prefix line, naming any older copies that were not summarized (review N3). */
function archivedNote(report: AutonomyLogReport): string {
  const n = report.olderArchives;
  const older =
    n === 0
      ? ''
      : ` (${n} older archived ${n === 1 ? 'copy of this session is' : 'copies of this session are'} not included; see .harness/archive/sessions/)`;
  return `Read from archived session: ${report.file}${older}`;
}

export function formatAutonomyLog(report: AutonomyLogReport): string[] {
  const lines = renderAutoDecisionSummary(report.entries, {
    session: report.session,
    invalidLines: report.invalidLines.length,
    includeJudgments: true,
  });
  const body =
    lines.length > 0
      ? lines
      : [
          report.logPresent
            ? `No auto-decisions recorded for session ${report.session} (log is empty: ${report.file}).`
            : `No auto-decisions recorded for session ${report.session} (no log file at ${report.file}).`,
        ];
  return report.archived ? [archivedNote(report), ...body] : body;
}

export function createAutonomyLogCommand(deps: AutonomyCliDeps = {}): Command {
  return new Command('log')
    .description(
      'Summarize a session’s auto-decisions: counts by class, audited N/M, agreement rate, escalations'
    )
    .requiredOption('--session <slug>', 'Session whose auto-decisions.jsonl to read')
    .action((opts: { session: string }, cmd: Command) => {
      const out = runAutonomyLog(opts, deps);
      if (!out.ok) {
        logger.error(out.message);
        process.exitCode = 1;
        return;
      }
      if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
        console.log(JSON.stringify(out.report, null, 2));
        return;
      }
      for (const line of formatAutonomyLog(out.report)) logger.info(line);
    });
}
