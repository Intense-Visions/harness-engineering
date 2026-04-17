import { Command } from 'commander';
import * as fs from 'node:fs';
import type { CICheckReport, CINotifyTarget, TrackerSyncConfig } from '@harness-engineering/core';
import { CINotifier, GitHubIssuesSyncAdapter } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function loadReport(reportPath: string): CICheckReport | null {
  try {
    const raw = fs.readFileSync(reportPath, 'utf-8');
    return JSON.parse(raw) as CICheckReport;
  } catch {
    return null;
  }
}

function resolveToken(): string | null {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

function resolveTrackerConfig(config: Record<string, unknown>): TrackerSyncConfig | null {
  const roadmap = config.roadmap as Record<string, unknown> | undefined;
  const tracker = roadmap?.tracker as TrackerSyncConfig | undefined;
  if (!tracker || tracker.kind !== 'github') return null;
  return tracker;
}

async function runNotifyAction(
  reportPath: string,
  opts: { target: string; pr?: string; title?: string; labels?: string },
  globalOpts: Record<string, unknown>
): Promise<void> {
  const mode = resolveOutputMode(globalOpts);

  // Load report
  const report = loadReport(reportPath);
  if (!report) {
    logger.error(`Failed to read or parse report: ${reportPath}`);
    process.exit(ExitCode.ERROR);
  }

  // Resolve config and tracker
  const configResult = resolveConfig(
    typeof globalOpts.config === 'string' ? globalOpts.config : undefined
  );
  if (!configResult.ok) {
    logger.error(configResult.error.message);
    process.exit(ExitCode.ERROR);
  }
  const config = configResult.value as unknown as Record<string, unknown>;

  const trackerConfig = resolveTrackerConfig(config);
  if (!trackerConfig || !trackerConfig.repo) {
    logger.error(
      'No GitHub tracker configured. Set roadmap.tracker in harness.config.json with kind: "github" and repo: "owner/repo".'
    );
    process.exit(ExitCode.ERROR);
  }

  const token = resolveToken();
  if (!token) {
    logger.error('No GitHub token found. Set GITHUB_TOKEN or GH_TOKEN environment variable.');
    process.exit(ExitCode.ERROR);
  }

  const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
  const notifier = new CINotifier(adapter, trackerConfig.repo);

  const target = opts.target as CINotifyTarget;

  if (target === 'pr-comment') {
    if (!opts.pr) {
      logger.error('--pr <number> is required when target is pr-comment');
      process.exit(ExitCode.ERROR);
    }
    const prNumber = parseInt(opts.pr, 10);
    if (isNaN(prNumber)) {
      logger.error(`Invalid PR number: ${opts.pr}`);
      process.exit(ExitCode.ERROR);
    }

    const result = await notifier.notifyPR(report, prNumber);
    if (!result.ok) {
      logger.error(`Failed to post PR comment: ${result.error.message}`);
      process.exit(ExitCode.ERROR);
    }

    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ target, pr: prNumber, status: 'posted' }));
    } else if (mode !== OutputMode.QUIET) {
      logger.success(`Posted CI report as comment on PR #${prNumber}`);
    }
  } else if (target === 'issue') {
    if (report.exitCode === 0) {
      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify({ target, status: 'skipped', reason: 'no failures' }));
      } else if (mode !== OutputMode.QUIET) {
        logger.dim('No failures — skipping issue creation');
      }
      return;
    }

    const notifyOptions: Pick<
      import('@harness-engineering/types').CINotifyOptions,
      'issueTitle' | 'labels'
    > = {};
    if (opts.title) notifyOptions.issueTitle = opts.title;
    if (opts.labels) notifyOptions.labels = opts.labels.split(',').map((l) => l.trim());
    const result = await notifier.notifyIssue(report, notifyOptions);
    if (!result.ok) {
      logger.error(`Failed to create issue: ${result.error.message}`);
      process.exit(ExitCode.ERROR);
    }

    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ target, ...result.value, status: 'created' }));
    } else if (mode !== OutputMode.QUIET) {
      logger.success(`Created issue: ${result.value.url}`);
    }
  } else {
    logger.error(`Unknown target: ${String(target)}. Use "pr-comment" or "issue".`);
    process.exit(ExitCode.ERROR);
  }
}

export function createNotifyCommand(): Command {
  return new Command('notify')
    .description('Post CI check results to GitHub (PR comment or issue)')
    .argument('<report>', 'Path to CI check report JSON file (from harness ci check --json)')
    .requiredOption('--target <target>', 'Notification target: pr-comment or issue')
    .option('--pr <number>', 'PR number (required for pr-comment target)')
    .option('--title <title>', 'Custom issue title (for issue target)')
    .option('--labels <labels>', 'Comma-separated labels for created issues')
    .action(async (reportPath: string, opts, cmd) => {
      await runNotifyAction(reportPath, opts, cmd.optsWithGlobals());
    });
}
