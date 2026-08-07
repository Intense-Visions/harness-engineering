import { refresh, resolvePaths } from '@harness-engineering/burn';
import { Command } from 'commander';

import { createBudgetCommand } from './budget';
import { createCalibrateCommand } from './calibrate';
import { createInstallCommand } from './install';
import { createReportCommand, printReport } from './report';
import { createResetDayCommand } from './reset-day';
import { createWeeksCommand } from './weeks';

/**
 * `harness burn` — the interactive surface of the usage HUD.
 *
 * The hot paths (statusline render, Stop hook) deliberately do NOT live here:
 * they ship as the standalone `harness-burn-hud` binary, because loading this
 * CLI's module graph costs ~0.85s against a ~0.11s repaint budget. Everything
 * under this command is human-invoked, where that cost does not matter.
 *
 * The gauge it drives is a local proxy, never Anthropic's real quota — /usage
 * is the authority, and no reading here is trustworthy until reconciled
 * against it.
 */
export function createBurnCommand(): Command {
  const command = new Command('burn')
    .description('Claude Code usage burn: pace, budget, calibration')
    .action(() => {
      // Bare `harness burn` is the report, matching the old `claude-burn`.
      process.exitCode = printReport();
    });

  command.addCommand(createReportCommand());
  command.addCommand(createWeeksCommand());
  command.addCommand(createBudgetCommand());
  command.addCommand(createCalibrateCommand());
  command.addCommand(createResetDayCommand());
  command.addCommand(createInstallCommand());
  command.addCommand(
    new Command('scan').description('Force a cache refresh').action(() => {
      const summary = refresh(resolvePaths());
      console.log(
        `scanned ${summary.scan.files_total} transcripts · ` +
          `${summary.scan.records_total.toLocaleString('en-US')} deduped requests · status ${summary.status}`
      );
    })
  );

  return command;
}
